#!/bin/bash

# Direct Lambda Deployment Script
# Bypasses serverless framework to deploy missing functions

set -e

echo "🚀 DIRECT LAMBDA DEPLOYMENT - STRIPEDSHIELD"
echo "=========================================="
echo ""

# Configuration
STACK_NAME="chargeback-autopilot-stripe-prod"
REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${STACK_NAME}-${REGION}-lambdaRole"

# Get VPC configuration from existing Lambda
echo "📋 Getting VPC configuration from existing Lambda..."
VPC_CONFIG=$(aws lambda get-function-configuration \
    --function-name "${STACK_NAME}-health" \
    --query 'VpcConfig' \
    --output json 2>/dev/null || echo '{}')

SECURITY_GROUPS=$(echo $VPC_CONFIG | jq -r '.SecurityGroupIds[]' 2>/dev/null | paste -sd ',' - || echo "")
SUBNETS=$(echo $VPC_CONFIG | jq -r '.SubnetIds[]' 2>/dev/null | paste -sd ',' - || echo "")

if [ -z "$SECURITY_GROUPS" ]; then
    echo "⚠️ No VPC configuration found. Using default."
    VPC_ARG=""
else
    echo "✅ Found VPC configuration"
    VPC_ARG="--vpc-config SubnetIds=${SUBNETS},SecurityGroupIds=${SECURITY_GROUPS}"
fi

# Get environment variables from existing Lambda
echo "📋 Getting environment variables..."
ENV_VARS_JSON=$(aws lambda get-function-configuration \
    --function-name "${STACK_NAME}-health" \
    --query 'Environment.Variables' \
    --output json 2>/dev/null || echo '{}')

# Convert to format AWS CLI expects
ENV_VARS="Variables=${ENV_VARS_JSON}"

# Function deployment helper
deploy_lambda() {
    local FUNCTION_NAME=$1
    local HANDLER=$2
    local MEMORY=${3:-1024}
    local TIMEOUT=${4:-10}
    local RUNTIME="nodejs20.x"
    
    echo ""
    echo "🔄 Deploying ${FUNCTION_NAME}..."
    
    # Check if function exists
    if aws lambda get-function --function-name "${STACK_NAME}-${FUNCTION_NAME}" 2>/dev/null >/dev/null; then
        echo "  Function already exists, updating..."
        
        # Update function code
        aws lambda update-function-code \
            --function-name "${STACK_NAME}-${FUNCTION_NAME}" \
            --zip-file "fileb://lambda-deployment.zip" \
            --output text --query 'LastUpdateStatus' | grep -q "Successful" && echo "  ✅ Code updated" || echo "  ⚠️ Code update failed"
        
        # Update function configuration
        aws lambda update-function-configuration \
            --function-name "${STACK_NAME}-${FUNCTION_NAME}" \
            --handler "dist/${HANDLER}" \
            --memory-size ${MEMORY} \
            --timeout ${TIMEOUT} \
            --environment "${ENV_VARS}" \
            $VPC_ARG \
            --output text --query 'LastUpdateStatus' | grep -q "Successful" && echo "  ✅ Configuration updated" || echo "  ⚠️ Configuration update failed"
    else
        echo "  Creating new function..."
        
        # Create the function
        aws lambda create-function \
            --function-name "${STACK_NAME}-${FUNCTION_NAME}" \
            --runtime ${RUNTIME} \
            --role ${ROLE_ARN} \
            --handler "dist/${HANDLER}" \
            --memory-size ${MEMORY} \
            --timeout ${TIMEOUT} \
            --environment "${ENV_VARS}" \
            --zip-file "fileb://lambda-deployment.zip" \
            $VPC_ARG \
            --output text --query 'FunctionArn' && echo "  ✅ Function created" || echo "  ❌ Creation failed"
    fi
}

