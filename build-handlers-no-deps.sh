#!/bin/bash

echo "🚀 Building handlers WITHOUT dependencies (using Lambda Layer)..."
echo "================================================================"

# Create dist directory
mkdir -p dist/handlers-nodeps

# List of handlers
HANDLERS=(
    "authLogin:authLoginHandler"
    "authStripeCallback"
    "authStripeStart"
    "autoRefreshTokens"
    "buildEvidence"
    "collectCase"
    "createCheckoutSession"
    "debugRedis"
    "disputes:disputesHandler"
    "getCase"
    "getCharge"
    "getDispute"
    "getPaymentIntent"
    "getUserDisputes"
    "health:health-minimal"
    "listCases"
    "metrics"
    "reportWeekly"
    "retryCase"
    "stats:statsHandler"
    "stripeStageEvidence"
    "stripeSubmitEvidence"
    "submitCase"
    "subscriptionCancel:subscriptionManager"
    "subscriptionStatus:subscriptionManager"
    "webhookStripe"
)

echo "📦 Compiling TypeScript only (no bundling)..."

for handler_spec in "${HANDLERS[@]}"; do
    # Parse handler name and source
    if [[ $handler_spec == *":"* ]]; then
        HANDLER="${handler_spec%%:*}"
        SOURCE="${handler_spec##*:}"
    else
        HANDLER="$handler_spec"
        SOURCE="$handler_spec"
    fi
    
    # Find source file
    if [ -f "src/handlers/${SOURCE}.ts" ]; then
        SOURCE_FILE="src/handlers/${SOURCE}.ts"
    elif [ -f "src/handlers/${SOURCE}Handler.ts" ]; then
        SOURCE_FILE="src/handlers/${SOURCE}Handler.ts"
    else
        echo "⚠️  Skipping $HANDLER (source not found)"
        continue
    fi
    
    echo -n "Compiling $HANDLER... "
    
    # Just compile TypeScript, don't bundle
    npx tsc "$SOURCE_FILE" \
        --outDir dist/handlers-nodeps \
        --module commonjs \
        --target es2020 \
        --lib es2020 \
        --resolveJsonModule \
        --esModuleInterop \
        --skipLibCheck \
        --forceConsistentCasingInFileNames \
        --strict false \
        --noEmit false \
        2>/dev/null
    
    # If that doesn't work, try esbuild without bundling
    if [ ! -f "dist/handlers-nodeps/$(basename ${SOURCE_FILE%.ts}.js)" ]; then
        npx esbuild "$SOURCE_FILE" \
            --platform=node \
            --target=node20 \
            --format=cjs \
            --outfile="dist/handlers-nodeps/${HANDLER}.js" \
            --minify \
            --keep-names \
            2>/dev/null
    fi
    
    if [ -f "dist/handlers-nodeps/${HANDLER}.js" ] || [ -f "dist/handlers-nodeps/$(basename ${SOURCE_FILE%.ts}.js)" ]; then
        # Rename if needed
        if [ -f "dist/handlers-nodeps/$(basename ${SOURCE_FILE%.ts}.js)" ] && [ ! -f "dist/handlers-nodeps/${HANDLER}.js" ]; then
            mv "dist/handlers-nodeps/$(basename ${SOURCE_FILE%.ts}.js)" "dist/handlers-nodeps/${HANDLER}.js"
        fi
        
        SIZE=$(ls -lh "dist/handlers-nodeps/${HANDLER}.js" 2>/dev/null | awk '{print $5}')
        echo "✅ $SIZE"
    else
        echo "❌ Failed"
    fi
done

echo
echo "📊 Handler sizes (without dependencies):"
echo "========================================="
ls -lh dist/handlers-nodeps/*.js 2>/dev/null | awk '{print $5, $9}'

echo
echo "📝 Deployment instructions:"
echo "==========================="
echo "1. First run: ./create-lambda-layer.sh"
echo "2. Then deploy these smaller handlers"
echo "3. Functions will use dependencies from the Lambda Layer"
echo
echo "This approach keeps handlers small while sharing common dependencies!"