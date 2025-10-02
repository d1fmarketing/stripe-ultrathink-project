#!/usr/bin/env node

/**
 * Training Data Collection Script
 * Collects dispute outcomes and features for ML training
 * 
 * Usage: node scripts/collect-training-data.js [--days=30] [--limit=1000]
 */

const AWS = require('@aws-sdk/client-dynamodb');
const { DynamoDBClient, PutItemCommand, ScanCommand } = AWS;
const Stripe = require('stripe');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
    const [key, value] = arg.split('=');
    acc[key.replace('--', '')] = value || true;
    return acc;
}, {});

const DAYS_BACK = parseInt(args.days || '30');
const LIMIT = parseInt(args.limit || '1000');

// Configuration
const config = {
    stripeKey: process.env.STRIPE_SECRET || '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',
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    tableName: 'ml-training-data',
    features: [
        'avs_match', 'cvc_match', 'three_d_secure',
        'customer_history_days', 'previous_disputes', 'total_spent',
        'reason_code', 'amount_cents', 'days_since_charge',
        'merchant_category', 'win_rate_history', 'issuer_country',
        'issuer_bank', 'customer_email_domain', 'shipping_matched',
        'ip_country_match', 'high_risk_indicator', 'response_time_hours',
        'evidence_strength_score', 'transaction_frequency',
        'average_transaction_amount', 'device_fingerprint_matches',
        'billing_shipping_match', 'weekend_transaction',
        'night_transaction', 'first_transaction', 'card_brand',
        'card_funding', 'customer_name_matched', 'phone_verified'
    ]
};

// Initialize clients
const stripe = new Stripe(config.stripeKey, { apiVersion: '2025-07-30.basil' });
const dynamodb = new DynamoDBClient({ region: config.awsRegion });

/**
 * Extract features from a dispute
 */
async function extractFeatures(dispute, charge) {
    const features = {};
    
    // Payment verification features
    features.avs_match = charge?.outcome?.network_status === 'approved_by_network' ? 1 : 0;
    features.cvc_match = charge?.outcome?.risk_level === 'normal' ? 1 : 0;
    features.three_d_secure = charge?.payment_method_details?.card?.three_d_secure ? 1 : 0;
    
    // Customer history
    const customer = charge?.customer ? await stripe.customers.retrieve(charge.customer) : null;
    features.customer_history_days = customer ? 
        Math.floor((Date.now() - customer.created * 1000) / (1000 * 60 * 60 * 24)) : 0;
    
    // Previous disputes
    if (customer) {
        const previousDisputes = await stripe.disputes.list({
            limit: 100,
            created: { lt: dispute.created }
        });
        features.previous_disputes = previousDisputes.data.filter(d => 
            d.charge && charge.customer === customer.id
        ).length;
    } else {
        features.previous_disputes = 0;
    }
    
    // Transaction features
    features.amount_cents = dispute.amount;
    features.days_since_charge = Math.floor((dispute.created - charge.created) / (60 * 60 * 24));
    features.reason_code = mapReasonToCode(dispute.reason);
    
    // Risk indicators
    features.high_risk_indicator = charge?.outcome?.risk_level === 'elevated' ? 1 : 0;
    features.weekend_transaction = new Date(charge.created * 1000).getDay() % 6 === 0 ? 1 : 0;
    features.night_transaction = new Date(charge.created * 1000).getHours() >= 22 || 
                                 new Date(charge.created * 1000).getHours() <= 6 ? 1 : 0;
    
    // Card details
    features.card_brand = charge?.payment_method_details?.card?.brand || 'unknown';
    features.card_funding = charge?.payment_method_details?.card?.funding || 'unknown';
    
    // Evidence strength (simplified)
    features.evidence_strength_score = calculateEvidenceStrength(dispute.evidence);
    
    // CE3 eligibility
    features.ce3_eligible = checkCE3Eligibility(dispute, charge) ? 1 : 0;
    
    // Fill remaining features with defaults
    config.features.forEach(feature => {
        if (!(feature in features)) {
            features[feature] = typeof features[feature] === 'string' ? 'unknown' : 0;
        }
    });
    
    return features;
}

