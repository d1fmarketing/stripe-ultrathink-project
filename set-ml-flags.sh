#!/bin/bash

# Set ML Feature Flags on Lambda Functions
echo "🚀 Setting ML Feature Flags on Lambda Functions"
echo "=============================================="
echo ""

# buildEvidence - get current vars and add ML flags
echo "📦 Updating buildEvidence..."
CURRENT_VARS=$(aws lambda get-function-configuration \
    --function-name chargeback-autopilot-stripe-prod-buildEvidence \
    --query 'Environment.Variables' \
    --output text | tr '\t' '=' | tr '\n' ',')

aws lambda update-function-configuration \
    --function-name chargeback-autopilot-stripe-prod-buildEvidence \
    --environment Variables="{${CURRENT_VARS}ENABLE_PATTERN_CACHE=false,ENABLE_SCORE_CACHE=false,ENABLE_FRAUD_ML=false}" \
    --output text --query 'LastModified' > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "  ✅ buildEvidence updated with ML flags"
else
    echo "  ❌ buildEvidence update failed"
fi

# webhookStripe - get current vars and add ML flags  
echo "📦 Updating webhookStripe..."
CURRENT_VARS=$(aws lambda get-function-configuration \
    --function-name chargeback-autopilot-stripe-prod-webhookStripe \
    --query 'Environment.Variables' \
    --output text | tr '\t' '=' | tr '\n' ',')

aws lambda update-function-configuration \
    --function-name chargeback-autopilot-stripe-prod-webhookStripe \
    --environment Variables="{${CURRENT_VARS}ENABLE_PATTERN_CACHE=false,ENABLE_SCORE_CACHE=false,ENABLE_MODEL_UPDATER=false}" \
    --output text --query 'LastModified' > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "  ✅ webhookStripe updated with ML flags"
else
    echo "  ❌ webhookStripe update failed"
fi

echo ""
echo "=============================================="
echo "✅ ML Feature Flags Set (All Disabled)"
echo ""
echo "Current Status:"
echo "  ENABLE_PATTERN_CACHE = false (microsecond lookups)"
echo "  ENABLE_SCORE_CACHE = false (evidence optimization)"
echo "  ENABLE_FRAUD_ML = false (fraud detection)"
echo "  ENABLE_MODEL_UPDATER = false (auto-retraining)"
echo ""
echo "To enable features one by one:"
echo "  1. Test baseline: ./test-baseline-performance.sh"
echo "  2. Enable pattern cache: ENABLE_PATTERN_CACHE=true"
echo "  3. Monitor for 24 hours"
echo "  4. Enable next feature"
echo ""