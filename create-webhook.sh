#!/bin/bash

# Create Stripe webhook endpoint for dispute events

echo "🔔 Creating Stripe webhook endpoint..."

WEBHOOK_RESPONSE=$(curl -s https://api.stripe.com/v1/webhook_endpoints \
  -u sk_test_51RocXcDkPJe82O0quRJwsiZlhCC6vyHjA9DKpBQWL3pymXm2VCPf1JpNwpA3R0J6CUfPI0zEIskbCKJQrU6KHldi00U2HEgHxr: \
  -d "url=https://0mctcvl8sg.execute-api.us-east-1.amazonaws.com/webhooks/stripe" \
  -d "enabled_events[]"="charge.dispute.created" \
  -d "enabled_events[]"="charge.dispute.updated" \
  -d "enabled_events[]"="charge.dispute.closed" \
  -d "enabled_events[]"="charge.dispute.funds_reinstated" \
  -d "enabled_events[]"="charge.dispute.funds_withdrawn" \
  -d "description=Chargeback Autopilot Webhook")

# Extract webhook ID and secret
WEBHOOK_ID=$(echo "$WEBHOOK_RESPONSE" | jq -r '.id')
WEBHOOK_SECRET=$(echo "$WEBHOOK_RESPONSE" | jq -r '.secret')

if [ "$WEBHOOK_ID" != "null" ]; then
    echo "✅ Webhook created successfully!"
    echo "   Webhook ID: $WEBHOOK_ID"
    echo "   Webhook Secret: $WEBHOOK_SECRET"
    echo ""
    echo "📝 Save this webhook secret for deployment:"
    echo "   export STRIPE_CONNECT_WEBHOOK_SECRET=$WEBHOOK_SECRET"
    echo ""
    
    # Save to file
    echo "WEBHOOK_ID=$WEBHOOK_ID" > webhook-config.txt
    echo "WEBHOOK_SECRET=$WEBHOOK_SECRET" >> webhook-config.txt
    echo "WEBHOOK_URL=https://0mctcvl8sg.execute-api.us-east-1.amazonaws.com/webhooks/stripe" >> webhook-config.txt
    
    echo "Configuration saved to webhook-config.txt"
else
    echo "❌ Failed to create webhook:"
    echo "$WEBHOOK_RESPONSE" | jq
fi