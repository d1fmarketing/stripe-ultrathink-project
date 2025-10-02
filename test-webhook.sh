#!/bin/bash

# Test webhook endpoint with Stripe CLI

echo "🧪 ULTRATHINK: Webhook Testing Suite"
echo "====================================="
echo ""

# Check webhook configuration
if [ -f webhook-config.txt ]; then
    source webhook-config.txt
    echo "✅ Webhook configured:"
    echo "   ID: $WEBHOOK_ID"
    echo "   URL: $WEBHOOK_URL"
    echo ""
else
    echo "⚠️  No webhook configuration found. Run create-webhook.sh first."
    exit 1
fi

# Function to test webhook with stripe trigger
test_dispute_created() {
    echo "📍 Test 1: Creating test dispute with stripe trigger..."
    echo "-------------------------------------------"
    
    # Create a test dispute
    echo "Triggering dispute.created event..."
    stripe trigger charge.dispute.created 2>&1 | tee trigger-output.txt
    
    if grep -q "succeeded" trigger-output.txt; then
        echo "✅ Dispute created successfully!"
    else
        echo "❌ Failed to create dispute"
        cat trigger-output.txt
    fi
    echo ""
}

# Function to check CloudWatch logs
check_logs() {
    echo "📍 Test 2: Checking CloudWatch logs..."
    echo "-------------------------------------------"
    
    echo "Fetching last 5 minutes of webhook logs..."
    aws logs tail /aws/lambda/chargeback-autopilot-stripe-dev-webhookStripe --since 5m --filter-pattern "dispute" | head -20
    echo ""
}

# Function to test direct webhook call
test_direct_webhook() {
    echo "📍 Test 3: Direct webhook test..."
    echo "-------------------------------------------"
    
    TIMESTAMP=$(date +%s)
    TEST_DISPUTE_ID="dp_test_${TIMESTAMP}"
    
    # Create test payload
    PAYLOAD=$(cat <<EOF
{
  "id": "evt_test_webhook_${TIMESTAMP}",
  "object": "event",
  "api_version": "2024-06-20",
  "created": ${TIMESTAMP},
  "data": {
    "object": {
      "id": "${TEST_DISPUTE_ID}",
      "object": "dispute",
      "amount": 10000,
      "charge": "ch_test_${TIMESTAMP}",
      "created": ${TIMESTAMP},
      "currency": "usd",
      "evidence": {
        "customer_communication": null,
        "customer_signature": null,
        "receipt": null,
        "shipping_documentation": null
      },
      "evidence_details": {
        "due_by": $((TIMESTAMP + 604800)),
        "has_evidence": false,
        "submission_count": 0
      },
      "is_charge_refundable": true,
      "reason": "fraudulent",
      "status": "warning_needs_response",
      "network_reason_code": "4855",
      "metadata": {
        "test": "true",
        "ce3_eligible": "checking"
      }
    }
  },
  "livemode": false,
  "pending_webhooks": 1,
  "request": {
    "id": null,
    "idempotency_key": null
  },
  "type": "charge.dispute.created"
}
EOF
)
    
    # Calculate signature (simplified for testing)
    SIGNATURE="t=${TIMESTAMP},v1=test_signature,v0="
    
    echo "Sending test dispute to webhook..."
    echo "Dispute ID: ${TEST_DISPUTE_ID}"
    echo "Amount: \$100.00"
    echo "Reason: fraudulent (CE3 eligible)"
    echo ""
    
    RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -H "Stripe-Signature: ${SIGNATURE}" \
        -d "$PAYLOAD")
    
    HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
    BODY=$(echo "$RESPONSE" | grep -v "HTTP_STATUS")
    
    echo "Response Status: $HTTP_STATUS"
    echo "Response Body: $BODY"
    
    if [ "$HTTP_STATUS" = "200" ]; then
        echo "✅ Webhook accepted the request!"
    else
        echo "⚠️  Webhook returned status $HTTP_STATUS"
    fi
    echo ""
}

# Function to list recent disputes
list_disputes() {
    echo "📍 Test 4: Listing recent disputes..."
    echo "-------------------------------------------"
    
    echo "Fetching disputes from Stripe..."
    stripe charges list --limit 5 | jq '.data[] | select(.disputed == true) | {id: .id, amount: .amount, disputed: .disputed, created: .created}'
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully fetched dispute data"
    else
        echo "⚠️  No disputes found or error fetching data"
    fi
    echo ""
}

# Function to check DynamoDB
check_dynamodb() {
    echo "📍 Test 5: Checking DynamoDB tables..."
    echo "-------------------------------------------"
    
    echo "Scanning CasesTable for disputes..."
    aws dynamodb scan --table-name chargeback-autopilot-stripe-dev-CasesTable --limit 5 2>/dev/null | jq '.Items[] | {dispute_id: .dispute_id.S, amount: .amount_cents.N, status: .status.S}' 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "✅ DynamoDB accessible"
    else
        echo "⚠️  No items found or table not accessible"
    fi
    echo ""
}

# Main execution
echo "🚀 Starting comprehensive webhook tests..."
echo ""

# Run all tests
test_dispute_created
sleep 3
check_logs
test_direct_webhook
list_disputes
check_dynamodb

echo "====================================="
echo "✅ Webhook testing complete!"
echo ""
echo "📊 Summary:"
echo "   • Webhook endpoint: $WEBHOOK_URL"
echo "   • Webhook ID: $WEBHOOK_ID"
echo "   • CloudWatch logs: /aws/lambda/chargeback-autopilot-stripe-dev-webhookStripe"
echo ""
echo "🎯 Next steps:"
echo "   1. Monitor CloudWatch for errors"
echo "   2. Create real test disputes in Stripe Dashboard"
echo "   3. Verify CE3.0 auto-detection"
echo "   4. Check evidence submission"