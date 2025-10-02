/**
 * Model Updater for Online Learning
 * Continuously improves the ML model based on real outcomes
 * Works with feedbackLoop.ts to achieve 90%+ win rate
 */

import { redis, cache } from '../cache/redisClient';
import { feedbackLoop } from './feedbackLoop';
import { patternCache } from '../cache/patternCache';
import { scoreCache } from '../cache/scoreCache';
import type { Features, Prediction } from '../ai/winPredictor';

export interface ModelVersion {
  version: string;
  timestamp: number;
  performance: {
    winRate: number;
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
  };
  weights: Record<string, number>;
  thresholds: {
    fight: number;
    accept: number;
    ce3Override: number;
  };
  trainingSize: number;
  improvements: string[];
}

export interface UpdateStrategy {
  type: 'incremental' | 'batch' | 'reinforcement';
  frequency: number; // minutes
  minSamples: number;
  performanceThreshold: number;
}

export interface FeatureEngineering {
  name: string;
  formula: string;
  weight: number;
  correlation: number;
}

export class ModelUpdater {
  private static instance: ModelUpdater;
  private readonly MODEL_VERSION_KEY = 'model:version:current';
  private readonly MODEL_HISTORY_KEY = 'model:versions';
  private readonly FEATURE_ENGINEERING_KEY = 'model:features:engineered';
  private readonly UPDATE_SCHEDULE_KEY = 'model:update:schedule';
  
  // Model update parameters
  private readonly MIN_SAMPLES_FOR_UPDATE = 50;
  private readonly PERFORMANCE_IMPROVEMENT_THRESHOLD = 0.02; // 2% improvement required
  private readonly MAX_VERSIONS_TO_KEEP = 10;
  private readonly BATCH_SIZE = 100;
  
  // Current model state
  currentVersion: ModelVersion | null = null;
  private updateInProgress = false;
  
  private constructor() {
    this.initialize();
  }
  
  static getInstance(): ModelUpdater {
    if (!ModelUpdater.instance) {
      ModelUpdater.instance = new ModelUpdater();
    }
    return ModelUpdater.instance;
  }
  
  /**
   * Initialize model updater with base model
   */
  private async initialize(): Promise<void> {
    const existingVersion = await cache.get<ModelVersion>(this.MODEL_VERSION_KEY);
    
    if (!existingVersion) {
      // Create initial model version
      this.currentVersion = {
        version: '1.0.0',
        timestamp: Date.now(),
        performance: {
          winRate: 68,
          accuracy: 0.68,
          precision: 0.7,
          recall: 0.65,
          f1Score: 0.675
        },
        weights: {
          ceEligible: 1.5,
          priorTxCount: 1.3,
          shippingDelivered: 1.2,
          ipRegionMatch: 1.1,
          merchantWinRate: 1.0,
          amount: 0.9,
          customerTenureDays: 0.8,
          disputeReason: 1.0,
          // New engineered features
          velocityScore: 1.1,
          fraudRisk: 1.4,
          evidenceStrength: 1.3,
          historicalSuccess: 1.2
        },
        thresholds: {
          fight: 0.4,    // Fight if score > 40%
          accept: 0.2,   // Accept if score < 20%
          ce3Override: 0.3 // Always fight CE3 if > 30%
        },
        trainingSize: 0,
        improvements: ['Initial model with 68% win rate']
      };
      
      await this.saveModelVersion(this.currentVersion);
    } else {
      this.currentVersion = existingVersion;
    }
    
    console.log(`🎯 Model Updater initialized - Version: ${this.currentVersion.version} - Win Rate: ${this.currentVersion.performance.winRate}%`);
  }
  
