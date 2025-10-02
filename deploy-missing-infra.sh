#!/bin/bash

# Deploy missing infrastructure components to AWS
# This script deploys Step Functions, WAF, CloudWatch Alarms that are configured but not deployed

set -e

echo "🚀 Deploying missing infrastructure components..."

# Export environment variables
export AWS_REGION=us-east-1
export STAGE=prod

echo "📦 Current directory: $(pwd)"

# Check if we're in the right directory
if [ ! -f "serverless.yml" ]; then
    echo "❌ Error: serverless.yml not found. Please run from project root."
    exit 1
fi

echo "✅ Configuration validated"

# Try a targeted deployment with increased timeout
echo "🔄 Attempting serverless deployment (this may take several minutes)..."

# Use timeout command to limit execution time and background process
timeout 600 npx serverless deploy --stage prod --verbose 2>&1 | tee deploy.log &
DEPLOY_PID=$!

# Monitor deployment
while kill -0 $DEPLOY_PID 2>/dev/null; do
    echo -n "."
    sleep 10
done

wait $DEPLOY_PID
DEPLOY_EXIT=$?

if [ $DEPLOY_EXIT -eq 124 ]; then
    echo ""
    echo "⏰ Deployment timed out after 10 minutes"
    echo "Checking what was actually deployed..."
else
    echo ""
    echo "✅ Deployment command completed with exit code: $DEPLOY_EXIT"
fi

# Verify what got deployed
echo ""
echo "🔍 Verifying deployment status..."

# Check Step Functions
echo -n "Step Functions: "
if aws stepfunctions describe-state-machine \
    --state-machine-arn "arn:aws:states:us-east-1:$(aws sts get-caller-identity --query Account --output text):stateMachine:chargeback-autopilot-stripe-prod-dispute-workflow" \
    2>/dev/null >/dev/null; then
    echo "✅ DEPLOYED"
else
    echo "❌ NOT FOUND"
fi

# Check WAF
echo -n "WAF WebACL: "
if aws wafv2 list-web-acls --scope REGIONAL --query "WebACLs[?contains(Name,'chargeback-autopilot-stripe-prod')]" --output json | jq -e '.[0]' >/dev/null 2>&1; then
    echo "✅ DEPLOYED"
else
    echo "❌ NOT FOUND"
fi

# Check CloudWatch Alarms
echo -n "CloudWatch Alarms: "
ALARM_COUNT=$(aws cloudwatch describe-alarms --alarm-name-prefix "chargeback-autopilot-stripe-prod" --query 'length(MetricAlarms)' --output text)
if [ "$ALARM_COUNT" -gt 0 ]; then
    echo "✅ $ALARM_COUNT DEPLOYED"
else
    echo "❌ NONE FOUND"
fi

# Check autoRefreshTokens Lambda
echo -n "autoRefreshTokens Lambda: "
if aws lambda get-function --function-name "chargeback-autopilot-stripe-prod-autoRefreshTokens" 2>/dev/null >/dev/null; then
    echo "✅ DEPLOYED"
else
    echo "❌ NOT FOUND"
fi

# Check retryCase Lambda
echo -n "retryCase Lambda: "
if aws lambda get-function --function-name "chargeback-autopilot-stripe-prod-retryCase" 2>/dev/null >/dev/null; then
    echo "✅ DEPLOYED"
else
    echo "❌ NOT FOUND"
fi

echo ""
echo "📊 Deployment verification complete!"
echo ""
echo "💡 If components are missing, try:"
echo "   1. Check deploy.log for errors"
echo "   2. Verify AWS credentials and permissions"
echo "   3. Try deploying individual functions with: npx serverless deploy function -f functionName"
echo "   4. Check CloudFormation stack events for rollback reasons"

# Check stack status
echo ""
echo "📈 Stack Status:"
aws cloudformation describe-stacks --stack-name chargeback-autopilot-stripe-prod \
    --query 'Stacks[0].{Status:StackStatus,LastUpdate:LastUpdatedTime}' \
    --output table