#!/bin/bash

echo "🔐 Migrating Secrets to SSM Parameter Store..."

# Source environment variables
source /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/.env

# Store OpenAI API Key
echo "Storing OpenAI API Key..."
aws ssm put-parameter \
  --name "/stripedshield/OPENAI_API_KEY" \
  --value "$OPENAI_API_KEY" \
  --type SecureString \
  --overwrite \
  --region us-east-1 > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✅ OpenAI API Key stored"
else
  echo "⚠️ Failed to store OpenAI API Key"
fi

# Store Stripe Secret
echo "Storing Stripe Secret..."
aws ssm put-parameter \
  --name "/stripedshield/STRIPE_SECRET" \
  --value "$STRIPE_SECRET" \
  --type SecureString \
  --overwrite \
  --region us-east-1 > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Stripe Secret stored"
else
  echo "⚠️ Failed to store Stripe Secret"
fi

# Store Redis URL
echo "Storing Redis URL..."
aws ssm put-parameter \
  --name "/stripedshield/REDIS_URL" \
  --value "$REDIS_URL" \
  --type SecureString \
  --overwrite \
  --region us-east-1 > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Redis URL stored"
else
  echo "⚠️ Failed to store Redis URL"
fi

# Store Webhook Secret
echo "Storing Webhook Secret..."
aws ssm put-parameter \
  --name "/stripedshield/STRIPE_WEBHOOK_SECRET" \
  --value "$STRIPE_CONNECT_WEBHOOK_SECRET" \
  --type SecureString \
  --overwrite \
  --region us-east-1 > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Webhook Secret stored"
else
  echo "⚠️ Failed to store Webhook Secret"
fi

# Store Environment
echo "Storing Environment..."
aws ssm put-parameter \
  --name "/stripedshield/ENV" \
  --value "prod" \
  --type String \
  --overwrite \
  --region us-east-1 > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Environment stored"
else
  echo "⚠️ Failed to store Environment"
fi

echo ""
echo "📋 Verifying stored parameters..."
aws ssm get-parameters \
  --names "/stripedshield/OPENAI_API_KEY" \
          "/stripedshield/STRIPE_SECRET" \
          "/stripedshield/REDIS_URL" \
          "/stripedshield/STRIPE_WEBHOOK_SECRET" \
          "/stripedshield/ENV" \
  --query "Parameters[].Name" \
  --output json \
  --region us-east-1 | jq -r '.[]'

echo ""
echo "✅ SSM Migration complete!"