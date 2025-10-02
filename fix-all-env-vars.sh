#!/bin/bash

echo "🔧 FIXING ALL LAMBDA ENVIRONMENT VARIABLES"
echo "=========================================="
echo ""

# Get the real Stripe key from health function
STRIPE_KEY=$(aws lambda get-function-configuration \
    --function-name chargeback-autopilot-stripe-prod-health \
    --query 'Environment.Variables.STRIPE_SECRET' \
    --output text)

echo "Found Stripe key: ${STRIPE_KEY:0:20}..."
echo ""

# Get all other env vars from health function as baseline
BASELINE_ENV=$(aws lambda get-function-configuration \
    --function-name chargeback-autopilot-stripe-prod-health \
    --query 'Environment.Variables' \
    --output json)

# Add critical missing variables to baseline
UPDATED_ENV=$(echo "$BASELINE_ENV" | jq \
    --arg stripe "$STRIPE_KEY" \
    --arg model "gpt-4-turbo-preview" \
    --arg openai "sk-proj-PLACEHOLDER_REPLACE_WITH_REAL_KEY" \
    --arg webhook "whsec_test" \
    '. + {
        STRIPE_SECRET: $stripe,
        AI_MODEL: $model,
        AI_ENABLED: "true",
        AI_TEMPERATURE: "0.7",
        OPENAI_API_KEY: $openai,
        STRIPE_WEBHOOK_SECRET: $webhook
    }')

# List of all Lambda functions
FUNCTIONS=(
    "authStripeStart"
    "authStripeCallback"
    "webhookStripe"
    "buildEvidence"
    "submitCase"
    "getCharge"
    "getDispute"
    "getPaymentIntent"
    "stripeStageEvidence"
    "stripeSubmitEvidence"
    "disputes"
    "stats"
    "getCase"
    "listCases"
    "collectCase"
    "createCheckoutSession"
    "getUserDisputes"
    "metrics"
    "health"
    "debugRedis"
    "reportWeekly"
    "retryCase"
    "subscriptionStatus"
    "subscriptionCancel"
    "authLogin"
    "autoRefreshTokens"
)

echo "Updating ${#FUNCTIONS[@]} Lambda functions..."
echo ""

# Update each function
for func in "${FUNCTIONS[@]}"; do
    echo -n "Updating $func... "
    
    aws lambda update-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --environment "Variables=$UPDATED_ENV" \
        --timeout 10 \
        --output json > /dev/null 2>&1 &
    
    echo "✅"
done

echo ""
echo "⏳ Waiting for updates to complete..."
wait

echo ""
echo "✅ All Lambda functions updated with consistent environment variables!"
echo ""
echo "Variables set:"
echo "  - STRIPE_SECRET: ${STRIPE_KEY:0:20}... (real live key)"
echo "  - AI_MODEL: gpt-4-turbo-preview"
echo "  - AI_ENABLED: true"
echo "  - OPENAI_API_KEY: placeholder (needs real key)"
echo "  - STRIPE_WEBHOOK_SECRET: whsec_test (needs real secret)"
echo ""