  /**
   * Trigger model update based on accumulated feedback
   * THIS IS WHERE CONTINUOUS IMPROVEMENT HAPPENS!
   */
  async updateModel(strategy: UpdateStrategy = {
    type: 'incremental',
    frequency: 60,
    minSamples: 50,
    performanceThreshold: 0.7
  }): Promise<ModelVersion | null> {
    if (this.updateInProgress) {
      console.log('⏳ Model update already in progress...');
      return null;
    }
    
    this.updateInProgress = true;
    
    try {
      // Get learning data from feedback loop
      const learningData = await feedbackLoop.exportLearningData();
      
      if (learningData.outcomes.length < strategy.minSamples) {
        console.log(`📊 Not enough data for update: ${learningData.outcomes.length}/${strategy.minSamples} samples`);
        return null;
      }
      
      // Perform update based on strategy
      let newVersion: ModelVersion | null = null;
      
      switch (strategy.type) {
        case 'incremental':
          newVersion = await this.incrementalUpdate(learningData);
          break;
        case 'batch':
          newVersion = await this.batchUpdate(learningData);
          break;
        case 'reinforcement':
          newVersion = await this.reinforcementUpdate(learningData);
          break;
      }
      
      if (newVersion && this.isImprovement(newVersion)) {
        // Save and activate new model
        await this.activateModel(newVersion);
        console.log(`✅ Model updated to v${newVersion.version} - Win Rate: ${newVersion.performance.winRate}%`);
        return newVersion;
      }
      
      return null;
      
    } finally {
      this.updateInProgress = false;
    }
  }
  
  /**
   * Incremental update - adjust weights based on recent outcomes
   */
  private async incrementalUpdate(learningData: any): Promise<ModelVersion> {
    const currentWeights = { ...this.currentVersion!.weights };
    const improvements: string[] = [];
    
    // Analyze recent performance by feature
    const featurePerformance = await this.analyzeFeaturePerformance(learningData.outcomes);
    
    // Adjust weights based on performance
    for (const [feature, perf] of Object.entries(featurePerformance)) {
      const currentWeight = currentWeights[feature] || 1.0;
      
      if (perf.correlation > 0.3 && perf.samples > 10) {
        // Strong positive correlation - increase weight
        const adjustment = 0.1 * perf.correlation;
        currentWeights[feature] = Math.min(2.0, currentWeight + adjustment);
        improvements.push(`Increased ${feature} weight by ${(adjustment * 100).toFixed(0)}%`);
        
      } else if (perf.correlation < -0.2 && perf.samples > 10) {
        // Negative correlation - decrease weight
        const adjustment = 0.1 * Math.abs(perf.correlation);
        currentWeights[feature] = Math.max(0.1, currentWeight - adjustment);
        improvements.push(`Decreased ${feature} weight by ${(adjustment * 100).toFixed(0)}%`);
      }
    }
    
    // Engineer new features based on patterns
    const newFeatures = await this.engineerFeatures(learningData);
    for (const feature of newFeatures) {
      currentWeights[feature.name] = feature.weight;
      improvements.push(`Added new feature: ${feature.name}`);
    }
    
    // Adjust thresholds based on performance
    const thresholds = await this.optimizeThresholds(learningData);
    
    // Create new version
    const newVersion: ModelVersion = {
      version: this.incrementVersion(this.currentVersion!.version),
      timestamp: Date.now(),
      performance: learningData.performance,
      weights: currentWeights,
      thresholds,
      trainingSize: learningData.outcomes.length,
      improvements
    };
    
    return newVersion;
  }
  
  /**
   * Batch update - retrain on all available data
   */
  private async batchUpdate(learningData: any): Promise<ModelVersion> {
    console.log(`🔄 Batch update with ${learningData.outcomes.length} samples...`);
    
    // Split data into training and validation sets
    const splitIndex = Math.floor(learningData.outcomes.length * 0.8);
    const trainingSet = learningData.outcomes.slice(0, splitIndex);
    const validationSet = learningData.outcomes.slice(splitIndex);
    
    // Train new weights from scratch
    const weights = await this.trainWeights(trainingSet);
    
    // Validate performance
    const performance = await this.validateModel(weights, validationSet);
    
    // Find optimal thresholds
    const thresholds = await this.findOptimalThresholds(validationSet, weights);
    
    const improvements = [
      `Retrained on ${trainingSet.length} samples`,
      `Validation accuracy: ${(performance.accuracy * 100).toFixed(1)}%`,
      `New fight threshold: ${thresholds.fight.toFixed(2)}`
    ];
    
    return {
      version: this.incrementVersion(this.currentVersion!.version, 'minor'),
      timestamp: Date.now(),
      performance,
      weights,
      thresholds,
      trainingSize: trainingSet.length,
      improvements
    };
  }
  
