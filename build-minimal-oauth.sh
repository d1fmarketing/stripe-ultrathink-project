#!/bin/bash
# Build minimal OAuth handlers for Lambda deployment

echo "Building minimal OAuth handlers..."

# Create minimal dist directory
mkdir -p dist-minimal/handlers

# Copy only OAuth handlers
cat > dist-minimal/handlers/authStripeStart.js << 'EOF'
const crypto = require('crypto');

exports.handler = async (event) => {
    const STRIPE_CLIENT_ID = process.env.STRIPE_CLIENT_ID || 'ca_SsL2dWaMFTzSsFMMGzraPtJY2OiPPRID';
    const STRIPE_REDIRECT_URI = process.env.STRIPE_REDIRECT_URI || 'https://ket0g0lurh.execute-api.us-east-1.amazonaws.com/auth/stripe/callback';
    
    const qs = event.queryStringParameters || {};
    const firebase_uid = qs.uid || qs.firebase_uid || null;
    
    const stateData = {
        firebase_uid,
        csrf: crypto.randomBytes(16).toString('hex'),
        timestamp: Date.now()
    };
    
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');
    
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: STRIPE_CLIENT_ID,
        scope: 'read_write',
        redirect_uri: STRIPE_REDIRECT_URI,
        state
    }).toString();
    
    return {
        statusCode: 302,
        headers: {
            'Location': `https://connect.stripe.com/oauth/authorize?${params}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        },
        body: ''
    };
};
EOF

echo "✅ OAuth start handler created"

# Create zip for deployment
cd dist-minimal
zip -q ../oauth-minimal.zip -r .
cd ..

echo "📦 Package size: $(ls -lh oauth-minimal.zip | awk '{print $5}')"
echo "✅ Minimal OAuth handlers ready for deployment"