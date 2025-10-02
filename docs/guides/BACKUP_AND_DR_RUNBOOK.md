# 🛡️ Backup & Disaster Recovery Runbook

This runbook defines the automated backup jobs and disaster recovery (DR) procedures for the StripedShield production stack. It covers all persistent data planes provisioned by the Serverless stack (`MerchantsTable`, `CasesTable`, `SubmissionsTable`, `EvidenceTable`, and the `EvidenceBucket` object store) and the associated configuration held in AWS Systems Manager Parameter Store.【F:serverless.yml†L620-L675】

---

## 🔁 Automated Backup Pipeline

### 1. Nightly GitHub Action
A GitHub Actions workflow (`.github/workflows/nightly-backup.yml`) runs every day at 06:00 UTC and can be triggered manually via **Run workflow**. It performs the following steps:

1. Checks out this repository revision.
2. Configures AWS credentials sourced from GitHub Secrets (`AWS_BACKUP_ACCESS_KEY_ID`, `AWS_BACKUP_SECRET_ACCESS_KEY`, and `AWS_BACKUP_BUCKET`).
3. Executes `scripts/automated-backup.sh` with production stage variables (`STAGE=prod`, `STACK_NAME=chargeback-autopilot-stripe-prod`, `SSM_PARAMETER_PATH=/chargeback/prod`).【F:.github/workflows/nightly-backup.yml†L1-L29】

> ✅ **Action required:** Populate the secrets above in the repository settings. Optionally replace the static credentials with an IAM role by swapping the credential configuration in the workflow for `role-to-assume`.

### 2. `scripts/automated-backup.sh`
The bash automation script performs a full snapshot of critical resources:

- Discovers DynamoDB tables and S3 buckets from the CloudFormation stack and triggers DynamoDB `create-backup` for each table, writing structured metadata (table name, backup name, and ARN) to a manifest.【F:scripts/automated-backup.sh†L34-L74】【F:scripts/automated-backup.sh†L76-L105】
- Mirrors each evidence S3 bucket into the central backup bucket under a timestamped prefix and records the sync paths in the manifest.【F:scripts/automated-backup.sh†L107-L119】
- Exports decrypted Parameter Store values under `/chargeback/<stage>` and stores them in the backup bucket alongside the manifest for traceability.【F:scripts/automated-backup.sh†L121-L143】

Backups are written to `s3://$BACKUP_BUCKET/{manifests|s3|ssm}/<stage>/<timestamp>.json`. A manifest upload completes the run and gives DR automation a single source of truth for the snapshot contents.【F:scripts/automated-backup.sh†L145-L152】

### 3. Monitoring the Backups
- GitHub Action logs surface command failures; configure branch protection to require the job for visibility.
- S3 lifecycle policies on the backup bucket should enforce retention (e.g., 90 days) and Glacier archival for long-term storage.
- Optionally create a CloudWatch EventBridge rule to invoke the script from a Lambda if you prefer AWS-native scheduling. The script only depends on IAM permissions and the environment variables defined above.

---

## 🚨 Disaster Recovery Procedures

### 1. Preparation Checklist
- Confirm access to the backup S3 bucket and ensure the manifest for the desired timestamp exists.
- Decide on the restoration mode:
  - `DYNAMO_RESTORE_MODE=clone` (default) creates `*-restore-<timestamp>` tables for validation before cutover.
  - `DYNAMO_RESTORE_MODE=in-place` deletes the live tables before restoring. Use only during a controlled outage window.

### 2. Automated Restore Script
Run `scripts/disaster-recovery-restore.sh` from a workstation or automation host with AWS credentials that can administer DynamoDB, S3, and SSM.

```bash
export AWS_REGION=us-east-1
export STAGE=prod
export BACKUP_BUCKET=my-stripeshield-backups
export RESTORE_TIMESTAMP=20250815T060000Z
# Optional: export DYNAMO_RESTORE_MODE=in-place
./scripts/disaster-recovery-restore.sh
```

The script performs the following actions:

1. Downloads the matching manifest from S3 and enumerates DynamoDB, S3, and SSM artefacts.【F:scripts/disaster-recovery-restore.sh†L24-L49】
2. Restores each DynamoDB backup to either cloned or in-place tables, waiting for completion before moving to the next item.【F:scripts/disaster-recovery-restore.sh†L51-L74】
3. Syncs evidence buckets back from the backup bucket, ensuring all artefacts are available.【F:scripts/disaster-recovery-restore.sh†L76-L84】
4. Replays Parameter Store configuration with secure overwrites for environment secrets.【F:scripts/disaster-recovery-restore.sh†L86-L103】

### 3. Post-Restore Validation
- Run API smoke tests (`test-all-endpoints.sh`) against the restored environment.
- Verify DynamoDB table item counts and compare to manifest timestamps.
- Confirm evidence files render in the dashboard and Parameter Store shows expected values.
- Document the incident in the ops log and rotate any secrets exposed during the recovery.

---

## 📚 Change Management
- Update this runbook whenever new persistent resources are added to `serverless.yml` so they are included in the automation.
- Store runbook revisions in source control (this file) and review quarterly during DR tests.

By combining scheduled automation with a repeatable restoration path, the team can recover core services from S3-stored snapshots within hours while preserving compliance and audit evidence.