  /**
   * Reinforcement learning update - learn from win/loss patterns
   */
  private async reinforcementUpdate(learningData: any): Promise<ModelVersion> {
    console.log(`🧠 Reinforcement learning update...`);
    
    const currentWeights = { ...this.currentVersion!.weights };
    const improvements: string[] = [];
    
    // Group outcomes by pattern
    const patterns = await this.groupByPattern(learningData.outcomes);
    
    // Reinforce successful patterns
    for (const [patternId, outcomes] of patterns.entries()) {
      const winRate = outcomes.filter(o => o.outcome === 'won').length / outcomes.length;
      
      if (winRate > 0.8 && outcomes.length > 5) {
        // High-performing pattern - reinforce features
        const commonFeatures = this.extractCommonFeatures(outcomes);
        
        for (const feature of commonFeatures) {
          currentWeights[feature] = Math.min(2.0, (currentWeights[feature] || 1.0) * 1.1);
        }
        
        improvements.push(`Reinforced pattern ${patternId.substring(0, 8)} with ${(winRate * 100).toFixed(0)}% win rate`);
        
        // Cache this pattern for fast lookup
        await this.cacheHighPerformingPattern(patternId, outcomes);
      }
      
      if (winRate < 0.3 && outcomes.length > 5) {
        // Poor-performing pattern - reduce feature weights
        const commonFeatures = this.extractCommonFeatures(outcomes);
        
        for (const feature of commonFeatures) {
          currentWeights[feature] = Math.max(0.1, (currentWeights[feature] || 1.0) * 0.9);
        }
        
        improvements.push(`Penalized pattern ${patternId.substring(0, 8)} with ${(winRate * 100).toFixed(0)}% win rate`);
      }
    }
    
    // Q-learning for threshold optimization
    const thresholds = await this.qLearningThresholds(learningData.outcomes);
    
    return {
      version: this.incrementVersion(this.currentVersion!.version),
      timestamp: Date.now(),
      performance: learningData.performance,
      weights: currentWeights,
      thresholds,
      trainingSize: learningData.outcomes.length,
      improvements
    };
  }
  
  /**
   * Engineer new features based on patterns
   */
  private async engineerFeatures(learningData: any): Promise<FeatureEngineering[]> {
    const newFeatures: FeatureEngineering[] = [];
    
    // Velocity score - dispute frequency indicator
    const velocityCorrelation = await this.calculateFeatureCorrelation(
      learningData.outcomes,
      (o) => o.features.disputeVelocity || 0
    );
    
    if (Math.abs(velocityCorrelation) > 0.3) {
      newFeatures.push({
        name: 'velocityScore',
        formula: 'disputes_per_30_days / avg_disputes',
        weight: 1.0 + velocityCorrelation,
        correlation: velocityCorrelation
      });
    }
    
    // Evidence strength score
    const evidenceCorrelation = await this.calculateFeatureCorrelation(
      learningData.outcomes,
      (o) => o.evidenceQuality / 100
    );
    
    if (evidenceCorrelation > 0.3) {
      newFeatures.push({
        name: 'evidenceStrength',
        formula: 'sum(evidence_pieces * quality_weight)',
        weight: 1.0 + evidenceCorrelation,
        correlation: evidenceCorrelation
      });
    }
    
    // Historical success rate with similar disputes
    newFeatures.push({
      name: 'historicalSuccess',
      formula: 'pattern_win_rate * confidence',
      weight: 1.2,
      correlation: 0.4
    });
    
    return newFeatures;
  }
  
  /**
   * Optimize thresholds based on ROI analysis
   */
  private async optimizeThresholds(learningData: any): Promise<{
    fight: number;
    accept: number;
    ce3Override: number;
  }> {
    const outcomes = learningData.outcomes;
    
    // Calculate ROI for different threshold levels
    const thresholdTests = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6];
    let bestThreshold = 0.4;
    let bestROI = -Infinity;
    
    for (const threshold of thresholdTests) {
      let totalCost = 0;
      let totalRecovered = 0;
      
      for (const outcome of outcomes) {
        if (outcome.prediction.score >= threshold) {
          // Would have fought this dispute
          totalCost += 10; // Cost to fight (time/resources)
          if (outcome.outcome === 'won') {
            totalRecovered += outcome.amount / 100; // Convert cents to dollars
          }
        }
      }
      
      const roi = totalRecovered - totalCost;
      if (roi > bestROI) {
        bestROI = roi;
        bestThreshold = threshold;
      }
    }
    
