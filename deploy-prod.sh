#!/bin/bash

echo "🚀 Deploying StripedShield to Production..."

# Source environment variables
export $(grep -v '^#' /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/.env | xargs)

# Navigate to project directory
cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT

# Deploy with serverless
npx serverless deploy --stage prod --region us-east-1 --verbose

echo "✅ Deployment complete!"
echo ""
echo "📊 Production Endpoints:"
echo "Health: https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/health"
echo "Metrics: https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/metrics/performance"