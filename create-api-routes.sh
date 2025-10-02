#!/bin/bash

# Create API Gateway routes for all Lambda functions

set -e

echo "🔗 CREATING API GATEWAY ROUTES"
echo "=============================="
echo ""

STACK_NAME="chargeback-autopilot-stripe-prod"
REGION="us-east-1"
ACCOUNT_ID="330140023537"

# Get API Gateway ID - use known production API ID
API_ID="ket0g0lurh"

if [ -z "$API_ID" ]; then
    echo "❌ API Gateway not found"
    exit 1
fi

echo "📋 API Gateway ID: ${API_ID}"
echo ""

# Function to create route with integration
create_route() {
    local FUNC_NAME=$1
    local PATH=$2
    local METHOD=$3
    
    echo "Creating route: ${METHOD} ${PATH} -> ${FUNC_NAME}"
    
    # Check if route already exists
    EXISTING_ROUTE=$(aws apigatewayv2 get-routes --api-id ${API_ID} \
        --query "Items[?RouteKey=='${METHOD} ${PATH}'].RouteId" \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$EXISTING_ROUTE" ]; then
        echo "  ✅ Route already exists"
        return
    fi
    
    # Check if integration already exists for this function
    EXISTING_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id ${API_ID} \
        --query "Items[?IntegrationUri=='arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${STACK_NAME}-${FUNC_NAME}'].IntegrationId" \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$EXISTING_INTEGRATION" ]; then
        # Create integration
        INTEGRATION_ID=$(aws apigatewayv2 create-integration \
            --api-id ${API_ID} \
            --integration-type AWS_PROXY \
            --integration-uri "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${STACK_NAME}-${FUNC_NAME}" \
            --payload-format-version 2.0 \
            --query 'IntegrationId' \
            --output text)
        echo "  Created integration: ${INTEGRATION_ID}"
    else
        INTEGRATION_ID=$EXISTING_INTEGRATION
        echo "  Using existing integration: ${INTEGRATION_ID}"
    fi
    
    # Create route
    aws apigatewayv2 create-route \
        --api-id ${API_ID} \
        --route-key "${METHOD} ${PATH}" \
        --target "integrations/${INTEGRATION_ID}" \
        --output text --query 'RouteId' >/dev/null && echo "  ✅ Route created" || echo "  ⚠️ Route creation failed"
    
    # Add Lambda permission
    STATEMENT_ID="ApiGatewayInvoke-${METHOD}-$(echo ${PATH} | tr '/' '-' | tr '{' '-' | tr '}' '-')"
    aws lambda add-permission \
        --function-name "${STACK_NAME}-${FUNC_NAME}" \
        --statement-id "${STATEMENT_ID}" \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" \
        2>/dev/null && echo "  ✅ Lambda permission added" || echo "  ⚠️ Permission may already exist"
    
    echo ""
}

echo "🚀 Creating routes for all endpoints..."
echo ""

# Health & Metrics
create_route "health" "/health" "GET"
create_route "metrics" "/metrics/performance" "GET"

# Authentication
create_route "authLogin" "/auth/login" "POST"
create_route "authLogin" "/auth/login" "OPTIONS"
create_route "authStripeStart" "/auth/stripe/start" "GET"
create_route "authStripeCallback" "/auth/stripe/callback" "GET"

# Cases
create_route "listCases" "/cases" "GET"
create_route "getCase" "/cases/{id}" "GET"
create_route "collectCase" "/cases/{id}/collect" "POST"
create_route "submitCase" "/cases/{id}/submit" "POST"
create_route "retryCase" "/cases/{id}/retry" "POST"

# Disputes
create_route "disputes" "/disputes" "GET"
create_route "disputes" "/disputes" "OPTIONS"
create_route "getUserDisputes" "/user/disputes" "GET"
create_route "getDispute" "/disputes/{id}" "GET"

# Stats
create_route "stats" "/stats" "GET"
create_route "stats" "/stats" "OPTIONS"

# Subscription
create_route "subscriptionStatus" "/subscription/status" "GET"
create_route "subscriptionStatus" "/subscription/status" "OPTIONS"
create_route "subscriptionCancel" "/subscription/cancel" "POST"
create_route "subscriptionCancel" "/subscription/cancel" "OPTIONS"
create_route "createCheckoutSession" "/subscription/checkout" "POST"

# Webhooks
create_route "webhookStripe" "/webhooks/stripe" "POST"

# Debug (if needed)
create_route "debugRedis" "/debug/redis" "GET"

echo "📊 ROUTE VERIFICATION"
echo "===================="
echo ""
echo "Total routes created:"
aws apigatewayv2 get-routes --api-id ${API_ID} --query 'length(Items)' --output text

echo ""
echo "Routes list:"
aws apigatewayv2 get-routes --api-id ${API_ID} \
    --query 'Items[].RouteKey' \
    --output text | tr '\t' '\n' | sort | uniq

echo ""
echo "✅ API Gateway routes configuration complete!"
echo ""
echo "🔗 API Base URL: https://${API_ID}.execute-api.${REGION}.amazonaws.com"
echo ""