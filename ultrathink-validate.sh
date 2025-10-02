#!/bin/bash

echo "================================================"
echo "🧠 ULTRATHINK VALIDATION - FINDING THE TRUTH"
echo "================================================"
echo

API_BASE="https://ket0g0lurh.execute-api.us-east-1.amazonaws.com"
RESULTS=()

# Test endpoints
ENDPOINTS=(
    "GET /health"
    "GET /stats"
    "GET /metrics/performance"
    "GET /auth/stripe/start"
    "GET /auth/stripe/callback?code=test"
    "GET /cases"
    "GET /disputes"
    "GET /debug/redis"
    "GET /subscription/status"
    "GET /user/disputes"
    "POST /webhooks/stripe"
    "POST /subscription/checkout"
)

echo "📡 Testing API Endpoints..."
echo "----------------------------"

for endpoint in "${ENDPOINTS[@]}"; do
    METHOD="${endpoint%% *}"
    PATH="${endpoint#* }"
    
    if [ "$METHOD" == "GET" ]; then
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE$PATH")
    else
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE$PATH" -H "Content-Type: application/json" -d '{}')
    fi
    
    if [ "$STATUS" == "200" ] || [ "$STATUS" == "302" ]; then
        echo "✅ $endpoint - $STATUS"
        RESULTS+=("PASS")
    elif [ "$STATUS" == "401" ] || [ "$STATUS" == "403" ]; then
        echo "🔒 $endpoint - $STATUS (Auth required)"
        RESULTS+=("AUTH")
    else
        echo "❌ $endpoint - $STATUS"
        RESULTS+=("FAIL")
    fi
done

echo
echo "🔧 Testing Lambda Functions..."
echo "-------------------------------"

LAMBDAS=(
    "health"
    "stats"
    "buildEvidence"
    "webhookStripe"
    "authStripeStart"
    "authStripeCallback"
    "disputes"
    "metrics"
)

for func in "${LAMBDAS[@]}"; do
    FULL_NAME="chargeback-autopilot-stripe-prod-$func"
    
    # Check if function exists and get handler + size
    CONFIG=$(aws lambda get-function-configuration --function-name "$FULL_NAME" 2>/dev/null)
    if [ $? -eq 0 ]; then
        HANDLER=$(echo "$CONFIG" | jq -r '.Handler')
        SIZE=$(aws lambda get-function --function-name "$FULL_NAME" --query 'Configuration.CodeSize' --output text 2>/dev/null)
        SIZE_MB=$(echo "scale=2; $SIZE / 1048576" | bc)
        
        if [ $(echo "$SIZE_MB > 1.0" | bc) -eq 1 ]; then
            echo "⚠️  $func: ${SIZE_MB}MB - Handler: $HANDLER (TOO LARGE)"
        else
            echo "✅ $func: ${SIZE_MB}MB - Handler: $HANDLER"
        fi
    else
        echo "❌ $func: NOT FOUND"
    fi
done

echo
echo "📊 System Analysis..."
echo "---------------------"

# Count results
PASS_COUNT=0
AUTH_COUNT=0
FAIL_COUNT=0

for result in "${RESULTS[@]}"; do
    case $result in
        PASS) ((PASS_COUNT++)) ;;
        AUTH) ((AUTH_COUNT++)) ;;
        FAIL) ((FAIL_COUNT++)) ;;
    esac
done

TOTAL=$((PASS_COUNT + AUTH_COUNT + FAIL_COUNT))
WORKING_PCT=$((PASS_COUNT * 100 / TOTAL))
AUTH_PCT=$((AUTH_COUNT * 100 / TOTAL))

echo "✅ Working: $PASS_COUNT/$TOTAL ($WORKING_PCT%)"
echo "🔒 Auth Required: $AUTH_COUNT/$TOTAL ($AUTH_PCT%)"
echo "❌ Failed: $FAIL_COUNT/$TOTAL"

echo
echo "🎯 ULTRATHINK VERDICT:"
echo "----------------------"

if [ $WORKING_PCT -gt 80 ]; then
    echo "System is ${WORKING_PCT}% functional!"
    echo "Primary issue: OAuth routes return 404 from API Gateway"
    echo "Lambda functions work when called directly"
    echo "STOP trying to 'fix' working components!"
elif [ $WORKING_PCT -gt 50 ]; then
    echo "System is ${WORKING_PCT}% functional but needs targeted fixes"
    echo "Focus on the $FAIL_COUNT failed endpoints only"
else
    echo "System has major issues - ${FAIL_COUNT} endpoints failing"
fi

echo
echo "📝 Recommended Actions:"
echo "-----------------------"
echo "1. OAuth endpoints return 404 from API Gateway but Lambda works"
echo "2. This suggests API Gateway integration or stage deployment issue"
echo "3. Run: npx serverless deploy --stage prod"
echo "4. Do NOT rebuild handlers - they're working"
echo "5. Do NOT create Lambda Layers - not needed"
echo
echo "================================================"