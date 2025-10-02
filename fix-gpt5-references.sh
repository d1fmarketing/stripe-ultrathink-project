#!/bin/bash

# Fix all GPT-5 references to GPT-4 Turbo

echo "🔧 Fixing GPT-5 references to GPT-4 Turbo..."

# Fix in all source files
find /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src -type f -name "*.ts" -exec sed -i \
  -e "s/'gpt-5'/'gpt-4-turbo-preview'/g" \
  -e 's/"gpt-5"/"gpt-4-turbo-preview"/g' \
  -e "s/gpt-5/gpt-4-turbo-preview/g" \
  -e "s/GPT-5/GPT-4 Turbo/g" {} \;

# Fix specific patterns
find /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src -type f -name "*.ts" -exec sed -i \
  -e "s/temperature: 1, \/\/ GPT-5 requires temperature=1/temperature: 0.7, \/\/ Optimal temperature/g" \
  -e "s/temperature: 1 \/\/ GPT-5/temperature: 0.7/g" \
  -e "s/max_completion_tokens/max_tokens/g" {} \;

echo "✅ Fixed all GPT-5 references"

# Show remaining references (should be none)
echo ""
echo "Checking for any remaining GPT-5 references:"
grep -r "gpt-5" /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/src --include="*.ts" --include="*.js" | head -5 || echo "✅ No GPT-5 references found"

echo ""
echo "Files updated. Ready to rebuild and deploy."