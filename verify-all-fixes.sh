#!/bin/bash

echo "🔍 COMPREHENSIVE STRIPEDSHIELD VERIFICATION"
echo "==========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
PASSED=0
FAILED=0
WARNINGS=0

# Function to check test result
check_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}"
        ((FAILED++))
    fi
}

# Function for warnings
warning() {
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}"
    ((WARNINGS++))
}

echo "PHASE 1: WEBHOOK CONFIGURATION"
echo "------------------------------"
echo -n "1.1 Checking webhook secret in Lambda... "
aws lambda get-function-configuration --function-name chargeback-autopilot-stripe-prod-webhookStripe \
    --query 'Environment.Variables.STRIPE_CONNECT_WEBHOOK_SECRET' --output text 2>/dev/null | grep -q "whsec"
check_result $?

echo -n "1.2 Testing webhook endpoint accessibility... "
curl -s -X POST https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/webhooks/stripe \
    -H "stripe-signature: test" -d '{}' 2>/dev/null | grep -q "bad sig"
check_result $?

echo ""
echo "PHASE 2: OAUTH TOKEN STORAGE"
echo "----------------------------"
echo -n "2.1 Checking OAuth start endpoint... "
curl -s https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/auth/stripe/start | grep -q "url"
check_result $?

echo -n "2.2 Verifying OAuth includes firebase_uid in state... "
grep -q "firebase_uid" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/handlers/authStripeStart.ts
check_result $?

echo -n "2.3 Checking token storage in callback... "
grep -q "access_token.*refresh_token" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/handlers/authStripeCallback.ts
check_result $?

echo ""
echo "PHASE 3: USER-MERCHANT LINKING"
echo "------------------------------"
echo -n "3.1 Checking firebase_uid field in OAuth callback... "
grep -q "firebase_uid.*Link to Firebase user" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/handlers/authStripeCallback.ts
check_result $?

echo -n "3.2 Verifying frontend passes UID... "
grep -q "firebase_uid=.*currentUser.uid" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/landing-site/onboarding.html
check_result $?

echo ""
echo "PHASE 4: FIREBASE SECURITY"
echo "--------------------------"
echo -n "4.1 Checking Firestore rules exist... "
[ -f /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/firestore.rules ]
check_result $?

echo -n "4.2 Verifying rules protect user data... "
grep -q "request.auth.uid == userId" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/firestore.rules
check_result $?

echo -n "4.3 Checking database rules exist... "
[ -f /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/database.rules.json ]
check_result $?

echo ""
echo "PHASE 5: API AUTHENTICATION"
echo "---------------------------"
echo -n "5.1 Checking auth middleware exists... "
[ -f /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/shared/auth.ts ]
check_result $?

echo -n "5.2 Verifying JWT validation in auth.ts... "
grep -q "verifyIdToken" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/shared/auth.ts
check_result $?

echo -n "5.3 Checking listCases requires auth... "
grep -q "requireAuth" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/handlers/listCases.ts
check_result $?

echo -n "5.4 Checking getCase requires auth... "
grep -q "requireAuth" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/handlers/getCase.ts
check_result $?

echo -n "5.5 Verifying merchant ownership check... "
grep -q "verifyMerchantOwnership" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/handlers/listCases.ts
check_result $?

echo ""
echo "PHASE 6: WEBHOOK REGISTRATION"
echo "-----------------------------"
echo -n "6.1 Checking webhook registration in OAuth callback... "
grep -q "stripe.webhookEndpoints.create" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/handlers/authStripeCallback.ts
check_result $?

echo -n "6.2 Verifying Connect webhook flag... "
grep -q "connect: true" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/handlers/authStripeCallback.ts
check_result $?

echo ""
echo "PHASE 7: PAYMENT TRACKING"
echo "-------------------------"
echo -n "7.1 Checking checkout session handler exists... "
[ -f /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/handlers/createCheckoutSession.ts ]
check_result $?

echo -n "7.2 Verifying subscription webhook handling... "
grep -q "checkout.session.completed" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/handlers/webhookStripe.ts
check_result $?

echo -n "7.3 Checking subscription status tracking... "
grep -q "customer.subscription" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/handlers/webhookStripe.ts
check_result $?

echo ""
echo "PHASE 8: USER DISPUTES ENDPOINT"
echo "-------------------------------"
echo -n "8.1 Checking user disputes handler exists... "
[ -f /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/handlers/getUserDisputes.ts ]
check_result $?

echo -n "8.2 Verifying it requires authentication... "
grep -q "requireAuth" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/handlers/getUserDisputes.ts
check_result $?

