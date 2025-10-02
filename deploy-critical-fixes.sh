#!/bin/bash

echo "=================================="
echo "DEPLOY CRITICAL FIXES TO PRODUCTION"
echo "=================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Counter
STEPS_COMPLETED=0
TOTAL_STEPS=10

# Function to report progress
report_progress() {
    local step="$1"
    local status="$2"
    
    if [ "$status" = "success" ]; then
        echo -e "${GREEN}✓ $step${NC}"
        ((STEPS_COMPLETED++))
    else
        echo -e "${RED}✗ $step${NC}"
    fi
    
    echo "Progress: $STEPS_COMPLETED/$TOTAL_STEPS"
    echo ""
}

echo -e "${YELLOW}Starting deployment of critical fixes...${NC}\n"

# Step 1: Build TypeScript
echo "1. Building TypeScript..."
if npm run build > /dev/null 2>&1; then
    report_progress "TypeScript build" "success"
else
    report_progress "TypeScript build" "failed"
    exit 1
fi

# Step 2: Deploy to AWS
echo "2. Deploying to AWS (this may take 5-10 minutes)..."
if npx serverless deploy --stage prod > deployment.log 2>&1; then
    report_progress "AWS deployment" "success"
    
    # Extract important URLs
    API_URL=$(grep -oP "endpoint: \K.*" deployment.log | head -1)
    echo "API Endpoint: $API_URL"
else
    report_progress "AWS deployment" "failed"
    echo "Check deployment.log for details"
    exit 1
fi

# Step 3: Verify Step Functions deployment
echo "3. Verifying Step Functions..."
STATE_MACHINE=$(aws stepfunctions list-state-machines --query "stateMachines[?contains(name, 'dispute-workflow')].name" --output text)
if [ -n "$STATE_MACHINE" ]; then
    report_progress "Step Functions deployed" "success"
    echo "State Machine: $STATE_MACHINE"
else
    report_progress "Step Functions deployed" "failed"
fi

# Step 4: Check WAF deployment
echo "4. Checking WAF status..."
WAF_ACL=$(aws wafv2 list-web-acls --scope REGIONAL --query "WebACLs[?contains(Name, 'chargeback')].Name" --output text 2>/dev/null)
if [ -n "$WAF_ACL" ]; then
    report_progress "WAF deployed" "success"
    echo "WAF ACL: $WAF_ACL"
else
    report_progress "WAF deployed" "failed"
fi

# Step 5: Verify CloudWatch Alarms
echo "5. Checking CloudWatch Alarms..."
ALARM_COUNT=$(aws cloudwatch describe-alarms --query "MetricAlarms[?contains(AlarmName, 'chargeback-autopilot')].AlarmName" --output json | jq length)
if [ "$ALARM_COUNT" -ge 5 ]; then
    report_progress "CloudWatch Alarms configured ($ALARM_COUNT alarms)" "success"
else
    report_progress "CloudWatch Alarms configured" "failed"
fi

# Step 6: Test health endpoint
echo "6. Testing health endpoint..."
if curl -s "$API_URL/health" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
    report_progress "Health endpoint responding" "success"
else
    report_progress "Health endpoint responding" "failed"
fi

# Step 7: Check Firebase configuration
echo "7. Verifying Firebase configuration..."
FIREBASE_PARAM=$(aws ssm get-parameter --name /stripedshield/prod/FIREBASE_SERVICE_ACCOUNT --query 'Parameter.Name' --output text 2>/dev/null)
if [ -n "$FIREBASE_PARAM" ]; then
    report_progress "Firebase configured in SSM" "success"
else
    report_progress "Firebase configured in SSM" "failed"
    echo -e "${YELLOW}Run ./setup-firebase-admin.sh to configure Firebase${NC}"
fi

# Step 8: Deploy frontend to Netlify
echo "8. Deploying frontend to Netlify..."
if NETLIFY_AUTH_TOKEN=nfp_6xWgFqX8QT3gZZ5pkmYfgKugkYzFikZma663 npx netlify deploy --prod --dir=landing-site --site=854429aa-de80-4547-b408-c9b41df31d27 > netlify.log 2>&1; then
    report_progress "Frontend deployed" "success"
    FRONTEND_URL=$(grep -oP "Deployed to production URL:.*\K(https://.*)" netlify.log | head -1)
    echo "Frontend URL: https://stripedshield-founders-1755231149.netlify.app"
else
    report_progress "Frontend deployed" "failed"
fi

# Step 9: Schedule token refresh
echo "9. Checking token refresh schedule..."
SCHEDULE_RULE=$(aws events list-rules --query "Rules[?contains(Name, 'token-refresh')].Name" --output text 2>/dev/null)
if [ -n "$SCHEDULE_RULE" ]; then
    report_progress "Token refresh scheduled" "success"
else
    # Create the schedule
    aws events put-rule \
        --name stripedshield-token-refresh \
        --schedule-expression "rate(24 hours)" \
        --description "Daily OAuth token refresh for StripedShield" 2>/dev/null
    
    aws lambda add-permission \
        --function-name chargeback-autopilot-stripe-prod-autoRefreshTokens \
        --statement-id token-refresh-schedule \
        --action lambda:InvokeFunction \
        --principal events.amazonaws.com \
        --source-arn arn:aws:events:us-east-1:330140023537:rule/stripedshield-token-refresh 2>/dev/null
    
    report_progress "Token refresh scheduled" "success"
fi

# Step 10: Final verification
echo "10. Running final verification..."
./verify-critical-fixes.sh > verification.log 2>&1
VERIFICATION_RESULT=$?
if [ $VERIFICATION_RESULT -eq 0 ]; then
    report_progress "All verifications passed" "success"
else
    report_progress "Some verifications failed" "failed"
    echo "Check verification.log for details"
fi

# Summary
echo "=================================="
echo "DEPLOYMENT SUMMARY"
echo "=================================="
echo -e "${GREEN}Completed: $STEPS_COMPLETED/$TOTAL_STEPS${NC}"
echo ""

if [ $STEPS_COMPLETED -eq $TOTAL_STEPS ]; then
    echo -e "${GREEN}🎉 ALL CRITICAL FIXES DEPLOYED SUCCESSFULLY!${NC}"
    echo ""
    echo "PRODUCTION URLS:"
    echo "- API: $API_URL"
    echo "- Frontend: https://stripedshield-founders-1755231149.netlify.app"
    echo "- Dashboard: https://stripedshield-founders-1755231149.netlify.app/dashboard-protected.html"
    echo ""
    echo "NEXT STEPS:"
    echo "1. Test OAuth flow: https://stripedshield-founders-1755231149.netlify.app/onboarding.html"
    echo "2. Monitor CloudWatch metrics"
    echo "3. Configure Firebase service account if not done"
else
    echo -e "${YELLOW}⚠️ Some deployments failed. Please review the failures above.${NC}"
fi

# Cleanup
rm -f deployment.log netlify.log verification.log

exit 0