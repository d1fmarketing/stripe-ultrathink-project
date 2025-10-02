#!/bin/bash
set -euo pipefail

echo "🚀 Deploying bundled handlers to Lambda functions"
echo "================================================"

AWS_REGION="${AWS_REGION:-us-east-1}"
LAMBDA_PREFIX="chargeback-autopilot-stripe-prod"

# Get all Lambda functions
echo "🔎 Discovering Lambda functions..."
mapfile -t FUNCS < <(aws lambda list-functions --region "$AWS_REGION" \
  --query "Functions[?starts_with(FunctionName, '$LAMBDA_PREFIX')].FunctionName" \
  --output text | tr '\t' '\n' | sort)

echo "Found ${#FUNCS[@]} functions"

SUCCESS=0
FAILED=0

# Create temp directory for packages
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for FN in "${FUNCS[@]}"; do
  # Get current handler configuration
  HANDLER="$(aws lambda get-function-configuration --region "$AWS_REGION" \
    --function-name "$FN" --query 'Handler' --output text)"
  
  # Extract base name from handler path
  BASE="$(basename "$HANDLER" .handler)"
  
  echo ""
  echo "[$((SUCCESS + FAILED + 1))/26] $FN"
  echo "  Handler: $HANDLER"
  echo "  Base: $BASE"
  
  # Check if handler file exists
  HANDLER_FILE="dist/handlers/$BASE.js"
  if [ ! -f "$HANDLER_FILE" ]; then
    echo "  ❌ Handler file not found: $HANDLER_FILE"
    ((FAILED++))
    continue
  fi
  
  # Create minimal deployment package with just the bundled handler
  PKG="$TMP/${FN##*-}.zip"
  
  # Create the dist/handlers structure in temp directory
  mkdir -p "$TMP/dist/handlers"
  cp "$HANDLER_FILE" "$TMP/dist/handlers/"
  
  # Create zip with correct structure
  (cd "$TMP" && zip -qr "$PKG" dist/)
  
  SIZE=$(du -h "$PKG" | cut -f1)
  echo "  📦 Package size: $SIZE"
  
  # Upload to Lambda
  echo -n "  ⬆️  Uploading... "
  if aws lambda update-function-code \
    --region "$AWS_REGION" \
    --function-name "$FN" \
    --zip-file "fileb://$PKG" >/dev/null 2>&1; then
    echo "✅"
    ((SUCCESS++))
  else
    echo "❌"
    ((FAILED++))
  fi
  
  # Clean temp files for next iteration
  rm -rf "$TMP/dist"
done

echo ""
echo "=================================="
echo "📊 Deployment Results:"
echo "  ✅ Success: $SUCCESS"
echo "  ❌ Failed: $FAILED"
echo "  📈 Success Rate: $((SUCCESS * 100 / (SUCCESS + FAILED)))%"
echo ""

if [ $SUCCESS -eq 26 ]; then
  echo "🎉 ALL FUNCTIONS DEPLOYED SUCCESSFULLY!"
else
  echo "⚠️  Some functions failed. Check the output above."
fi