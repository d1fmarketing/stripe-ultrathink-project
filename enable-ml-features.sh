#!/bin/bash

# Enable ML Features with Feature Flags for Safe Rollout
# This script gradually enables ML components without breaking the 68% baseline

echo "🚀 ENABLING ML FEATURES FOR SAFE ROLLOUT"
echo "========================================="
echo ""
echo "This will add feature flags to Lambda functions to safely enable ML components"
echo "ML features will only activate when flags are true, ensuring fallback to standard flow"
echo ""

# Phase 1: Enable pattern cache (lowest risk - read-only lookups)
echo "📊 Phase 1: Enabling Pattern Cache (microsecond win probability lookups)"
echo "------------------------------------------------------------------------"

FUNCTIONS="buildEvidence webhookStripe"
for func in $FUNCTIONS; do
    echo -n "  Updating $func..."
    aws lambda update-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --environment "Variables={
            $(aws lambda get-function-configuration --function-name "chargeback-autopilot-stripe-prod-$func" --query 'Environment.Variables' --output text | sed 's/\t/=/g' | tr '\n' ',' | sed 's/,$//')
            ,ENABLE_PATTERN_CACHE=false
        }" \
        --timeout 30 \
        --output text --query 'LastModified' > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo " ✅"
    else
        echo " ❌ Failed"
    fi
done

echo ""
echo "📊 Phase 2: Enabling Score Cache (evidence optimization)"
echo "--------------------------------------------------------"

for func in $FUNCTIONS; do
    echo -n "  Updating $func..."
    aws lambda update-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --environment "Variables={
            $(aws lambda get-function-configuration --function-name "chargeback-autopilot-stripe-prod-$func" --query 'Environment.Variables' --output text | sed 's/\t/=/g' | tr '\n' ',' | sed 's/,$//')
            ,ENABLE_SCORE_CACHE=false
        }" \
        --output text --query 'LastModified' > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo " ✅"
    else
        echo " ❌ Failed"
    fi
done

echo ""
echo "📊 Phase 3: Enabling Fraud Detection ML"
echo "---------------------------------------"

echo -n "  Updating buildEvidence..."
aws lambda update-function-configuration \
    --function-name "chargeback-autopilot-stripe-prod-buildEvidence" \
    --environment "Variables={
        $(aws lambda get-function-configuration --function-name "chargeback-autopilot-stripe-prod-buildEvidence" --query 'Environment.Variables' --output text | sed 's/\t/=/g' | tr '\n' ',' | sed 's/,$//')
        ,ENABLE_FRAUD_ML=false
    }" \
    --output text --query 'LastModified' > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo " ✅"
else
    echo " ❌ Failed"
fi

echo ""
echo "📊 Phase 4: Enabling Model Updater (automatic retraining)"
echo "---------------------------------------------------------"

echo -n "  Updating webhookStripe..."
aws lambda update-function-configuration \
    --function-name "chargeback-autopilot-stripe-prod-webhookStripe" \
    --environment "Variables={
        $(aws lambda get-function-configuration --function-name "chargeback-autopilot-stripe-prod-webhookStripe" --query 'Environment.Variables' --output text | sed 's/\t/=/g' | tr '\n' ',' | sed 's/,$//')
        ,ENABLE_MODEL_UPDATER=false
    }" \
    --output text --query 'LastModified' > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo " ✅"
else
    echo " ❌ Failed"
fi

echo ""
echo "========================================="
echo "✅ ML FEATURE FLAGS CONFIGURED (ALL DISABLED)"
echo ""
echo "To enable ML features gradually:"
echo ""
echo "1️⃣  TEST BASELINE (Current - 68% win rate):"
echo "    ./test-baseline-performance.sh"
echo ""
echo "2️⃣  ENABLE PATTERN CACHE (Low risk - read-only):"
echo "    aws lambda update-function-configuration --function-name chargeback-autopilot-stripe-prod-buildEvidence --environment 'Variables={ENABLE_PATTERN_CACHE=true}'"
echo "    aws lambda update-function-configuration --function-name chargeback-autopilot-stripe-prod-webhookStripe --environment 'Variables={ENABLE_PATTERN_CACHE=true}'"
echo ""
echo "3️⃣  MONITOR METRICS:"
echo "    aws cloudwatch get-metric-statistics --namespace StripeAutopilot/AI --metric-name ml_pattern_cache_hit --start-time 2025-08-21T00:00:00Z --end-time 2025-08-22T00:00:00Z --period 3600 --statistics Sum"
echo ""
echo "4️⃣  ENABLE MORE FEATURES (After validation):"
echo "    ENABLE_SCORE_CACHE=true     # Evidence optimization"
echo "    ENABLE_FRAUD_ML=true        # Fraud detection"
echo "    ENABLE_MODEL_UPDATER=true   # Auto-retraining"
echo ""
echo "5️⃣  FULL ML ACTIVATION (90%+ win rate):"
echo "    ./activate-all-ml.sh"
echo ""
echo "⚠️  IMPORTANT: Test each phase for 24 hours before proceeding"
echo "📊 Monitor win rate to ensure it stays above 68% baseline"
echo ""