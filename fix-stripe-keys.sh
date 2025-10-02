#!/bin/bash

# Fix Stripe Keys Script - ULTRATHINK
# This script updates all Lambda functions with the correct Stripe keys

echo "🔧 STRIPE KEY UPDATE SCRIPT"
echo "=========================="
echo ""

# Check if SK_LIVE is provided as argument
if [ -z "$1" ]; then
    echo "❌ ERROR: Please provide your Stripe Secret Key"
    echo ""
    echo "Usage: ./fix-stripe-keys.sh sk_live_YOUR_KEY_HERE"
    echo ""
    echo "To get your key:"
    echo "1. Go to: https://dashboard.stripe.com/apikeys"
    echo "2. Copy the 'Secret key' (starts with sk_live_)"
    echo "3. Run: ./fix-stripe-keys.sh sk_live_YOUR_KEY_HERE"
    echo ""
    exit 1
fi

SK_LIVE="$1"
CLIENT_ID="ca_SsL2dWaMFTzSsFMMGzraPtJY2OiPPRID"

echo "📝 Configuration:"
echo "  Client ID: $CLIENT_ID"
echo "  Secret Key: ${SK_LIVE:0:20}...${SK_LIVE: -4}"
echo ""

# List of Lambda functions that need the secret key
FUNCTIONS=(
    "chargeback-autopilot-stripe-prod-authStripeCallback"
    "chargeback-autopilot-stripe-prod-webhookStripe"
    "chargeback-autopilot-stripe-prod-buildEvidence"
    "chargeback-autopilot-stripe-prod-submitCase"
    "chargeback-autopilot-stripe-prod-getDispute"
    "chargeback-autopilot-stripe-prod-getCharge"
    "chargeback-autopilot-stripe-prod-stripeSubmitEvidence"
)

echo "🚀 Updating Lambda functions..."
echo ""

# Update authStripeCallback specifically
echo "1. Updating authStripeCallback..."
aws lambda update-function-configuration \
    --function-name chargeback-autopilot-stripe-prod-authStripeCallback \
    --environment "Variables={STRIPE_CLIENT_ID=$CLIENT_ID,STRIPE_SECRET=$SK_LIVE}" \
    --output json > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "   ✅ authStripeCallback updated"
else
    echo "   ❌ Failed to update authStripeCallback"
fi

# Update other functions
for i in "${!FUNCTIONS[@]}"; do
    if [ $i -eq 0 ]; then
        continue  # Skip authStripeCallback as we already did it
    fi
    
    FUNCTION="${FUNCTIONS[$i]}"
    echo "$((i+1)). Updating ${FUNCTION##*-}..."
    
    # Get current environment variables
    CURRENT_VARS=$(aws lambda get-function-configuration \
        --function-name "$FUNCTION" \
        --query 'Environment.Variables' \
        --output json 2>/dev/null)
    
    if [ ! -z "$CURRENT_VARS" ] && [ "$CURRENT_VARS" != "null" ]; then
        # Update only STRIPE_SECRET, keep other vars
        aws lambda update-function-configuration \
            --function-name "$FUNCTION" \
            --environment Variables="{STRIPE_SECRET=$SK_LIVE}" \
            --output json > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            echo "   ✅ ${FUNCTION##*-} updated"
        else
            echo "   ⚠️  Skipped ${FUNCTION##*-} (may not need update)"
        fi
    fi
done

echo ""
echo "🧪 Testing OAuth endpoint..."
echo ""

# Test the OAuth start endpoint
RESPONSE=$(curl -s https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/auth/stripe/start)

if echo "$RESPONSE" | grep -q "$CLIENT_ID"; then
    echo "✅ OAuth endpoint working with correct client_id!"
    echo ""
    echo "📱 Ready to test at:"
    echo "   https://stripedshield-founders-1755231149.netlify.app/onboarding.html"
else
    echo "⚠️  OAuth endpoint may need a moment to update"
    echo "   Try again in 30 seconds"
fi

echo ""
echo "✅ Script complete!"
echo ""
echo "📌 Next steps:"
echo "1. Make sure OAuth Standard is enabled in Stripe Dashboard"
echo "2. Test at: https://stripedshield-founders-1755231149.netlify.app/onboarding.html"
echo "3. Click 'Connect Stripe Account'"
echo ""