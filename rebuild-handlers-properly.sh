#!/bin/bash
set -euo pipefail

echo "🔧 Rebuilding handlers with correct export placement"
echo "==================================================="

cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT

# Clean and recreate dist/handlers
rm -rf dist/handlers
mkdir -p dist/handlers

echo ""
echo "📦 Building handlers with proper CommonJS format..."

for file in src/handlers/*.ts; do
  if [ -f "$file" ]; then
    basename=$(basename "$file" .ts)
    echo -n "  Building $basename... "
    
    # Build with esbuild but with different settings
    # Use iife format and then wrap it properly for CommonJS
    npx esbuild "$file" \
      --bundle \
      --platform=node \
      --target=node20 \
      --format=iife \
      --global-name="module.exports" \
      --outfile="dist/handlers/${basename}.js.tmp" \
      --external:@aws-sdk/* \
      --minify=false \
      --sourcemap=false 2>/dev/null
    
    # Wrap the IIFE output in proper CommonJS
    echo "// CommonJS wrapper for Lambda" > "dist/handlers/${basename}.js"
    cat "dist/handlers/${basename}.js.tmp" >> "dist/handlers/${basename}.js"
    echo "" >> "dist/handlers/${basename}.js"
    echo "// Export handler for Lambda" >> "dist/handlers/${basename}.js"
    echo "if (typeof module !== 'undefined' && module.exports) {" >> "dist/handlers/${basename}.js"
    echo "  module.exports = module.exports.handler ? module.exports : { handler: module.exports };" >> "dist/handlers/${basename}.js"
    echo "}" >> "dist/handlers/${basename}.js"
    
    rm "dist/handlers/${basename}.js.tmp"
    
    echo "✅"
  fi
done

echo ""
echo "✅ All handlers rebuilt with correct exports!"