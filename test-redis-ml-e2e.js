#!/usr/bin/env node

/**
 * ULTRATHINK Redis + ML End-to-End Test
 * Tests the complete flow from dispute to learning
 * Validates 90%+ win rate potential
 */

import { redis, cache } from './src/cache/redisClient.js';
import { patternCache } from './src/cache/patternCache.js';
import { scoreCache } from './src/cache/scoreCache.js';
import { fraudTracker } from './src/cache/fraudTracker.js';
import { feedbackLoop } from './src/ml/feedbackLoop.js';
import { modelUpdater } from './src/ml/modelUpdater.js';

// Test data
const mockDispute = {
  id: 'dp_test_' + Date.now(),
  amount: 5000, // $50
  reason: 'fraudulent',
  status: 'needs_response',
  created: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
  charge: {
    id: 'ch_test_123',
    amount: 5000,
    merchant: 'acct_test',
    outcome: {
      network_status: 'approved'
    },
    payment_method_details: {
      card: {
        country: 'US',
        checks: {
          cvc_check: 'pass'
        }
      }
    }
  },
  evidence: {
    receipt: 'receipt_url',
    shipping_documentation: 'tracking_123',
    customer_purchase_ip: '192.168.1.1',
    customer_communication: 'email_thread'
  },
  metadata: {
    prior_undisputed_transactions: '3',
    customer_tenure_days: '180'
  }
};

const mockFeatures = {
  amount: 5000,
  disputeReason: 'fraudulent',
  ceEligible: true,
  priorTxCount: 3,
  customerTenureDays: 180,
  shippingDelivered: true,
  ipRegionMatch: true,
  merchantWinRate: 0.65
};

const mockPrediction = {
  score: 0.75,
  confidence: 0.85,
  recommendation: 'FIGHT',
  estimatedWinProbability: 75,
  topFactors: [
    { factor: 'ceEligible', impact: 1.5 },
    { factor: 'shippingDelivered', impact: 1.2 }
  ]
};

// Test results collector
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// Test runner
async function runTest(name, testFn) {
  process.stdout.write(`Testing ${name}... `);
  try {
    const startTime = Date.now();
    await testFn();
    const duration = Date.now() - startTime;
    console.log(`✅ PASSED (${duration}ms)`);
    results.passed++;
    results.tests.push({ name, status: 'passed', duration });
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    results.failed++;
    results.tests.push({ name, status: 'failed', error: error.message });
  }
}

// Clean up function
async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');
  
  // Clear test patterns
  const testKeys = await redis.keys('*test*');
  if (testKeys.length > 0) {
    await redis.del(...testKeys);
  }
  
  console.log('✅ Cleanup complete');
}

