#!/bin/bash

echo "🎯 Creating Lambda Layer for shared dependencies..."
echo "==================================================="

# Create layer directory structure
mkdir -p lambda-layer/nodejs
cd lambda-layer/nodejs

# Create package.json with all shared dependencies
cat > package.json << EOF
{
  "name": "stripedshield-dependencies",
  "version": "1.0.0",
  "description": "Shared dependencies for StripedShield Lambda functions",
  "dependencies": {
    "stripe": "^14.0.0",
    "ioredis": "^5.3.2",
    "openai": "^4.20.0",
    "zod": "^3.22.4",
    "axios": "^1.6.0",
    "jsonwebtoken": "^9.0.2",
    "uuid": "^9.0.1"
  }
}
EOF

echo "📦 Installing dependencies..."
npm install --production

# Remove unnecessary files to reduce size
echo "🗑️  Cleaning up unnecessary files..."
find . -name "*.md" -delete
find . -name "*.ts" -delete
find . -name "*.map" -delete
find . -name "test" -type d -exec rm -rf {} + 2>/dev/null
find . -name "tests" -type d -exec rm -rf {} + 2>/dev/null
find . -name "example" -type d -exec rm -rf {} + 2>/dev/null
find . -name "examples" -type d -exec rm -rf {} + 2>/dev/null
find . -name ".github" -type d -exec rm -rf {} + 2>/dev/null

cd ../..

# Create the layer zip
echo "📦 Creating layer ZIP..."
cd lambda-layer
zip -r ../stripedshield-layer.zip . -q
cd ..

LAYER_SIZE=$(ls -lh stripedshield-layer.zip | awk '{print $5}')
echo "✅ Layer created: $LAYER_SIZE"

# Publish the layer to AWS
echo "☁️  Publishing layer to AWS..."
LAYER_VERSION=$(aws lambda publish-layer-version \
    --layer-name stripedshield-dependencies \
    --description "Shared dependencies for StripedShield Lambda functions" \
    --zip-file fileb://stripedshield-layer.zip \
    --compatible-runtimes nodejs20.x \
    --query 'Version' \
    --output text)

LAYER_ARN="arn:aws:lambda:us-east-1:$(aws sts get-caller-identity --query Account --output text):layer:stripedshield-dependencies:$LAYER_VERSION"

echo "✅ Layer published: Version $LAYER_VERSION"
echo "📍 Layer ARN: $LAYER_ARN"

# Update Lambda functions to use the layer
echo
echo "🔄 Updating Lambda functions to use the layer..."

FUNCTIONS=(
    "authLogin"
    "buildEvidence"
    "webhookStripe"
    "disputes"
    "stats"
    "health"
    "metrics"
    "submitCase"
    "retryCase"
    "listCases"
    "getCase"
    "getUserDisputes"
    "createCheckoutSession"
)

for func in "${FUNCTIONS[@]}"; do
    echo -n "Updating $func... "
    
    # Get current layers
    CURRENT_LAYERS=$(aws lambda get-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --query 'Layers[].Arn' \
        --output json 2>/dev/null || echo "[]")
    
    # Add new layer (remove old versions first)
    NEW_LAYERS=$(echo "$CURRENT_LAYERS" | jq --arg layer "$LAYER_ARN" '. | map(select(test("stripedshield-dependencies") | not)) + [$layer]')
    
    # Update function
    aws lambda update-function-configuration \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --layers $(echo "$NEW_LAYERS" | jq -r '. | join(" ")') \
        --output text &>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "✅"
    else
        echo "❌"
    fi
done

echo
echo "==================================================="
echo "✅ Lambda Layer deployed successfully!"
echo "==================================================="
echo
echo "Now your handlers can be much smaller since they'll use"
echo "the shared dependencies from the layer instead of bundling them."
echo
echo "To rebuild handlers without dependencies:"
echo "./build-handlers-no-deps.sh"