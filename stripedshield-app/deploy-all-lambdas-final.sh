#!/bin/bash

echo "🚀 FINAL LAMBDA DEPLOYMENT WITH CORRECT CODE"
echo "============================================"
echo ""

# Build TypeScript first
echo "Building TypeScript..."
npm run build 2>&1 | tail -5

# Create deployment package
echo ""
echo "Creating deployment package..."
rm -rf lambda-final
mkdir -p lambda-final
cd lambda-final

# Create minimal package.json
cat > package.json << 'PACKAGE'
{
  "name": "stripedshield",
  "version": "1.0.0",
  "dependencies": {
    "stripe": "^18.4.0",
    "@aws-sdk/client-dynamodb": "^3.868.0",
    "@aws-sdk/lib-dynamodb": "^3.864.0",
    "@aws-sdk/client-sfn": "^3.600.0",
    "@aws-sdk/client-cloudwatch": "^3.864.0",
    "redis": "^5.8.1",
    "openai": "^5.12.2"
  }
}
PACKAGE

npm install --production --no-optional 2>/dev/null

# Copy all compiled files
cp ../dist/*.js .

# Create universal handler wrapper
for file in *.js; do
    if [[ "$file" != *"_wrapped.js" ]]; then
        handler="${file%.js}"
        mv "$file" "${handler}_impl.js"
        
        cat > "$file" << WRAPPER
const impl = require('./${handler}_impl.js');
exports.handler = impl.handler || impl.default || impl;
WRAPPER
    fi
done

# Deploy ALL functions
echo ""
echo "Deploying all Lambda functions..."

FUNCTIONS=$(aws lambda list-functions \
    --query "Functions[?contains(FunctionName,'chargeback-autopilot-stripe-prod')].FunctionName" \
    --output text)

count=0
for func_full in $FUNCTIONS; do
    func=${func_full#chargeback-autopilot-stripe-prod-}
    
    if [ -f "${func}.js" ]; then
        echo -n "$func: "
        
        # Create ZIP with handler and dependencies
        zip -q "${func}.zip" "${func}.js" "${func}_impl.js" package.json node_modules -r
        
        # Update function code
        aws lambda update-function-code \
            --function-name "$func_full" \
            --zip-file "fileb://${func}.zip" \
            --output json > /dev/null 2>&1 &
        
        # Update handler path to use dist/
        aws lambda update-function-configuration \
            --function-name "$func_full" \
            --handler "dist/${func}.handler" \
            --output json > /dev/null 2>&1 &
        
        echo "✅"
        ((count++))
        
        # Batch updates to avoid rate limiting
        if [ $((count % 5)) -eq 0 ]; then
            wait
        fi
    fi
done

wait
cd ..

echo ""
echo "✅ Deployed $count Lambda functions"
echo ""
