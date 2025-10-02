/**
 * AI Features Module Exports
 * ULTRATHINK: Complete AI Enhancement Suite
 */

import { NarrativeWriter } from './narrativeWriter';
import { DisputeAnalyzer } from './disputeAnalyzer';
import { EvidenceEnhancer } from './evidenceEnhancer';
import { FraudDetector } from './fraudDetector';
import { TimingOptimizer } from './timingOptimizer';

export { NarrativeWriter } from './narrativeWriter';
export { DisputeAnalyzer } from './disputeAnalyzer';
export { EvidenceEnhancer } from './evidenceEnhancer';
export { FraudDetector } from './fraudDetector';
export { TimingOptimizer } from './timingOptimizer';

export type {
  AIConfig,
  NarrativeInput,
  NarrativeOutput,
  DisputeAnalysis,
  EvidenceEnhancement,
  FraudPattern,
  TimingRecommendation,
  CustomerHistory,
  MerchantInfo,
  AIError,
  AIMetrics
} from './types';

// Import types for the factory function
import type { AIConfig } from './types';

// Factory function to create all AI features with config
export function createAIFeatures(config: AIConfig) {
  return {
    narrativeWriter: new NarrativeWriter(config),
    disputeAnalyzer: new DisputeAnalyzer(config),
    evidenceEnhancer: new EvidenceEnhancer(config),
    fraudDetector: new FraudDetector(config),
    timingOptimizer: new TimingOptimizer(config)
  };
}