/**
 * Map dispute reason to numeric code
 */
function mapReasonToCode(reason) {
    const reasonMap = {
        'duplicate': 1,
        'fraudulent': 2,
        'subscription_canceled': 3,
        'product_unacceptable': 4,
        'product_not_received': 5,
        'unrecognized': 6,
        'credit_not_processed': 7,
        'general': 8,
        'incorrect_account_details': 9,
        'insufficient_funds': 10,
        'bank_cannot_process': 11,
        'debit_not_authorized': 12,
        'customer_initiated': 13
    };
    return reasonMap[reason] || 0;
}

/**
 * Calculate evidence strength score
 */
function calculateEvidenceStrength(evidence) {
    let score = 0;
    if (evidence.receipt) score += 20;
    if (evidence.customer_communication) score += 20;
    if (evidence.shipping_documentation) score += 20;
    if (evidence.shipping_tracking_number) score += 15;
    if (evidence.service_documentation) score += 15;
    if (evidence.customer_signature) score += 10;
    return score;
}

/**
 * Check CE3 eligibility
 */
function checkCE3Eligibility(dispute, charge) {
    // Simplified CE3 check
    return dispute.reason === 'fraudulent' && 
           charge?.payment_method_details?.card?.network === 'visa';
}

/**
 * Save training data to DynamoDB
 */
async function saveTrainingData(disputeId, features, outcome, confidence) {
    const item = {
        disputeId: { S: disputeId },
        timestamp: { N: Date.now().toString() },
        features: { S: JSON.stringify(features) },
        outcome: { S: outcome },
        confidence: { N: confidence.toString() },
        modelVersion: { S: 'heuristic-v1' }
    };
    
    try {
        await dynamodb.send(new PutItemCommand({
            TableName: config.tableName,
            Item: item
        }));
        return true;
    } catch (error) {
        console.error(`Failed to save training data for ${disputeId}:`, error.message);
        return false;
    }
}

/**
 * Collect historical dispute data
 */
