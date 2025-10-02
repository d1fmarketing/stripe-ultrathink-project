#!/usr/bin/env bash
set -euo pipefail

if [[ "${DEBUG:-}" == "true" ]]; then
  set -x
fi

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--stage <stage>] [--skip-build]

Options:
  --stage <stage>   Deployment stage to target (defaults to prod).
  --skip-build      Skip the TypeScript build step and deploy the previously built artifacts.
  -h, --help        Show this message.

Environment variables:
  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, and STRIPE keys must be set for deployment.
USAGE
}

STAGE="prod"
SKIP_BUILD="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage)
      STAGE="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f package.json ]]; then
  echo "This script must be run from the repository root." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing npm dependencies..."
  npm ci
fi

if [[ "$SKIP_BUILD" != "true" ]]; then
  echo "Building project artifacts..."
  npm run build
else
  echo "Skipping build step as requested."
fi

echo "Deploying stage '$STAGE' via Serverless..."
if [[ "$STAGE" == "prod" ]]; then
  npx serverless deploy --stage prod
else
  npx serverless deploy --stage "$STAGE"
fi

echo "Deployment complete."
