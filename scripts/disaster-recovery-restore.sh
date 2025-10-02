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
require_env RESTORE_TIMESTAMP

STACK_NAME="${STACK_NAME:-chargeback-autopilot-stripe-${STAGE}}"
DYNAMO_RESTORE_MODE="${DYNAMO_RESTORE_MODE:-clone}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
MANIFEST_PATH="$WORKDIR/manifest.json"
export AWS_REGION

manifest_s3_object="s3://${BACKUP_BUCKET}/manifests/${STAGE}/${RESTORE_TIMESTAMP}.json"
log "Fetching manifest ${manifest_s3_object}"
aws s3 cp "$manifest_s3_object" "$MANIFEST_PATH" --only-show-errors

log "Parsing manifest"
dynamo_entries=$(python - "$MANIFEST_PATH" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1]))
entries = manifest.get("dynamodbBackups", [])
print("\n".join(f"{entry['table']} {entry['backupArn']}" for entry in entries))
PY
)

s3_entries=$(python - "$MANIFEST_PATH" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1]))
entries = manifest.get("s3Syncs", [])
print("\n".join(f"{entry['source']} {entry['destination']}" for entry in entries))
PY
)

ssm_object=$(python - "$MANIFEST_PATH" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1]))
export = manifest.get("ssmParameterExport", {})
print(export.get("s3Object", ""))
PY
)

if [[ -n "$dynamo_entries" ]]; then
  log "Restoring DynamoDB tables using mode '$DYNAMO_RESTORE_MODE'"
  while read -r table backup_arn; do
    [[ -z "$table" ]] && continue
    if [[ "$DYNAMO_RESTORE_MODE" == "in-place" ]]; then
      log "Deleting existing table $table"
      aws dynamodb delete-table --table-name "$table" >/dev/null 2>&1 || true
      aws dynamodb wait table-not-exists --table-name "$table" || true
      target_table="$table"
    else
      target_table="${table}-restore-${RESTORE_TIMESTAMP}"
    fi
    log "Restoring backup $backup_arn to table $target_table"
    aws dynamodb restore-table-from-backup \
      --target-table-name "$target_table" \
      --backup-arn "$backup_arn" >/dev/null
    aws dynamodb wait table-exists --table-name "$target_table"
  done <<< "$dynamo_entries"
else
  log "No DynamoDB backups found in manifest"
fi

if [[ -n "$s3_entries" ]]; then
  log "Restoring S3 buckets"
  while read -r source destination; do
    [[ -z "$source" ]] && continue
    backup_prefix="s3://${BACKUP_BUCKET}/s3/${source}/${RESTORE_TIMESTAMP}/"
    log "Syncing $backup_prefix back to s3://$source"
    aws s3 sync "$backup_prefix" "s3://$source" --only-show-errors
  done <<< "$s3_entries"
else
  log "No S3 sync entries found in manifest"
fi

if [[ -n "$ssm_object" ]]; then
  log "Restoring SSM parameters from $ssm_object"
  ssm_file="$WORKDIR/ssm-parameters.json"
  aws s3 cp "$ssm_object" "$ssm_file" --only-show-errors
  python - "$ssm_file" <<'PY'
import json, subprocess, sys
payload = json.load(open(sys.argv[1]))
for param in payload.get("Parameters", []):
    name = param["Name"]
    value = param.get("Value", "")
    param_type = param.get("Type", "String")
    key_id = param.get("KeyId")
    cmd = ["aws", "ssm", "put-parameter", "--name", name, "--value", value, "--type", param_type, "--overwrite"]
    if key_id:
        cmd.extend(["--key-id", key_id])
    subprocess.run(cmd, check=True)
PY
else
  log "No SSM export found in manifest"
fi

log "Disaster recovery restore complete"
