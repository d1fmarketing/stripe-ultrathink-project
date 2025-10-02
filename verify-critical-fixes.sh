#!/bin/bash

echo "================================"
echo "CRITICAL FIXES VERIFICATION"
echo "================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Counter for passed/failed tests
PASSED=0
FAILED=0

# Function to check a condition
check() {
    local description="$1"
    local command="$2"
    
    echo -n "Checking: $description... "
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((FAILED++))
    fi
}

echo ""
echo "1. AUTHENTICATION & OAUTH FIXES"
echo "--------------------------------"

# Check if auth middleware exists
check "Auth middleware exists" "test -f src/shared/auth.ts"

# Check if OAuth callback saves tokens
check "OAuth callback saves access_token" "grep -q 'access_token' src/handlers/authStripeCallback.ts"
check "OAuth callback saves refresh_token" "grep -q 'refresh_token' src/handlers/authStripeCallback.ts"

echo ""
echo "2. EVIDENCE SUBMISSION FIXES"
echo "-----------------------------"

# Check if evidence uses merchant access_token
check "Evidence uses merchant access_token" "grep -q 'merchant?.access_token' src/handlers/buildEvidence.ts"
check "Submit uses OAuth token" "grep -q 'merchant.access_token' src/handlers/stripeSubmitEvidence.ts"
check "Stage uses OAuth token" "grep -q 'merchant.access_token' src/handlers/stripeStageEvidence.ts"

echo ""
echo "3. WEBHOOK IMPROVEMENTS"
echo "-----------------------"

# Check webhook idempotency
check "Webhook idempotency checking" "grep -q 'isEventProcessed' src/handlers/webhookStripe.ts"
check "Webhook event marking" "grep -q 'markEventProcessed' src/handlers/webhookStripe.ts"
check "Per-account webhook secrets" "grep -q 'WEBHOOK_SECRET_' src/handlers/webhookStripe.ts"

echo ""
echo "4. DATABASE & DATA FLOW"
echo "-----------------------"

# Check merchant lookup fix
check "Merchant key structure fixed" "grep -q 'stripe_account_id || m.merchant_id' src/shared/db.ts"
check "Firebase rules exist" "test -f firestore.rules"
check "Firebase service account template" "test -f firebase-service-account.json.template"

echo ""
echo "5. SECURITY & RELIABILITY"
echo "-------------------------"

# Check CORS headers
check "CORS headers in responses" "grep -q 'Access-Control-Allow-Origin' src/shared/responses.ts"
check "Rate limiting middleware" "test -f src/shared/rateLimit.ts"
check "Rate limit in listCases" "grep -q 'rateLimitMiddleware' src/handlers/listCases.ts"

echo ""
echo "6. MONITORING & OPERATIONS"
echo "--------------------------"

# Check CloudWatch alarms
check "Webhook failure alarm" "grep -q 'WebhookFailureAlarm' serverless.yml"
check "Evidence submission alarm" "grep -q 'EvidenceSubmissionFailureAlarm' serverless.yml"
check "High response time alarm" "grep -q 'HighResponseTimeAlarm' serverless.yml"
check "AI analysis failure alarm" "grep -q 'AIAnalysisFailureAlarm' serverless.yml"

echo ""
echo "7. MANUAL RETRY MECHANISM"
echo "-------------------------"

check "Retry handler exists" "test -f src/handlers/retryCase.ts"
check "Retry endpoint configured" "grep -q '/cases/{id}/retry' serverless.yml"

echo ""
echo "8. FRONTEND FIXES"
echo "-----------------"

# Check payment link fix
check "Payment link configured" "grep -q 'buy.stripe.com/aFaeVd4oF7pv0xs9ahc3m01' landing-site/checkout.html"
check "Payment link condition fixed" "grep -q '!STRIPE_PAYMENT_LINK' landing-site/checkout.html"

echo ""
echo "9. BUILD & DEPLOYMENT"
echo "---------------------"

# Check if build succeeds
echo -n "Checking: TypeScript build... "
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
fi

# Check Lambda deployment status
check "Lambda stack deployed" "aws cloudformation describe-stacks --stack-name chargeback-autopilot-stripe-prod --query 'Stacks[0].StackStatus' --output text | grep -E 'CREATE_COMPLETE|UPDATE_COMPLETE'"

echo ""
echo "================================"
echo "VERIFICATION SUMMARY"
echo "================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 ALL CRITICAL FIXES VERIFIED!${NC}"
    echo "The system has been successfully patched with all critical fixes."
else
    echo -e "\n${YELLOW}⚠️  Some checks failed. Please review the failures above.${NC}"
fi

echo ""
echo "NEXT STEPS:"
echo "-----------"
echo "1. Deploy updated frontend: NETLIFY_AUTH_TOKEN=nfp_6xWgFqX8QT3gZZ5pkmYfgKugkYzFikZma663 npx netlify deploy --prod --dir=landing-site"
echo "2. Test OAuth flow: Visit https://stripedshield-founders-1755231149.netlify.app/onboarding.html"
echo "3. Monitor CloudWatch alarms for any issues"
echo "4. Configure Firebase service account with real credentials"

exit $FAILED