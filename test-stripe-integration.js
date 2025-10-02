#!/usr/bin/env node

/**
 * Stripe Integration Test Script
 * Tests the deployed Chargeback Autopilot with Stripe test keys
 */

const https = require('https');
const crypto = require('crypto');

// Configuration
const config = {
  publishableKey: 'pk_test_51RocXcDkPJe82O0qxBH2WAlJzVjh8idKa2eEH3u5xFHkn9Zebn7zXGXQzELO9tRWKQSKvaAJH8sv5SpzlJxhlujc00IxJBmucF',
  secretKey: process.env.STRIPE_SECRET || 'sk_test_51RocXcDkPJe82O0q', // Incomplete - need full key
  apiBaseUrl: 'https://j39ls67cy6.execute-api.us-east-1.amazonaws.com',
  stripeApiUrl: 'https://api.stripe.com/v1'
};

// Test functions
async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });
    
    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function testEndpoints() {
  console.log('🧪 Testing Stripe Chargeback Autopilot Endpoints\n');
  console.log('=' .repeat(50));
  
  // Test 1: Health check - List cases
  console.log('\n📍 Test 1: GET /cases');
  try {
    const result = await makeRequest(`${config.apiBaseUrl}/cases`);
    console.log(`Status: ${result.status}`);
    console.log(`Response:`, result.data);
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  // Test 2: OAuth Start
  console.log('\n📍 Test 2: GET /auth/stripe/start');
  try {
    const result = await makeRequest(`${config.apiBaseUrl}/auth/stripe/start`);
    console.log(`Status: ${result.status}`);
    console.log(`Response:`, result.data);
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  // Test 3: Create test dispute webhook event
  console.log('\n📍 Test 3: POST /webhooks/stripe (simulated dispute)');
  
  const testDisputeEvent = {
    id: 'evt_test_' + Date.now(),
    object: 'event',
    api_version: '2025-07-30.basil',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'dp_test_' + Date.now(),
        object: 'dispute',
        amount: 5000,
        charge: 'ch_test_' + Date.now(),
        created: Math.floor(Date.now() / 1000),
        currency: 'usd',
        evidence: {
          customer_communication: null,
          customer_signature: null,
          receipt: null,
          shipping_documentation: null
        },
        evidence_details: {
          due_by: Math.floor(Date.now() / 1000) + 604800, // 7 days from now
          has_evidence: false,
          submission_count: 0
        },
        is_charge_refundable: true,
        reason: 'fraudulent',
        status: 'warning_needs_response',
        metadata: {}
      }
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: null,
      idempotency_key: null
    },
    type: 'dispute.created'
  };
  
  // Create webhook signature (simplified for testing)
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify(testDisputeEvent);
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', 'test_webhook_secret')
    .update(signedPayload)
    .digest('hex');
  
  try {
    const result = await makeRequest(`${config.apiBaseUrl}/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Stripe-Signature': `t=${timestamp},v1=${expectedSignature}`
      },
      body: testDisputeEvent
    });
    console.log(`Status: ${result.status}`);
    console.log(`Response:`, result.data);
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log('✅ Basic endpoint tests complete\n');
}

async function createTestDispute() {
  console.log('🔧 Creating Test Dispute in Stripe\n');
  console.log('⚠️  Note: Secret key appears incomplete');
  console.log('Please provide full secret key to test Stripe API calls\n');
  
  if (config.secretKey.length < 50) {
    console.log('❌ Secret key too short. Expected format: sk_test_[50+ characters]');
    console.log('Current key length:', config.secretKey.length);
    return;
  }
  
  // Would create actual test charge and dispute here with complete key
  console.log('Would create test charge and dispute with complete API key...');
}

async function testCE3Detection() {
  console.log('🔍 Testing CE3.0 Detection Logic\n');
  
  // Simulate CE3-eligible dispute
  const ce3EligibleDispute = {
    id: 'dp_ce3_test',
    reason: 'fraudulent',
    charge: {
      payment_method_details: {
        card: {
          network: 'visa',
          three_d_secure: {
            authenticated: true
          }
        }
      }
    },
    evidence_details: {
      due_by: Math.floor(Date.now() / 1000) + 604800
    }
  };
  
  console.log('CE3 Eligible Dispute:', ce3EligibleDispute);
  console.log('Expected: Should detect as CE3.0 eligible for auto-win');
  
  // Test with internal endpoint once we have proper auth
  console.log('Ready to test with complete Stripe credentials');
}

// Main execution
async function main() {
  console.log('🚀 Stripe Chargeback Autopilot Test Suite');
  console.log('Environment: TEST (Sandbox)');
  console.log('API Base:', config.apiBaseUrl);
  console.log('Stripe Account:', config.publishableKey.substring(0, 30) + '...');
  console.log('\n');
  
  await testEndpoints();
  await createTestDispute();
  await testCE3Detection();
  
  console.log('\n📝 Next Steps:');
  console.log('1. Provide complete Stripe secret key');
  console.log('2. Set up webhook endpoint in Stripe Dashboard');
  console.log('3. Configure OAuth app in Stripe Dashboard');
  console.log('4. Run full integration tests');
}

// Run tests
main().catch(console.error);