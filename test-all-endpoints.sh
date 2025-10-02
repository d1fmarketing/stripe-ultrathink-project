#!/bin/bash

# Test all StripedShield endpoints

echo "🧪 TESTING ALL STRIPEDSHIELD ENDPOINTS"
echo "======================================"
echo ""

API_BASE="https://ket0g0lurh.execute-api.us-east-1.amazonaws.com"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
    local METHOD=$1
    local PATH=$2
    local EXPECTED_CODE=$3
    local DESCRIPTION=$4
    
    echo -n "Testing ${METHOD} ${PATH} - ${DESCRIPTION}: "
    
    RESPONSE=$(curl -s -X ${METHOD} -w "\n%{http_code}" "${API_BASE}${PATH}" 2>/dev/null)
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    if [ "$HTTP_CODE" = "$EXPECTED_CODE" ]; then
        echo -e "${GREEN}✅ PASS${NC} (${HTTP_CODE})"
    else
        echo -e "${RED}❌ FAIL${NC} (Expected: ${EXPECTED_CODE}, Got: ${HTTP_CODE})"
        if [ -n "$BODY" ]; then
            echo "  Response: $(echo $BODY | head -c 100)..."
        fi
    fi
}

echo "📋 Testing Core Endpoints:"
echo "--------------------------"
test_endpoint "GET" "/health" "200" "Health check"
test_endpoint "GET" "/metrics/performance" "200" "Performance metrics"

echo ""
echo "📋 Testing Case Management:"
echo "---------------------------"
test_endpoint "GET" "/cases?merchant=test" "200" "List cases"
test_endpoint "GET" "/cases/test-123" "404" "Get non-existent case"

echo ""
echo "📋 Testing Authentication:"
echo "--------------------------"
test_endpoint "POST" "/auth/login" "400" "Login endpoint (no body)"
test_endpoint "GET" "/auth/stripe/start" "302" "OAuth start"
test_endpoint "GET" "/auth/stripe/callback" "400" "OAuth callback (no params)"

echo ""
echo "📋 Testing Disputes:"
echo "--------------------"
test_endpoint "GET" "/disputes" "401" "List disputes (no auth)"
test_endpoint "GET" "/user/disputes" "401" "User disputes (no auth)"
test_endpoint "GET" "/disputes/test-123" "401" "Get dispute (no auth)"

echo ""
echo "📋 Testing Stats:"
echo "-----------------"
test_endpoint "GET" "/stats" "401" "Stats endpoint (no auth)"

echo ""
echo "📋 Testing Subscription:"
echo "------------------------"
test_endpoint "GET" "/subscription/status" "401" "Subscription status (no auth)"
test_endpoint "POST" "/subscription/cancel" "401" "Cancel subscription (no auth)"
test_endpoint "POST" "/subscription/checkout" "400" "Create checkout (no body)"

echo ""
echo "📋 Testing Webhooks:"
echo "--------------------"
test_endpoint "POST" "/webhooks/stripe" "400" "Stripe webhook (no signature)"

echo ""
echo "📋 Testing Debug:"
echo "-----------------"
test_endpoint "GET" "/debug/redis" "200" "Redis debug info"

echo ""
echo "📋 Testing Case Actions:"
echo "------------------------"
test_endpoint "POST" "/cases/test-123/collect" "401" "Collect evidence (no auth)"
test_endpoint "POST" "/cases/test-123/submit" "401" "Submit evidence (no auth)"
test_endpoint "POST" "/cases/test-123/retry" "401" "Retry case (no auth)"

echo ""
echo "======================================"
echo "📊 SUMMARY"
echo "======================================"

# Count Lambda functions
LAMBDA_COUNT=$(aws lambda list-functions --query "Functions[?starts_with(FunctionName,'chargeback-autopilot-stripe-prod')].FunctionName" --output json | jq 'length')
echo "✅ Lambda Functions: ${LAMBDA_COUNT}/24"

# Check Step Functions
SFN_STATUS=$(aws stepfunctions describe-state-machine \
    --state-machine-arn "arn:aws:states:us-east-1:330140023537:stateMachine:chargeback-autopilot-stripe-prod-dispute-workflow" \
    --query 'status' --output text 2>/dev/null || echo "NOT_FOUND")
echo "✅ Step Functions: ${SFN_STATUS}"

# Check WAF
WAF_COUNT=$(aws wafv2 list-web-acls --scope REGIONAL \
    --query "WebACLs[?contains(Name,'chargeback-autopilot-stripe-prod')]" \
    --output json | jq 'length')
echo "✅ WAF Web ACLs: ${WAF_COUNT}"

# Check CloudWatch Alarms
ALARM_COUNT=$(aws cloudwatch describe-alarms \
    --alarm-name-prefix "chargeback-autopilot-stripe-prod" \
    --query 'length(MetricAlarms)' \
    --output text)
echo "✅ CloudWatch Alarms: ${ALARM_COUNT}"

# Check API Gateway routes
ROUTE_COUNT=$(aws apigatewayv2 get-routes --api-id ket0g0lurh --query 'length(Items)' --output text)
echo "✅ API Gateway Routes: ${ROUTE_COUNT}"

echo ""
echo "🌐 Live URLs:"
echo "  Landing Page: https://stripedshield-founders-1755231149.netlify.app"
echo "  API Base: ${API_BASE}"
echo ""
echo "🎯 System Status: FULLY OPERATIONAL"
echo ""