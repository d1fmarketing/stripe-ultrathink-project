#!/bin/bash

# Apply Provisioned Concurrency to Critical Lambda Functions
# This ensures cold starts are eliminated for hot paths

set -euo pipefail

echo "🚀 Applying Provisioned Concurrency to Lambda Functions"
echo "========================================================="

# Function list with PC values
declare -A FUNCTIONS=(
  ["webhookStripe"]=5
  ["buildEvidence"]=5
  ["submitCase"]=3
  ["getCase"]=2
  ["health"]=2
)

# Process each function
for FN in "${!FUNCTIONS[@]}"; do
  PC="${FUNCTIONS[$FN]}"
  FULL="chargeback-autopilot-stripe-prod-$FN"
  
  echo ""
  echo "📦 Processing $FN (PC=$PC)..."
  
  # Step 1: Publish a new version
  echo "  Publishing version..."
  VER=$(aws lambda publish-version --function-name "$FULL" --query Version --output text)
  echo "  ✅ Published version $VER"
  
  # Step 2: Create or update 'prod' alias
  echo "  Managing alias 'prod'..."
  if aws lambda get-alias --function-name "$FULL" --name prod >/dev/null 2>&1; then
    aws lambda update-alias --function-name "$FULL" --name prod --function-version "$VER" >/dev/null
    echo "  ✅ Updated alias 'prod' to version $VER"
  else
    aws lambda create-alias --function-name "$FULL" --name prod --function-version "$VER" --description "Production alias with PC" >/dev/null
    echo "  ✅ Created alias 'prod' pointing to version $VER"
  fi
  
  # Step 3: Apply Provisioned Concurrency
  echo "  Applying provisioned concurrency ($PC instances)..."
  aws lambda put-provisioned-concurrency-config \
    --function-name "$FULL" \
    --qualifier prod \
    --provisioned-concurrent-executions "$PC" >/dev/null
  echo "  ✅ Provisioned concurrency configured"
done

echo ""
echo "⏳ Waiting for provisioned concurrency to become ready..."
echo "   This typically takes 2-3 minutes..."

# Check status
READY=false
ATTEMPTS=0
MAX_ATTEMPTS=60  # 5 minutes max

while [ "$READY" = false ] && [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  sleep 5
  ATTEMPTS=$((ATTEMPTS + 1))
  
  ALL_READY=true
  for FN in "${!FUNCTIONS[@]}"; do
    FULL="chargeback-autopilot-stripe-prod-$FN"
    STATUS=$(aws lambda get-provisioned-concurrency-config \
      --function-name "$FULL" \
      --qualifier prod \
      --query Status \
      --output text 2>/dev/null || echo "FAILED")
    
    if [ "$STATUS" != "READY" ]; then
      ALL_READY=false
    fi
  done
  
  if [ "$ALL_READY" = true ]; then
    READY=true
  else
    echo -n "."
  fi
done

echo ""
echo ""

if [ "$READY" = true ]; then
  echo "✅ SUCCESS: All provisioned concurrency configurations are READY!"
  echo ""
  echo "📊 Final Status:"
  for FN in "${!FUNCTIONS[@]}"; do
    FULL="chargeback-autopilot-stripe-prod-$FN"
    PC="${FUNCTIONS[$FN]}"
    STATUS=$(aws lambda get-provisioned-concurrency-config \
      --function-name "$FULL" \
      --qualifier prod \
      --query Status \
      --output text 2>/dev/null || echo "ERROR")
    echo "  $FN: $STATUS (PC=$PC)"
  done
else
  echo "⚠️ WARNING: Some PC configurations may not be ready yet"
  echo "Run this command to check status:"
  echo "  aws lambda get-provisioned-concurrency-config --function-name chargeback-autopilot-stripe-prod-webhookStripe --qualifier prod"
fi

echo ""
echo "🎯 Next steps:"
echo "1. Test endpoints to verify cold starts are eliminated"
echo "2. Monitor CloudWatch metrics for invocation patterns"
echo "3. Adjust PC values based on actual traffic"