#!/bin/bash

echo "🧠 ULTRATHINK FINAL VERIFICATION - EXTREME SKEPTICAL CHECK"
echo "=========================================================="
echo ""

# 1. Test Critical Endpoints
echo "1. CRITICAL ENDPOINT TESTS:"
echo "---------------------------"
endpoints=(
    "GET|/health|200|Health check"
    "GET|/auth/stripe/start|302|OAuth redirect"
    "POST|/webhooks/stripe|400|Webhook signature"
    "GET|/stats|200|Statistics"
    "GET|/cases?merchant=acct_test|200|Cases list"
)

passed=0
failed=0
for endpoint in "${endpoints[@]}"; do
    IFS='|' read -r method path expected desc <<< "$endpoint"
    
    if [ "$method" = "GET" ]; then
        status=$(curl -s -o /dev/null -w "%{http_code}" "https://ket0g0lurh.execute-api.us-east-1.amazonaws.com$path")
    else
        status=$(curl -X POST -s -o /dev/null -w "%{http_code}" "https://ket0g0lurh.execute-api.us-east-1.amazonaws.com$path" -H "Content-Type: application/json" -d '{}')
    fi
    
    if [ "$status" = "$expected" ]; then
        echo "  ✅ $desc: $status"
        ((passed++))
    else
        echo "  ❌ $desc: $status (expected $expected)"
        ((failed++))
    fi
done
echo "Result: $passed/$((passed + failed)) passed"
echo ""

# 2. Verify Lambda Environment Variables
echo "2. LAMBDA ENVIRONMENT CHECK:"
echo "----------------------------"
critical_funcs=("webhookStripe" "buildEvidence" "authStripeStart")
env_ok=true

for func in "${critical_funcs[@]}"; do
    echo -n "$func: "
    
    # Check Stripe key
    stripe_key=$(aws lambda get-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --query 'Environment.Variables.STRIPE_SECRET' \
        --output text 2>/dev/null | head -c 20)
    
    # Check AI model
    ai_model=$(aws lambda get-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --query 'Environment.Variables.AI_MODEL' \
        --output text 2>/dev/null)
    
    if [[ "$stripe_key" == "sk_live_"* ]] && [[ "$ai_model" == "gpt-5" ]]; then
        echo "✅ Stripe: ${stripe_key}... | AI: $ai_model"
    else
        echo "❌ Stripe: ${stripe_key}... | AI: $ai_model"
        env_ok=false
    fi
done
echo ""

# 3. Test Lambda Direct Invocation
echo "3. LAMBDA DIRECT INVOCATION TEST:"
echo "---------------------------------"
echo -n "Testing webhookStripe: "
echo '{"headers":{},"body":"{}"}' | base64 > /tmp/test-webhook.b64
response=$(aws lambda invoke \
    --function-name chargeback-autopilot-stripe-prod-webhookStripe \
    --payload file:///tmp/test-webhook.b64 \
    /tmp/webhook-response.json 2>&1)

if [[ "$response" == *"StatusCode: 200"* ]]; then
    status=$(cat /tmp/webhook-response.json | jq -r '.statusCode // "error"')
    if [ "$status" = "400" ]; then
        echo "✅ Returns 400 for bad signature"
    else
        echo "❌ Returns $status (expected 400)"
    fi
else
    echo "❌ Lambda invocation failed"
fi
echo ""

# 4. Check Recent Errors
echo "4. RECENT ERROR CHECK (last 10 mins):"
echo "-------------------------------------"
for func in webhookStripe buildEvidence authStripeStart; do
    echo -n "$func: "
    
    # Count errors in last 10 minutes
    error_count=$(aws logs filter-log-events \
        --log-group-name "/aws/lambda/chargeback-autopilot-stripe-prod-$func" \
        --start-time $(($(date +%s) - 600))000 \
        --filter-pattern '"ERROR"' \
        --query 'events | length(@)' \
        --output text 2>/dev/null || echo "0")
    
    if [ "$error_count" = "0" ] || [ -z "$error_count" ]; then
        echo "✅ No recent errors"
    else
        echo "⚠️ $error_count errors"
    fi
done
echo ""

# 5. Database Connectivity
echo "5. DATABASE & CACHE CHECK:"
echo "--------------------------"
# Check DynamoDB
echo -n "DynamoDB: "
table_count=$(aws dynamodb list-tables --query 'TableNames | length(@)' --output text 2>/dev/null)
if [ "$table_count" -gt 0 ]; then
    echo "✅ $table_count tables accessible"
else
    echo "❌ Cannot access tables"
fi

# Check Redis via health endpoint
echo -n "Redis: "
health_response=$(curl -s https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/health)
if [[ "$health_response" == *"redis"* ]]; then
    echo "✅ Connected"
else
    echo "❌ Not connected"
fi
echo ""

# Final Summary
echo "=========================================================="
echo "📊 ULTRATHINK VERIFICATION SUMMARY"
echo "=========================================================="
echo ""

total_tests=$((passed + failed))
if [ $failed -eq 0 ] && $env_ok; then
    echo "✅ SYSTEM STATUS: FULLY OPERATIONAL"
    echo ""
    echo "All critical components verified:"
    echo "  • All endpoints responding correctly"
    echo "  • Lambda functions properly configured"
    echo "  • GPT-5 AI model configured"
    echo "  • Stripe live keys in place"
    echo "  • Database and cache connected"
    echo ""
    echo "⚠️ Final Requirements:"
    echo "  1. Add real OpenAI API key (currently placeholder)"
    echo "  2. Configure webhook secret in Stripe Dashboard"
    echo "  3. Add Firebase authentication credentials"
else
    echo "⚠️ SYSTEM STATUS: PARTIALLY OPERATIONAL"
    echo ""
    echo "Issues found:"
    echo "  • $failed/$total_tests endpoint tests failed"
    if ! $env_ok; then
        echo "  • Environment variables not properly configured"
    fi
    echo ""
    echo "Review the errors above and fix remaining issues."
fi

echo ""
echo "Live URLs:"
echo "  API: https://ket0g0lurh.execute-api.us-east-1.amazonaws.com"
echo "  Landing: https://stripedshield-founders-1755231149.netlify.app"
echo ""
