#!/bin/bash

# Deploy missing Lambda functions using serverless framework
# This leverages existing serverless.yml configuration

set -e

echo "🚀 DEPLOYING MISSING LAMBDAS VIA SERVERLESS"
echo "==========================================="
echo ""

cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT

# Build the project first
echo "📦 Building project..."
npm run build

echo ""
echo "🔄 Deploying individual functions via serverless..."

# Deploy each function individually using serverless deploy function
FUNCTIONS=(
    "autoRefreshTokens"
    "disputes"
    "stats"
    "retryCase"
    "subscriptionStatus"
    "subscriptionCancel"
)

for func in "${FUNCTIONS[@]}"; do
    echo ""
    echo "Deploying ${func}..."
    npx serverless deploy function --function ${func} --stage prod 2>&1 | tail -5 || echo "  ⚠️ ${func} may need configuration in serverless.yml"
done

echo ""
echo "📊 Verification:"
for func in authLogin autoRefreshTokens disputes stats retryCase subscriptionStatus subscriptionCancel; do
    echo -n "  ${func}: "
    aws lambda get-function --function-name "chargeback-autopilot-stripe-prod-${func}" 2>/dev/null >/dev/null && echo "✅ DEPLOYED" || echo "❌ NOT FOUND"
done

echo ""
echo "📈 Total Lambda Count:"
TOTAL_LAMBDAS=$(aws lambda list-functions --query "Functions[?starts_with(FunctionName,'chargeback-autopilot-stripe-prod')].FunctionName" --output json | jq 'length')
echo "  Total Lambda functions deployed: ${TOTAL_LAMBDAS}/24"
echo ""