#!/bin/bash

echo "🔧 Fixing Lambda handler paths..."
echo ""

# List of functions that need handler path updates
FUNCTIONS=(
    "authStripeCallback"
    "getCharge"
    "getDispute"
    "getPaymentIntent"
    "buildEvidence"
    "submitCase"
    "stripeStageEvidence"
    "stripeSubmitEvidence"
)

# Update each function
for func in "${FUNCTIONS[@]}"; do
    echo "Updating $func..."
    
    # Check current handler
    CURRENT=$(aws lambda get-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --query 'Handler' \
        --output text 2>/dev/null)
    
    if [[ "$CURRENT" == src/handlers/* ]]; then
        # Extract just the filename part
        FILENAME=$(basename "$CURRENT" .handler)
        NEW_HANDLER="dist/${FILENAME}.handler"
        
        aws lambda update-function-configuration \
            --function-name "chargeback-autopilot-stripe-prod-$func" \
            --handler "$NEW_HANDLER" \
            --output json > /dev/null 2>&1
        
        echo "  ✅ Updated from $CURRENT to $NEW_HANDLER"
    else
        echo "  ⏭️ Already using correct handler: $CURRENT"
    fi
done

echo ""
echo "⏳ Waiting for updates to complete..."
sleep 10

echo ""
echo "✅ Handler paths fixed!"
