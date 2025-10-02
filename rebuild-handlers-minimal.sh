#!/bin/bash

echo "🚀 Rebuilding handlers with MINIMAL dependencies..."
echo "=================================================="

# Critical handlers that need to be small
CRITICAL_HANDLERS=(
    "health"
    "stats"
    "webhookStripe"
    "buildEvidence"
    "disputes"
    "metrics"
)

# Build minimal versions
for handler in "${CRITICAL_HANDLERS[@]}"; do
    echo "Building minimal $handler..."
    
    # Use webpack with aggressive tree-shaking
    cat > /tmp/webpack.${handler}.config.js << EOF
const path = require('path');

module.exports = {
  entry: './src/handlers/${handler}.ts',
  target: 'node',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'dist/handlers'),
    filename: '${handler}.min.js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    'aws-sdk': 'aws-sdk',
    '@aws-sdk/client-dynamodb': '@aws-sdk/client-dynamodb',
    '@aws-sdk/lib-dynamodb': '@aws-sdk/lib-dynamodb',
    '@aws-sdk/client-ssm': '@aws-sdk/client-ssm',
    '@aws-sdk/client-lambda': '@aws-sdk/client-lambda',
    '@aws-sdk/client-cloudwatch': '@aws-sdk/client-cloudwatch',
    '@aws-sdk/client-sfn': '@aws-sdk/client-sfn',
    'firebase': 'firebase',
    'firebase-admin': 'firebase-admin',
    '@firebase/app': '@firebase/app',
    '@firebase/auth': '@firebase/auth',
    '@firebase/database': '@firebase/database',
    '@firebase/firestore': '@firebase/firestore',
    '@google-cloud/firestore': '@google-cloud/firestore',
    'google-gax': 'google-gax',
    'grpc': 'grpc',
    '@grpc/grpc-js': '@grpc/grpc-js'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      // Prevent Firebase from being bundled
      'firebase': false,
      'firebase-admin': false
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  optimization: {
    minimize: true,
    usedExports: true,
    sideEffects: false
  }
};
EOF
    
    # Try webpack first
    if command -v webpack &> /dev/null; then
        webpack --config /tmp/webpack.${handler}.config.js 2>/dev/null
    fi
done

# Fallback: Use esbuild with explicit externals
echo
echo "Using esbuild with externals..."

for handler in "${CRITICAL_HANDLERS[@]}"; do
    # Find source file
    if [ -f "src/handlers/${handler}.ts" ]; then
        SOURCE="src/handlers/${handler}.ts"
    elif [ -f "src/handlers/${handler}Handler.ts" ]; then
        SOURCE="src/handlers/${handler}Handler.ts"
    elif [ "$handler" == "health" ] && [ -f "src/handlers/health-minimal.ts" ]; then
        SOURCE="src/handlers/health-minimal.ts"
    else
        echo "Skipping $handler (not found)"
        continue
    fi
    
    echo -n "Building $handler... "
    
    npx esbuild "$SOURCE" \
        --bundle \
        --platform=node \
        --target=node20 \
        --outfile="dist/handlers/${handler}.js" \
        --minify \
        --tree-shaking=true \
        --external:aws-sdk \
        --external:@aws-sdk/* \
        --external:firebase \
        --external:firebase-admin \
        --external:@firebase/* \
        --external:@google-cloud/* \
        --external:google-gax \
        --external:grpc \
        --external:@grpc/* \
        --external:tr46 \
        --external:whatwg-url \
        --external:net \
        --external:tls \
        --external:fs \
        --external:path \
        --external:crypto \
        --external:stream \
        --external:util \
        --external:http \
        --external:https \
        --external:zlib \
        --external:events \
        --external:buffer \
        --external:querystring \
        --external:url \
        --external:child_process \
        --external:os \
        --external:assert \
        --keep-names \
        2>/dev/null
    
    if [ $? -eq 0 ]; then
        SIZE=$(ls -lh "dist/handlers/${handler}.js" | awk '{print $5}')
        echo "✅ $SIZE"
    else
        echo "❌ Failed"
    fi
done

echo
echo "📊 Final sizes:"
ls -lh dist/handlers/*.js | grep -E "(health|stats|webhook|build|disputes|metrics)" | awk '{print $5, $9}'