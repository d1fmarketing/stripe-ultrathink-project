#!/bin/bash

# Deploy all updated handlers to Lambda functions
echo "🚀 DEPLOYING UPDATED HANDLERS WITH REDIS FIX..."
echo "=============================================="

cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/dist/handlers

# Map handler files to Lambda function names
declare -A HANDLER_MAP=(
    ["authLoginHandler.js"]="authLogin"
    ["autoRefreshTokens.js"]="autoRefreshTokens"
    ["disputesHandler.js"]="disputes"
    ["statsHandler.js"]="stats"
    ["retryCase.js"]="retryCase"
    ["subscriptionManager.js"]="subscriptionStatus subscriptionCancel"
    ["getDispute.js"]="getDispute"
    ["getCharge.js"]="getCharge"
    ["getPaymentIntent.js"]="getPaymentIntent"
    ["buildEvidence.js"]="buildEvidence"
    ["stripeStageEvidence.js"]="stripeStageEvidence"
    ["stripeSubmitEvidence.js"]="stripeSubmitEvidence"
    ["webhookStripe.js"]="webhookStripe"
    ["health.js"]="health"
    ["metrics.js"]="metrics"
    ["collectCase.js"]="collectCase"
    ["getUserDisputes.js"]="getUserDisputes"
    ["createCheckoutSession.js"]="createCheckoutSession"
    ["authStripeCallback.js"]="authStripeCallback"
    ["authStripeStart.js"]="authStripeStart"
    ["reportWeekly.js"]="reportWeekly"
    ["debugRedis.js"]="debugRedis"
    ["listCases.js"]="listCases"
    ["getCase.js"]="getCase"
    ["submitCase.js"]="submitCase"
)

SUCCESS=0
FAILED=0

for handler_file in "${!HANDLER_MAP[@]}"; do
    if [ -f "$handler_file" ]; then
        functions="${HANDLER_MAP[$handler_file]}"
        
        # Create zip file
        zip -q /tmp/${handler_file%.js}.zip $handler_file
        
        # Deploy to each function this handler maps to
        for func in $functions; do
            FULL_NAME="chargeback-autopilot-stripe-prod-$func"
            echo -n "Deploying $handler_file to $func... "
            
            aws lambda update-function-code \
                --function-name $FULL_NAME \
                --zip-file fileb:///tmp/${handler_file%.js}.zip \
                --no-cli-pager > /dev/null 2>&1
            
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
        
        # Clean up zip file
        rm -f /tmp/${handler_file%.js}.zip
    fi
done

echo
echo "================================"
echo "Deployment Results:"
echo "✅ Success: $SUCCESS"
echo "❌ Failed: $FAILED"
echo "================================"

# Test Redis connection again
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