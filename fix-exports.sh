#!/bin/bash
set -euo pipefail

echo "🔧 Fixing exports in bundled handlers"
echo "====================================="

cd /home/ubuntu/STRIPE_ULTRATHINK_PROJECT

# Fix the broken export pattern in all handler files
for file in dist/handlers/*.js; do
  if [ -f "$file" ]; then
    basename=$(basename "$file")
    echo -n "  Fixing $basename... "
    
    # Replace the broken export pattern with proper CommonJS export
    # Pattern: "0 && (module.exports = {" -> "module.exports = {"
    sed -i 's/0 && (module\.exports = {/module.exports = {/g' "$file"
    
    # Also ensure the handler is properly exported if not already
    # Check if module.exports exists and is not wrapped in 0 &&
    if ! grep -q "^module.exports = {" "$file"; then
      # If no proper export found, append one
      echo "" >> "$file"
      echo "// Fixed export for Lambda" >> "$file"
      echo "module.exports = { handler };" >> "$file"
    fi
    
    echo "✅"
  fi
done

echo ""
echo "✅ All exports fixed!"