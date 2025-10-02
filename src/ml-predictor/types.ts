import Stripe from 'stripe';

export interface PredictionRequest {
  disputeId: string;
  stripeAccountId?: string;
  includeFeatures?: boolean;
  includeRecommendations?: boolean;
}

export interface PredictionResponse {
  disputeId: string;
  prediction: DisputePrediction;
  features?: ExtractedFeatures;
  recommendations?: ActionRecommendations;
  metadata: PredictionMetadata;
}

export interface DisputePrediction {
  winProbability: number;
  confidence: number;
  outcome: 'WIN' | 'LOSE' | 'UNCERTAIN';
  expectedValue: number;
  riskScore: number;
}

export interface ExtractedFeatures {
  featureCount: number;
  topFeatures: FeatureImportance[];
  missingFeatures: string[];
  featureQuality: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface FeatureImportance {
  name: string;
  value: any;
  importance: number;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
}

export interface ActionRecommendations {
  primaryAction: RecommendedAction;
  alternativeActions: RecommendedAction[];
  evidenceNeeded: EvidenceRequirement[];
  estimatedTimeToComplete: number;
  urgencyLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface RecommendedAction {
  action: 'FIGHT' | 'ACCEPT' | 'NEGOTIATE' | 'GATHER_EVIDENCE' | 'ESCALATE';
  reason: string;
  expectedOutcome: string;
  effortRequired: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
  successProbability: number;
}

export interface EvidenceRequirement {
  type: string;
  description: string;
  importance: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  source: string;
  available: boolean;
}

export interface PredictionMetadata {
  modelVersion: string;
  modelAccuracy: number;
  predictionTimestamp: Date;
  processingTimeMs: number;
  dataCompleteness: number;
}

export interface ModelPerformance {
  modelId: string;
  version: string;
  trainingDate: Date;
  metrics: PerformanceMetrics;
  datasetInfo: DatasetInfo;
  featureImportance: FeatureRanking[];
}

export interface PerformanceMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  auc: number;
  matthewsCorrelation: number;
  logLoss: number;
}

export interface DatasetInfo {
  totalSamples: number;
  trainingSamples: number;
  testSamples: number;
  positiveClass: number;
  negativeClass: number;
  dateRange: {
    start: Date;
    end: Date;
  };
}

export interface FeatureRanking {
  feature: string;
  importance: number;
  gain: number;
  cover: number;
  frequency: number;
}

export interface BatchPredictionRequest {
  disputes: string[];
  stripeAccountId?: string;
  parallel?: boolean;
  includeMetrics?: boolean;
}

export interface BatchPredictionResponse {
  predictions: PredictionResponse[];
  summary: BatchSummary;
  errors: PredictionError[];
}

export interface BatchSummary {
  total: number;
  successful: number;
  failed: number;
  averageWinProbability: number;
  recommendedFights: number;
  recommendedAccepts: number;
  totalExpectedValue: number;
  processingTimeMs: number;
}

export interface PredictionError {
  disputeId: string;
  error: string;
  code: string;
  timestamp: Date;
}

export interface ModelUpdateRequest {
  disputes: string[];
  outcomes: DisputeOutcome[];
  updateType: 'INCREMENTAL' | 'FULL_RETRAIN';
  validateOnly?: boolean;
}

export interface DisputeOutcome {
  disputeId: string;
  outcome: 'WON' | 'LOST' | 'WITHDRAWN';
  actualEvidence?: string[];
  processingTime?: number;
  notes?: string;
}

export interface ModelUpdateResponse {
  success: boolean;
  previousMetrics: PerformanceMetrics;
  newMetrics: PerformanceMetrics;
  improvement: number;
  samplesProcessed: number;
  newVersion: string;
}

export interface CE3Integration {
  ce3Eligible: boolean;
  ce3Confidence: number;
  ce3Requirements: CE3Requirement[];
  ce3Evidence: CE3Evidence;
  autoSubmit: boolean;
}

export interface CE3Requirement {
  requirement: string;
  met: boolean;
  evidence: string;
  confidence: number;
}

export interface CE3Evidence {
  priorTransactions: string[];
  matchingElements: string[];
  verificationMethods: string[];
  submissionReady: boolean;
}

export interface DisputeContext {
  dispute: Stripe.Dispute;
  charge?: Stripe.Charge;
  paymentIntent?: Stripe.PaymentIntent;
  customer?: Stripe.Customer;
  merchantSettings?: MerchantSettings;
  historicalPerformance?: HistoricalPerformance;
}

export interface MerchantSettings {
  merchantId: string;
  autoFightThreshold: number;
  autoAcceptThreshold: number;
  maxDisputeAmount: number;
  priorityReasons: string[];
  excludedReasons: string[];
  notificationPreferences: NotificationPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  webhook: boolean;
  emailAddresses: string[];
  phoneNumbers: string[];
  webhookUrl: string;
}

export interface HistoricalPerformance {
  totalDisputes: number;
  wonDisputes: number;
  lostDisputes: number;
  winRate: number;
  averageRecovery: number;
  averageResponseTime: number;
  topWinReasons: string[];
  topLossReasons: string[];
}

export interface PredictionConfig {
  useCache: boolean;
  cacheTimeout: number;
  maxRetries: number;
  timeout: number;
  includeExplanation: boolean;
  confidenceThreshold: number;
  featureDepth: 'BASIC' | 'STANDARD' | 'COMPREHENSIVE';
}

export interface ModelDiagnostics {
  health: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  lastUpdate: Date;
  predictionCount24h: number;
  averageLatency: number;
  errorRate: number;
  driftDetected: boolean;
  retrainingNeeded: boolean;
  alerts: ModelAlert[];
}

export interface ModelAlert {
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  timestamp: Date;
  metric: string;
  value: number;
  threshold: number;
}