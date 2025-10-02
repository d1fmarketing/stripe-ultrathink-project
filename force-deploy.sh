#!/bin/bash

echo "🚀 Force Deploying StripedShield to Production..."

# Set environment variables
export STRIPE_SECRET=sk_test_51Placeholder123456789
export STRIPE_CLIENT_ID=ca_placeholder
export STRIPE_REDIRECT_URI=https://localhost:3000/callback
export STRIPE_CONNECT_WEBHOOK_SECRET=whsec_placeholder
export SES_FROM=noreply@example.com
export SES_DEFAULT_TO=admin@example.com
export OPENAI_API_KEY=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

cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/infra

# Remove serverless cache
rm -rf .serverless

# Deploy with force flag
npx serverless deploy --stage prod --region us-east-1 --force --verbose

echo "✅ Force deployment complete!"
echo ""
echo "📊 Production Endpoints:"
echo "Health: https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/health"
echo "Metrics: https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/metrics/performance"