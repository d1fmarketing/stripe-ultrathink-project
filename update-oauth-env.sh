#!/bin/bash

echo "🔧 Updating Lambda Environment Variables for OAuth"
echo "================================================"

# OAuth Start Lambda
echo -e "\n📝 Updating authStripeStart Lambda..."
aws lambda update-function-configuration \
  --function-name chargeback-autopilot-stripe-prod-authStripeStart \
  --environment Variables="{STRIPE_CLIENT_ID=ca_SsL2dWaMFTzSsFMMGzraPtJY2OiPPRID,STRIPE_REDIRECT_URI=https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/auth/stripe/callback}" \
  --output json | jq '{FunctionName, LastModified}'

# OAuth Callback Lambda
echo -e "\n📝 Updating authStripeCallback Lambda..."
echo "⚠️  Need real STRIPE_SECRET key from Dashboard!"
echo "Replace 'sk_test_PLACEHOLDER' with your actual test secret key"

# Uncomment and update with real key:
# aws lambda update-function-configuration \
#   --function-name chargeback-autopilot-stripe-prod-authStripeCallback \
#   --environment Variables="{STRIPE_SECRET=sk_test_REAL_KEY_HERE,STRIPE_CLIENT_ID=ca_SsL2dWaMFTzSsFMMGzraPtJY2OiPPRID}" \
#   --output json | jq '{FunctionName, LastModified}'

echo -e "\n✅ OAuth Start Lambda updated"
echo "⚠️  OAuth Callback Lambda needs real STRIPE_SECRET key"
echo ""
echo "Next steps:"
echo "1. Get your sk_test_... key from Stripe Dashboard"
echo "2. Uncomment and update the callback Lambda command above"
echo "3. Run this script again"