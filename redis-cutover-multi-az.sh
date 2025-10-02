#!/usr/bin/env bash
# ULTRATHINK Redis Multi-AZ Cutover Script
# Purpose: Zero-downtime migration from single-node Redis to Multi-AZ Replication Group (HA)
# - Creates RG (1 primary + 1 replica) across two AZs
# - Waits for availability and validates
# - Updates SSM parameter for REDIS_URL
# - (Optional) Patches serverless.yml to read REDIS_URL from SSM and deploys
# - Provides rollback and deletion plan

set -euo pipefail

# ---------- Config (env or flags) ----------
REGION="${REGION:-us-east-1}"
SUBNET_IDS_CSV="${SUBNET_IDS_CSV:-}"               # e.g. subnet-aaa,subnet-bbb
LAMBDA_SG_ID="${LAMBDA_SG_ID:-}"                   # e.g. sg-0c2a1401ef504c3f3
REDIS_SG_ID="${REDIS_SG_ID:-}"                     # e.g. sg-0dd54a0f71afd1c2c
SUBNET_GROUP_NAME="${SUBNET_GROUP_NAME:-stripedshield-redis-subnet}"
RG_ID="${RG_ID:-stripedshield-redis-rg}"
ENGINE_VERSION="${ENGINE_VERSION:-7.1}"
NODE_TYPE="${NODE_TYPE:-cache.t3.micro}"
SSM_PARAM_REDIS_URL="${SSM_PARAM_REDIS_URL:-/stripedshield/REDIS_URL}"
SERVICE_DIR="${SERVICE_DIR:-STRIPE_ULTRATHINK_PROJECT/infra}"
DO_DEPLOY="${DO_DEPLOY:-no}"                         # yes|no - run serverless deploy
PATCH_SLS_ENV="${PATCH_SLS_ENV:-yes}"                # yes|no - patch serverless.yml to use SSM
API_BASE="${API_BASE:-}"                              # optional, for post-deploy health validation
PREFERRED_AZS_CSV="${PREFERRED_AZS_CSV:-us-east-1a,us-east-1b}"

# ---------- Helpers ----------
log() { echo -e "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing command: $1"; exit 1; }; }
awsq() { aws --region "$REGION" "$@"; }

die() { echo "Error: $*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: $(basename "$0") [--region us-east-1] \
       --subnets subnet-azA,subnet-azB --lambda-sg sg-... --redis-sg sg-... \
       [--rg-id stripedshield-redis-rg] [--engine 7.1] [--node-type cache.t3.micro] \
       [--ssm-param /stripedshield/REDIS_URL] [--service-dir STRIPE_ULTRATHINK_PROJECT/infra] \
       [--deploy yes|no] [--patch-sls yes|no] [--api https://...execute-api.../]

Environment vars alternative: REGION, SUBNET_IDS_CSV, LAMBDA_SG_ID, REDIS_SG_ID,
SUBNET_GROUP_NAME, RG_ID, ENGINE_VERSION, NODE_TYPE, SSM_PARAM_REDIS_URL,
SERVICE_DIR, DO_DEPLOY, PATCH_SLS_ENV, API_BASE, PREFERRED_AZS_CSV
EOF
}

# ---------- Parse flags ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --region) REGION="$2"; shift 2;;
    --subnets) SUBNET_IDS_CSV="$2"; shift 2;;
    --lambda-sg) LAMBDA_SG_ID="$2"; shift 2;;
    --redis-sg) REDIS_SG_ID="$2"; shift 2;;
    --rg-id) RG_ID="$2"; shift 2;;
    --engine) ENGINE_VERSION="$2"; shift 2;;
    --node-type) NODE_TYPE="$2"; shift 2;;
    --ssm-param) SSM_PARAM_REDIS_URL="$2"; shift 2;;
    --service-dir) SERVICE_DIR="$2"; shift 2;;
    --deploy) DO_DEPLOY="$2"; shift 2;;
    --patch-sls) PATCH_SLS_ENV="$2"; shift 2;;
    --api) API_BASE="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown flag: $1"; usage; exit 1;;
  esac
done

# ---------- Preconditions ----------
need aws
if [[ -z "$SUBNET_IDS_CSV" || -z "$LAMBDA_SG_ID" || -z "$REDIS_SG_ID" ]]; then
  usage; die "--subnets, --lambda-sg, and --redis-sg are required"
fi
IFS=',' read -r -a SUBNET_IDS <<< "$SUBNET_IDS_CSV"
IFS=',' read -r -a PREFERRED_AZS <<< "$PREFERRED_AZS_CSV"

log "Region: $REGION"
log "Subnets: ${SUBNET_IDS[*]}"
log "Lambda SG: $LAMBDA_SG_ID | Redis SG: $REDIS_SG_ID"
log "Replication Group: $RG_ID | Engine: $ENGINE_VERSION | Node: $NODE_TYPE"
log "SSM Param: $SSM_PARAM_REDIS_URL"

