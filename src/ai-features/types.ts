/**
 * TypeScript interfaces for AI Features
 * ULTRATHINK: AI-Enhanced Dispute Processing
 */

import type Stripe from 'stripe';

export interface AIConfig {
  openaiApiKey: string;
  pineconeApiKey?: string;
  pineconeEnvironment?: string;
  maxTokens?: number;
  temperature?: number;
  model?: 'gpt-5';  // GPT-5 EXCLUSIVE ACCESS!
}

export interface NarrativeInput {
  dispute: Stripe.Dispute;
  charge: Stripe.Charge;
  evidence: any;
  customerHistory?: CustomerHistory;
  merchantInfo?: MerchantInfo;
}

export interface NarrativeOutput {
  narrative: string;
  emotionalTone: 'empathetic' | 'professional' | 'assertive' | 'defensive';
  keyPoints: string[];
  confidence: number;
  disclaimer: string;
}

export interface DisputeAnalysis {
  disputeId: string;
  weaknesses: string[];
  counterArguments: string[];
  recommendedEvidence: string[];
  winProbability: number;
  riskFactors: string[];
  strategy: 'aggressive' | 'defensive' | 'balanced';
  aiConfidence: number;
  reasoning?: string;
  recommendedAction?: 'FIGHT' | 'ACCEPT' | 'NEGOTIATE';
  serialFraudster?: boolean;
}

export interface EvidenceEnhancement {
  originalEvidence: any;
  enhancedEvidence: any;
  additions: {
    field: string;
    value: string;
    type: 'ai_generated' | 'ai_enhanced' | 'ai_suggested';
  }[];
  summary: string;
}

export interface FraudPattern {
  customerId: string;
  email: string;
  patterns: {
    type: string;
    confidence: number;
    description: string;
  }[];
  riskScore: number;
  similarDisputes: string[];
  recommendation: 'block' | 'watch' | 'allow';
}

export interface TimingRecommendation {
  currentTime: Date;
  optimalTime: Date;
  reason: string;
  delayMinutes: number;
  confidence: number;
  factors: {
    timezone: string;
    businessHours: boolean;
    reviewerAvailability: number;
  };
}

export interface CustomerHistory {
  totalOrders: number;
  totalSpent: number;
  disputeHistory: number;
  accountAge: number;
  isRepeatCustomer: boolean;
}

export interface MerchantInfo {
  name: string;
  industry: string;
  disputeRate: number;
  winRate: number;
  totalVolume: number;
}

export interface AIError {
  code: 'AI_API_ERROR' | 'AI_RATE_LIMIT' | 'AI_INVALID_RESPONSE' | 'AI_CONFIG_ERROR';
  message: string;
  fallback?: any;
}

export interface AIMetrics {
  processingTime: number;
  tokensUsed: number;
  cost: number;
  model: string;
  success: boolean;
}