async function collectHistoricalData() {
    console.log('🔍 Starting training data collection...');
    console.log(`📅 Looking back ${DAYS_BACK} days`);
    console.log(`🎯 Target: ${LIMIT} samples\n`);
    
    const startTime = Date.now();
    const cutoffTime = Math.floor((Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000) / 1000);
    
    let collected = 0;
    let processed = 0;
    let hasMore = true;
    let startingAfter = undefined;
    
    const stats = {
        won: 0,
        lost: 0,
        warning_closed: 0,
        ce3_eligible: 0,
        high_confidence: 0
    };
    
    while (hasMore && collected < LIMIT) {
        try {
            // Fetch disputes from Stripe
            const disputes = await stripe.disputes.list({
                limit: 100,
                created: { gte: cutoffTime },
                starting_after: startingAfter
            });
            
            for (const dispute of disputes.data) {
                processed++;
                
                // Only collect resolved disputes
                if (!['won', 'lost', 'warning_closed'].includes(dispute.status)) {
                    continue;
                }
                
                // Get associated charge
                const charge = dispute.charge ? 
                    await stripe.charges.retrieve(dispute.charge) : null;
                
                if (!charge) {
                    console.log(`⚠️  Skipping ${dispute.id} - no charge data`);
                    continue;
                }
                
                // Extract features
                const features = await extractFeatures(dispute, charge);
                
                // Calculate confidence based on outcome
                let confidence = 0.5;
                if (dispute.status === 'won') {
                    confidence = 0.85;
                    stats.won++;
                } else if (dispute.status === 'lost') {
                    confidence = 0.15;
                    stats.lost++;
                } else {
                    confidence = 0.5;
                    stats.warning_closed++;
                }
                
                // Track CE3 eligibility
                if (features.ce3_eligible) {
                    stats.ce3_eligible++;
                }
                
                // Track high confidence predictions
                if (confidence > 0.7 || confidence < 0.3) {
                    stats.high_confidence++;
                }
                
                // Save to DynamoDB
                const saved = await saveTrainingData(
                    dispute.id,
                    features,
                    dispute.status,
                    confidence
                );
                
                if (saved) {
                    collected++;
                    
                    // Progress update
                    if (collected % 10 === 0) {
                        const winRate = stats.won / collected * 100;
                        console.log(`✅ Collected ${collected}/${LIMIT} samples (${winRate.toFixed(1)}% win rate)`);
                    }
                }
                
                if (collected >= LIMIT) break;
            }
            
            hasMore = disputes.has_more;
            if (disputes.data.length > 0) {
                startingAfter = disputes.data[disputes.data.length - 1].id;
            }
            
        } catch (error) {
            console.error('❌ Error collecting data:', error.message);
            hasMore = false;
        }
    }
    
    // Final statistics
    const duration = Math.floor((Date.now() - startTime) / 1000);
    const winRate = collected > 0 ? (stats.won / collected * 100).toFixed(1) : 0;
    const ce3Rate = collected > 0 ? (stats.ce3_eligible / collected * 100).toFixed(1) : 0;
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 COLLECTION COMPLETE');
    console.log('='.repeat(50));
    console.log(`✅ Total collected: ${collected} samples`);
    console.log(`📈 Win rate: ${winRate}%`);
    console.log(`🎯 CE3 eligible: ${ce3Rate}%`);
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log('\nBreakdown:');
    console.log(`  - Won: ${stats.won} (${(stats.won/collected*100).toFixed(1)}%)`);
    console.log(`  - Lost: ${stats.lost} (${(stats.lost/collected*100).toFixed(1)}%)`);
    console.log(`  - Warning: ${stats.warning_closed} (${(stats.warning_closed/collected*100).toFixed(1)}%)`);
    console.log(`  - High confidence: ${stats.high_confidence} (${(stats.high_confidence/collected*100).toFixed(1)}%)`);
    
    if (collected >= 100) {
        console.log('\n✅ Sufficient data collected for initial model training!');
        console.log('📝 Next step: Run training script');
        console.log('   node scripts/train-model.js');
    } else if (collected >= 50) {
        console.log('\n⚠️  Limited data collected. Consider:');
        console.log('   1. Expanding date range (--days=60)');
        console.log('   2. Using synthetic data augmentation');
    } else {
        console.log('\n❌ Insufficient data for training.');
        console.log('   Need at least 50 samples for basic model.');
    }
}

/**
 * Check/create DynamoDB table
 */
async function ensureTable() {
    console.log('🔧 Checking DynamoDB table...');
    
    try {
        // Check if table exists
        const tables = await dynamodb.send(new AWS.ListTablesCommand({}));
        
        if (!tables.TableNames.includes(config.tableName)) {
            console.log(`📦 Creating table ${config.tableName}...`);
            
            await dynamodb.send(new AWS.CreateTableCommand({
                TableName: config.tableName,
                KeySchema: [
                    { AttributeName: 'disputeId', KeyType: 'HASH' }
                ],
                AttributeDefinitions: [
                    { AttributeName: 'disputeId', AttributeType: 'S' }
                ],
                BillingMode: 'PAY_PER_REQUEST'
            }));
            
            console.log('✅ Table created successfully');
            
            // Wait for table to be active
            await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
            console.log('✅ Table exists');
        }
    } catch (error) {
        console.error('⚠️  Table check failed:', error.message);
        console.log('   Continuing anyway - table might exist');
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('🚀 StripedShield ML Training Data Collector');
    console.log('==========================================\n');
    
    // Ensure table exists
    await ensureTable();
    
    // Collect data
    await collectHistoricalData();
    
    console.log('\n✅ Collection process complete!');
    process.exit(0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { extractFeatures, saveTrainingData };