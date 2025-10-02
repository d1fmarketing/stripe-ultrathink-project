#!/bin/bash

# Update AI functions with required environment variables

echo "🔧 Updating AI function environment variables..."

# Get OpenAI API key from existing function config
OPENAI_KEY=$(aws lambda get-function-configuration \
    --function-name chargeback-autopilot-stripe-prod-buildEvidence \
    --query 'Environment.Variables.OPENAI_API_KEY' \
    --output text 2>/dev/null)

# Set a test Stripe key for now (should be replaced with real key)
STRIPE_KEY="sk_test_4eC39HqLyjWDarjtT1zdp7dc"

# Update AI functions
for func in buildEvidence submitCase collectCase; do
    echo "Updating $func..."
    
    aws lambda update-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --environment Variables="{
            AI_MODEL=gpt-5,
            AI_ENABLED=true,
            STRIPE_SECRET=$STRIPE_KEY,
            OPENAI_API_KEY=$OPENAI_KEY,
            REDIS_URL=redis://stripedshield-redis.mot6cw.0001.use1.cache.amazonaws.com:6379,
            DYNAMODB_TABLE_CASES=stripedshield-cases,
            DYNAMODB_TABLE_MERCHANTS=stripedshield-merchants
        }" \
        --no-cli-pager > /dev/null 2>&1
    
    echo "✅ $func updated"
    sleep 2
done

echo "🎉 Environment variables updated!"

# Test buildEvidence again
echo
echo "Testing buildEvidence with updated config..."
aws lambda invoke \
    --function-name chargeback-autopilot-stripe-prod-buildEvidence \
    --cli-binary-format raw-in-base64-out \
    --payload file://test-gpt5-payload.json \
    /tmp/test-build.json \
    --no-cli-pager

echo "Response:"
cat /tmp/test-build.json | jq .