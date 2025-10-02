#!/bin/bash

echo "🚀 Building optimized Lambda handlers..."
echo "========================================"

# Create dist/handlers directory
mkdir -p dist/handlers

# Handler list
HANDLERS=(
    "authLogin"
    "authStripeCallback"
    "authStripeStart"
    "autoRefreshTokens"
    "buildEvidence"
    "collectCase"
    "createCheckoutSession"
    "debugRedis"
    "disputes"
    "getCase"
    "getCharge"
    "getDispute"
    "getPaymentIntent"
    "getUserDisputes"
    "health-minimal:health"
    "listCases"
    "metrics"
    "reportWeekly"
    "retryCase"
    "stats"
    "stripeStageEvidence"
    "stripeSubmitEvidence"
    "submitCase"
    "subscriptionCancel"
    "subscriptionStatus"
    "webhookStripe"
)

# Build each handler with proper optimization
for handler in "${HANDLERS[@]}"; do
    # Parse handler name (handle renaming case like health-minimal:health)
    if [[ $handler == *":"* ]]; then
        SOURCE_NAME="${handler%%:*}"
        OUTPUT_NAME="${handler##*:}"
    else
        SOURCE_NAME="$handler"
        OUTPUT_NAME="$handler"
    fi
    
    # Map to actual source file
    if [ -f "src/handlers/${SOURCE_NAME}.ts" ]; then
        SOURCE_FILE="src/handlers/${SOURCE_NAME}.ts"
    elif [ -f "src/handlers/${SOURCE_NAME}Handler.ts" ]; then
        SOURCE_FILE="src/handlers/${SOURCE_NAME}Handler.ts"
    else
        echo "⚠️  Skipping $SOURCE_NAME (source not found)"
        continue
    fi
    
    echo -n "Building $OUTPUT_NAME... "
    
    # Build with esbuild - optimized settings
    npx esbuild "$SOURCE_FILE" \
        --bundle \
        --platform=node \
        --target=node20 \
        --outfile="dist/handlers/${OUTPUT_NAME}.js" \
        --minify \
        --tree-shaking=true \
        --external:aws-sdk \
        --external:@aws-sdk/client-dynamodb \
        --external:@aws-sdk/client-ssm \
        --external:@aws-sdk/client-lambda \
        --external:@aws-sdk/lib-dynamodb \
        --keep-names \
        --sourcemap=inline \
        --metafile="dist/handlers/${OUTPUT_NAME}.meta.json" \
        2>/dev/null
    
    if [ $? -eq 0 ]; then
        SIZE=$(ls -lh "dist/handlers/${OUTPUT_NAME}.js" | awk '{print $5}')
        echo "✅ $SIZE"
        
        # Warn if still too large
        SIZE_BYTES=$(stat -c%s "dist/handlers/${OUTPUT_NAME}.js" 2>/dev/null || stat -f%z "dist/handlers/${OUTPUT_NAME}.js" 2>/dev/null)
        if [ "$SIZE_BYTES" -gt 5000000 ]; then
            echo "   ⚠️  WARNING: ${OUTPUT_NAME}.js is still large (${SIZE})"
        fi
    else
        echo "❌ Failed"
    fi
done

echo
echo "📊 Handler sizes:"
echo "=================="
ls -lh dist/handlers/*.js | grep -v meta.json | awk '{print $5, $9}' | sort -rh

echo
echo "✅ Build complete!"