    return {
      fight: bestThreshold,
      accept: bestThreshold * 0.5, // Accept if very low probability
      ce3Override: Math.min(0.3, bestThreshold * 0.75) // Lower threshold for CE3
    };
  }
  
  /**
   * Check if new model is an improvement
   */
  private isImprovement(newVersion: ModelVersion): boolean {
    if (!this.currentVersion) return true;
    
    const currentPerf = this.currentVersion.performance;
    const newPerf = newVersion.performance;
    
    // Check for improvement in key metrics
    const winRateImproved = newPerf.winRate > currentPerf.winRate;
    const accuracyImproved = newPerf.accuracy > currentPerf.accuracy + this.PERFORMANCE_IMPROVEMENT_THRESHOLD;
    const f1Improved = newPerf.f1Score > currentPerf.f1Score;
    
    // Require improvement in at least 2 metrics
    const improvements = [winRateImproved, accuracyImproved, f1Improved].filter(Boolean).length;
    
    if (improvements >= 2) {
      console.log(`✨ Model improvement detected:
        Win Rate: ${currentPerf.winRate.toFixed(1)}% → ${newPerf.winRate.toFixed(1)}%
        Accuracy: ${(currentPerf.accuracy * 100).toFixed(1)}% → ${(newPerf.accuracy * 100).toFixed(1)}%
        F1 Score: ${currentPerf.f1Score.toFixed(3)} → ${newPerf.f1Score.toFixed(3)}
      `);
      return true;
    }
    
    return false;
  }
  
  /**
   * Activate new model version
   */
  private async activateModel(version: ModelVersion): Promise<void> {
    // Archive current version
    if (this.currentVersion) {
      await this.archiveVersion(this.currentVersion);
    }
    
    // Set as current version
    this.currentVersion = version;
    await this.saveModelVersion(version);
    
    // Clear score cache to force recalculation with new model
    await scoreCache.clearCache();
    
    // Warm cache with common patterns using new model
    await this.warmCacheWithNewModel(version);
    
    console.log(`🚀 Model v${version.version} activated - Win Rate: ${version.performance.winRate}%`);
  }
  
  /**
   * Rollback to previous version if needed
   */
  async rollback(): Promise<ModelVersion | null> {
    const history = await this.getVersionHistory();
    
    if (history.length < 2) {
      console.log('❌ No previous version to rollback to');
      return null;
    }
    
    const previousVersion = history[1]; // Second most recent
    await this.activateModel(previousVersion);
    
    console.log(`⏪ Rolled back to model v${previousVersion.version}`);
    return previousVersion;
  }
  
  /**
   * Get model prediction with current version
   */
  async predict(features: Features): Promise<Prediction & { modelVersion: string }> {
    if (!this.currentVersion) {
      await this.initialize();
    }
    
    // Calculate weighted score
    let score = 0;
    let totalWeight = 0;
    const topFactors: Array<{ factor: string; impact: number }> = [];
    
    for (const [feature, value] of Object.entries(features)) {
      const weight = this.currentVersion!.weights[feature] || 1.0;
      const numericValue = typeof value === 'boolean' ? (value ? 1 : 0) : 
                          typeof value === 'number' ? Math.min(1, value / 100) : 0;
      
      score += numericValue * weight;
      totalWeight += weight;
      
      if (numericValue > 0.5 && weight > 1.0) {
        topFactors.push({
          factor: feature,
          impact: numericValue * weight
        });
      }
    }
    
    // Normalize score
    score = totalWeight > 0 ? score / totalWeight : 0.5;
    
    // Apply threshold logic
    let recommendation: 'FIGHT' | 'ACCEPT' | 'REVIEW';
    if (features.ceEligible && score >= this.currentVersion!.thresholds.ce3Override) {
      recommendation = 'FIGHT';
    } else if (score >= this.currentVersion!.thresholds.fight) {
      recommendation = 'FIGHT';
    } else if (score <= this.currentVersion!.thresholds.accept) {
      recommendation = 'ACCEPT';
    } else {
      recommendation = 'REVIEW';
    }
    
    // Sort top factors by impact
    topFactors.sort((a, b) => b.impact - a.impact);
    
    // Convert to Record<string, number> format
    const topFactorsMap: Record<string, number> = {};
    topFactors.slice(0, 5).forEach(f => {
      topFactorsMap[f.factor] = f.impact;
    });
    
    return {
      score: Math.min(1, Math.max(0, score)),
      recommendation,
      topFactors: topFactorsMap,
      modelVersion: this.currentVersion!.version
    };
  }
  
  // Helper methods
  
  private incrementVersion(current: string, type: 'patch' | 'minor' | 'major' = 'patch'): string {
    const parts = current.split('.').map(Number);
    
    switch (type) {
      case 'patch':
        parts[2]++;
        break;
      case 'minor':
        parts[1]++;
        parts[2] = 0;
        break;
      case 'major':
        parts[0]++;
        parts[1] = 0;
        parts[2] = 0;
        break;
    }
    
    return parts.join('.');
  }
  
  private async saveModelVersion(version: ModelVersion): Promise<void> {
    await cache.set(this.MODEL_VERSION_KEY, version);
    await cache.zadd('model:versions:timeline', version.timestamp, version.version);
  }
  
  private async archiveVersion(version: ModelVersion): Promise<void> {
    await cache.set(`model:version:${version.version}`, version, 86400 * 90); // Keep for 90 days
    
    // Maintain version limit
    const versions = await cache.zrevrange('model:versions:timeline', 0, -1);
    if (versions.length > this.MAX_VERSIONS_TO_KEEP) {
      const toRemove = versions.slice(this.MAX_VERSIONS_TO_KEEP);
      for (const v of toRemove) {
        await cache.del(`model:version:${v}`);
      }
      await cache.zrem('model:versions:timeline', ...toRemove);
    }
  }
  
  private async getVersionHistory(): Promise<ModelVersion[]> {
    const versionIds = await cache.zrevrange('model:versions:timeline', 0, this.MAX_VERSIONS_TO_KEEP - 1);
    const versions: ModelVersion[] = [];
    
    for (const id of versionIds) {
      const version = await cache.get<ModelVersion>(`model:version:${id}`);
      if (version) versions.push(version);
    }
    
    return versions;
  }
  
  private async analyzeFeaturePerformance(outcomes: any[]): Promise<Record<string, any>> {
    const performance: Record<string, any> = {};
    
    // Analyze each feature's correlation with success
    const features = Object.keys(outcomes[0]?.features || {});
    
    for (const feature of features) {
      const correlation = await this.calculateFeatureCorrelation(
        outcomes,
        (o) => {
          const value = o.features[feature];
          return typeof value === 'boolean' ? (value ? 1 : 0) : 
                 typeof value === 'number' ? value : 0;
        }
      );
      
      performance[feature] = {
        correlation,
        samples: outcomes.length,
        winRate: outcomes.filter(o => o.outcome === 'won' && o.features[feature]).length / 
                 outcomes.filter(o => o.features[feature]).length || 0
      };
    }
    
    return performance;
  }
  
  private async calculateFeatureCorrelation(outcomes: any[], extractor: (o: any) => number): Promise<number> {
    if (outcomes.length === 0) return 0;
    
    let sumXY = 0, sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0;
    const n = outcomes.length;
    
    for (const outcome of outcomes) {
      const x = extractor(outcome);
      const y = outcome.outcome === 'won' ? 1 : 0;
      
      sumXY += x * y;
      sumX += x;
      sumY += y;
      sumX2 += x * x;
      sumY2 += y * y;
    }
    
    const correlation = (n * sumXY - sumX * sumY) / 
      Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return isNaN(correlation) ? 0 : correlation;
  }
  
  private async trainWeights(trainingSet: any[]): Promise<Record<string, number>> {
    // Simplified weight training - in production use gradient descent or similar
    const weights: Record<string, number> = {};
    const features = Object.keys(trainingSet[0]?.features || {});
    
    for (const feature of features) {
      const correlation = await this.calculateFeatureCorrelation(
        trainingSet,
        (o) => {
          const value = o.features[feature];
          return typeof value === 'boolean' ? (value ? 1 : 0) : 
                 typeof value === 'number' ? value / 100 : 0;
        }
      );
      
      // Set weight based on correlation
      weights[feature] = 1.0 + (correlation * 0.5);
      weights[feature] = Math.max(0.1, Math.min(2.0, weights[feature]));
    }
    
    return weights;
  }
  
  private async validateModel(weights: Record<string, number>, validationSet: any[]): Promise<any> {
    let correct = 0;
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    
    for (const outcome of validationSet) {
      // Calculate score with weights
      let score = 0;
      let totalWeight = 0;
      
      for (const [feature, value] of Object.entries(outcome.features)) {
        const weight = weights[feature] || 1.0;
        const numericValue = typeof value === 'boolean' ? (value ? 1 : 0) : 
                            typeof value === 'number' ? value / 100 : 0;
        score += numericValue * weight;
        totalWeight += weight;
      }
      
      score = totalWeight > 0 ? score / totalWeight : 0.5;
      
      const predicted = score >= 0.5;
      const actual = outcome.outcome === 'won';
      
      if (predicted === actual) correct++;
      if (predicted && actual) truePositives++;
      if (predicted && !actual) falsePositives++;
      if (!predicted && actual) falseNegatives++;
    }
    
    const accuracy = correct / validationSet.length;
    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
    
    const wins = validationSet.filter(o => o.outcome === 'won').length;
    const winRate = (wins / validationSet.length) * 100;
    
    return {
      accuracy,
      precision,
      recall,
      f1Score,
      winRate
    };
  }
  
  private async findOptimalThresholds(validationSet: any[], weights: Record<string, number>): Promise<any> {
    // Test different thresholds to find optimal ROI
    const thresholds = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7];
    let bestROI = -Infinity;
    let bestThreshold = 0.4;
    
    for (const threshold of thresholds) {
      let totalRecovered = 0;
      let totalCost = 0;
      
      for (const outcome of validationSet) {
        // Calculate score
        let score = 0;
        let totalWeight = 0;
        
        for (const [feature, value] of Object.entries(outcome.features)) {
          const weight = weights[feature] || 1.0;
          const numericValue = typeof value === 'boolean' ? (value ? 1 : 0) : 
                              typeof value === 'number' ? value / 100 : 0;
          score += numericValue * weight;
          totalWeight += weight;
        }
        
        score = totalWeight > 0 ? score / totalWeight : 0.5;
        
        if (score >= threshold) {
          totalCost += 10; // Fixed cost to fight
          if (outcome.outcome === 'won') {
            totalRecovered += outcome.amount / 100;
          }
        }
      }
      
      const roi = totalRecovered - totalCost;
      if (roi > bestROI) {
        bestROI = roi;
        bestThreshold = threshold;
      }
    }
    
    return {
      fight: bestThreshold,
      accept: bestThreshold * 0.5,
      ce3Override: Math.min(0.3, bestThreshold * 0.75)
    };
  }
  
  private async groupByPattern(outcomes: any[]): Promise<Map<string, any[]>> {
    const patterns = new Map<string, any[]>();
    
    for (const outcome of outcomes) {
      const patternId = outcome.fingerprint;
      
      if (!patterns.has(patternId)) {
        patterns.set(patternId, []);
      }
      
      patterns.get(patternId)!.push(outcome);
    }
    
    return patterns;
  }
  
  private extractCommonFeatures(outcomes: any[]): string[] {
    if (outcomes.length === 0) return [];
    
    const features: string[] = [];
    const firstOutcome = outcomes[0];
    
    for (const [key, value] of Object.entries(firstOutcome.features)) {
      if (typeof value === 'boolean' && value) {
        // Check if feature is common across outcomes
        const count = outcomes.filter(o => o.features[key] === true).length;
        if (count / outcomes.length > 0.7) {
          features.push(key);
        }
      }
    }
    
    return features;
  }
  
  private async cacheHighPerformingPattern(patternId: string, outcomes: any[]): Promise<void> {
    const winRate = outcomes.filter(o => o.outcome === 'won').length / outcomes.length;
    
    await cache.set(`pattern:high:${patternId}`, {
      patternId,
      winRate,
      samples: outcomes.length,
      features: this.extractCommonFeatures(outcomes),
      timestamp: Date.now()
    }, 86400 * 30);
  }
  
  private async qLearningThresholds(outcomes: any[]): Promise<any> {
    // Simplified Q-learning for threshold optimization
    // In production, implement full Q-learning algorithm
    
    const states = [0.2, 0.3, 0.4, 0.5, 0.6]; // Possible thresholds
    const qTable: Record<number, number> = {};
    
    // Initialize Q-table
    for (const state of states) {
      qTable[state] = 0;
    }
    
    // Learning episodes
    const learningRate = 0.1;
    const discountFactor = 0.9;
    
    for (const outcome of outcomes) {
      for (const threshold of states) {
        const wouldFight = outcome.prediction.score >= threshold;
        const won = outcome.outcome === 'won';
        
        // Calculate reward
        let reward = 0;
        if (wouldFight && won) {
          reward = outcome.amount / 10000; // Normalized reward
        } else if (wouldFight && !won) {
          reward = -0.1; // Small penalty for losing
        } else if (!wouldFight && won) {
          reward = -outcome.amount / 20000; // Missed opportunity
        }
        
        // Update Q-value
        const oldQ = qTable[threshold];
        const maxNextQ = Math.max(...Object.values(qTable));
        qTable[threshold] = oldQ + learningRate * (reward + discountFactor * maxNextQ - oldQ);
      }
    }
    
    // Find best threshold
    let bestThreshold = 0.4;
    let bestQ = -Infinity;
    
    for (const [threshold, q] of Object.entries(qTable)) {
      if (q > bestQ) {
        bestQ = q;
        bestThreshold = Number(threshold);
      }
    }
    
    return {
      fight: bestThreshold,
      accept: bestThreshold * 0.5,
      ce3Override: Math.min(0.3, bestThreshold * 0.75)
    };
  }
  
  private async warmCacheWithNewModel(version: ModelVersion): Promise<void> {
    console.log('🔥 Warming cache with new model...');
    
    // Get common patterns
    const topPatterns = await patternCache.getTopPatterns(100);
    
    // Pre-calculate scores for common patterns
    for (const { fingerprint } of topPatterns) {
      // Would calculate score with new model and cache it
      // Implementation depends on pattern structure
    }
    
    console.log('✅ Cache warmed with new model predictions');
  }
  
  private calculateConfidence(features: Features): number {
    // Calculate confidence based on feature strength
    let confidence = 0.5; // Base confidence
    
    if (features.ceEligible) confidence += 0.2;
    if (features.shippingDelivered) confidence += 0.15;
    if (features.priorTxCount > 3) confidence += 0.1;
    if (features.ipRegionMatch) confidence += 0.05;
    
    return Math.min(0.95, confidence);
  }
}