# ---------- Step 0: Capture current REDIS_URL (for rollback) ----------
OLD_REDIS_URL=""
if aws ssm get-parameter --region "$REGION" --name "$SSM_PARAM_REDIS_URL" --with-decryption >/dev/null 2>&1; then
  OLD_REDIS_URL=$(aws ssm get-parameter --region "$REGION" --name "$SSM_PARAM_REDIS_URL" --with-decryption --query 'Parameter.Value' --output text)
  log "Current SSM $SSM_PARAM_REDIS_URL: $OLD_REDIS_URL"
else
  log "SSM $SSM_PARAM_REDIS_URL not found; will create it later"
fi

# Extract old host for potential deletion plan
OLD_HOST_CANDIDATE=""
if [[ -n "$OLD_REDIS_URL" ]]; then
  OLD_HOST_CANDIDATE=$(echo "$OLD_REDIS_URL" | sed -E 's#^redis://([^:/]+).*#\1#') || true
fi

ROLLBACK_FILE="redis-cutover-rollback-$(date +%Y%m%dT%H%M%SZ).env"
echo "SSM_PARAM_REDIS_URL=$SSM_PARAM_REDIS_URL" > "$ROLLBACK_FILE"
echo "OLD_REDIS_URL=$OLD_REDIS_URL" >> "$ROLLBACK_FILE"
log "Rollback file written: $ROLLBACK_FILE"

# ---------- Step 1: Subnet group (idempotent) ----------
if ! awsq elasticache describe-cache-subnet-groups --cache-subnet-group-name "$SUBNET_GROUP_NAME" >/dev/null 2>&1; then
  log "Creating cache subnet group $SUBNET_GROUP_NAME"
  awsq elasticache create-cache-subnet-group \
    --cache-subnet-group-name "$SUBNET_GROUP_NAME" \
    --cache-subnet-group-description "Redis subnet group" \
    --subnet-ids "${SUBNET_IDS[@]}"
else
  log "Subnet group $SUBNET_GROUP_NAME exists"
fi

# ---------- Step 2: SG rules (idempotent) ----------
log "Ensuring SG rules (Lambda egress → Redis ingress on 6379)"
aWS_SILENT(){ awsq "$@" >/dev/null 2>&1 || true; }
aWS_SILENT ec2 authorize-security-group-egress --group-id "$LAMBDA_SG_ID" --protocol tcp --port 6379 --source-group "$REDIS_SG_ID"
aWS_SILENT ec2 authorize-security-group-ingress --group-id "$REDIS_SG_ID" --protocol tcp --port 6379 --source-group "$LAMBDA_SG_ID"

# ---------- Step 3: Create replication group (if missing) ----------
if ! awsq elasticache describe-replication-groups --replication-group-id "$RG_ID" >/dev/null 2>&1; then
  log "Creating replication group $RG_ID (Multi-AZ, failover)"
  awsq elasticache create-replication-group \
    --replication-group-id "$RG_ID" \
    --replication-group-description "Prod Redis RG (Multi-AZ, failover)" \
    --engine redis \
    --engine-version "$ENGINE_VERSION" \
    --cache-node-type "$NODE_TYPE" \
    --cache-subnet-group-name "$SUBNET_GROUP_NAME" \
    --security-group-ids "$REDIS_SG_ID" \
    --num-node-groups 1 \
    --replicas-per-node-group 1 \
    --multi-az-enabled \
    --automatic-failover-enabled \
    --preferred-cache-cluster-azs "${PREFERRED_AZS[0]},${PREFERRED_AZS[1]}"
else
  log "Replication group $RG_ID already exists"
fi

# ---------- Step 4: Wait for available ----------
log "Waiting for replication group $RG_ID to become available..."
for i in {1..60}; do
  STATUS=$(awsq elasticache describe-replication-groups --replication-group-id "$RG_ID" --query 'ReplicationGroups[0].Status' --output text || echo "")
  if [[ "$STATUS" == "available" ]]; then
    break
  fi
  sleep 10
  log "Status: $STATUS (attempt $i)"
done
[[ "$STATUS" == "available" ]] || die "Replication group did not become available in time"

