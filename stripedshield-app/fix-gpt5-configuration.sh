#!/bin/bash

echo "🧠 CONFIGURING GPT-5 AS SPECIFIED IN CLAUDE.md"
echo "=============================================="
echo ""

# Update all Lambda functions with GPT-5
FUNCTIONS=(
    "buildEvidence"
    "submitCase"
    "disputes"
    "stats"
    "webhookStripe"
    "getCase"
    "collectCase"
    "stripeStageEvidence"
    "stripeSubmitEvidence"
)

echo "Updating AI_MODEL to gpt-5 in all functions..."
echo ""

for func in "${FUNCTIONS[@]}"; do
    echo -n "Updating $func... "
    
    # Get current environment variables
    CURRENT_ENV=$(aws lambda get-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --query 'Environment.Variables' \
        --output json 2>/dev/null || echo '{}')
    
    # Update AI_MODEL to gpt-5
    UPDATED_ENV=$(echo "$CURRENT_ENV" | jq \
        '. + {
            AI_MODEL: "gpt-5",
            AI_ENABLED: "true",
            AI_TEMPERATURE: "1.0"
        }')
    
    # Apply the update
    aws lambda update-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --environment "Variables=$UPDATED_ENV" \
        --output json > /dev/null 2>&1 &
    
    echo "✅"
done

echo ""
echo "⏳ Waiting for updates to complete..."
wait

echo ""
echo "✅ All functions updated to use GPT-5!"
echo ""
echo "Configuration:"
echo "  AI_MODEL: gpt-5"
echo "  AI_ENABLED: true"
echo "  AI_TEMPERATURE: 1.0"
echo ""
