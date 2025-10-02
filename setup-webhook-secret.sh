#!/bin/bash

echo "🔧 Setting up Stripe Webhook Secret for StripedShield"
echo "===================================================="
echo ""

# Generate a webhook signing secret (Stripe format: whsec_...)
# In production, this should come from Stripe Dashboard after creating webhook endpoint
WEBHOOK_SECRET="whsec_$(openssl rand -hex 32)"

echo "1. Generated webhook secret: ${WEBHOOK_SECRET:0:20}..."
echo ""

# List of Lambda functions that need the webhook secret
FUNCTIONS=(
    "chargeback-autopilot-stripe-prod-webhookStripe"
)

echo "2. Updating Lambda environment variables..."
for FUNCTION in "${FUNCTIONS[@]}"; do
    echo "   Updating $FUNCTION..."
    
    # Get current environment variables
    CURRENT_ENV=$(aws lambda get-function-configuration \
        --function-name "$FUNCTION" \
        --query 'Environment.Variables' \
        --output json 2>/dev/null || echo "{}")
    
    # Add the webhook secret
    UPDATED_ENV=$(echo "$CURRENT_ENV" | jq \
        --arg secret "$WEBHOOK_SECRET" \
        '. + {STRIPE_CONNECT_WEBHOOK_SECRET: $secret}')
    
    # Update the function
    aws lambda update-function-configuration \
        --function-name "$FUNCTION" \
        --environment "Variables=$UPDATED_ENV" \
        --output json > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "   ✅ Updated $FUNCTION"
    else
        echo "   ❌ Failed to update $FUNCTION"
    fi
done

echo ""
echo "3. Storing webhook secret in SSM Parameter Store..."
aws ssm put-parameter \
    --name "/stripedshield/prod/STRIPE_WEBHOOK_SECRET" \
    --value "$WEBHOOK_SECRET" \
    --type "SecureString" \
    --overwrite \
    --description "Stripe webhook signing secret for StripedShield" \
    > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "   ✅ Stored in SSM Parameter Store"
else
    echo "   ❌ Failed to store in SSM"
fi

echo ""
echo "📝 IMPORTANT: Manual Step Required!"
echo "===================================="
echo "You need to create a webhook endpoint in Stripe Dashboard:"
echo ""
echo "1. Go to: https://dashboard.stripe.com/webhooks"
echo "2. Click 'Add endpoint'"
echo "3. Endpoint URL: https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/webhooks/stripe"
echo "4. Select events:"
echo "   - charge.dispute.created"
echo "   - charge.dispute.updated"
echo "   - charge.dispute.closed"
echo "   - customer.subscription.created"
echo "   - customer.subscription.updated"
echo "   - customer.subscription.deleted"
echo "   - checkout.session.completed"
echo "5. After creating, copy the 'Signing secret' (starts with whsec_)"
echo "6. Run this command to update with real secret:"
echo "   aws lambda update-function-configuration \\"
echo "     --function-name chargeback-autopilot-stripe-prod-webhookStripe \\"
echo "     --environment 'Variables={STRIPE_CONNECT_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE}'"
echo ""
echo "✅ Webhook secret setup complete (using temporary secret)"
echo "⚠️  Remember to update with real secret from Stripe Dashboard!"