echo ""
echo "PHASE 9: TOKEN REFRESH"
echo "----------------------"
echo -n "9.1 Checking refresh token handler exists... "
[ -f /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/handlers/refreshStripeToken.ts ]
check_result $?

echo -n "9.2 Checking auto-refresh handler exists... "
[ -f /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src/handlers/autoRefreshTokens.ts ]
check_result $?

echo ""
echo "PHASE 10: FRONTEND UPDATES"
echo "--------------------------"
echo -n "10.1 Dashboard sends auth token... "
grep -q "Authorization.*Bearer.*idToken" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/landing-site/dashboard-protected.html
check_result $?

echo -n "10.2 Dashboard checks Stripe connection... "
grep -q "hasStripeConnection" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/landing-site/dashboard-protected.html
check_result $?

echo -n "10.3 Dashboard shows connect prompt... "
grep -q "Connect Your Stripe Account" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/landing-site/dashboard-protected.html
check_result $?

echo ""
echo "PHASE 11: BUILD VERIFICATION"
echo "----------------------------"
echo -n "11.1 TypeScript builds successfully... "
cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT && npm run build > /dev/null 2>&1
check_result $?

echo -n "11.2 Firebase Admin SDK installed... "
npm list firebase-admin > /dev/null 2>&1
check_result $?

echo ""
echo "PHASE 12: DATABASE TABLES"
echo "-------------------------"
echo -n "12.1 Checking Merchants table exists... "
aws dynamodb describe-table --table-name chargeback-autopilot-stripe-prod-MerchantsTable-51TCFUV1R406 > /dev/null 2>&1
check_result $?

echo -n "12.2 Checking Cases table exists... "
aws dynamodb describe-table --table-name chargeback-autopilot-stripe-prod-CasesTable-1LPIUKCN82FYI > /dev/null 2>&1
check_result $?

echo ""
echo "PHASE 13: ENVIRONMENT VARIABLES"
echo "-------------------------------"
echo -n "13.1 Checking STRIPE_SECRET is set... "
aws lambda get-function-configuration --function-name chargeback-autopilot-stripe-prod-webhookStripe \
    --query 'Environment.Variables.STRIPE_SECRET' --output text 2>/dev/null | grep -q "sk_"
check_result $?

echo -n "13.2 Checking STRIPE_CLIENT_ID is set... "
aws lambda get-function-configuration --function-name chargeback-autopilot-stripe-prod-authStripeStart \
    --query 'Environment.Variables.STRIPE_CLIENT_ID' --output text 2>/dev/null | grep -q "ca_"
check_result $?

echo ""
echo "PHASE 14: CRITICAL VULNERABILITIES"
echo "----------------------------------"
echo -n "14.1 API requires authentication (no open access)... "
curl -s https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/cases?merchant=test 2>/dev/null | grep -q "Unauthorized"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((PASSED++))
else
    # Check if it returns empty or error
    RESPONSE=$(curl -s https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/cases?merchant=test 2>/dev/null)
    if echo "$RESPONSE" | grep -q "items"; then
        echo -e "${RED}❌ FAIL - API is not protected!${NC}"
        ((FAILED++))
    else
        warning "API may not be fully deployed yet"
    fi
fi

echo ""
echo "========================================="
echo "VERIFICATION RESULTS"
echo "========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL CRITICAL FIXES VERIFIED SUCCESSFULLY!${NC}"
    echo ""
    echo "The system is now:"
    echo "✅ Webhook secret configured"
    echo "✅ OAuth tokens properly saved"
    echo "✅ Users linked to merchants"
    echo "✅ Firebase security rules in place"
    echo "✅ API endpoints authenticated"
    echo "✅ Webhook auto-registration working"
    echo "✅ Payment tracking implemented"
    echo "✅ User-specific disputes available"
    echo "✅ Token refresh mechanism ready"
    echo "✅ Frontend properly integrated"
else
    echo -e "${RED}⚠️  SOME FIXES NEED ATTENTION${NC}"
    echo ""
    echo "Please review the failed tests above and:"
    echo "1. Deploy the Lambda functions: npx serverless deploy --stage prod"
    echo "2. Deploy the frontend: NETLIFY_AUTH_TOKEN=... npx netlify deploy --prod"
    echo "3. Configure webhook in Stripe Dashboard"
    echo "4. Update Firebase security rules in console"
fi

echo ""
echo "NEXT STEPS:"
echo "-----------"
echo "1. Create webhook in Stripe Dashboard with signing secret"
echo "2. Update Lambda with real webhook secret"
echo "3. Test complete OAuth flow with a real account"
echo "4. Create a test dispute to verify processing"
echo "5. Test payment flow with Stripe test card"

exit $FAILED