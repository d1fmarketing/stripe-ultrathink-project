#!/bin/bash

# ROTATE SECRETS TO PRODUCTION VALUES
# This script updates all secrets in AWS SSM Parameter Store
# Run this after getting production keys from Stripe and OpenAI

set -e

echo "🔐 ROTATING SECRETS TO PRODUCTION VALUES"
echo "=========================================="
echo ""
echo "⚠️  WARNING: This will update production secrets in AWS SSM"
echo "Make sure you have the correct production keys ready!"
echo ""
read -p "Continue? (y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "❌ AWS credentials not configured"
    exit 1
fi

# Function to safely update SSM parameter
update_ssm_param() {
    local param_name=$1
    local param_value=$2
    local description=$3
    
    echo "📝 Updating $param_name..."
    
    if [ -z "$param_value" ]; then
        echo "  ⚠️  Skipping - no value provided"
        return
    fi
    
    aws ssm put-parameter \
        --name "$param_name" \
        --value "$param_value" \
        --type "SecureString" \
        --description "$description" \
        --overwrite \
        --region us-east-1 > /dev/null
    
    echo "  ✅ Updated successfully"
}

echo ""
echo "🔑 STEP 1: OpenAI API Key"
echo "-------------------------"
echo "Get your production key from: https://platform.openai.com/api-keys"
read -sp "Enter OpenAI API Key (sk-proj-...): " OPENAI_KEY
echo ""
update_ssm_param "/stripedshield/prod/OPENAI_API_KEY" "$OPENAI_KEY" "OpenAI GPT-5 API Key for production"

echo ""
echo "💳 STEP 2: Stripe Production Keys"
echo "--------------------------------"
echo "Get your production keys from: https://dashboard.stripe.com/apikeys"
read -sp "Enter Stripe Secret Key (sk_live_...): " STRIPE_SECRET
echo ""
update_ssm_param "/stripedshield/prod/STRIPE_SECRET" "$STRIPE_SECRET" "Stripe production secret key"

read -sp "Enter Stripe Client ID (ca_...): " STRIPE_CLIENT_ID
echo ""
update_ssm_param "/stripedshield/prod/STRIPE_CLIENT_ID" "$STRIPE_CLIENT_ID" "Stripe OAuth client ID"

echo ""
echo "🔔 STEP 3: Stripe Webhook Secret"
echo "--------------------------------"
echo "Get from: https://dashboard.stripe.com/webhooks"
read -sp "Enter Webhook Secret (whsec_...): " WEBHOOK_SECRET
echo ""
update_ssm_param "/stripedshield/prod/STRIPE_WEBHOOK_SECRET" "$WEBHOOK_SECRET" "Stripe webhook endpoint secret"

echo ""
echo "🔐 STEP 4: Additional Configuration"
echo "-----------------------------------"

# Redis URL (if using managed Redis with auth)
echo "Redis URL (leave empty to skip):"
read -sp "Enter Redis URL (redis://...): " REDIS_URL
echo ""
if [ ! -z "$REDIS_URL" ]; then
    update_ssm_param "/stripedshield/prod/REDIS_URL" "$REDIS_URL" "Redis connection URL with auth"
fi

# Service key for internal API auth
SERVICE_KEY=$(openssl rand -base64 32)
update_ssm_param "/stripedshield/prod/SERVICE_KEY" "$SERVICE_KEY" "Internal service authentication key"
echo "  ℹ️  Generated random service key"

echo ""
echo "✅ SECRETS ROTATION COMPLETE!"
echo "=============================="
echo ""
echo "Next steps:"
echo "1. Update serverless.yml to use SSM parameters"
echo "2. Deploy with: ./deploy-prod.sh"
echo "3. Test endpoints to verify new keys work"
echo ""
echo "🔒 Security reminders:"
echo "- Delete local .env file if it contains production keys"
echo "- Never commit secrets to git"
echo "- Rotate keys regularly (every 90 days)"
echo ""
echo "📊 Verify parameters with:"
echo "aws ssm get-parameters-by-path --path /stripedshield/prod --region us-east-1 --query 'Parameters[].Name'"