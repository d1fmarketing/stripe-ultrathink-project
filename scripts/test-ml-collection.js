#!/usr/bin/env node

/**
 * Test ML Data Collection
 * Triggers the webhook endpoint with a simulated dispute resolution
 */

const https = require('https');

// Simulate a dispute that was resolved as "won"
const testEvent = {
  id: "evt_test_ml_collection_" + Date.now(),
  type: "charge.dispute.updated",
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: "dp_test_" + Date.now(),
      object: "dispute",
      amount: 5000,
      balance_transactions: [],
      charge: "ch_test_123456",
      created: Math.floor(Date.now() / 1000) - 86400,
      currency: "usd",
      evidence: {
        receipt: "https://example.com/receipt.pdf",
        shipping_documentation: "Delivered on 2025-08-15",
        customer_communication: "Customer confirmed receipt"
      },
      evidence_details: {
        submission_count: 1,
        has_evidence: true
      },
      is_charge_refundable: false,
      metadata: {},
      network_reason_code: "4855",
      reason: "fraudulent",
      status: "won", // This triggers ML collection
      balance_transaction: null
    }
  }
};

// Send to webhook endpoint
const options = {
  hostname: 'ket0g0lurh.execute-api.us-east-1.amazonaws.com',
  port: 443,
  path: '/webhooks/stripe',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'stripe-signature': 'test_signature',
    'stripe-account': 'acct_test_merchant'
  }
};

console.log('🚀 Sending test dispute resolution to trigger ML collection...');
console.log(`📊 Dispute ID: ${testEvent.data.object.id}`);
console.log(`📈 Status: ${testEvent.data.object.status} (should trigger collection)`);

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`\n✅ Response received: ${res.statusCode}`);
    console.log(`📝 Response body: ${data}`);
    
    if (res.statusCode === 200) {
      console.log('\n✨ ML data collection should have been triggered!');
      console.log('🔍 Check the training data table in 10 seconds:');
      console.log('   node scripts/monitor-ml-collection.js');
    } else {
      console.log('\n❌ Webhook returned an error. Check Lambda logs:');
      console.log('   aws logs tail /aws/lambda/chargeback-autopilot-stripe-prod-webhookStripe --follow');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error sending test event:', error);
});

req.write(JSON.stringify(testEvent));
req.end();