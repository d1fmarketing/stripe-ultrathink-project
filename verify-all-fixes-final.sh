#!/bin/bash

# Final verification of all 25+ critical fixes for StripedShield
# This script checks both code implementation and actual deployment

# Don't exit on error - we want to see all results
set +e

echo "🔍 ULTRATHINK VERIFICATION - CHECKING ALL 25+ CRITICAL FIXES"
echo "============================================================"
echo ""

PASS_COUNT=0
FAIL_COUNT=0

# Function to check if something exists
check() {
    local NAME="$1"
    local COMMAND="$2"
    echo -n "Checking $NAME... "
    if eval "$COMMAND" > /dev/null 2>&1; then
        echo "✅ PASS"
        ((PASS_COUNT++))
        return 0
    else
        echo "❌ FAIL"
        ((FAIL_COUNT++))
        return 1
    fi
}

# Function to check code implementation
check_code() {
    local NAME="$1"
    local FILE="$2"
    local PATTERN="$3"
    echo -n "Code Check - $NAME... "
    if grep -q "$PATTERN" "$FILE" 2>/dev/null; then
        echo "✅ IMPLEMENTED"
        ((PASS_COUNT++))
        return 0
    else
        echo "❌ NOT FOUND"
        ((FAIL_COUNT++))
        return 1
    fi
}

echo "🔐 1. AUTHENTICATION & AUTHORIZATION FIXES"
echo "----------------------------------------"
check_code "requireAuth in submitCase" "src/handlers/submitCase.ts" "requireAuth"
check_code "requireAuth in collectCase" "src/handlers/collectCase.ts" "requireAuth"
check_code "verifyMerchantOwnership in submitCase" "src/handlers/submitCase.ts" "verifyMerchantOwnership"
check_code "verifyMerchantOwnership in collectCase" "src/handlers/collectCase.ts" "verifyMerchantOwnership"
check_code "JWT validation in auth middleware" "src/shared/auth.ts" "verifyIdToken"

echo ""
echo "📝 2. AUDIT LOGGING IMPLEMENTATION"
echo "-----------------------------------"
check_code "Audit logging in authStripeCallback" "src/handlers/authStripeCallback.ts" "createAuditLog"
check_code "Audit logging in submitCase" "src/handlers/submitCase.ts" "createAuditLog"
check_code "AuditLog module exists" "src/shared/auditLog.ts" "export.*createAuditLog"

echo ""
echo "🛡️ 3. INPUT VALIDATION"
echo "----------------------"
check_code "Validation middleware exists" "src/shared/validation.ts" "validationMiddleware"
check_code "Validation in listCases" "src/handlers/listCases.ts" "validationMiddleware"
check_code "Validation in getCase" "src/handlers/getCase.ts" "validationMiddleware"
check_code "Validation in disputesHandler" "src/handlers/disputesHandler.ts" "validationMiddleware"

echo ""
echo "💾 4. REAL DATA VS MOCK DATA"
echo "----------------------------"
echo -n "Mock data removed from disputesHandler... "
if ! grep -q "generateMockDisputes" "src/handlers/disputesHandler.ts" 2>/dev/null; then
    echo "✅ REMOVED"
    ((PASS_COUNT++))
else
    echo "❌ STILL PRESENT"
    ((FAIL_COUNT++))
fi

check_code "Real Stripe data in disputesHandler" "src/handlers/disputesHandler.ts" "stripe.disputes.list"

echo ""
echo "🔄 5. SUBSCRIPTION MANAGEMENT"
echo "------------------------------"
check_code "Subscription manager module" "src/handlers/subscriptionManager.ts" "handleSubscriptionEvent"
check_code "Subscription endpoints in serverless.yml" "serverless.yml" "subscriptionStatus"
check_code "Subscription webhook handling" "src/handlers/webhookStripe.ts" "handleSubscriptionEvent"

echo ""
echo "🔐 6. OAUTH TOKEN MANAGEMENT"
echo "-----------------------------"
check_code "OAuth tokens saved in authStripeCallback" "src/handlers/authStripeCallback.ts" "access_token.*// CRITICAL"
check_code "Token refresh handler exists" "src/handlers/autoRefreshTokens.ts" "refresh_token"

echo ""
echo "🚦 7. RATE LIMITING"
echo "-------------------"
check_code "Rate limiting middleware" "src/shared/rateLimit.ts" "rateLimitMiddleware"
check_code "Rate limiting in listCases" "src/handlers/listCases.ts" "rateLimitMiddleware"

