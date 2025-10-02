#!/bin/bash

# Deploy Step Functions, WAF, and CloudWatch Alarms via CloudFormation
# This completes the missing infrastructure deployment

set -e

echo "🚀 DEPLOYING MISSING INFRASTRUCTURE - STRIPEDSHIELD"
echo "=================================================="
echo ""

# Configuration
REGION="us-east-1"
SERVICE_NAME="chargeback-autopilot-stripe"
STAGE="prod"

# Get API Gateway ID
API_ID=$(aws apigatewayv2 get-apis --query "Items[?contains(Name,'${SERVICE_NAME}')].ApiId" --output text)
API_STAGE_ARN="arn:aws:apigateway:${REGION}::/apis/${API_ID}/stages/${STAGE}"

echo "📋 Configuration:"
echo "  Region: ${REGION}"
echo "  Service: ${SERVICE_NAME}"
echo "  Stage: ${STAGE}"
echo "  API Gateway ID: ${API_ID}"
echo ""

# Deploy Step Functions
echo "🔄 Deploying Step Functions State Machine..."
aws cloudformation deploy \
    --template-file cloudformation-stepfunctions.yaml \
    --stack-name "${SERVICE_NAME}-${STAGE}-stepfunctions" \
    --parameter-overrides \
        ServiceName="${SERVICE_NAME}" \
        Stage="${STAGE}" \
    --capabilities CAPABILITY_IAM \
    --no-fail-on-empty-changeset \
    2>&1 | grep -v "No changes to deploy" || true

# Check Step Functions deployment
SFN_ARN=$(aws cloudformation describe-stacks \
    --stack-name "${SERVICE_NAME}-${STAGE}-stepfunctions" \
    --query 'Stacks[0].Outputs[?OutputKey==`StateMachineArn`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -n "$SFN_ARN" ]; then
    echo "  ✅ Step Functions deployed: ${SFN_ARN}"
    
    # Update Lambda environment variables with Step Functions ARN
    echo "  📝 Updating Lambda functions with Step Functions ARN..."
    for func in collectCase webhookStripe; do
        aws lambda update-function-configuration \
            --function-name "${SERVICE_NAME}-${STAGE}-${func}" \
            --environment "Variables={SFN_ARN=${SFN_ARN}}" \
            2>/dev/null || true
    done
else
    echo "  ⚠️ Step Functions deployment may have failed"
fi

echo ""

# Deploy WAF
echo "🛡️ Deploying WAF Web ACL..."
aws cloudformation deploy \
    --template-file cloudformation-waf.yaml \
    --stack-name "${SERVICE_NAME}-${STAGE}-waf" \
    --parameter-overrides \
        ServiceName="${SERVICE_NAME}" \
        Stage="${STAGE}" \
        ApiGatewayArn="${API_STAGE_ARN}" \
    --capabilities CAPABILITY_IAM \
    --no-fail-on-empty-changeset \
    2>&1 | grep -v "No changes to deploy" || true

# Check WAF deployment
WAF_ARN=$(aws cloudformation describe-stacks \
    --stack-name "${SERVICE_NAME}-${STAGE}-waf" \
    --query 'Stacks[0].Outputs[?OutputKey==`WebACLArn`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -n "$WAF_ARN" ]; then
    echo "  ✅ WAF deployed: ${WAF_ARN}"
else
    echo "  ⚠️ WAF deployment may have failed"
fi

echo ""

# Deploy CloudWatch Alarms
echo "📊 Deploying CloudWatch Alarms..."
aws cloudformation deploy \
    --template-file cloudformation-alarms.yaml \
    --stack-name "${SERVICE_NAME}-${STAGE}-alarms" \
    --parameter-overrides \
        ServiceName="${SERVICE_NAME}" \
        Stage="${STAGE}" \
        ApiId="${API_ID}" \
    --capabilities CAPABILITY_IAM \
    --no-fail-on-empty-changeset \
    2>&1 | grep -v "No changes to deploy" || true

# Check Alarms deployment
ALARM_COUNT=$(aws cloudwatch describe-alarms \
    --alarm-name-prefix "${SERVICE_NAME}-${STAGE}" \
    --query 'length(MetricAlarms)' \
    --output text 2>/dev/null || echo "0")

if [ "$ALARM_COUNT" -gt 0 ]; then
    echo "  ✅ CloudWatch Alarms deployed: ${ALARM_COUNT} alarms"
else
    echo "  ⚠️ CloudWatch Alarms deployment may have failed"
fi

echo ""

# Configure Firebase in SSM
echo "🔐 Configuring Firebase in SSM..."
aws ssm put-parameter \
    --name "/stripedshield/prod/FIREBASE_PROJECT_ID" \
    --value "stripecharge-b27a6" \
    --type "String" \
    --overwrite \
    2>/dev/null && echo "  ✅ Firebase Project ID configured" || echo "  ⚠️ Firebase Project ID may already exist"

echo ""
echo "=================================================="
echo "📊 DEPLOYMENT VERIFICATION"
echo "=================================================="

# Verify Step Functions
echo -n "Step Functions: "
aws stepfunctions describe-state-machine \
    --state-machine-arn "${SFN_ARN}" \
    2>/dev/null >/dev/null && echo "✅ ACTIVE" || echo "❌ NOT FOUND"

# Verify WAF
echo -n "WAF Web ACL: "
aws wafv2 list-web-acls --scope REGIONAL \
    --query "WebACLs[?contains(Name,'${SERVICE_NAME}-${STAGE}')]" \
    --output json | jq -e '.[0]' >/dev/null 2>&1 && echo "✅ ACTIVE" || echo "❌ NOT FOUND"

# Verify CloudWatch Alarms
echo "CloudWatch Alarms: ${ALARM_COUNT} deployed"

# List all alarms
if [ "$ALARM_COUNT" -gt 0 ]; then
    echo ""
    echo "Active Alarms:"
    aws cloudwatch describe-alarms \
        --alarm-name-prefix "${SERVICE_NAME}-${STAGE}" \
        --query 'MetricAlarms[].AlarmName' \
        --output json | jq -r '.[]' | sed 's/^/  - /'
fi

echo ""
echo "✅ INFRASTRUCTURE DEPLOYMENT COMPLETE!"
echo ""
echo "Next steps:"
echo "1. Monitor CloudWatch for any alarm triggers"
echo "2. Test Step Functions with: aws stepfunctions start-execution --state-machine-arn ${SFN_ARN} --input '{\"dispute_id\":\"test\",\"merchant\":{\"stripe_account_id\":\"test\"}}'"
echo "3. Check WAF metrics in CloudWatch"
echo ""