#!/bin/bash

# Update Stripe OAuth Configuration
echo "🔧 Updating Stripe OAuth Configuration..."

# Real Stripe Client ID from your Connect app
CLIENT_ID="ca_SsL2dWaMFTzSsFMMGzraPtJY2OiPPRID"
REDIRECT_URI="https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/auth/stripe/callback"

echo "📝 Client ID: $CLIENT_ID"
echo "📝 Redirect URI: $REDIRECT_URI"

# Update SSM Parameters
echo "⚙️ Updating AWS SSM Parameters..."

# Update Client ID
aws ssm put-parameter \
    --name "/stripedshield/prod/STRIPE_CLIENT_ID" \
    --value "$CLIENT_ID" \
    --type "SecureString" \
    --overwrite \
    --region us-east-1 \
    2>&1 | grep -E "(Version|error)" || echo "✅ Client ID updated"

# Update Redirect URI (if needed)
aws ssm put-parameter \
    --name "/stripedshield/prod/STRIPE_REDIRECT_URI" \
    --value "$REDIRECT_URI" \
    --type "SecureString" \
    --overwrite \
    --region us-east-1 \
    2>&1 | grep -E "(Version|error)" || echo "✅ Redirect URI updated"

echo ""
echo "✅ Configuration updated!"
echo ""
echo "📌 Next steps:"
echo "1. Wait for serverless deploy to complete"
echo "2. Test OAuth at: https://stripedshield-founders-1755231149.netlify.app/onboarding.html"
echo "3. Click 'Connect Stripe Account'"
echo ""
echo "🧪 To test the API directly:"
echo "curl https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/auth/stripe/start | jq"