echo ""
echo "📊 8. REDIS CACHING"
echo "-------------------"
check_code "Redis in listCases" "src/handlers/listCases.ts" "Redis.*ioredis"
check_code "Cache TTL configured" "src/handlers/listCases.ts" "setex.*90"

echo ""
echo "🔒 9. SECURITY HEADERS"
echo "----------------------"
check_code "CORS headers" "src/shared/responses.ts" "Access-Control-Allow-Origin"
check_code "Security headers (CSP)" "src/shared/responses.ts" "Content-Security-Policy"
check_code "HSTS header" "src/shared/responses.ts" "Strict-Transport-Security"

echo ""
echo "🪝 10. WEBHOOK IMPROVEMENTS"
echo "----------------------------"
check_code "Webhook idempotency" "src/shared/webhookIdempotency.ts" "isDuplicate"
check_code "Per-account webhook secrets" "src/shared/webhookSecrets.ts" "getMerchantWebhookSecret"

echo ""
echo "☁️ 11. AWS INFRASTRUCTURE DEPLOYMENT"
echo "-------------------------------------"
check "Step Functions deployed" "aws stepfunctions describe-state-machine --state-machine-arn arn:aws:states:us-east-1:$(aws sts get-caller-identity --query Account --output text):stateMachine:chargeback-autopilot-stripe-prod-dispute-workflow"
check "WAF deployed" "aws wafv2 list-web-acls --scope REGIONAL --query \"WebACLs[?contains(Name,'chargeback-autopilot-stripe-prod')]\" --output json | jq -e '.[0]'"
check "CloudWatch Alarms deployed" "aws cloudwatch describe-alarms --alarm-name-prefix chargeback-autopilot-stripe-prod --query 'length(MetricAlarms)' --output text | grep -v '^0$'"
check "autoRefreshTokens Lambda" "aws lambda get-function --function-name chargeback-autopilot-stripe-prod-autoRefreshTokens"
check "retryCase Lambda" "aws lambda get-function --function-name chargeback-autopilot-stripe-prod-retryCase"
check "subscriptionStatus Lambda" "aws lambda get-function --function-name chargeback-autopilot-stripe-prod-subscriptionStatus"

echo ""
echo "🔧 12. CONFIGURATION"
echo "--------------------"
check "Firebase project ID in SSM" "aws ssm get-parameter --name /stripedshield/prod/FIREBASE_PROJECT_ID --query Parameter.Value"
check "Stripe Secret in SSM" "aws ssm get-parameter --name /stripedshield/prod/STRIPE_SECRET --query Parameter.Value"
check "OpenAI API Key in SSM" "aws ssm get-parameter --name /stripedshield/prod/OPENAI_API_KEY --query Parameter.Value"

echo ""
echo "📡 13. API ENDPOINTS"
echo "--------------------"
echo -n "Health endpoint responding... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/health)
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ 200 OK"
    ((PASS_COUNT++))
else
    echo "❌ HTTP $HTTP_CODE"
    ((FAIL_COUNT++))
fi

echo ""
echo "📈 14. BUILD & COMPILATION"
echo "--------------------------"
echo -n "TypeScript builds successfully... "
if npm run build > /dev/null 2>&1; then
    echo "✅ BUILD SUCCESS"
    ((PASS_COUNT++))
else
    echo "❌ BUILD FAILED"
    ((FAIL_COUNT++))
fi

echo ""
echo "=================================="
echo "📊 FINAL RESULTS:"
echo "=================================="
echo "✅ PASSED: $PASS_COUNT"
echo "❌ FAILED: $FAIL_COUNT"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo "🎉 ALL CHECKS PASSED! System is ready for production!"
else
    echo "⚠️ WARNING: $FAIL_COUNT checks failed. Please review and fix."
    echo ""
    echo "Critical failures that MUST be fixed:"
    echo "1. If Step Functions/WAF/Alarms not deployed: Run 'npx serverless deploy'"
    echo "2. If mock data still present: Remove all generateMockDisputes code"
    echo "3. If authentication missing: Add requireAuth to all API handlers"
    echo "4. If Firebase not configured: Set up Firebase service account in SSM"
fi

echo ""
echo "🚀 To deploy missing infrastructure:"
echo "   npx serverless deploy --stage prod"
echo ""
echo "📝 To configure Firebase:"
echo "   aws ssm put-parameter --name /stripedshield/prod/FIREBASE_PROJECT_ID --value 'your-project-id' --type String"
echo ""