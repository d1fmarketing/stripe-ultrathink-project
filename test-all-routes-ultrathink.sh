#!/bin/bash

echo "🚀 ULTRATHINK COMPLETE SYSTEM TEST"
echo "==================================="
echo ""

BASE_URL="https://ket0g0lurh.execute-api.us-east-1.amazonaws.com"

# Test all endpoints
echo "1. Testing API Endpoints:"
echo "-------------------------"

endpoints=(
    "GET /health 200"
    "GET /auth/stripe/start 302"
    "GET /auth/stripe/callback 400"
    "GET /stats 200"
    "GET /disputes 401"
    "GET /cases 200"
    "POST /webhooks/stripe 400"
    "GET /metrics/performance 200"
)

passed=0
failed=0

for endpoint in "${endpoints[@]}"; do
    IFS=' ' read -r method path expected <<< "$endpoint"
    
    if [ "$method" = "GET" ]; then
        status=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL$path")
    else
        status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL$path" -H "Content-Type: application/json" -d '{}')
    fi
    
    if [ "$status" = "$expected" ]; then
        echo "  ✅ $method $path: $status"
        ((passed++))
    else
        echo "  ❌ $method $path: $status (expected $expected)"
        ((failed++))
    fi
done

echo ""
echo "Results: $passed/${#endpoints[@]} tests passed"
echo ""

# Check Lambda functions
echo "2. Lambda Function Status:"
echo "--------------------------"

functions=(
    "authStripeStart"
    "authStripeCallback"
    "webhookStripe"
    "buildEvidence"
    "submitCase"
    "getCharge"
    "getDispute"
    "getPaymentIntent"
)

for func in "${functions[@]}"; do
    handler=$(aws lambda get-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --query 'Handler' \
        --output text 2>/dev/null)
    
    if [[ "$handler" == dist/* ]]; then
        echo "  ✅ $func: $handler"
    else
        echo "  ❌ $func: $handler (incorrect path)"
    fi
done

echo ""
echo "3. System Health Check:"
echo "-----------------------"

# Check DynamoDB tables
echo -n "DynamoDB Tables: "
aws dynamodb list-tables --query 'TableNames | length(@)' --output text

# Check Redis connectivity
echo -n "Redis Cache: "
curl -s "$BASE_URL/debug/redis" | jq -r '.redis' 2>/dev/null || echo "Not configured"

# Check AI configuration
echo -n "AI Model: "
aws lambda get-function-configuration \
    --function-name chargeback-autopilot-stripe-prod-buildEvidence \
    --query 'Environment.Variables.AI_MODEL' \
    --output text 2>/dev/null || echo "Not set"

echo ""
echo "==================================="
echo "📊 ULTRATHINK VERIFICATION COMPLETE"
echo "==================================="
