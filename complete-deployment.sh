#!/bin/bash

# Complete deployment script for StripedShield
# Run this to deploy all remaining infrastructure

echo "🚀 STRIPEDSHIELD COMPLETE DEPLOYMENT SCRIPT"
echo "==========================================="
echo ""
echo "This script will deploy:"
echo "  • 7 missing Lambda functions"
echo "  • Step Functions state machine"
echo "  • WAF Web ACL"
echo "  • CloudWatch Alarms"
echo "  • Firebase configuration"
echo ""

# Set environment
export AWS_REGION=us-east-1
export STAGE=prod

echo "📦 Step 1: Building TypeScript..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix compilation errors."
    exit 1
fi
echo "✅ Build successful"
echo ""

echo "🔄 Step 2: Deploying to AWS..."
echo "This may take 10-15 minutes..."
npx serverless deploy --stage prod

if [ $? -eq 0 ]; then
    echo "✅ Serverless deployment completed"
else
    echo "⚠️ Serverless deployment had issues"
    echo "Trying individual function deployments..."
    
    # Deploy missing functions individually
    for func in authLogin autoRefreshTokens disputes stats retryCase subscriptionStatus subscriptionCancel; do
        echo "Deploying $func..."
        npx serverless deploy function -f $func --stage prod
    done
fi

echo ""
echo "🔐 Step 3: Configuring Firebase..."
aws ssm put-parameter \
    --name "/stripedshield/prod/FIREBASE_PROJECT_ID" \
    --value "stripecharge-b27a6" \
    --type "String" \
    --overwrite \
    2>/dev/null && echo "✅ Firebase Project ID configured" || echo "⚠️ Firebase config may already exist"

echo ""
echo "📊 Step 4: Verifying deployment..."
echo ""

# Check Lambda functions
echo "Lambda Functions:"
for func in authLogin autoRefreshTokens disputes stats retryCase subscriptionStatus subscriptionCancel; do
    echo -n "  $func: "
    aws lambda get-function --function-name "chargeback-autopilot-stripe-prod-$func" 2>/dev/null >/dev/null && echo "✅" || echo "❌"
done

# Check Step Functions
echo ""
echo -n "Step Functions: "
aws stepfunctions describe-state-machine \
    --state-machine-arn "arn:aws:states:us-east-1:$(aws sts get-caller-identity --query Account --output text):stateMachine:chargeback-autopilot-stripe-prod-dispute-workflow" \
    2>/dev/null >/dev/null && echo "✅" || echo "❌"

# Check WAF
echo -n "WAF Web ACL: "
aws wafv2 list-web-acls --scope REGIONAL --query "WebACLs[?contains(Name,'chargeback-autopilot-stripe-prod')]" --output json | jq -e '.[0]' >/dev/null 2>&1 && echo "✅" || echo "❌"

# Check CloudWatch Alarms
echo -n "CloudWatch Alarms: "
ALARM_COUNT=$(aws cloudwatch describe-alarms --alarm-name-prefix "chargeback-autopilot-stripe-prod" --query 'length(MetricAlarms)' --output text)
if [ "$ALARM_COUNT" -gt 0 ]; then
    echo "✅ ($ALARM_COUNT alarms)"
else
    echo "❌"
fi

echo ""
echo "============================================"
echo "📈 DEPLOYMENT SUMMARY"
echo "============================================"

# Count deployed functions
TOTAL_FUNCTIONS=$(aws lambda list-functions --query "Functions[?contains(FunctionName, 'chargeback-autopilot-stripe-prod')].FunctionName" --output json | jq '. | length')
echo "Total Lambda Functions: $TOTAL_FUNCTIONS/24"

# Test health endpoint
echo ""
echo "Testing health endpoint..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/health)
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ API is responding (HTTP 200)"
else
    echo "⚠️ API returned HTTP $HTTP_CODE"
fi

echo ""
echo "🎯 Next Steps:"
echo "1. If any components failed, run: npx serverless deploy --stage prod"
echo "2. Test the frontend at: https://stripedshield-founders-1755231149.netlify.app"
echo "3. Monitor logs: aws logs tail /aws/lambda/chargeback-autopilot-stripe-prod-buildEvidence --follow"
echo ""
echo "For support, check the logs:"
echo "  aws logs tail /aws/lambda/chargeback-autopilot-stripe-prod-FUNCTION_NAME --follow"
echo ""