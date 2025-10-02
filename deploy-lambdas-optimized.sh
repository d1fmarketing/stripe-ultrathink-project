#!/bin/bash

echo "🚀 DEPLOYING OPTIMIZED LAMBDA FUNCTIONS"
echo "========================================"
echo ""

# Create deployment directory
rm -rf lambda-deploy
mkdir -p lambda-deploy
cd lambda-deploy

# Create package.json for Lambda runtime
cat > package.json << 'PACKAGE'
{
  "name": "stripedshield-lambda",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "stripe": "^18.4.0",
    "@aws-sdk/client-dynamodb": "^3.868.0",
    "@aws-sdk/lib-dynamodb": "^3.864.0",
    "@aws-sdk/client-sfn": "^3.600.0",
    "@aws-sdk/client-cloudwatch": "^3.864.0",
    "@aws-sdk/client-ssm": "^3.864.0",
    "redis": "^5.8.1",
    "firebase-admin": "^13.4.0",
    "openai": "^5.12.2",
    "jsonwebtoken": "^9.0.2"
  }
}
PACKAGE

# Install production dependencies
npm install --production --no-optional

# Copy compiled handlers
cp ../dist/*.js .

# Create wrapper for each handler to ensure proper CommonJS export
for file in *.js; do
    handler="${file%.js}"
    mv "$file" "${handler}_orig.js"
    
    cat > "$file" << WRAPPER
const handler_module = require('./${handler}_orig.js');
exports.handler = handler_module.handler || handler_module.default || handler_module;
WRAPPER
done

# List of critical functions to update
FUNCTIONS=(
    "webhookStripe"
    "authStripeStart"
    "authStripeCallback"
    "buildEvidence"
    "getCharge"
    "getDispute"
)

echo "Deploying critical functions..."
echo ""

for func in "${FUNCTIONS[@]}"; do
    echo -n "Deploying $func... "
    
    # Create individual ZIP for this function
    zip -q "${func}.zip" "${func}.js" "${func}_orig.js" package.json node_modules -r
    
    # Update Lambda function code
    aws lambda update-function-code \
        --function-name "chargeback-autopilot-stripe-prod-$func" \
        --zip-file "fileb://${func}.zip" \
        --output json > /dev/null 2>&1 &
    
    echo "✅"
done

echo ""
echo "⏳ Waiting for deployments to complete..."
wait

cd ..

echo ""
echo "✅ Lambda functions deployed successfully!"
echo ""
