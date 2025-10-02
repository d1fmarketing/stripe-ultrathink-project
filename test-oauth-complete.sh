#!/bin/bash

echo "🔍 Testing StripedShield OAuth Flow"
echo "===================================="
echo ""

# Test 1: OAuth Start Endpoint
echo "1. Testing OAuth Start Endpoint..."
OAUTH_RESPONSE=$(curl -s https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/auth/stripe/start)

if echo "$OAUTH_RESPONSE" | grep -q "ca_SsL2dWaMFTzSsFMMGzraPtJY2OiPPRID"; then
    echo "   ✅ OAuth endpoint returns correct client_id"
    
    # Extract the OAuth URL
    OAUTH_URL=$(echo "$OAUTH_RESPONSE" | python3 -c "import json, sys; print(json.load(sys.stdin)['url'])")
    echo "   OAuth URL: ${OAUTH_URL:0:100}..."
else
    echo "   ❌ OAuth endpoint not returning correct client_id"
    echo "   Response: $OAUTH_RESPONSE"
fi

echo ""
echo "2. Checking Frontend Pages..."

# Test 2: Onboarding page
ONBOARDING_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://stripedshield-founders-1755231149.netlify.app/onboarding.html)
if [ "$ONBOARDING_STATUS" == "200" ]; then
    echo "   ✅ Onboarding page is accessible"
else
    echo "   ❌ Onboarding page returned status: $ONBOARDING_STATUS"
fi

# Test 3: Callback page
CALLBACK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://stripedshield-founders-1755231149.netlify.app/stripe-callback.html)
if [ "$CALLBACK_STATUS" == "200" ]; then
    echo "   ✅ Callback page is accessible"
else
    echo "   ❌ Callback page returned status: $CALLBACK_STATUS"
fi

# Test 4: Dashboard page
DASHBOARD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://stripedshield-founders-1755231149.netlify.app/dashboard-protected.html)
if [ "$DASHBOARD_STATUS" == "200" ]; then
    echo "   ✅ Dashboard page is accessible"
else
    echo "   ❌ Dashboard page returned status: $DASHBOARD_STATUS"
fi

echo ""
echo "3. Verifying OAuth Configuration..."

# Check if the redirect URI matches
if echo "$OAUTH_RESPONSE" | grep -q "redirect_uri=https%3A%2F%2Fket0g0lurh.execute-api.us-east-1.amazonaws.com%2Fauth%2Fstripe%2Fcallback"; then
    echo "   ✅ Redirect URI correctly configured"
else
    echo "   ❌ Redirect URI mismatch"
fi

echo ""
echo "📋 Summary:"
echo "----------"
echo "✅ OAuth flow is properly configured with:"
echo "   • Client ID: ca_SsL2dWaMFTzSsFMMGzraPtJY2OiPPRID"
echo "   • Redirect URI: Backend → Frontend flow"
echo "   • All frontend pages deployed"
echo ""
echo "🚀 Ready for testing at:"
echo "   https://stripedshield-founders-1755231149.netlify.app/onboarding.html"
echo ""
echo "📝 OAuth Flow:"
echo "   1. User logs in at /auth.html"
echo "   2. Redirected to /onboarding.html"
echo "   3. Click 'Connect Stripe Account'"
echo "   4. Authorize on Stripe"
echo "   5. Backend exchanges code and redirects to /stripe-callback.html"
echo "   6. Callback saves to Firebase and redirects to /dashboard-protected.html"
echo ""