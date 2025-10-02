#!/bin/bash

# Direct AWS CLI deployment using existing Lambda as template

set -e

echo "🚀 DIRECT AWS CLI LAMBDA DEPLOYMENT"
echo "===================================="
echo ""

STACK_NAME="chargeback-autopilot-stripe-prod"
REGION="us-east-1"
ACCOUNT_ID="330140023537"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${STACK_NAME}-${REGION}-lambdaRole"

# Download existing Lambda deployment package as template
echo "📦 Getting deployment package from existing Lambda..."
aws lambda get-function --function-name "${STACK_NAME}-health" --query 'Code.Location' --output text | xargs curl -s -o template.zip

# Get VPC and environment configuration from existing Lambda
echo "📋 Getting configuration from existing Lambda..."
VPC_CONFIG=$(aws lambda get-function-configuration \
    --function-name "${STACK_NAME}-health" \
    --query 'VpcConfig' \
    --output json)

ENV_VARS=$(aws lambda get-function-configuration \
    --function-name "${STACK_NAME}-health" \
    --query 'Environment' \
    --output json)

SECURITY_GROUPS=$(echo $VPC_CONFIG | jq -r '.SecurityGroupIds[]' | paste -sd ',' -)
SUBNETS=$(echo $VPC_CONFIG | jq -r '.SubnetIds[]' | paste -sd ',' -)

# Function to deploy Lambda
deploy_function() {
    local FUNC_NAME=$1
    local HANDLER=$2
    local MEMORY=${3:-1024}
    local TIMEOUT=${4:-10}
    
    echo ""
    echo "🔄 Deploying ${FUNC_NAME}..."
    
    # Check if function exists
    if aws lambda get-function --function-name "${STACK_NAME}-${FUNC_NAME}" 2>/dev/null >/dev/null; then
        echo "  ✅ Function already exists: ${STACK_NAME}-${FUNC_NAME}"
    else
        echo "  Creating function ${STACK_NAME}-${FUNC_NAME}..."
        aws lambda create-function \
            --function-name "${STACK_NAME}-${FUNC_NAME}" \
            --runtime "nodejs20.x" \
            --role "${ROLE_ARN}" \
            --handler "${HANDLER}" \
            --memory-size ${MEMORY} \
            --timeout ${TIMEOUT} \
            --environment "${ENV_VARS}" \
            --vpc-config "SubnetIds=${SUBNETS},SecurityGroupIds=${SECURITY_GROUPS}" \
            --zip-file "fileb://template.zip" \
            --publish \
            2>&1 | grep -E "(FunctionArn|already exists)" || echo "  ⚠️ May need manual configuration"
    fi
}

# Deploy missing functions
deploy_function "autoRefreshTokens" "dist/autoRefreshTokens.handler" 1536 120
deploy_function "disputes" "dist/disputesHandler.handler" 1024 10
deploy_function "stats" "dist/statsHandler.handler" 1536 10
deploy_function "retryCase" "dist/retryCase.handler" 2048 30
deploy_function "subscriptionStatus" "dist/subscriptionManager.getSubscriptionStatus" 1024 10
deploy_function "subscriptionCancel" "dist/subscriptionManager.cancelSubscription" 1024 10

# Create EventBridge rule for autoRefreshTokens
echo ""
echo "🔄 Creating EventBridge rule for autoRefreshTokens..."
aws events put-rule \
    --name "${STACK_NAME}-token-refresh" \
    --schedule-expression "rate(24 hours)" \
    --description "Daily OAuth token refresh" \
    --state ENABLED \
    2>/dev/null && echo "✅ EventBridge rule created" || echo "⚠️ Rule may already exist"

aws lambda add-permission \
    --function-name "${STACK_NAME}-autoRefreshTokens" \
    --statement-id "EventBridgeInvoke" \
    --action "lambda:InvokeFunction" \
    --principal "events.amazonaws.com" \
    --source-arn "arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/${STACK_NAME}-token-refresh" \
    2>/dev/null || true

aws events put-targets \
    --rule "${STACK_NAME}-token-refresh" \
    --targets "Id=1,Arn=arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${STACK_NAME}-autoRefreshTokens" \
    2>/dev/null || true

# Create API Gateway routes
echo ""
echo "🔗 Creating API Gateway routes..."
API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='${STACK_NAME}'].ApiId" --output text)

if [ -n "$API_ID" ]; then
    echo "  API Gateway ID: ${API_ID}"
    
    # Function to create route
    create_route() {
        local FUNC=$1
        local PATH=$2
        local METHOD=$3
        
        # Create integration
        INTEGRATION_ID=$(aws apigatewayv2 create-integration \
            --api-id ${API_ID} \
            --integration-type AWS_PROXY \
            --integration-uri "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${STACK_NAME}-${FUNC}" \
            --payload-format-version 2.0 \
            --query 'IntegrationId' \
            --output text 2>/dev/null || echo "")
        
        if [ -n "$INTEGRATION_ID" ]; then
            # Create route
            aws apigatewayv2 create-route \
                --api-id ${API_ID} \
                --route-key "${METHOD} ${PATH}" \
                --target "integrations/${INTEGRATION_ID}" \
                2>/dev/null && echo "  ✅ Route: ${METHOD} ${PATH}" || echo "  ⚠️ Route may exist: ${METHOD} ${PATH}"
            
            # Add permission
            aws lambda add-permission \
                --function-name "${STACK_NAME}-${FUNC}" \
                --statement-id "ApiGatewayInvoke-${METHOD}-${FUNC}" \
                --action "lambda:InvokeFunction" \
                --principal "apigateway.amazonaws.com" \
                --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" \
                2>/dev/null || true
        fi
    }
    
    create_route "disputes" "/disputes" "GET"
    create_route "stats" "/stats" "GET"
    create_route "retryCase" "/cases/{id}/retry" "POST"
    create_route "subscriptionStatus" "/subscription/status" "GET"
    create_route "subscriptionCancel" "/subscription/cancel" "POST"
fi

# Clean up
rm -f template.zip

echo ""
echo "📊 DEPLOYMENT VERIFICATION:"
echo "=========================="
for func in authLogin autoRefreshTokens disputes stats retryCase subscriptionStatus subscriptionCancel; do
    echo -n "${func}: "
    aws lambda get-function --function-name "${STACK_NAME}-${func}" 2>/dev/null >/dev/null && echo "✅ DEPLOYED" || echo "❌ NOT FOUND"
done

echo ""
echo "📈 Total Lambda Count:"
TOTAL_LAMBDAS=$(aws lambda list-functions --query "Functions[?starts_with(FunctionName,'${STACK_NAME}')].FunctionName" --output json | jq 'length')
echo "Total Lambda functions deployed: ${TOTAL_LAMBDAS}/24"
echo ""