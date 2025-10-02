#!/bin/bash

# GPT-5 Optimized Deployment Script
# Builds smaller bundles with external dependencies

echo "🚀 Starting optimized deployment for GPT-5..."

# Navigate to project directory
cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT

# Clean previous builds
rm -rf dist/handlers
mkdir -p dist/handlers

echo "📦 Building optimized handlers..."

# Build each handler individually with optimizations
for handler in authLoginHandler autoRefreshTokens disputesHandler statsHandler retryCase subscriptionManager; do
    echo "Building $handler..."
    npx esbuild src/handlers/${handler}.ts \
        --bundle \
        --platform=node \
        --target=node20 \
        --format=cjs \
        --outfile=dist/handlers/${handler}.js \
        --minify \
        --tree-shaking=true \
        --external:aws-sdk \
        --external:@aws-sdk/* \
        --loader:.node=file
done

# Build AI handlers with GPT-5 configuration
for handler in buildEvidence submitCase collectCase; do
    echo "Building AI handler $handler..."
    npx esbuild src/handlers/${handler}.ts \
        --bundle \
        --platform=node \
        --target=node20 \
        --format=cjs \
        --outfile=dist/handlers/${handler}.js \
        --minify \
        --tree-shaking=true \
        --external:aws-sdk \
        --external:@aws-sdk/* \
        --loader:.node=file
done

# Build simple handlers
for handler in health metrics getCase listCases webhookStripe debugRedis reportWeekly getDispute getCharge getPaymentIntent stripeStageEvidence stripeSubmitEvidence authStripeStart authStripeCallback getUserDisputes createCheckoutSession refreshStripeToken; do
    echo "Building $handler..."
    npx esbuild src/handlers/${handler}.ts \
        --bundle \
        --platform=node \
        --target=node20 \
        --format=cjs \
        --outfile=dist/handlers/${handler}.js \
        --minify \
        --tree-shaking=true \
        --external:aws-sdk \
        --external:@aws-sdk/* \
        --loader:.node=file
done

echo "✅ Build complete"

# Deploy each function
echo "🚀 Deploying to Lambda..."

# Critical functions with AI_MODEL=gpt-5
for func in buildEvidence submitCase collectCase; do
    echo "Deploying $func with GPT-5..."
    
    # Update environment variable
    aws lambda update-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --environment Variables="{AI_MODEL=gpt-5,AI_ENABLED=true}" \
        --no-cli-pager > /dev/null 2>&1
    
    # Wait for update
    sleep 2
    
    # Create deployment package
    cd dist/handlers
    zip /tmp/${func}.zip ${func}.js
    cd ../..
    
    # Deploy code
    aws lambda update-function-code \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --zip-file fileb:///tmp/${func}.zip \
        --no-cli-pager > /dev/null 2>&1
    
    echo "✅ $func deployed"
done

# Deploy other functions
FUNCTIONS=(
    "authLogin:authLoginHandler"
    "autoRefreshTokens:autoRefreshTokens"
    "disputes:disputesHandler"
    "stats:statsHandler"
    "retryCase:retryCase"
    "subscriptionStatus:subscriptionManager"
    "subscriptionCancel:subscriptionManager"
    "health:health"
    "metrics:metrics"
    "getCase:getCase"
    "listCases:listCases"
    "webhookStripe:webhookStripe"
    "debugRedis:debugRedis"
    "reportWeekly:reportWeekly"
    "getDispute:getDispute"
    "getCharge:getCharge"
    "getPaymentIntent:getPaymentIntent"
    "getUserDisputes:getUserDisputes"
    "createCheckoutSession:createCheckoutSession"
)

for func_mapping in "${FUNCTIONS[@]}"; do
    IFS=':' read -r func handler <<< "$func_mapping"
    echo "Deploying $func..."
    
    # Create deployment package
    cd dist/handlers
    zip /tmp/${func}.zip ${handler}.js
    cd ../..
    
    # Deploy code
    aws lambda update-function-code \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --zip-file fileb:///tmp/${func}.zip \
        --no-cli-pager > /dev/null 2>&1
    
    echo "✅ $func deployed"
done

echo "🎉 All functions deployed with GPT-5 configuration!"

# Clean up temp files
rm -f /tmp/*.zip

echo "🧪 Running quick test..."
aws lambda invoke \
    --function-name chargeback-autopilot-stripe-prod-health \
    --cli-binary-format raw-in-base64-out \
    /tmp/health-test.json \
    --no-cli-pager

cat /tmp/health-test.json | jq .