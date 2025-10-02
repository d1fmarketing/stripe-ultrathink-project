#!/usr/bin/env node

/**
 * ML Training Data Monitor
 * Checks the status of automatically collected training data
 * Shows readiness for ML model training
 */

const AWS = require('@aws-sdk/client-dynamodb');
const { DynamoDBClient, ScanCommand } = AWS;

// Configuration
const TABLE_NAME = 'chargeback-ml-training-data';
const REGION = process.env.AWS_REGION || 'us-east-1';
const MIN_SAMPLES_FOR_TRAINING = 100;

// Initialize DynamoDB client
const client = new DynamoDBClient({ region: REGION });

/**
 * Format date for display
 */
function formatDate(timestamp) {
  return new Date(parseInt(timestamp)).toLocaleString();
}

/**
 * Calculate statistics from training data
 */
function calculateStats(items) {
  const stats = {
    total: items.length,
    won: 0,
    lost: 0,
    warning_closed: 0,
    reasons: {},
    avgPredictionError: 0,
    ce3Eligible: 0,
    dateRange: {
      earliest: null,
      latest: null
    }
  };
  
  let totalPredictionError = 0;
  
  items.forEach(item => {
    // Count by status
    if (item.status?.S === 'won') stats.won++;
    else if (item.status?.S === 'lost') stats.lost++;
    else if (item.status?.S === 'warning_closed') stats.warning_closed++;
    
    // Count by reason
    const reason = item.reason?.S || 'unknown';
    stats.reasons[reason] = (stats.reasons[reason] || 0) + 1;
    
    // Calculate prediction error
    const originalPrediction = parseFloat(item.originalPrediction?.N || '0.5');
    const actualOutcome = item.status?.S === 'won' ? 1 : 0;
    totalPredictionError += Math.abs(originalPrediction - actualOutcome);
    
    // Check CE3 eligibility
    if (item.features?.S) {
      try {
        const features = JSON.parse(item.features.S);
        if (features.ce3Eligible || features.basic?.ce3Eligible) {
          stats.ce3Eligible++;
        }
      } catch (e) {
        // Features might not be valid JSON
      }
    }
    
    // Track date range
    const timestamp = parseInt(item.timestamp?.N || '0');
    if (!stats.dateRange.earliest || timestamp < stats.dateRange.earliest) {
      stats.dateRange.earliest = timestamp;
    }
    if (!stats.dateRange.latest || timestamp > stats.dateRange.latest) {
      stats.dateRange.latest = timestamp;
    }
  });
  
  stats.avgPredictionError = items.length > 0 ? 
    (totalPredictionError / items.length * 100).toFixed(1) : 0;
  
  return stats;
}

/**
 * Main monitoring function
 */
async function monitorMLCollection() {
  console.log('🤖 ML Training Data Monitor');
  console.log('=' .repeat(50));
  console.log(`📊 Table: ${TABLE_NAME}`);
  console.log(`🌍 Region: ${REGION}`);
  console.log('');
  
  try {
    // Scan the training data table
    const scanResult = await client.send(new ScanCommand({
      TableName: TABLE_NAME,
      Select: 'ALL_ATTRIBUTES'
    }));
    
    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.log('❌ No training data collected yet');
      console.log('');
      console.log('💡 Training data will be collected automatically when:');
      console.log('   1. Disputes are resolved (won/lost/warning_closed)');
      console.log('   2. Webhook receives charge.dispute.updated events');
      console.log('   3. ML collection is enabled in Lambda');
      return;
    }
    
    // Calculate statistics
    const stats = calculateStats(scanResult.Items);
    
    // Display results
    console.log('📈 DATA COLLECTION STATUS');
    console.log('-'.repeat(50));
    console.log(`✅ Total samples collected: ${stats.total}`);
    console.log(`📅 Date range: ${formatDate(stats.dateRange.earliest)} to ${formatDate(stats.dateRange.latest)}`);
    console.log('');
    
    // Win rate analysis
    const winRate = stats.total > 0 ? (stats.won / stats.total * 100).toFixed(1) : 0;
    console.log('🎯 OUTCOME DISTRIBUTION');
    console.log('-'.repeat(50));
    console.log(`   Won: ${stats.won} (${(stats.won/stats.total*100).toFixed(1)}%)`);
    console.log(`   Lost: ${stats.lost} (${(stats.lost/stats.total*100).toFixed(1)}%)`);
    console.log(`   Warning: ${stats.warning_closed} (${(stats.warning_closed/stats.total*100).toFixed(1)}%)`);
    console.log(`   Overall Win Rate: ${winRate}%`);
    console.log('');
    
    // Dispute reasons
    console.log('📊 DISPUTE REASONS');
    console.log('-'.repeat(50));
    Object.entries(stats.reasons)
      .sort((a, b) => b[1] - a[1])
      .forEach(([reason, count]) => {
        console.log(`   ${reason}: ${count} (${(count/stats.total*100).toFixed(1)}%)`);
      });
    console.log('');
    
    // Model performance
    console.log('🧠 MODEL PERFORMANCE');
    console.log('-'.repeat(50));
    console.log(`   Average Prediction Error: ${stats.avgPredictionError}%`);
    console.log(`   CE3 Eligible Disputes: ${stats.ce3Eligible} (${(stats.ce3Eligible/stats.total*100).toFixed(1)}%)`);
    console.log('');
    
    // Training readiness
    console.log('🚀 TRAINING READINESS');
    console.log('-'.repeat(50));
    
    if (stats.total >= MIN_SAMPLES_FOR_TRAINING) {
      console.log(`✅ READY FOR TRAINING!`);
      console.log(`   You have ${stats.total} samples (minimum: ${MIN_SAMPLES_FOR_TRAINING})`);
      console.log('');
      console.log('📝 Next steps:');
      console.log('   1. Run: node scripts/train-model.js');
      console.log('   2. Deploy trained model to Lambda');
      console.log('   3. A/B test against heuristics');
    } else {
      const needed = MIN_SAMPLES_FOR_TRAINING - stats.total;
      const daysElapsed = (stats.dateRange.latest - stats.dateRange.earliest) / (1000 * 60 * 60 * 24);
      const samplesPerDay = stats.total / Math.max(daysElapsed, 1);
      const daysToReady = Math.ceil(needed / samplesPerDay);
      
      console.log(`⏳ NOT READY YET`);
      console.log(`   Current: ${stats.total} samples`);
      console.log(`   Needed: ${MIN_SAMPLES_FOR_TRAINING} samples`);
      console.log(`   Gap: ${needed} more samples needed`);
      console.log(`   Collection rate: ${samplesPerDay.toFixed(1)} samples/day`);
      console.log(`   Estimated ready: ~${daysToReady} days`);
    }
    
    console.log('');
    console.log('💡 Tips:');
    console.log('   - Process more disputes to collect training data faster');
    console.log('   - Ensure webhook is receiving charge.dispute.updated events');
    console.log('   - Check CloudWatch for MLDataCollected metrics');
    
  } catch (error) {
    console.error('❌ Error monitoring ML data:', error.message);
    
    if (error.name === 'ResourceNotFoundException') {
      console.log('');
      console.log('⚠️  Table not found. Creating it now...');
      console.log('   Run: aws dynamodb create-table --table-name ' + TABLE_NAME);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  monitorMLCollection()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { monitorMLCollection, calculateStats };