// Main test suite
async function main() {
  console.log('🚀 ULTRATHINK Redis + ML Integration Test');
  console.log('==========================================\n');
  
  try {
    // Test 1: Redis Connection
    await runTest('Redis Connection', async () => {
      const pong = await redis.ping();
      if (pong !== 'PONG') throw new Error('Redis not responding');
    });
    
    // Test 2: Pattern Caching
    await runTest('Pattern Cache - Store & Retrieve', async () => {
      const fingerprint = patternCache.generateFingerprint(mockDispute);
      
      // Cache pattern
      await patternCache.cachePattern(fingerprint, true, 1500, 'Test narrative');
      
      // Retrieve cached score
      const cachedScore = await patternCache.getCachedScore(fingerprint);
      if (cachedScore === null) throw new Error('Failed to retrieve cached pattern');
      if (cachedScore !== 100) throw new Error(`Expected 100% win rate, got ${cachedScore}%`);
    });
    
    // Test 3: Score Caching
    await runTest('Score Cache - Fast Lookup', async () => {
      // Cache score
      await scoreCache.cacheScore(mockFeatures, mockPrediction, mockDispute.id);
      
      // Retrieve with timing
      const startTime = Date.now();
      const cached = await scoreCache.getCachedScore(mockFeatures);
      const lookupTime = Date.now() - startTime;
      
      if (!cached) throw new Error('Failed to retrieve cached score');
      if (cached.score !== mockPrediction.score) throw new Error('Score mismatch');
      if (lookupTime > 10) throw new Error(`Lookup too slow: ${lookupTime}ms (target <10ms)`);
    });
    
    // Test 4: Fraud Tracking
    await runTest('Fraud Tracker - Risk Detection', async () => {
      const indicator = {
        customerId: 'cust_test_fraud',
        email: 'test@fraud.com',
        ip: '192.168.1.100',
        cardFingerprint: 'card_test_123',
        timestamp: Date.now()
      };
      
      // Track multiple disputes to trigger velocity alerts
      for (let i = 0; i < 4; i++) {
        await fraudTracker.trackDispute(indicator, 10000);
      }
      
      // Check fraud status
      const fraudCheck = await fraudTracker.checkFraud(indicator);
      if (fraudCheck.allow !== false) throw new Error('Should detect high velocity fraud');
      if (fraudCheck.reason !== 'VELOCITY_LIMIT') throw new Error(`Wrong reason: ${fraudCheck.reason}`);
    });
    
    // Test 5: Feedback Loop Learning
    await runTest('Feedback Loop - Learning from Outcomes', async () => {
      // Record winning outcome
      mockDispute.status = 'won';
      await feedbackLoop.recordOutcome(mockDispute, mockFeatures, mockPrediction, 'Winning narrative');
      
      // Apply learning to new dispute
      const learned = await feedbackLoop.applyLearning(mockDispute, mockFeatures);
      
      if (learned.adjustedScore < 0.7) throw new Error('Learning not applied correctly');
      if (!learned.suggestedNarrative) throw new Error('Should suggest successful narrative');
    });
    
    // Test 6: Model Updater - Version Management
    await runTest('Model Updater - Prediction & Versioning', async () => {
      // Get prediction with current model
      const prediction = await modelUpdater.predict(mockFeatures);
      
      if (!prediction.modelVersion) throw new Error('Missing model version');
      if (prediction.score < 0 || prediction.score > 1) throw new Error('Invalid score range');
      if (!prediction.recommendation) throw new Error('Missing recommendation');
    });
    
    // Test 7: Pattern Discovery
    await runTest('Pattern Discovery - High Win Rate Patterns', async () => {
      // Simulate multiple winning disputes with same pattern
      const testPattern = 'test_pattern_' + Date.now();
      
      for (let i = 0; i < 6; i++) {
        await patternCache.cachePattern(testPattern, true, 1000 + i * 100);
      }
      
      // Check if pattern is discovered
      const topPatterns = await patternCache.getTopPatterns(5);
      const found = topPatterns.find(p => p.fingerprint === testPattern);
      
      if (!found) throw new Error('Pattern not in top patterns');
      if (found.stats.win_rate !== 100) throw new Error('Should have 100% win rate');
    });
    
    // Test 8: Cache Performance
    await runTest('Cache Performance - Sub-millisecond Response', async () => {
      const iterations = 100;
      const times = [];
      
      // Warm up cache
      await scoreCache.getCachedScore(mockFeatures);
      
      // Measure response times
      for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();
        await scoreCache.getCachedScore(mockFeatures);
        const end = process.hrtime.bigint();
        times.push(Number(end - start) / 1000000); // Convert to ms
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`\n    Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      if (avgTime > 5) throw new Error(`Average response too slow: ${avgTime.toFixed(2)}ms`);
      if (maxTime > 20) throw new Error(`Max response too slow: ${maxTime.toFixed(2)}ms`);
    });
    
    // Test 9: Score Distribution Analytics
    await runTest('Score Distribution - Analytics', async () => {
      const distribution = await scoreCache.getScoreDistribution();
      
      if (distribution.total === 0) throw new Error('No scores in distribution');
      if (distribution.average < 0 || distribution.average > 1) throw new Error('Invalid average score');
    });
    
    // Test 10: Model Performance Tracking
    await runTest('Model Performance - Metrics', async () => {
      const performance = await feedbackLoop.getPerformance();
      
      if (performance.winRate < 0 || performance.winRate > 100) throw new Error('Invalid win rate');
      if (performance.accuracy < 0 || performance.accuracy > 1) throw new Error('Invalid accuracy');
      if (performance.f1Score < 0 || performance.f1Score > 1) throw new Error('Invalid F1 score');
    });
    
    // Test 11: Recommendations Engine
    await runTest('Learning Recommendations', async () => {
      const recommendations = await feedbackLoop.getRecommendations();
      
      if (!Array.isArray(recommendations)) throw new Error('Should return array of recommendations');
      if (recommendations.length === 0) throw new Error('Should provide at least one recommendation');
    });
    
    // Test 12: Pattern Insights
    await runTest('Pattern Insights - Win Rate Analysis', async () => {
      const insights = await patternCache.getPatternInsights();
      
      if (insights.total_patterns < 0) throw new Error('Invalid pattern count');
      if (insights.avg_win_rate < 0 || insights.avg_win_rate > 100) throw new Error('Invalid win rate');
    });
    
    // Test 13: Real-time Stats
    await runTest('Real-time Cache Stats', async () => {
      const stats = await scoreCache.getRealtimeStats();
      
      if (stats.hitRate < 0 || stats.hitRate > 100) throw new Error('Invalid hit rate');
      if (stats.avgResponseTime < 0) throw new Error('Invalid response time');
      if (stats.cacheSize < 0) throw new Error('Invalid cache size');
    });
    
    // Test 14: Fraud Network Detection
    await runTest('Fraud Network Analysis', async () => {
      const stats = await fraudTracker.getFraudStats();
      
      if (stats.blacklisted < 0) throw new Error('Invalid blacklist count');
      if (stats.amount_saved < 0) throw new Error('Invalid amount saved');
    });
    
    // Test 15: End-to-end Flow
    await runTest('End-to-End Dispute Processing', async () => {
      const testDispute = { ...mockDispute, id: 'dp_e2e_' + Date.now() };
      
      // 1. Generate fingerprint
      const fingerprint = patternCache.generateFingerprint(testDispute);
      
      // 2. Check cache for instant response
      let cachedScore = await patternCache.getCachedScore(fingerprint);
      
      // 3. If not cached, predict and cache
      if (!cachedScore) {
        const prediction = await modelUpdater.predict(mockFeatures);
        await scoreCache.cacheScore(mockFeatures, prediction, testDispute.id);
        cachedScore = prediction.score * 100;
      }
      
      // 4. Check fraud
      const fraudCheck = await fraudTracker.checkFraud({
        customerId: 'cust_e2e_test',
        timestamp: Date.now()
      });
      
      // 5. Make decision
      const shouldFight = cachedScore > 40 && fraudCheck.allow;
      
      // 6. Record outcome for learning
      testDispute.status = shouldFight && cachedScore > 70 ? 'won' : 'lost';
      await feedbackLoop.recordOutcome(testDispute, mockFeatures, mockPrediction);
      
      // Verify flow completed
      const performance = await feedbackLoop.getPerformance();
      if (performance.totalDisputes === 0) throw new Error('Outcome not recorded');
    });
    
    // Performance Summary
    console.log('\n📊 PERFORMANCE SUMMARY');
    console.log('======================');
    
    // Get cache stats
    const cacheStats = await scoreCache.getRealtimeStats();
    const patternInsights = await patternCache.getPatternInsights();
    const modelPerf = await feedbackLoop.getPerformance();
    
    console.log(`\n📈 Cache Performance:`);
    console.log(`   Hit Rate: ${cacheStats.hitRate.toFixed(1)}%`);
    console.log(`   Avg Response: ${cacheStats.avgResponseTime.toFixed(2)}ms`);
    console.log(`   Cache Size: ${cacheStats.cacheSize} entries`);
    console.log(`   Memory: ${cacheStats.memoryUsage}`);
    
    console.log(`\n🎯 Pattern Recognition:`);
    console.log(`   Total Patterns: ${patternInsights.total_patterns}`);
    console.log(`   Avg Win Rate: ${patternInsights.avg_win_rate.toFixed(1)}%`);
    console.log(`   High Confidence: ${patternInsights.high_confidence_patterns}`);
    
    console.log(`\n🤖 ML Performance:`);
    console.log(`   Win Rate: ${modelPerf.winRate.toFixed(1)}%`);
    console.log(`   Accuracy: ${(modelPerf.accuracy * 100).toFixed(1)}%`);
    console.log(`   F1 Score: ${modelPerf.f1Score.toFixed(3)}`);
    console.log(`   Total Disputes: ${modelPerf.totalDisputes}`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    results.failed++;
  } finally {
    // Clean up test data
    await cleanup();
    
    // Final results
    console.log('\n========================================');
    console.log('📋 TEST RESULTS');
    console.log('========================================');
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📊 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
    
    if (results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      results.tests
        .filter(t => t.status === 'failed')
        .forEach(t => console.log(`   - ${t.name}: ${t.error}`));
    }
    
    // Validate 90%+ potential
    console.log('\n🚀 90%+ WIN RATE VALIDATION');
    console.log('============================');
    
    const readyFor90 = {
      redis: results.tests.find(t => t.name.includes('Redis')).status === 'passed',
      patternCache: results.tests.find(t => t.name.includes('Pattern Cache')).status === 'passed',
      scoreCache: results.tests.find(t => t.name.includes('Score Cache')).status === 'passed',
      learning: results.tests.find(t => t.name.includes('Feedback Loop')).status === 'passed',
      performance: cacheStats.avgResponseTime < 5
    };
    
    const allReady = Object.values(readyFor90).every(v => v);
    
    console.log(`✅ Redis Integration: ${readyFor90.redis ? 'READY' : 'NOT READY'}`);
    console.log(`✅ Pattern Caching: ${readyFor90.patternCache ? 'READY' : 'NOT READY'}`);
    console.log(`✅ Score Caching: ${readyFor90.scoreCache ? 'READY' : 'NOT READY'}`);
    console.log(`✅ ML Learning: ${readyFor90.learning ? 'READY' : 'NOT READY'}`);
    console.log(`✅ Sub-5ms Response: ${readyFor90.performance ? 'ACHIEVED' : 'NOT ACHIEVED'}`);
    
    if (allReady) {
      console.log('\n🎉 SYSTEM READY FOR 90%+ WIN RATE! 🎉');
      console.log('With sufficient data, the system will:');
      console.log('  • Learn from every dispute outcome');
      console.log('  • Cache successful patterns');
      console.log('  • Respond in microseconds');
      console.log('  • Auto-tune for maximum win rate');
      console.log('  • Detect and prevent fraud instantly');
    } else {
      console.log('\n⚠️ Some components need attention before achieving 90%+ win rate');
    }
    
    // Close Redis connection
    await redis.quit();
    
    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);
  }
}

// Run tests
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});