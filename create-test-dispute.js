#!/usr/bin/env node

/**
 * Create Test Dispute in Stripe
 * Generates a test charge and dispute for testing the Chargeback Autopilot
 */

const stripe = require('stripe')('sk_test_51RocXcDkPJe82O0quRJwsiZlhCC6vyHjA9DKpBQWL3pymXm2VCPf1JpNwpA3R0J6CUfPI0zEIskbCKJQrU6KHldi00U2HEgHxr');

async function createTestCharge() {
  console.log('💳 Creating test charge...');
  
  try {
    // First create a test token (simulating a card payment)
    const token = await stripe.tokens.create({
      card: {
        number: '4000000000000259', // This card number triggers a dispute
        exp_month: 12,
        exp_year: 2026,
        cvc: '123',
      },
    });
    
    console.log('✅ Token created:', token.id);
    
    // Create a charge using the token
    const charge = await stripe.charges.create({
      amount: 5000, // $50.00
      currency: 'usd',
      source: token.id,
      description: 'Test charge for dispute - Chargeback Autopilot',
      metadata: {
        order_id: 'test_order_' + Date.now(),
        customer_email: 'test@example.com',
        product: 'Digital subscription',
        test_mode: 'true'
      }
    });
    
    console.log('✅ Charge created successfully!');
    console.log('   Charge ID:', charge.id);
    console.log('   Amount:', '$' + (charge.amount / 100).toFixed(2));
    console.log('   Status:', charge.status);
    
    // Note: Disputes are automatically created for test card 4000000000000259
    console.log('\n⏳ Dispute should be created automatically...');
    console.log('   (Card 4000000000000259 triggers immediate dispute)');
    
    return charge;
  } catch (error) {
    console.error('❌ Error creating charge:', error.message);
    throw error;
  }
}

async function listRecentDisputes() {
  console.log('\n📋 Fetching recent disputes...');
  
  try {
    const disputes = await stripe.disputes.list({
      limit: 5
    });
    
    if (disputes.data.length === 0) {
      console.log('No disputes found');
      return null;
    }
    
    console.log(`\n✅ Found ${disputes.data.length} dispute(s):\n`);
    
    disputes.data.forEach((dispute, index) => {
      console.log(`Dispute ${index + 1}:`);
      console.log(`  ID: ${dispute.id}`);
      console.log(`  Amount: $${(dispute.amount / 100).toFixed(2)}`);
      console.log(`  Reason: ${dispute.reason}`);
      console.log(`  Status: ${dispute.status}`);
      console.log(`  Created: ${new Date(dispute.created * 1000).toLocaleString()}`);
      console.log(`  Charge: ${dispute.charge}`);
      console.log('');
    });
    
    return disputes.data[0]; // Return most recent dispute
  } catch (error) {
    console.error('❌ Error fetching disputes:', error.message);
    throw error;
  }
}

async function updateDisputeWithEvidence(disputeId) {
  console.log(`\n📝 Adding evidence to dispute ${disputeId}...`);
  
  try {
    const updatedDispute = await stripe.disputes.update(disputeId, {
      evidence: {
        customer_communication: 'Order confirmation email sent to customer@example.com on 2025-08-13',
        receipt: 'Receipt #12345 showing successful payment and delivery',
        shipping_documentation: 'Digital delivery confirmed via IP tracking',
        product_description: 'Monthly subscription to premium digital service',
        customer_signature: 'Terms accepted via checkbox on checkout page',
        billing_address: '123 Test St, San Francisco, CA 94102',
        access_activity_log: 'Customer accessed service 45 times after purchase',
        service_documentation: 'Service successfully provided as described'
      },
      metadata: {
        processed_by: 'chargeback-autopilot',
        ce3_eligible: 'checking',
        win_probability: '0.75'
      }
    });
    
    console.log('✅ Evidence added successfully!');
    console.log('   Status:', updatedDispute.status);
    console.log('   Evidence count:', updatedDispute.evidence_details.submission_count);
    
    return updatedDispute;
  } catch (error) {
    console.error('❌ Error updating dispute:', error.message);
    throw error;
  }
}

async function testWebhook(dispute) {
  console.log('\n🔔 Sending dispute to webhook endpoint...');
  
  const webhookUrl = 'https://j39ls67cy6.execute-api.us-east-1.amazonaws.com/webhooks/stripe';
  
  // Create webhook event
  const event = {
    id: 'evt_test_' + Date.now(),
    object: 'event',
    api_version: '2025-07-30.basil',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: dispute
    },
    livemode: false,
    type: 'dispute.created'
  };
  
  console.log(`   Webhook URL: ${webhookUrl}`);
  console.log(`   Event type: ${event.type}`);
  console.log(`   Dispute ID: ${dispute.id}`);
  
  // Note: In production, Stripe sends this automatically
  console.log('\n✅ In production, Stripe will automatically send webhooks');
  console.log('   Configure webhook endpoint in Stripe Dashboard:');
  console.log(`   ${webhookUrl}`);
}

async function main() {
  console.log('🚀 Stripe Test Dispute Creator');
  console.log('=' .repeat(50));
  console.log('Account: Test Mode');
  console.log('API Version: 2025-07-30.basil');
  console.log('=' .repeat(50));
  
  try {
    // Step 1: Create a test charge that will dispute
    const charge = await createTestCharge();
    
    // Wait a moment for dispute to be created
    console.log('\n⏳ Waiting 3 seconds for dispute creation...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 2: List recent disputes
    const dispute = await listRecentDisputes();
    
    if (dispute) {
      // Step 3: Add evidence to the dispute
      await updateDisputeWithEvidence(dispute.id);
      
      // Step 4: Show webhook info
      await testWebhook(dispute);
      
      console.log('\n' + '=' .repeat(50));
      console.log('✅ Test dispute created and updated successfully!');
      console.log('\n📊 Summary:');
      console.log(`   Dispute ID: ${dispute.id}`);
      console.log(`   Amount: $${(dispute.amount / 100).toFixed(2)}`);
      console.log(`   View in Stripe: https://dashboard.stripe.com/test/disputes/${dispute.id}`);
      console.log('\n🎯 Next Steps:');
      console.log('   1. Check CloudWatch logs for Lambda function');
      console.log('   2. Configure webhook in Stripe Dashboard');
      console.log('   3. Test CE3.0 detection logic');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nPlease ensure:');
    console.error('1. Stripe API key is valid');
    console.error('2. Test mode is enabled');
    console.error('3. Network connectivity is available');
  }
}

// Run the test
main();