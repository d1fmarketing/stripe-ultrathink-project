#!/bin/bash

# Set ALL required environment variables for Lambda functions
echo "🔧 SETTING ALL ENVIRONMENT VARIABLES..."
echo "======================================"

# All required environment variables
ENV_VARS='{
  "AI_MODEL": "gpt-5",
  "AI_ENABLED": "true",
  "AI_MAX_COMPLETION_TOKENS": "500",
  "AI_TEMPERATURE": "1.0",
  "OPENAI_API_KEY": "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",
  "STRIPE_SECRET": "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",
  "REDIS_URL": "redis://stripedshield-redis.mot6cw.0001.use1.cache.amazonaws.com:6379",
  "REDIS_HOST": "stripedshield-redis.mot6cw.0001.use1.cache.amazonaws.com",
  "REDIS_PORT": "6379",
  "DYNAMODB_TABLE_CASES": "stripedshield-cases",
  "DYNAMODB_TABLE_MERCHANTS": "stripedshield-merchants",
  "DYNAMODB_TABLE_USERS": "stripedshield-users",
  "DYNAMODB_TABLE_EVIDENCE": "stripedshield-evidence",
  "DYNAMODB_TABLE_TEMPLATES": "stripedshield-templates",
  "DYNAMODB_TABLE_ANALYTICS": "stripedshield-analytics",
  "DYNAMODB_TABLE_PAYMENTS": "stripedshield-payments",
  "DYNAMODB_TABLE_WEBHOOKS": "stripedshield-webhooks"
}'

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
    echo -n "Setting env vars for $func... "
    
    aws lambda update-function-configuration \
        --function-name $FULL_NAME \
        --environment Variables="$ENV_VARS" \
        --no-cli-pager > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅"
        ((SUCCESS++))
    else
        echo "❌"
        ((FAILED++))
    fi
    
    # Small delay to avoid throttling
    sleep 1
done

echo
echo "================================"
echo "Results:"
echo "✅ Success: $SUCCESS"
echo "❌ Failed: $FAILED"
echo "================================"

# Wait for configuration to propagate
echo
echo "⏳ Waiting 10 seconds for configuration to propagate..."
sleep 10

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
    cat /tmp/redis-test.json | jq '.body | fromjson' 2>/dev/null || cat /tmp/redis-test.json
fi

# Test health endpoint
echo
echo "🧪 Testing health endpoint..."
curl -s https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/health | jq '.'