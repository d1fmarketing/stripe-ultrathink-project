#!/bin/bash

echo "🔧 FIXING STRIPE OAUTH CONFIGURATION..."
echo "======================================="

# OAuth configuration
STRIPE_CLIENT_ID="ca_SsL2dWaMFTzSsFMMGzraPtJY2OiPPRID"
STRIPE_REDIRECT_URI="https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/auth/stripe/callback"
STRIPE_SECRET="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"
OPENAI_API_KEY="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"

# Update authStripeStart
echo "1. Updating authStripeStart..."
aws lambda update-function-configuration \
  --function-name chargeback-autopilot-stripe-prod-authStripeStart \
  --environment Variables="{
    \"STRIPE_CLIENT_ID\":\"${STRIPE_CLIENT_ID}\",
    \"STRIPE_REDIRECT_URI\":\"${STRIPE_REDIRECT_URI}\",
    \"STRIPE_SECRET\":\"${STRIPE_SECRET}\",
    \"AI_MODEL\":\"gpt-5\",
    \"AI_ENABLED\":\"true\",
    \"OPENAI_API_KEY\":\"${OPENAI_API_KEY}\"
  }" \
  --no-cli-pager > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "   ✅ authStripeStart updated"
else
    echo "   ❌ Failed to update authStripeStart"
fi

# Update authStripeCallback
echo "2. Updating authStripeCallback..."
aws lambda update-function-configuration \
  --function-name chargeback-autopilot-stripe-prod-authStripeCallback \
  --environment Variables="{
    \"STRIPE_CLIENT_ID\":\"${STRIPE_CLIENT_ID}\",
    \"STRIPE_REDIRECT_URI\":\"${STRIPE_REDIRECT_URI}\",
    \"STRIPE_SECRET\":\"${STRIPE_SECRET}\",
    \"AI_MODEL\":\"gpt-5\",
    \"AI_ENABLED\":\"true\",
    \"OPENAI_API_KEY\":\"${OPENAI_API_KEY}\",
    \"DYNAMODB_TABLE_MERCHANTS\":\"stripedshield-merchants\"
  }" \
  --no-cli-pager > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "   ✅ authStripeCallback updated"
else
    echo "   ❌ Failed to update authStripeCallback"
fi

# Wait for configuration to propagate
echo ""
echo "⏳ Waiting 5 seconds for configuration to propagate..."
sleep 5

# Test OAuth start endpoint
echo ""
echo "🧪 Testing OAuth endpoint..."
RESPONSE=$(curl -s https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/auth/stripe/start -w "\nHTTP_STATUS:%{http_code}")
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_STATUS:")

if [ "$HTTP_STATUS" == "302" ]; then
    echo "   ✅ OAuth redirect working (HTTP 302)"
    LOCATION=$(curl -s -I https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/auth/stripe/start | grep -i "location:" | cut -d' ' -f2)
    echo "   Redirect URL: ${LOCATION:0:100}..."
elif echo "$BODY" | grep -q "error"; then
    echo "   ❌ OAuth endpoint still returning error:"
    echo "   $BODY"
else
    echo "   ⚠️ Unexpected response (HTTP $HTTP_STATUS):"
    echo "   $BODY"
fi

echo ""
echo "================================"
echo "OAuth Configuration Complete!"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Enable Standard OAuth in Stripe Dashboard:"
echo "   Dashboard → Settings → Connect → OAuth settings"
echo "   Toggle 'Enable onboarding accounts with OAuth'"
echo "   Add redirect URI: ${STRIPE_REDIRECT_URI}"
echo ""
echo "2. If using test mode first, get test client_id from:"
echo "   https://dashboard.stripe.com/test/settings/connect"
echo ""
echo "3. Test the flow at:"
echo "   https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/auth/stripe/start"