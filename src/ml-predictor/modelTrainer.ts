import Stripe from 'stripe';
import { FeatureExtractor } from './featureExtractor';
import { WinPredictor } from './winPredictor';

export interface TrainingData {
  disputeId: string;
  features: Record<string, any>;
  outcome: 'won' | 'lost' | 'warning_closed';
  confidence: number;
}

export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  auc: number;
  confusionMatrix: {
    truePositive: number;
    trueNegative: number;
    falsePositive: number;
    falseNegative: number;
  };
}

export interface TrainingConfig {
  testSplitRatio: number;
  minSampleSize: number;
  maxIterations: number;
  learningRate: number;
  regularization: number;
  crossValidationFolds: number;
}

export class ModelTrainer {
  private stripe: Stripe;
  private featureExtractor: FeatureExtractor;
  private predictor: WinPredictor;
  private trainingData: TrainingData[];
  private config: TrainingConfig;
  
  constructor(stripeSecretKey: string) {
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-07-30.basil',
    });
    
    this.featureExtractor = new FeatureExtractor(stripeSecretKey);
    this.predictor = new WinPredictor(stripeSecretKey);
    this.trainingData = [];
    
    this.config = {
      testSplitRatio: 0.2,
      minSampleSize: 100,
      maxIterations: 1000,
      learningRate: 0.01,
      regularization: 0.1,
      crossValidationFolds: 5
    };
  }
  
  async collectHistoricalData(limit: number = 1000): Promise<TrainingData[]> {
    console.log(`Collecting historical dispute data (limit: ${limit})...`);
    
    const trainingData: TrainingData[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;
    
    while (hasMore && trainingData.length < limit) {
      try {
        const disputes = await this.stripe.disputes.list({
          limit: 100,
          starting_after: startingAfter
        });
        
        for (const dispute of disputes.data) {
          if (['won', 'lost', 'warning_closed'].includes(dispute.status)) {
            const features = await this.featureExtractor.extractAllFeatures(dispute);
            const flatFeatures = this.featureExtractor.flattenFeatures(features);
            
            trainingData.push({
              disputeId: dispute.id,
              features: flatFeatures,
              outcome: dispute.status as 'won' | 'lost' | 'warning_closed',
              confidence: this.calculateConfidenceFromOutcome(dispute)
            });
            
            if (trainingData.length >= limit) break;
          }
        }
        
        hasMore = disputes.has_more;
        if (disputes.data.length > 0) {
          startingAfter = disputes.data[disputes.data.length - 1].id;
        }
        
      } catch (error) {
        console.error('Error collecting historical data:', error);
        break;
      }
    }
    
    console.log(`Collected ${trainingData.length} historical disputes for training`);
    this.trainingData = trainingData;
    return trainingData;
  }
  
  private calculateConfidenceFromOutcome(dispute: Stripe.Dispute): number {
    if (dispute.status === 'won') {
      if (dispute.evidence_details?.submission_count === 0) {
        return 0.95;
      } else if (dispute.evidence_details?.submission_count === 1) {
        return 0.85;
      } else {
        return 0.75;
      }
    } else if (dispute.status === 'lost') {
      if (dispute.reason === 'fraudulent') {
        return 0.2;
      } else {
        return 0.3;
      }
    } else {
      return 0.5;
    }
  }
  
  splitData(data: TrainingData[]): { train: TrainingData[], test: TrainingData[] } {
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    const splitIndex = Math.floor(shuffled.length * (1 - this.config.testSplitRatio));
    
    return {
      train: shuffled.slice(0, splitIndex),
      test: shuffled.slice(splitIndex)
    };
  }
  
  private normalizeFeatures(features: Record<string, any>): Record<string, number> {
    const normalized: Record<string, number> = {};
    
    Object.entries(features).forEach(([key, value]) => {
      if (typeof value === 'boolean') {
        normalized[key] = value ? 1 : 0;
      } else if (typeof value === 'number') {
        normalized[key] = value;
      } else if (typeof value === 'string') {
        normalized[`${key}_encoded`] = this.encodeString(value);
      } else if (value === null || value === undefined) {
        normalized[key] = 0;
      }
    });
    
    return normalized;
  }
  
  private encodeString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) % 1000;
  }
  
  async trainModel(data?: TrainingData[]): Promise<ModelMetrics> {
    const trainingData = data || this.trainingData;
    
    if (trainingData.length < this.config.minSampleSize) {
      throw new Error(`Insufficient training data. Need at least ${this.config.minSampleSize} samples, got ${trainingData.length}`);
    }
    
    console.log(`Training model with ${trainingData.length} samples...`);
    
    const { train, test } = this.splitData(trainingData);
    
    const weights = this.initializeWeights(train[0].features);
    
    for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
      let totalLoss = 0;
      
      for (const sample of train) {
        const normalizedFeatures = this.normalizeFeatures(sample.features);
        const prediction = this.predict(normalizedFeatures, weights);
        const target = sample.outcome === 'won' ? 1 : 0;
        const loss = this.calculateLoss(prediction, target);
        totalLoss += loss;
        
        this.updateWeights(weights, normalizedFeatures, prediction, target);
      }
      
      if (iteration % 100 === 0) {
        console.log(`Iteration ${iteration}: Average loss = ${totalLoss / train.length}`);
      }
      
      if (totalLoss / train.length < 0.01) {
        console.log(`Converged at iteration ${iteration}`);
        break;
      }
    }
    
    const metrics = this.evaluateModel(test, weights);
    
    console.log('Model training complete!');
    console.log(`Accuracy: ${(metrics.accuracy * 100).toFixed(2)}%`);
    console.log(`Precision: ${(metrics.precision * 100).toFixed(2)}%`);
    console.log(`Recall: ${(metrics.recall * 100).toFixed(2)}%`);
    console.log(`F1 Score: ${(metrics.f1Score * 100).toFixed(2)}%`);
    
    return metrics;
  }
  
  private initializeWeights(sampleFeatures: Record<string, any>): Map<string, number> {
    const weights = new Map<string, number>();
    const normalized = this.normalizeFeatures(sampleFeatures);
    
    Object.keys(normalized).forEach(key => {
      weights.set(key, (Math.random() - 0.5) * 0.1);
    });
    
    return weights;
  }
  
  private predict(features: Record<string, number>, weights: Map<string, number>): number {
    let sum = 0;
    
    Object.entries(features).forEach(([key, value]) => {
      const weight = weights.get(key) || 0;
      sum += value * weight;
    });
    
    return 1 / (1 + Math.exp(-sum));
  }
  
  private calculateLoss(prediction: number, target: number): number {
    const epsilon = 1e-7;
    return -target * Math.log(prediction + epsilon) - (1 - target) * Math.log(1 - prediction + epsilon);
  }
  
  private updateWeights(
    weights: Map<string, number>,
    features: Record<string, number>,
    prediction: number,
    target: number
  ): void {
    const error = prediction - target;
    
    Object.entries(features).forEach(([key, value]) => {
      const currentWeight = weights.get(key) || 0;
      const gradient = error * value;
      const regularization = this.config.regularization * currentWeight;
      const newWeight = currentWeight - this.config.learningRate * (gradient + regularization);
      weights.set(key, newWeight);
    });
  }
  
  private evaluateModel(testData: TrainingData[], weights: Map<string, number>): ModelMetrics {
    let truePositive = 0;
    let trueNegative = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    
    for (const sample of testData) {
      const normalizedFeatures = this.normalizeFeatures(sample.features);
      const prediction = this.predict(normalizedFeatures, weights);
      const predicted = prediction > 0.5 ? 1 : 0;
      const actual = sample.outcome === 'won' ? 1 : 0;
      
      if (predicted === 1 && actual === 1) truePositive++;
      else if (predicted === 0 && actual === 0) trueNegative++;
      else if (predicted === 1 && actual === 0) falsePositive++;
      else if (predicted === 0 && actual === 1) falseNegative++;
    }
    
    const accuracy = (truePositive + trueNegative) / testData.length;
    const precision = truePositive / (truePositive + falsePositive || 1);
    const recall = truePositive / (truePositive + falseNegative || 1);
    const f1Score = 2 * (precision * recall) / (precision + recall || 1);
    
    const auc = this.calculateAUC(testData, weights);
    
    return {
      accuracy,
      precision,
      recall,
      f1Score,
      auc,
      confusionMatrix: {
        truePositive,
        trueNegative,
        falsePositive,
        falseNegative
      }
    };
  }
  
  private calculateAUC(testData: TrainingData[], weights: Map<string, number>): number {
    const predictions = testData.map(sample => {
      const normalizedFeatures = this.normalizeFeatures(sample.features);
      return {
        score: this.predict(normalizedFeatures, weights),
        label: sample.outcome === 'won' ? 1 : 0
      };
    });
    
    predictions.sort((a, b) => b.score - a.score);
    
    let auc = 0;
    let tpr = 0;
    let fpr = 0;
    const positives = predictions.filter(p => p.label === 1).length;
    const negatives = predictions.filter(p => p.label === 0).length;
    
    for (const pred of predictions) {
      if (pred.label === 1) {
        tpr += 1 / positives;
      } else {
        auc += tpr / negatives;
        fpr += 1 / negatives;
      }
    }
    
    return auc;
  }
  
  async crossValidate(data?: TrainingData[]): Promise<ModelMetrics[]> {
    const trainingData = data || this.trainingData;
    const folds = this.config.crossValidationFolds;
    const foldSize = Math.floor(trainingData.length / folds);
    const metrics: ModelMetrics[] = [];
    
    console.log(`Running ${folds}-fold cross-validation...`);
    
    for (let i = 0; i < folds; i++) {
      const testStart = i * foldSize;
      const testEnd = (i + 1) * foldSize;
      
      const testFold = trainingData.slice(testStart, testEnd);
      const trainFold = [
        ...trainingData.slice(0, testStart),
        ...trainingData.slice(testEnd)
      ];
      
      console.log(`Fold ${i + 1}/${folds}: Training with ${trainFold.length} samples, testing with ${testFold.length} samples`);
      
      const weights = this.initializeWeights(trainFold[0].features);
      
      for (let iteration = 0; iteration < this.config.maxIterations / 10; iteration++) {
        for (const sample of trainFold) {
          const normalizedFeatures = this.normalizeFeatures(sample.features);
          const prediction = this.predict(normalizedFeatures, weights);
          const target = sample.outcome === 'won' ? 1 : 0;
          this.updateWeights(weights, normalizedFeatures, prediction, target);
        }
      }
      
      const foldMetrics = this.evaluateModel(testFold, weights);
      metrics.push(foldMetrics);
    }
    
    const avgMetrics = this.averageMetrics(metrics);
    console.log(`Cross-validation complete. Average accuracy: ${(avgMetrics.accuracy * 100).toFixed(2)}%`);
    
    return metrics;
  }
  
  private averageMetrics(metrics: ModelMetrics[]): ModelMetrics {
    const sum = metrics.reduce((acc, m) => ({
      accuracy: acc.accuracy + m.accuracy,
      precision: acc.precision + m.precision,
      recall: acc.recall + m.recall,
      f1Score: acc.f1Score + m.f1Score,
      auc: acc.auc + m.auc,
      confusionMatrix: {
        truePositive: acc.confusionMatrix.truePositive + m.confusionMatrix.truePositive,
        trueNegative: acc.confusionMatrix.trueNegative + m.confusionMatrix.trueNegative,
        falsePositive: acc.confusionMatrix.falsePositive + m.confusionMatrix.falsePositive,
        falseNegative: acc.confusionMatrix.falseNegative + m.confusionMatrix.falseNegative
      }
    }), {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      auc: 0,
      confusionMatrix: {
        truePositive: 0,
        trueNegative: 0,
        falsePositive: 0,
        falseNegative: 0
      }
    });
    
    const n = metrics.length;
    return {
      accuracy: sum.accuracy / n,
      precision: sum.precision / n,
      recall: sum.recall / n,
      f1Score: sum.f1Score / n,
      auc: sum.auc / n,
      confusionMatrix: {
        truePositive: Math.round(sum.confusionMatrix.truePositive / n),
        trueNegative: Math.round(sum.confusionMatrix.trueNegative / n),
        falsePositive: Math.round(sum.confusionMatrix.falsePositive / n),
        falseNegative: Math.round(sum.confusionMatrix.falseNegative / n)
      }
    };
  }
  
  exportModel(): string {
    console.log('Model export functionality would save weights to S3/database');
    return 'model_v1_' + Date.now() + '.json';
  }
  
  importModel(modelPath: string): boolean {
    console.log(`Model import functionality would load weights from ${modelPath}`);
    return true;
  }
}