NEW_HOST=$(awsq elasticache describe-replication-groups --replication-group-id "$RG_ID" --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint.Address' --output text)
[[ -n "$NEW_HOST" && "$NEW_HOST" != "None" ]] || die "Primary endpoint not found"
log "New primary endpoint: $NEW_HOST"

# ---------- Step 5: Optional local validation with redis-cli ----------
if command -v redis-cli >/dev/null 2>&1; then
  log "Validating redis PING on new endpoint"
  T0=$(date +%s%3N)
  if redis-cli -h "$NEW_HOST" -p 6379 ping | grep -q PONG; then
    T1=$(date +%s%3N); LAT=$((T1 - T0)); log "redis-cli PING ok in ${LAT}ms"
  else
    log "redis-cli PING failed (continuing, will validate via /health if provided)"
  fi
else
  log "redis-cli not installed; skipping local PING validation"
fi

# ---------- Step 6: Update SSM parameter (safe rollback) ----------
NEW_REDIS_URL="redis://${NEW_HOST}:6379"
log "Updating SSM ${SSM_PARAM_REDIS_URL} -> ${NEW_REDIS_URL} (backup in $ROLLBACK_FILE)"
aWSq ssm put-parameter --name "$SSM_PARAM_REDIS_URL" --value "$NEW_REDIS_URL" --type SecureString --overwrite >/dev/null

echo "NEW_REDIS_URL=$NEW_REDIS_URL" >> "$ROLLBACK_FILE"

# ---------- Step 7: Patch serverless.yml to read from SSM (optional) ----------
PATCHED=0
if [[ "$PATCH_SLS_ENV" == "yes" ]]; then
  SLS_FILE="$SERVICE_DIR/serverless.yml"
  if [[ -f "$SLS_FILE" ]]; then
    if grep -q "REDIS_URL: ${ssm:" "$SLS_FILE" 2>/dev/null; then
      log "serverless.yml already references SSM for REDIS_URL"
    else
      log "Patching serverless.yml to use \\${ssm:$SSM_PARAM_REDIS_URL} for REDIS_URL"
      # Replace the REDIS_URL line value preserving indentation
      # This sed assumes YAML key 'REDIS_URL:' exists under provider.environment
      sed -i.bak -E "s#(^\s*REDIS_URL:\s*).*$#\1\${ssm:${SSM_PARAM_REDIS_URL}}#" "$SLS_FILE" || die "Failed to patch serverless.yml"
      PATCHED=1
      log "Patched. Backup: $SLS_FILE.bak"
    fi
  else
    log "serverless.yml not found at $SLS_FILE; skipping patch"
  fi
else
  log "Skipping serverless.yml patch as requested"
fi

# ---------- Step 8: Deploy (optional) ----------
if [[ "$DO_DEPLOY" == "yes" ]]; then
  need npx
  log "Deploying with Serverless (dir: $SERVICE_DIR)"
  (cd "$SERVICE_DIR" && npx serverless deploy --stage prod --region "$REGION")
else
  log "Skipping deploy (set DO_DEPLOY=yes to enable)"
fi

# ---------- Step 9: Post-deploy validation ----------
if [[ -n "$API_BASE" ]]; then
  need curl
  log "Checking /health at $API_BASE/health"
  set +e
  RESP=$(curl -sS "$API_BASE/health")
  RC=$?
  set -e
  if [[ $RC -eq 0 ]]; then
    echo "$RESP" | sed -e 's/.\{0\}/\0/' >/dev/null || true
    log "Health response received. Verify degraded=false and redis_ms ~3-7ms"
  else
    log "Health check failed (curl rc=$RC). Verify deployment and networking."
  fi
fi

# ---------- Step 10: Deletion plan for old cluster ----------
if [[ -n "$OLD_HOST_CANDIDATE" ]]; then
  OLD_ID_CANDIDATE=$(echo "$OLD_HOST_CANDIDATE" | cut -d'.' -f1)
  cat <<PLAN > deletion-plan.txt
# When ready to decommission old cluster (after stability confirmation):
# Identify whether it was a single cache cluster or a replication group.
# If it was a single cache cluster:
aws --region $REGION elasticache delete-cache-cluster --cache-cluster-id $OLD_ID_CANDIDATE
# If it was a replication group:
aws --region $REGION elasticache delete-replication-group --replication-group-id $OLD_ID_CANDIDATE --retain-primary-cluster
# (Review identifiers before running.)
PLAN
  log "Deletion plan drafted: deletion-plan.txt (candidate id: $OLD_ID_CANDIDATE)"
else
  log "Could not infer old Redis host; skip deletion plan."
fi

# ---------- Summary ----------
cat <<EOF

Cutover complete (configuration stage).
- New Redis endpoint: $NEW_HOST
- SSM updated: $SSM_PARAM_REDIS_URL -> $NEW_REDIS_URL
- Serverless patched: $([[ $PATCHED -eq 1 ]] && echo yes || echo no)
- Deployed now: $DO_DEPLOY

Rollback:
  source $ROLLBACK_FILE
  aws --region $REGION ssm put-parameter --name "$SSM_PARAM_REDIS_URL" --value "$OLD_REDIS_URL" --type SecureString --overwrite
  # Optional: revert serverless.yml from backup and redeploy
  [ -f "$SERVICE_DIR/serverless.yml.bak" ] && mv "$SERVICE_DIR/serverless.yml.bak" "$SERVICE_DIR/serverless.yml"
  (cd "$SERVICE_DIR" && npx serverless deploy --stage prod --region "$REGION")

Validation:
  redis-cli -h $NEW_HOST ping   # optional local
  curl -sS ${API_BASE:-https://<api>/}/health | jq  # if API_BASE provided

Deletion plan: see deletion-plan.txt (run only after stability window).
EOF
