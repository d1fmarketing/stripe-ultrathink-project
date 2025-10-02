#!/bin/bash
set -euo pipefail

echo "🔧 Removing duplicate module.exports from handlers"
echo "================================================"

cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT

for file in dist/handlers/*.js; do
  if [ -f "$file" ]; then
    basename=$(basename "$file")
    echo -n "  Fixing $basename... "
    
    # Remove the trailing incorrect module.exports that we added
    # Keep only the __toCommonJS export that esbuild created
    
    # First, check if file has __toCommonJS export
    if grep -q "__toCommonJS" "$file"; then
      # Remove everything after "// Annotate the CommonJS export"
      sed -i '/^\/\/ Annotate the CommonJS export/,$d' "$file"
      echo "✅ (cleaned duplicate)"
    else
      # File doesn't have __toCommonJS, might be a different format
      # Check if it has duplicate module.exports
      count=$(grep -c "^module.exports" "$file" || true)
      if [ "$count" -gt 1 ]; then
        # Keep only the first module.exports
        awk '/^module.exports/{if (++count==1) print; else exit} {print}' "$file" > "$file.tmp"
        mv "$file.tmp" "$file"
        echo "✅ (kept first export)"
      else
        echo "✅ (no change needed)"
      fi
    fi
  fi
done

echo ""
echo "✅ All duplicate exports removed!"