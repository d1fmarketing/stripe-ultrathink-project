import { z } from 'zod';
import { 
  SageMakerRuntimeClient, 
  InvokeEndpointCommand 
} from '@aws-sdk/client-sagemaker-runtime';

// Feature schema for type safety
export const FeatureSchema = z.object({
  caseId: z.string(),
  merchantId: z.string(),
  amount: z.number(),
  mcc: z.string().optional(),
  disputeReason: z.string().optional(),
  priorTxCount: z.number().int().nonnegative(),
  ceEligible: z.boolean(),
  customerTenureDays: z.number().nonnegative(),
  orderCount: z.number().nonnegative(),
  refundsLast90d: z.number().nonnegative(),
  ipRegionMatch: z.boolean().optional(),
  shippingDelivered: z.boolean().optional(),
  merchantWinRate: z.number().min(0).max(1).optional()
});

export type Features = z.infer<typeof FeatureSchema>;

export type Prediction = {
  score: number; // 0..1
  topFactors?: Record<string, number>;
  recommendation?: 'FIGHT' | 'ACCEPT' | 'REVIEW';
};

// Initialize SageMaker client
const sm = new SageMakerRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const endpoint = process.env.WIN_PREDICTOR_ENDPOINT_NAME;
const MIN_THRESHOLD = Number(process.env.MIN_WIN_THRESHOLD || '0.45');

/**
 * Score a dispute using ML model or heuristic fallback
 * Returns win probability between 0 and 1
 */
export async function score(feats: Features): Promise<Prediction> {
  try {
    const f = FeatureSchema.parse(feats);
    
    // If no SageMaker endpoint configured, use heuristic model
    if (!endpoint) {
      return heuristicScore(f);
    }
    
    // Call SageMaker endpoint
    const body = JSON.stringify([f]); // Model expects JSON array
    const res = await sm.send(new InvokeEndpointCommand({
      EndpointName: endpoint,
      Body: Buffer.from(body),
      ContentType: 'application/json',
      Accept: 'application/json'
    }));
    
    const parsed = JSON.parse(new TextDecoder().decode(res.Body as Uint8Array));
    const score = parsed[0]?.score ?? 0.5;
    
    return {
      score: Math.max(0, Math.min(1, score)),
      topFactors: parsed[0]?.factors,
      recommendation: getRecommendation(score)
    };
  } catch (error) {
    console.error('[winPredictor] Error scoring dispute:', error);
    // Fallback to heuristic
    return heuristicScore(feats);
  }
}

/**
 * Heuristic scoring when ML model unavailable
 * Based on key dispute indicators
 */
function heuristicScore(f: Features): Prediction {
  // Start with base score
  let score = 0.25;
  
  // CE3.0 eligibility is strongest signal
  if (f.ceEligible) {
    score += 0.35;
  }
  
  // Prior transactions indicate legitimate customer
  score += Math.min(f.priorTxCount, 5) * 0.04; // Max +0.20
  
  // Shipping delivered is strong evidence
  if (f.shippingDelivered) {
    score += 0.15;
  }
  
  // IP region match suggests legitimate transaction
  if (f.ipRegionMatch) {
    score += 0.08;
  }
  
  // Long customer tenure is positive
  if (f.customerTenureDays > 180) {
    score += 0.10;
  } else if (f.customerTenureDays > 30) {
    score += 0.05;
  }
  
  // Multiple orders indicate real customer
  if (f.orderCount > 5) {
    score += 0.08;
  } else if (f.orderCount > 1) {
    score += 0.04;
  }
  
  // Recent refunds are negative signal
  if (f.refundsLast90d > 2) {
    score -= 0.10;
  }
  
  // Adjust by merchant historical win rate
  if (f.merchantWinRate !== undefined) {
    score = score * 0.7 + f.merchantWinRate * 0.3;
  }
  
  // Adjust by dispute reason
  if (f.disputeReason === 'fraudulent') {
    score *= 0.9; // Slightly harder to win
  } else if (f.disputeReason === 'subscription_canceled') {
    score *= 1.1; // Easier with proof
  }
  
  // Clamp to valid range
  score = Math.max(0, Math.min(1, score));
  
  // Build top factors explanation
  const topFactors: Record<string, number> = {};
  if (f.ceEligible) topFactors.ce3_eligible = 0.35;
  if (f.shippingDelivered) topFactors.shipping_delivered = 0.15;
  if (f.priorTxCount > 0) topFactors.prior_transactions = Math.min(f.priorTxCount, 5) * 0.04;
  if (f.customerTenureDays > 30) topFactors.customer_tenure = f.customerTenureDays > 180 ? 0.10 : 0.05;
  
  return {
    score,
    topFactors,
    recommendation: getRecommendation(score)
  };
}

/**
 * Get recommendation based on score
 */
function getRecommendation(score: number): 'FIGHT' | 'ACCEPT' | 'REVIEW' {
  if (score >= 0.65) return 'FIGHT';
  if (score >= MIN_THRESHOLD) return 'REVIEW';
  return 'ACCEPT';
}

/**
 * Determine if dispute should be submitted based on prediction
 */
export function shouldSubmit(p: Prediction): boolean {
  return p.score >= MIN_THRESHOLD;
}

/**
 * Calculate expected value of fighting dispute
 */
export function expectedValue(amount: number, prediction: Prediction): number {
  // Expected value = (amount * win_probability) - cost_to_fight
  const costToFight = 15; // Approximate time/resource cost in USD
  return (amount * prediction.score) - costToFight;
}

/**
 * Batch score multiple disputes (for efficiency)
 */
export async function batchScore(features: Features[]): Promise<Prediction[]> {
  // For now, just map over individual scores
  // Could be optimized with batch SageMaker endpoint
  return Promise.all(features.map(f => score(f)));
}