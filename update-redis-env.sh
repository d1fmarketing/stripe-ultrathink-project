#!/bin/bash

# Update Redis URL for all Lambda functions while preserving existing env vars

echo "🔧 Updating Redis URL for all Lambda functions..."
echo "================================================"

REDIS_URL="redis://stripedshield-redis.mot6cw.0001.use1.cache.amazonaws.com:6379"

# List of all functions
FUNCTIONS=(
    "authLogin"
    "autoRefreshTokens"
    "disputes"
    "stats"
    "retryCase"
    "subscriptionStatus"
    "subscriptionCancel"
    "getDispute"
    "getCharge"
    "getPaymentIntent"
    "buildEvidence"
    "stripeStageEvidence"
    "stripeSubmitEvidence"
    "webhookStripe"
    "health"
    "metrics"
    "collectCase"
    "getUserDisputes"
    "createCheckoutSession"
    "authStripeCallback"
    "authStripeStart"
    "reportWeekly"
    "debugRedis"
    "listCases"
    "getCase"
    "submitCase"
)

SUCCESS=0
FAILED=0

for func in "${FUNCTIONS[@]}"; do
    FULL_NAME="chargeback-autopilot-stripe-prod-$func"
    echo -n "Updating $func... "
    
    # Get current environment variables
    CURRENT_ENV=$(aws lambda get-function-configuration \
        --function-name $FULL_NAME \
        --query 'Environment.Variables' \
        --output json 2>/dev/null)
    
    if [ "$CURRENT_ENV" = "null" ] || [ -z "$CURRENT_ENV" ]; then
        # No existing env vars, create new
        aws lambda update-function-configuration \
            --function-name $FULL_NAME \
            --environment "Variables={REDIS_URL=$REDIS_URL}" \
            --no-cli-pager > /dev/null 2>&1
    else
        # Merge with existing env vars
        UPDATED_ENV=$(echo $CURRENT_ENV | jq --arg redis "$REDIS_URL" '. + {REDIS_URL: $redis}' | jq -c .)
        
        aws lambda update-function-configuration \
            --function-name $FULL_NAME \
            --environment "Variables=$UPDATED_ENV" \
            --no-cli-pager > /dev/null 2>&1
    fi
    
    if [ $? -eq 0 ]; then
        echo "✅"
        ((SUCCESS++))
    else
        echo "❌"
        ((FAILED++))
    fi
    
    # Small delay to avoid throttling
    sleep 0.5
done

echo
echo "================================"
echo "Results:"
echo "✅ Success: $SUCCESS"
echo "❌ Failed: $FAILED"
echo "================================"

# Test Redis connection
echo
echo "🧪 Testing Redis connectivity..."
aws lambda invoke \
    --function-name chargeback-autopilot-stripe-prod-debugRedis \
    --cli-binary-format raw-in-base64-out \
    --payload '{}' \
    /tmp/redis-test.json \
    --no-cli-pager > /dev/null 2>&1

if [ -f /tmp/redis-test.json ]; then
    echo "Debug Redis response:"
    cat /tmp/redis-test.json | jq '.'
fi