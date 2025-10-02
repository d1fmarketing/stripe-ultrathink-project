#!/bin/bash

# Fix Redis Connection for All Lambda Functions
# Part of Day 1: 80% → 85% completion

echo "🔧 FIXING REDIS CONNECTIVITY..."
echo "================================"

REDIS_URL="redis://stripedshield-redis.mot6cw.0001.use1.cache.amazonaws.com:6379"
echo "Redis URL: $REDIS_URL"

# Get all Lambda functions
FUNCTIONS=$(aws lambda list-functions --query "Functions[?starts_with(FunctionName, 'chargeback-autopilot-stripe-prod')].FunctionName" --output text)

echo "Found $(echo $FUNCTIONS | wc -w) Lambda functions to update"
echo

# Update each function with Redis URL
for func in $FUNCTIONS; do
    echo "Updating $func..."
    
    # Get current environment variables
    CURRENT_ENV=$(aws lambda get-function-configuration \
        --function-name $func \
        --query 'Environment.Variables' \
        --output json 2>/dev/null || echo "{}")
    
    # Add/Update REDIS_URL
    UPDATED_ENV=$(echo $CURRENT_ENV | jq --arg redis "$REDIS_URL" '. + {REDIS_URL: $redis}')
    
    # Update function configuration
    aws lambda update-function-configuration \
        --function-name $func \
        --environment Variables="$UPDATED_ENV" \
        --no-cli-pager > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅ $func updated with Redis URL"
    else
        echo "❌ Failed to update $func"
    fi
    
    # Small delay to avoid rate limiting
    sleep 1
done

echo
echo "🧪 Testing Redis connectivity..."

# Test with debugRedis function
aws lambda invoke \
    --function-name chargeback-autopilot-stripe-prod-debugRedis \
    --cli-binary-format raw-in-base64-out \
    --payload '{}' \
    /tmp/redis-test.json \
    --no-cli-pager > /dev/null 2>&1

if [ -f /tmp/redis-test.json ]; then
    echo "Redis test response:"
    cat /tmp/redis-test.json | jq '.body | fromjson' 2>/dev/null || cat /tmp/redis-test.json
fi

echo
echo "✅ Redis URL configured on all Lambda functions!"
echo "Next: Update Redis client code to handle connection properly"