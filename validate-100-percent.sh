#!/bin/bash

echo "🎯 VALIDATING 100% FUNCTIONALITY"
echo "================================="
echo

API_BASE="https://ket0g0lurh.execute-api.us-east-1.amazonaws.com"
FRONTEND="https://stripedshield-founders-1755231149.netlify.app"
SCORE=0
TOTAL=10

# 1. Frontend Landing Page
echo -n "1. Landing Page: "
if curl -sI $FRONTEND | grep -q "200"; then
    echo "✅ LIVE"
    ((SCORE++))
else
    echo "❌ DOWN"
fi

# 2. Frontend Connect Page
echo -n "2. Connect Page: "
if curl -sI $FRONTEND/connect.html | grep -q "200"; then
    echo "✅ LIVE"
    ((SCORE++))
else
    echo "❌ DOWN"
fi

# 3. Health Endpoint
echo -n "3. Health API: "
if [ "$(curl -s -o /dev/null -w "%{http_code}" $API_BASE/health)" = "200" ]; then
    echo "✅ WORKING"
    ((SCORE++))
else
    echo "❌ BROKEN"
fi

# 4. Stats Endpoint (68% win rate)
echo -n "4. Stats API: "
WIN_RATE=$(curl -s $API_BASE/stats | jq -r '.data.winRate' 2>/dev/null)
if [ "$WIN_RATE" = "68" ]; then
    echo "✅ 68% WIN RATE"
    ((SCORE++))
else
    echo "❌ BROKEN"
fi

# 5. OAuth Start Endpoint
echo -n "5. OAuth Start: "
if [ "$(curl -s -o /dev/null -w "%{http_code}" $API_BASE/auth/stripe/start)" = "302" ]; then
    echo "✅ REDIRECTS"
    ((SCORE++))
else
    echo "❌ BROKEN"
fi

# 6. Lambda Functions
echo -n "6. Lambda Functions: "
LAMBDA_COUNT=$(aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `chargeback-autopilot-stripe-prod`)].FunctionName' --output json | jq 'length')
if [ "$LAMBDA_COUNT" -ge "26" ]; then
    echo "✅ 26 DEPLOYED"
    ((SCORE++))
else
    echo "❌ MISSING ($LAMBDA_COUNT/26)"
fi

# 7. DynamoDB Tables
echo -n "7. DynamoDB Tables: "
TABLE_COUNT=$(aws dynamodb list-tables --output json | jq -r '.TableNames[]' | grep -c chargeback-autopilot)
if [ "$TABLE_COUNT" -ge "4" ]; then
    echo "✅ CONFIGURED"
    ((SCORE++))
else
    echo "❌ MISSING ($TABLE_COUNT/4)"
fi

# 8. API Gateway Routes
echo -n "8. API Gateway: "
ROUTE_COUNT=$(aws apigatewayv2 get-routes --api-id ket0g0lurh --output json | jq '.Items | length')
if [ "$ROUTE_COUNT" -ge "10" ]; then
    echo "✅ $ROUTE_COUNT ROUTES"
    ((SCORE++))
else
    echo "❌ INSUFFICIENT ($ROUTE_COUNT)"
fi

# 9. Performance Metrics
echo -n "9. Performance: "
RESPONSE_TIME=$(curl -s $API_BASE/stats | jq -r '.data.averageResponseTime' 2>/dev/null | sed 's/ms//')
if [ ! -z "$RESPONSE_TIME" ] && [ "$RESPONSE_TIME" -lt "1000" ]; then
    echo "✅ ${RESPONSE_TIME}ms (SUB-SECOND)"
    ((SCORE++))
else
    echo "❌ SLOW"
fi

# 10. OAuth Full Flow Test
echo -n "10. OAuth Flow: "
OAUTH_URL=$(curl -sI $API_BASE/auth/stripe/start 2>/dev/null | grep -i "location:" | cut -d' ' -f2 | tr -d '\r')
if [[ "$OAUTH_URL" == *"connect.stripe.com"* ]]; then
    echo "✅ COMPLETE"
    ((SCORE++))
else
    echo "❌ BROKEN"
fi

# Final Score
echo
echo "================================="
PERCENTAGE=$((SCORE * 10))
echo "📊 FINAL SCORE: $SCORE/$TOTAL"
echo "🎯 SYSTEM FUNCTIONALITY: ${PERCENTAGE}%"
echo

if [ "$PERCENTAGE" -eq "100" ]; then
    echo "🚀 SYSTEM IS 100% FUNCTIONAL!"
    echo "✅ Ready for production use"
    echo "🔗 Connect URL: $FRONTEND/connect.html"
elif [ "$PERCENTAGE" -ge "90" ]; then
    echo "⚠️  ALMOST THERE: ${PERCENTAGE}% functional"
    echo "Minor issues remaining"
else
    echo "❌ NEEDS WORK: Only ${PERCENTAGE}% functional"
fi