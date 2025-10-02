#!/bin/bash

# Deploy StripedShield Landing Page to Netlify
# Uses the provided Netlify API token

echo "🚀 Deploying StripedShield Landing Page to Netlify..."
echo "================================================"

# Set the auth token
export NETLIFY_AUTH_TOKEN="nfp_6xWgFqX8QT3gZZ5pkmYfgKugkYzFikZma663"

# Create a simple site directory
mkdir -p site-deploy
cp index.html site-deploy/
cp landing-page-founder-update.html site-deploy/

# Create a simple redirect for the root
cat > site-deploy/_redirects << EOF
/founder /landing-page-founder-update.html 200
EOF

echo ""
echo "📦 Site files prepared..."
echo ""
echo "🌐 Deploying to Netlify..."
echo ""

# Deploy using Netlify CLI
# First deployment creates a new site
npx netlify deploy --prod --dir=site-deploy --site stripedshield-founders 2>/dev/null || \
npx netlify sites:create --name stripedshield-founders && \
npx netlify deploy --prod --dir=site-deploy

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔗 Your site should be live at:"
echo "   https://stripedshield-founders.netlify.app"
echo ""
echo "📝 Next steps:"
echo "1. Visit the URL to verify deployment"
echo "2. Share link in founder outreach"
echo "3. Update LinkedIn with live URL"
echo "4. Track clicks in analytics"