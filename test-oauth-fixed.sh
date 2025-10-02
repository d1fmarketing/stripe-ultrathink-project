#!/bin/bash

echo "🧪 Testing Stripe OAuth After Dashboard Fix"
echo "==========================================="
echo

API_BASE="https://ket0g0lurh.execute-api.us-east-1.amazonaws.com"

# Test 1: Check OAuth Start endpoint
echo "1️⃣ Testing OAuth Start Endpoint..."
echo "   URL: $API_BASE/auth/stripe/start"
echo

RESPONSE=$(curl -sI "$API_BASE/auth/stripe/start" 2>/dev/null)
STATUS_CODE=$(echo "$RESPONSE" | head -1 | awk '{print $2}')
LOCATION=$(echo "$RESPONSE" | grep -i "location:" | cut -d' ' -f2 | tr -d '\r')

echo "   Status Code: $STATUS_CODE"

if [ "$STATUS_CODE" = "302" ]; then
    echo "   ✅ Returns 302 redirect"
    
    if [[ "$LOCATION" == *"connect.stripe.com"* ]]; then
        echo "   ✅ Redirects to Stripe Connect"
        echo "   Location: $LOCATION"
        
        # Test 2: Try to access the OAuth URL directly
        echo
        echo "2️⃣ Testing Stripe OAuth URL..."
        echo "   Checking if OAuth is enabled..."
        
        # Extract just the base URL for testing
        OAUTH_BASE="https://connect.stripe.com/oauth/authorize?response_type=code&client_id=ca_SsL2dWaMFTzSsFMMGzraPtJY2OiPPRID&scope=read_write"
        
        # Check if we get the error page or success
        STRIPE_RESPONSE=$(curl -s "$OAUTH_BASE" 2>/dev/null | head -500)
        
        if [[ "$STRIPE_RESPONSE" == *"Standard OAuth is disabled"* ]]; then
            echo "   ❌ OAUTH STILL DISABLED IN STRIPE!"
            echo
            echo "   ⚠️  You need to:"
            echo "   1. Log into Stripe Dashboard"
            echo "   2. Go to Settings → Connect → OAuth settings"
            echo "   3. Enable 'Standard OAuth for Standard accounts'"
            echo "   4. Add redirect URI: $API_BASE/auth/stripe/callback"
        elif [[ "$STRIPE_RESPONSE" == *"Connect with"* ]] || [[ "$STRIPE_RESPONSE" == *"Sign in to"* ]]; then
            echo "   ✅ OAUTH IS ENABLED!"
            echo "   ✅ Stripe Connect page loads successfully"
            echo
            echo "   🎉 OAuth is now working! You can now:"
            echo "   1. Visit: https://stripedshield-founders-1755231149.netlify.app/connect.html"
            echo "   2. Click 'Connect with Stripe'"
            echo "   3. Authorize the connection"
        else
            echo "   ⚠️  Unexpected response from Stripe"
            echo "   Check manually: $OAUTH_BASE"
        fi
    else
        echo "   ❌ Not redirecting to Stripe Connect"
        echo "   Location: $LOCATION"
    fi
else
    echo "   ❌ Expected 302, got $STATUS_CODE"
    echo "   API Gateway issue - try forcing deployment:"
    echo "   aws apigatewayv2 create-deployment --api-id ket0g0lurh"
fi

echo
echo "3️⃣ Testing Lambda Directly..."
LAMBDA_TEST=$(echo '{"queryStringParameters":{}}' | aws lambda invoke \
    --function-name chargeback-autopilot-stripe-prod-authStripeStart \
    --cli-binary-format raw-in-base64-out \
    --payload file:///dev/stdin \
    /tmp/oauth-lambda.json 2>/dev/null)

LAMBDA_STATUS=$(jq -r '.statusCode' /tmp/oauth-lambda.json 2>/dev/null)
LAMBDA_LOCATION=$(jq -r '.headers.Location' /tmp/oauth-lambda.json 2>/dev/null)

if [ "$LAMBDA_STATUS" = "302" ]; then
    echo "   ✅ Lambda returns 302"
    if [[ "$LAMBDA_LOCATION" == *"connect.stripe.com"* ]]; then
        echo "   ✅ Lambda OAuth URL correct"
    fi
else
    echo "   ❌ Lambda issue: Status $LAMBDA_STATUS"
fi

echo
echo "==========================================="
echo "📊 SUMMARY:"
echo

if [[ "$STRIPE_RESPONSE" == *"Standard OAuth is disabled"* ]]; then
    echo "❌ OAuth is DISABLED in Stripe Dashboard"
    echo "   ACTION REQUIRED: Enable it in Stripe Connect settings"
elif [[ "$STATUS_CODE" = "302" ]] && [[ "$LOCATION" == *"connect.stripe.com"* ]]; then
    echo "✅ OAuth is WORKING!"
    echo "   Ready to connect merchants"
    echo "   Connect URL: https://stripedshield-founders-1755231149.netlify.app/connect.html"
else
    echo "⚠️  Partial issues detected"
    echo "   Check the details above"
fi

echo
echo "Need help? Check: /home/ubuntu/STRIPE_ULTRATHINK_PROJECT/setup-stripe-webhooks.md"