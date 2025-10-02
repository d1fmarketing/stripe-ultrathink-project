#!/usr/bin/env bash
set -euo pipefail

log() {
  local timestamp
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[$timestamp] $*" >&2
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Environment variable '$name' must be set" >&2
    exit 1
  fi
}

require_env AWS_REGION
require_env STAGE
require_env BACKUP_BUCKET

STACK_NAME="${STACK_NAME:-chargeback-autopilot-stripe-${STAGE}}"
SSM_PARAMETER_PATH="${SSM_PARAMETER_PATH:-/chargeback/${STAGE}}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
MANIFEST_PATH="$WORKDIR/backup-manifest.json"
SSM_EXPORT_PATH="$WORKDIR/ssm-parameters.json"
export AWS_REGION

format_json_array() {
  local -n entries=$1
  if ((${#entries[@]} == 0)); then
    echo "[]"
    return
  fi
  local IFS=,
  echo "[${entries[*]}]"
}

log "Starting backup run for stage '$STAGE' (stack: $STACK_NAME)"

log "Resolving CloudFormation resources"
STACK_RESOURCES=$(aws cloudformation describe-stack-resources \
  --stack-name "$STACK_NAME" \
  --query "StackResources[].{Type:ResourceType,PhysicalId:PhysicalResourceId}" \
  --output json)

declare -a dynamo_tables=()
mapfile -t dynamo_tables < <(python - "$STACK_RESOURCES" <<'PY'
import json, sys
resources = json.loads(sys.argv[1])
for resource in resources:
    if resource.get("Type") == "AWS::DynamoDB::Table":
        print(resource["PhysicalId"])
PY
)

declare -a s3_buckets=()
mapfile -t s3_buckets < <(python - "$STACK_RESOURCES" <<'PY'
import json, sys
resources = json.loads(sys.argv[1])
for resource in resources:
    if resource.get("Type") == "AWS::S3::Bucket":
        print(resource["PhysicalId"])
PY
)

declare -a dynamo_manifest_entries=()
for table in "${dynamo_tables[@]}"; do
  if [[ -z "$table" ]]; then
    continue
  fi
  backup_name="${table//:/-}-${TIMESTAMP}"
  log "Creating DynamoDB backup for $table"
  backup_output=$(aws dynamodb create-backup \
    --table-name "$table" \
    --backup-name "$backup_name" \
    --output json)
  backup_arn=$(python - <<'PY'
import json, sys
payload = json.load(sys.stdin)
print(payload["BackupDetails"]["BackupArn"])
PY
<<<"$backup_output")
  dynamo_manifest_entries+=("{\"table\":\"$table\",\"backupName\":\"$backup_name\",\"backupArn\":\"$backup_arn\"}")
done

declare -a s3_manifest_entries=()
for bucket in "${s3_buckets[@]}"; do
  if [[ -z "$bucket" ]]; then
    continue
  fi
  destination="s3://${BACKUP_BUCKET}/s3/${bucket}/${TIMESTAMP}"
  log "Syncing s3://$bucket to $destination"
  aws s3 sync "s3://$bucket" "$destination" --only-show-errors
  s3_manifest_entries+=("{\"source\":\"$bucket\",\"destination\":\"$destination\"}")
done

log "Exporting SSM parameters from $SSM_PARAMETER_PATH"
aws ssm get-parameters-by-path \
  --path "$SSM_PARAMETER_PATH" \
  --with-decryption \
  --recursive \
  --output json > "$SSM_EXPORT_PATH"
ssm_s3_object="s3://${BACKUP_BUCKET}/ssm/${STAGE}/${TIMESTAMP}.json"
aws s3 cp "$SSM_EXPORT_PATH" "$ssm_s3_object" --only-show-errors

log "Creating manifest"
dynamo_json=$(format_json_array dynamo_manifest_entries)
s3_json=$(format_json_array s3_manifest_entries)
{
  echo '{'
  echo "  \"timestamp\": \"$TIMESTAMP\"," 
  echo "  \"stage\": \"$STAGE\"," 
  echo "  \"stackName\": \"$STACK_NAME\"," 
  echo "  \"dynamodbBackups\": $dynamo_json,"
  echo "  \"s3Syncs\": $s3_json,"
  echo "  \"ssmParameterExport\": {\"path\": \"$SSM_PARAMETER_PATH\", \"s3Object\": \"$ssm_s3_object\"}"
  echo '}'
} > "$MANIFEST_PATH"

manifest_s3_object="s3://${BACKUP_BUCKET}/manifests/${STAGE}/${TIMESTAMP}.json"
aws s3 cp "$MANIFEST_PATH" "$manifest_s3_object" --only-show-errors

log "Backup completed. Manifest uploaded to $manifest_s3_object"
