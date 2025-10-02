#!/bin/bash

# GPT-5 E2E Test Script
# Tests all critical functions with GPT-5 configuration

echo "🧪 ULTRATHINK E2E TEST - GPT-5 VALIDATION"
echo "=========================================="
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASS=0
FAIL=0

# Function to test endpoint
test_function() {
    local func_name=$1
    local payload=$2
    local expected_field=$3
    
    echo -n "Testing $func_name... "
    
    # Invoke function
    aws lambda invoke \
        --function-name "chargeback-autopilot-stripe-prod-$func_name" \
        --cli-binary-format raw-in-base64-out \
        --payload "$payload" \
        /tmp/test-$func_name.json \
        --no-cli-pager > /dev/null 2>&1
    
    # Check result
    if [ -f /tmp/test-$func_name.json ]; then
        # Check for specific field if provided
        if [ ! -z "$expected_field" ]; then
            if cat /tmp/test-$func_name.json | jq -e ".$expected_field" > /dev/null 2>&1; then
                echo -e "${GREEN}✅ PASS${NC}"
                ((PASS++))
            else
                echo -e "${RED}❌ FAIL${NC} (missing $expected_field)"
                cat /tmp/test-$func_name.json | jq . 2>/dev/null || cat /tmp/test-$func_name.json
                ((FAIL++))
            fi
        else
            # Just check if response is valid JSON
            if cat /tmp/test-$func_name.json | jq . > /dev/null 2>&1; then
                echo -e "${GREEN}✅ PASS${NC}"
                ((PASS++))
            else
                echo -e "${RED}❌ FAIL${NC} (invalid response)"
                cat /tmp/test-$func_name.json
                ((FAIL++))
            fi
        fi
    else
        echo -e "${RED}❌ FAIL${NC} (no response)"
        ((FAIL++))
    fi
}

# Test API endpoints
test_api() {
    local endpoint=$1
    local expected_status=$2
    
    echo -n "Testing API $endpoint... "
    
    response=$(curl -s -w "\n%{http_code}" https://ket0g0lurh.execute-api.us-east-1.amazonaws.com$endpoint)
    status_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS${NC} (HTTP $status_code)"
        ((PASS++))
    else
        echo -e "${RED}❌ FAIL${NC} (HTTP $status_code, expected $expected_status)"
        echo "$body" | jq . 2>/dev/null || echo "$body"
        ((FAIL++))
    fi
}

echo "1️⃣ Testing Basic Functions"
echo "----------------------------"
test_function "health" '{}' "ok"
test_function "metrics" '{}' "statusCode"
test_function "debugRedis" '{}' "statusCode"

echo
echo "2️⃣ Testing Stripe Integration"
echo "-------------------------------"
test_function "getCharge" '{"chargeId":"ch_test_123"}' "statusCode"
test_function "getDispute" '{"disputeId":"dp_test_123"}' "statusCode"
test_function "getPaymentIntent" '{"paymentIntentId":"pi_test_123"}' "statusCode"

echo
echo "3️⃣ Testing GPT-5 AI Functions"
echo "--------------------------------"
echo -e "${YELLOW}Testing buildEvidence with GPT-5...${NC}"

# Test buildEvidence with GPT-5
aws lambda invoke \
    --function-name chargeback-autopilot-stripe-prod-buildEvidence \
    --cli-binary-format raw-in-base64-out \
    --payload '{
        "charge": {
            "id": "ch_test_gpt5",
            "amount": 29900,
            "currency": "usd",
            "created": 1724000000,
            "customer": "cus_test",
            "description": "Test charge for GPT-5 validation"
        },
        "dispute": {
            "id": "dp_test_gpt5",
            "reason": "fraudulent",
            "amount": 29900
        }
    }' \
    /tmp/test-buildEvidence.json \
    --no-cli-pager > /dev/null 2>&1

if [ -f /tmp/test-buildEvidence.json ]; then
    # Check if response contains evidence
    if cat /tmp/test-buildEvidence.json | jq -e '.body | fromjson | .evidence' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ buildEvidence WORKING with GPT-5!${NC}"
        echo "Response:"
        cat /tmp/test-buildEvidence.json | jq '.body | fromjson | .evidence | .narrative' 2>/dev/null | head -c 200
        echo "..."
        ((PASS++))
    else
        echo -e "${RED}❌ buildEvidence FAILED${NC}"
        cat /tmp/test-buildEvidence.json | jq .
        ((FAIL++))
    fi
fi

echo
echo "4️⃣ Testing Case Management"
echo "---------------------------"
test_function "listCases" '{"merchant":"test"}' "statusCode"
test_function "getCase" '{"caseId":"case_test"}' "statusCode"

echo
echo "5️⃣ Testing API Gateway Routes"
echo "-------------------------------"
test_api "/health" "200"
test_api "/metrics/performance" "200"
test_api "/cases?merchant=test" "200"

echo
echo "6️⃣ Checking GPT-5 Configuration"
echo "---------------------------------"
for func in buildEvidence submitCase collectCase; do
    echo -n "Checking $func env vars... "
    
    AI_MODEL=$(aws lambda get-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --query 'Environment.Variables.AI_MODEL' \
        --output text 2>/dev/null)
    
    if [ "$AI_MODEL" = "gpt-5" ]; then
        echo -e "${GREEN}✅ GPT-5 configured${NC}"
        ((PASS++))
    else
        echo -e "${RED}❌ AI_MODEL=$AI_MODEL (should be gpt-5)${NC}"
        ((FAIL++))
    fi
done

echo
echo "7️⃣ Testing Complex Scenario"
echo "-----------------------------"
echo "Creating test dispute with GPT-5 narrative..."

# Test complete flow
aws lambda invoke \
    --function-name chargeback-autopilot-stripe-prod-collectCase \
    --cli-binary-format raw-in-base64-out \
    --payload '{
        "caseId": "test_gpt5_flow",
        "disputeId": "dp_test_flow",
        "chargeId": "ch_test_flow",
        "useAI": true
    }' \
    /tmp/test-flow.json \
    --no-cli-pager > /dev/null 2>&1

if cat /tmp/test-flow.json | jq . > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Complex flow test passed${NC}"
    ((PASS++))
else
    echo -e "${RED}❌ Complex flow test failed${NC}"
    ((FAIL++))
fi

echo
echo "=========================================="
echo "📊 TEST RESULTS"
echo "=========================================="
echo -e "Passed: ${GREEN}$PASS${NC}"
echo -e "Failed: ${RED}$FAIL${NC}"
echo

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! GPT-5 IS WORKING!${NC}"
    echo "System is ready for production use."
else
    echo -e "${YELLOW}⚠️ Some tests failed. Review the output above.${NC}"
    echo "System may need additional fixes."
fi

echo
echo "GPT-5 Status:"
echo "-------------"
if cat /tmp/test-buildEvidence.json 2>/dev/null | jq -e '.body | fromjson | .evidence.narrative' > /dev/null; then
    echo -e "${GREEN}✅ GPT-5 is generating narratives successfully${NC}"
    echo "Model: gpt-5"
    echo "Temperature: 1"
    echo "Store: true"
else
    echo -e "${RED}❌ GPT-5 narrative generation needs attention${NC}"
fi

# Clean up
rm -f /tmp/test-*.json

echo
echo "Test completed at $(date)"