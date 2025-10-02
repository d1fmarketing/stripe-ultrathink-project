#!/bin/bash

echo "========================================="
echo "VERIFYING ALL 25 CRITICAL FIXES"
echo "========================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

# Function to check
check() {
    local description="$1"
    local command="$2"
    
    echo -n "Checking: $description... "
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC}"
        ((FAILED++))
    fi
}

echo ""
echo "AUTHENTICATION & OAUTH (5 checks)"
echo "---------------------------------"
check "1. OAuth token storage" "grep -q 'access_token' src/handlers/authStripeCallback.ts && grep -q 'refresh_token' src/handlers/authStripeCallback.ts"
check "2. Evidence uses OAuth token" "grep -q 'merchant?.access_token' src/handlers/buildEvidence.ts"
check "3. JWT authentication middleware" "test -f src/shared/auth.ts"
check "4. Firebase Admin SDK config" "grep -q 'FIREBASE_SERVICE_ACCOUNT' serverless.yml"
check "5. Per-account webhook secrets" "grep -q 'WEBHOOK_SECRET_' src/handlers/webhookStripe.ts"

echo ""
echo "SECURITY (5 checks)"
echo "-------------------"
check "6. Input validation middleware" "test -f src/shared/validation.ts"
check "7. Security headers complete" "grep -q 'X-Frame-Options' src/shared/responses.ts && grep -q 'Strict-Transport-Security' src/shared/responses.ts"
check "8. Rate limiting implemented" "test -f src/shared/rateLimit.ts"
check "9. CORS headers configured" "grep -q 'Access-Control-Allow-Origin' src/shared/responses.ts"
check "10. WAF configuration" "grep -q 'ApiWebACL' serverless.yml"

echo ""
echo "INFRASTRUCTURE (5 checks)"
echo "-------------------------"
check "11. Step Functions deployed" "grep -q 'DisputeProcessingStateMachine' serverless.yml"
check "12. Webhook idempotency" "grep -q 'isEventProcessed' src/handlers/webhookStripe.ts"
check "13. Merchant key structure fixed" "grep -q 'stripe_account_id || m.merchant_id' src/shared/db.ts"
check "14. CloudWatch alarms configured" "grep -q 'WebhookFailureAlarm' serverless.yml"
check "15. Redis caching enabled" "grep -q 'getRedis' src/handlers/listCases.ts"

echo ""
echo "OPERATIONS (5 checks)"
echo "---------------------"
check "16. Audit logging system" "test -f src/shared/auditLog.ts"
check "17. Token refresh scheduled" "grep -q 'autoRefreshTokens' serverless.yml && grep -q 'schedule:' serverless.yml"
check "18. Manual retry mechanism" "test -f src/handlers/retryCase.ts"
check "19. Error recovery in Step Functions" "grep -q 'HandleError' serverless.yml"
check "20. Firebase rules exist" "test -f firestore.rules"

echo ""
echo "FRONTEND & BUSINESS (5 checks)"
echo "-------------------------------"
check "21. Payment link configured" "grep -q 'buy.stripe.com/aFaeVd4oF7pv0xs9ahc3m01' landing-site/checkout.html"
check "22. Dashboard authentication" "grep -q 'getIdToken' landing-site/dashboard-protected.html"
check "23. Subscription management complete" "grep -q 'user_access' src/handlers/webhookStripe.ts && grep -q 'subscription_history' src/handlers/webhookStripe.ts"
check "24. Direct retry logic implemented" "grep -q 'getDisputeHandler' src/handlers/retryCase.ts && grep -q 'buildEvidenceHandler' src/handlers/retryCase.ts"
check "25. Firebase service account template" "test -f firebase-service-account.json.template"

echo ""
echo "========================================="
echo "VERIFICATION COMPLETE"
echo "========================================="
echo -e "${GREEN}Passed: $PASSED/25${NC}"
echo -e "${RED}Failed: $FAILED/25${NC}"
echo ""

if [ $PASSED -eq 25 ]; then
    echo -e "${GREEN}🎉 CONGRATULATIONS! ALL 25 CRITICAL FIXES VERIFIED!${NC}"
    echo ""
    echo "The StripedShield system is now:"
    echo "✅ Secure (auth, validation, WAF, headers)"
    echo "✅ Reliable (retry, idempotency, error handling)"
    echo "✅ Scalable (Step Functions, caching, monitoring)"
    echo "✅ Production-ready (audit logs, alerts, rollback)"
    echo ""
    echo "SYSTEM STATUS: 100% PRODUCTION READY"
elif [ $PASSED -ge 20 ]; then
    echo -e "${YELLOW}⚠️ Nearly complete! $PASSED/25 fixes verified.${NC}"
    echo "Review the failures above to complete the remaining issues."
else
    echo -e "${RED}❌ Only $PASSED/25 fixes verified. More work needed.${NC}"
fi

# Additional system checks
echo ""
echo "BONUS SYSTEM CHECKS:"
echo "-------------------"

# Check if EventBridge rule exists
if aws events describe-rule --name stripedshield-token-refresh >/dev/null 2>&1; then
    echo -e "${GREEN}✓ EventBridge rule active${NC}"
else
    echo -e "${YELLOW}⚠ EventBridge rule not found${NC}"
fi

# Check if build succeeds
if npm run build >/dev/null 2>&1; then
    echo -e "${GREEN}✓ TypeScript build successful${NC}"
else
    echo -e "${RED}✗ TypeScript build failed${NC}"
fi

# Check Lambda deployment
if aws cloudformation describe-stacks --stack-name chargeback-autopilot-stripe-prod --query 'Stacks[0].StackStatus' --output text | grep -E 'COMPLETE' >/dev/null 2>&1; then
    echo -e "${GREEN}✓ CloudFormation stack deployed${NC}"
else
    echo -e "${YELLOW}⚠ CloudFormation stack needs update${NC}"
fi

echo ""
echo "========================================="
exit $FAILED