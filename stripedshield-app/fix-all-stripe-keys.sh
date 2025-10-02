#!/bin/bash

echo "🔧 FIXING ALL STRIPE KEYS ACROSS SYSTEM"
echo "========================================"
echo ""

# Get the real Stripe key from a working function
echo "Extracting real Stripe key..."
STRIPE_KEY=$(aws lambda get-function-configuration \
    --function-name chargeback-autopilot-stripe-prod-getUserDisputes \
    --query 'Environment.Variables.STRIPE_SECRET' \
    --output text 2>/dev/null)

if [[ "$STRIPE_KEY" == sk_live_* ]]; then
    echo "Found live key: ${STRIPE_KEY:0:20}..."
else
    # Try another source
    STRIPE_KEY=$(aws lambda get-function-configuration \
        --function-name chargeback-autopilot-stripe-prod-listCases \
        --query 'Environment.Variables.STRIPE_SECRET' \
        --output text 2>/dev/null)
fi

echo ""
echo "Updating ALL Lambda functions with real Stripe key..."

# List ALL functions in the system
ALL_FUNCTIONS=$(aws lambda list-functions \
    --query "Functions[?contains(FunctionName,'chargeback-autopilot-stripe-prod')].FunctionName" \
    --output text)

count=0
for func_full in $ALL_FUNCTIONS; do
    # Extract just the function suffix
    func=${func_full#chargeback-autopilot-stripe-prod-}
    
    echo -n "$func: "
    
    # Get current environment
    CURRENT_ENV=$(aws lambda get-function-configuration \
        --function-name "$func_full" \
        --query 'Environment.Variables' \
        --output json 2>/dev/null || echo '{}')
    
    # Check current Stripe key
    CURRENT_KEY=$(echo "$CURRENT_ENV" | jq -r '.STRIPE_SECRET // "none"')
    
    if [[ "$CURRENT_KEY" != "$STRIPE_KEY" ]]; then
        # Update with real key
        UPDATED_ENV=$(echo "$CURRENT_ENV" | jq \
            --arg stripe "$STRIPE_KEY" \
            '. + {STRIPE_SECRET: $stripe}')
        
        aws lambda update-function-configuration \
            --function-name "$func_full" \
            --environment "Variables=$UPDATED_ENV" \
            --output json > /dev/null 2>&1
        
        echo "✅ Updated"
        ((count++))
    else
        echo "⏭️ Already correct"
    fi
done

echo ""
echo "✅ Updated $count functions with real Stripe key"
echo ""

# Verify critical functions
echo "Verifying critical functions have live keys:"
for func in webhookStripe buildEvidence authStripeCallback getCharge; do
    KEY=$(aws lambda get-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --query 'Environment.Variables.STRIPE_SECRET' \
        --output text 2>/dev/null | head -c 20)
    
    if [[ "$KEY" == sk_live_* ]]; then
        echo "  ✅ $func: $KEY..."
    else
        echo "  ❌ $func: $KEY..."
    fi
done

echo ""
echo "✅ Stripe key configuration complete!"
