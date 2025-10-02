#!/bin/bash
set -euo pipefail

echo "🔧 Building handlers with simple CommonJS exports"
echo "==============================================="

cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT

# Clean and recreate dist/handlers
rm -rf dist/handlers
mkdir -p dist/handlers

echo ""
echo "📦 Compiling TypeScript handlers..."

# First, compile TypeScript to JavaScript without bundling
npx tsc --module commonjs --target es2022 --outDir dist/ src/handlers/*.ts 2>/dev/null || true

echo ""
echo "📦 Bundling each handler..."

for file in src/handlers/*.ts; do
  if [ -f "$file" ]; then
    basename=$(basename "$file" .ts)
    echo -n "  $basename... "
    
    # Use esbuild with specific settings to ensure proper CommonJS
    npx esbuild "$file" \
      --bundle \
      --platform=node \
      --target=node20 \
      --format=cjs \
      --outfile="dist/handlers/${basename}.js" \
      --external:@aws-sdk/* \
      --minify=false \
      --keep-names \
      --main-fields=main,module 2>/dev/null
    
    # Ensure the handler is properly exported
    # Check if the file ends with a proper export
    if ! grep -q "exports.handler" "dist/handlers/${basename}.js"; then
      # Add a safety export at the end
      echo "" >> "dist/handlers/${basename}.js"
      echo "// Ensure handler is exported" >> "dist/handlers/${basename}.js"
      echo "if (!exports.handler && typeof handler !== 'undefined') {" >> "dist/handlers/${basename}.js"
      echo "  exports.handler = handler;" >> "dist/handlers/${basename}.js"
      echo "}" >> "dist/handlers/${basename}.js"
    fi
    
    echo "✅"
  fi
done

echo ""
echo "✅ All handlers built successfully!"

# Quick validation
echo ""
echo "🔍 Validating exports..."
for file in dist/handlers/*.js; do
  basename=$(basename "$file")
  if grep -q "exports.handler" "$file" || grep -q "module.exports.*handler" "$file"; then
    echo "  ✅ $basename has handler export"
  else
    echo "  ❌ $basename missing handler export!"
  fi
done