# Create API Gateway integration helper
create_api_integration() {
    local FUNCTION_NAME=$1
    local PATH=$2
    local METHOD=$3
    
    echo "  🔗 Creating API Gateway integration for ${PATH} ${METHOD}..."
    
    # Get API ID
    API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='${STACK_NAME}'].ApiId" --output text)
    
    if [ -z "$API_ID" ]; then
        echo "  ⚠️ API Gateway not found"
        return
    fi
    
    # Create integration
    INTEGRATION_ID=$(aws apigatewayv2 create-integration \
        --api-id ${API_ID} \
        --integration-type AWS_PROXY \
        --integration-uri "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${STACK_NAME}-${FUNCTION_NAME}" \
        --payload-format-version 2.0 \
        --query 'IntegrationId' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$INTEGRATION_ID" ]; then
        # Create route
        aws apigatewayv2 create-route \
            --api-id ${API_ID} \
            --route-key "${METHOD} ${PATH}" \
            --target "integrations/${INTEGRATION_ID}" \
            --output text --query 'RouteId' >/dev/null 2>&1 && echo "  ✅ Route created: ${METHOD} ${PATH}" || echo "  ⚠️ Route may already exist"
        
        # Add Lambda permission
        aws lambda add-permission \
            --function-name "${STACK_NAME}-${FUNCTION_NAME}" \
            --statement-id "ApiGatewayInvoke-${METHOD}-$(echo ${PATH} | tr '/' '-')" \
            --action lambda:InvokeFunction \
            --principal apigateway.amazonaws.com \
            --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" \
            2>/dev/null && echo "  ✅ Lambda permission added" || echo "  ⚠️ Permission may already exist"
    fi
}

echo ""
echo "📦 Building and packaging Lambda functions..."
npm run build || exit 1

# Create deployment package
echo "📦 Creating deployment package..."
cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT
zip -qr lambda-deployment.zip dist/ node_modules/ package.json

echo ""
echo "🚀 Deploying missing Lambda functions..."

# Deploy authLogin
deploy_lambda "authLogin" "authLoginHandler.handler" 1024 10
create_api_integration "authLogin" "/auth/login" "POST"
create_api_integration "authLogin" "/auth/login" "OPTIONS"

# Deploy autoRefreshTokens (scheduled function, no API)
deploy_lambda "autoRefreshTokens" "autoRefreshTokens.handler" 1536 120

# Deploy disputes
deploy_lambda "disputes" "disputesHandler.handler" 1024 10
create_api_integration "disputes" "/disputes" "GET"
create_api_integration "disputes" "/disputes" "OPTIONS"

# Deploy stats
deploy_lambda "stats" "statsHandler.handler" 1536 10
create_api_integration "stats" "/stats" "GET"

# Deploy retryCase
deploy_lambda "retryCase" "retryCase.handler" 2048 30
create_api_integration "retryCase" "/cases/{id}/retry" "POST"

# Deploy subscriptionStatus
deploy_lambda "subscriptionStatus" "subscriptionManager.getSubscriptionStatus" 1024 10
create_api_integration "subscriptionStatus" "/subscription/status" "GET"

# Deploy subscriptionCancel
deploy_lambda "subscriptionCancel" "subscriptionManager.cancelSubscription" 1024 10
create_api_integration "subscriptionCancel" "/subscription/cancel" "POST"

echo ""
echo "🔄 Creating EventBridge rule for autoRefreshTokens..."
aws events put-rule \
    --name "${STACK_NAME}-token-refresh" \
    --schedule-expression "rate(24 hours)" \
    --description "Daily OAuth token refresh for all connected accounts" \
    --state ENABLED \
    2>/dev/null && echo "✅ EventBridge rule created" || echo "⚠️ Rule may already exist"

# Add Lambda permission for EventBridge
aws lambda add-permission \
    --function-name "${STACK_NAME}-autoRefreshTokens" \
    --statement-id "EventBridgeInvoke" \
    --action lambda:InvokeFunction \
    --principal events.amazonaws.com \
    --source-arn "arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/${STACK_NAME}-token-refresh" \
    2>/dev/null && echo "✅ EventBridge permission added" || echo "⚠️ Permission may already exist"

# Add target to EventBridge rule
aws events put-targets \
    --rule "${STACK_NAME}-token-refresh" \
    --targets "Id=1,Arn=arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${STACK_NAME}-autoRefreshTokens" \
    2>/dev/null && echo "✅ EventBridge target added" || echo "⚠️ Target may already exist"

# Clean up
rm -f lambda-deployment.zip

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo ""
echo "📊 Verification:"
for func in authLogin autoRefreshTokens disputes stats retryCase subscriptionStatus subscriptionCancel; do
    echo -n "  ${func}: "
    aws lambda get-function --function-name "${STACK_NAME}-${func}" 2>/dev/null >/dev/null && echo "✅ DEPLOYED" || echo "❌ NOT FOUND"
done

echo ""
echo "🔗 API Endpoints:"
echo "  POST   /auth/login"
echo "  GET    /disputes"
echo "  GET    /stats"
echo "  POST   /cases/{id}/retry"
echo "  GET    /subscription/status"
echo "  POST   /subscription/cancel"
echo ""
echo "⏰ Scheduled Functions:"
echo "  autoRefreshTokens - runs every 24 hours"
echo ""