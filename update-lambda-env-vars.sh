#!/bin/bash

# Update Lambda environment variables with proper AI configuration

echo "🔧 Updating Lambda environment variables..."

# Set the OpenAI API key (PLACEHOLDER - user needs to replace with real key)
OPENAI_API_KEY="${OPENAI_API_KEY:-sk-proj-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX}"

# Set the webhook secret (generate a new one)
WEBHOOK_SECRET="whsec_$(openssl rand -hex 32)"

# Set Firebase config (PLACEHOLDER - user needs to replace)
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-stripedshield-prod}"
FIREBASE_PRIVATE_KEY="${FIREBASE_PRIVATE_KEY:------BEGIN PRIVATE KEY-----\nREPLACE_WITH_REAL_KEY\n-----END PRIVATE KEY-----}"
FIREBASE_CLIENT_EMAIL="${FIREBASE_CLIENT_EMAIL:-firebase-adminsdk@stripedshield-prod.iam.gserviceaccount.com}"

# Function to update environment variables for a Lambda function
update_function_env() {
    local FUNCTION_NAME=$1
    echo "Updating $FUNCTION_NAME..."
    
    # Get current environment variables
    CURRENT_ENV=$(aws lambda get-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$FUNCTION_NAME" \
        --query 'Environment.Variables' \
        --output json 2>/dev/null || echo '{}')
    
    # Merge with new variables
    UPDATED_ENV=$(echo "$CURRENT_ENV" | jq \
        --arg openai "$OPENAI_API_KEY" \
        --arg model "gpt-4-turbo-preview" \
        --arg webhook "$WEBHOOK_SECRET" \
        --arg firebase_project "$FIREBASE_PROJECT_ID" \
        --arg firebase_email "$FIREBASE_CLIENT_EMAIL" \
        '. + {
            OPENAI_API_KEY: $openai,
            AI_MODEL: $model,
            AI_ENABLED: "true",
            AI_TEMPERATURE: "0.7",
            STRIPE_WEBHOOK_SECRET: $webhook,
            FIREBASE_PROJECT_ID: $firebase_project,
            FIREBASE_CLIENT_EMAIL: $firebase_email
        }')
    
    # Update the function
    aws lambda update-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$FUNCTION_NAME" \
        --environment "Variables=$UPDATED_ENV" \
        --query 'LastUpdateStatus' \
        --output text 2>/dev/null && echo "  ✅ Updated" || echo "  ⚠️ Failed"
}

# Update critical AI functions
AI_FUNCTIONS=(
    "buildEvidence"
    "submitCase"
    "disputes"
    "stats"
    "webhookStripe"
)

echo ""
echo "Updating AI-enabled functions..."
for func in "${AI_FUNCTIONS[@]}"; do
    update_function_env "$func"
done

# Store secrets in SSM Parameter Store
echo ""
echo "Storing secrets in SSM Parameter Store..."

# Store OpenAI API key
aws ssm put-parameter \
    --name "/chargeback-autopilot-stripe-prod/openai-api-key" \
    --value "$OPENAI_API_KEY" \
    --type "SecureString" \
    --overwrite \
    2>/dev/null && echo "✅ OpenAI API key stored" || echo "⚠️ Failed to store OpenAI key"

# Store webhook secret
aws ssm put-parameter \
    --name "/chargeback-autopilot-stripe-prod/stripe-webhook-secret" \
    --value "$WEBHOOK_SECRET" \
    --type "SecureString" \
    --overwrite \
    2>/dev/null && echo "✅ Webhook secret stored" || echo "⚠️ Failed to store webhook secret"

# Store Firebase credentials
aws ssm put-parameter \
    --name "/chargeback-autopilot-stripe-prod/firebase-config" \
    --value "{\"project_id\":\"$FIREBASE_PROJECT_ID\",\"client_email\":\"$FIREBASE_CLIENT_EMAIL\",\"private_key\":\"$FIREBASE_PRIVATE_KEY\"}" \
    --type "SecureString" \
    --overwrite \
    2>/dev/null && echo "✅ Firebase config stored" || echo "⚠️ Failed to store Firebase config"

echo ""
echo "📝 IMPORTANT NOTES:"
echo "================================"
echo "1. OPENAI_API_KEY is a placeholder - replace with your real key"
echo "2. Generated webhook secret: $WEBHOOK_SECRET"
echo "3. Configure this webhook secret in Stripe Dashboard"
echo "4. Firebase credentials are placeholders - add real service account"
echo ""
echo "To add your real OpenAI API key:"
echo "  export OPENAI_API_KEY='sk-proj-YOUR_REAL_KEY_HERE'"
echo "  ./update-lambda-env-vars.sh"
echo ""
echo "✅ Environment variables update complete!"