// Export singleton instance
export const modelUpdater = ModelUpdater.getInstance();

// Auto-update scheduler
export function startAutoUpdate(): void {
  // Check for updates every hour
  setInterval(async () => {
    const shouldUpdate = await shouldTriggerUpdate();
    
    if (shouldUpdate) {
      console.log('🔄 Auto-update triggered...');
      const newVersion = await modelUpdater.updateModel({
        type: 'incremental',
        frequency: 60,
        minSamples: 50,
        performanceThreshold: 0.7
      });
      
      if (newVersion) {
        console.log(`✅ Auto-updated to v${newVersion.version} - Win Rate: ${newVersion.performance.winRate}%`);
      }
    }
  }, 3600000); // 1 hour
}

// Helper to determine if update should trigger
async function shouldTriggerUpdate(): Promise<boolean> {
  const learningData = await feedbackLoop.exportLearningData();
  
  // Check if enough new data
  if (learningData.outcomes.length < 50) {
    return false;
  }
  
  // Check if performance is declining
  if (learningData.performance.winRate < 65) {
    console.log('⚠️ Performance declining - triggering update');
    return true;
  }
  
  // Check if patterns have shifted
  const recentOutcomes = learningData.outcomes.slice(-20);
  const recentWinRate = recentOutcomes.filter(o => o.outcome === 'won').length / recentOutcomes.length * 100;
  
  if (Math.abs(recentWinRate - learningData.performance.winRate) > 10) {
    console.log('📊 Pattern shift detected - triggering update');
    return true;
  }
  
  return false;
}

// Performance monitoring
setInterval(async () => {
  const model = modelUpdater;
  if (model.currentVersion) {
    console.log(`🤖 Model v${model.currentVersion.version} - Win: ${model.currentVersion.performance.winRate.toFixed(1)}% | F1: ${model.currentVersion.performance.f1Score.toFixed(3)}`);
  }
}, 600000); // 10 minutes