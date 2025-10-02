import { ok, bad } from "../shared/responses.js";
import { requireAuth, verifyMerchantOwnership } from "../shared/auth.js";
import { createAuditLog, AuditAction } from "../shared/auditLog.js";
import Stripe from 'stripe';
import { stripeCircuitBreaker } from "../shared/circuitBreaker.js";
import { 
  predictWinRate, 
  shouldSubmit,
  expectedValue,
  isAIEnabled,
  type Features
} from '../ai';
import { CloudWatch, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { 
  getMerchantWinRate,
  getCustomerTransactionCount,
  getCustomerTenureDays,
  getCustomerOrderCount,
  getCustomerRefundsLast90Days,
  checkCE3Eligibility
} from "../shared/db-helpers.js";
import { CE3Detector } from "../ce3-engine/ce3Detector.js";
import { TimingOptimizer } from "../ai-features/timingOptimizer.js";

const stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion:'2025-07-30.basil' });
const cloudwatch = new CloudWatch({});

// Helper to publish metrics
async function publishMetric(name: string, value: number, unit: string = 'Count') {
  try {
    await cloudwatch.putMetricData({
      Namespace: 'StripeAutopilot/AI',
      MetricData: [{
        MetricName: name,
        Value: value,
        Unit: unit as StandardUnit,
        Timestamp: new Date()
      }]
    });
  } catch (error) {
    console.error('Failed to publish metric:', name, error);
  }
}

export async function handler(event:any){
  // REQUIRE AUTHENTICATION
  const authResult = await requireAuth(event);
  if ('statusCode' in authResult) {
    return authResult; // Return 401 if not authenticated
  }
  const authContext = authResult;
  
  const id = event.pathParameters?.id;
  const qs = event.queryStringParameters || {};
  const merchantId = qs.merchant || authContext.merchant_id;
  const forceSubmit = qs.force === 'true'; // Allow forcing immediate submission
  
  if(!merchantId || !id) return bad("missing merchant or id");
  
  // VERIFY USER OWNS THIS MERCHANT ACCOUNT
  const hasAccess = await verifyMerchantOwnership(authContext, merchantId);
  if (!hasAccess) {
    await createAuditLog({
      action: AuditAction.UNAUTHORIZED_ACCESS,
      userId: authContext.uid,
      userEmail: authContext.email,
      resourceType: 'dispute',
      resourceId: id,
      success: false,
      errorMessage: 'Attempted to submit evidence for unauthorized merchant'
    });
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'Access denied to this merchant account' })
    };
  }

  try {
    // Get dispute details with charge expanded
    const dispute = await stripeCircuitBreaker(
      'disputes.retrieve',
      () => stripe.disputes.retrieve(
        id,
        { expand: ['charge'] },
        { stripeAccount: merchantId }
      ),
      {
        failureThreshold: 4,
        cooldownPeriod: 120_000
      }
    );
    const charge = dispute.charge as Stripe.Charge;
    
    // Check if AI is enabled for win prediction
    const aiEnabled = process.env.AI_ENABLED === 'true' && isAIEnabled();
    let winPrediction = null;
    let shouldSkip = false;
    let features: Features | null = null;
    
    if (aiEnabled && !forceSubmit) {
      try {
        // Extract customer ID from charge
        const customerId = charge.customer as string || 'unknown';
        
        // Fetch REAL data from database - no more hardcoded values!
        const [
          priorTxCount,
          ce3Check,
          customerTenureDays,
          orderCount,
          refundsLast90d,
          merchantWinRate
        ] = await Promise.all([
          getCustomerTransactionCount(merchantId, customerId),
          checkCE3Eligibility(merchantId, customerId, charge.id),
          getCustomerTenureDays(merchantId, customerId),
          getCustomerOrderCount(merchantId, customerId),
          getCustomerRefundsLast90Days(merchantId, customerId),
          getMerchantWinRate(merchantId)
        ]);
        
        // Build features for win prediction with REAL data
        features = {
          caseId: dispute.id,
          merchantId: merchantId,
          amount: dispute.amount / 100, // Convert to dollars
          disputeReason: dispute.reason,
          priorTxCount, // REAL data from DB
          ceEligible: ce3Check.eligible, // REAL CE3 eligibility check
          customerTenureDays, // REAL customer tenure
          orderCount, // REAL order count
          refundsLast90d, // REAL refund count
          ipRegionMatch: undefined,
          shippingDelivered: undefined,
          merchantWinRate // REAL merchant win rate
        };
        
        // Get win prediction
        winPrediction = await predictWinRate(features);
        
        console.log('[AI] Win Prediction:', {
          disputeId: dispute.id,
          score: winPrediction.score,
          recommendation: winPrediction.recommendation,
          topFactors: winPrediction.topFactors
        });
        
        // Check if we should submit based on prediction
        shouldSkip = !shouldSubmit(winPrediction);
        
        // Calculate expected value
        const expValue = expectedValue(dispute.amount / 100, winPrediction);
        
        // Publish metrics
        await publishMetric('ai_scored', 1);
        await publishMetric('ai_win_score', winPrediction.score * 100, 'Percent');
        
        if (shouldSkip) {
          console.log(`[AI] Skipping dispute ${id} - low win probability: ${(winPrediction.score * 100).toFixed(1)}%`);
          await publishMetric('ai_skipped', 1);
          
          return ok({
            submitted: false,
            skippedByAI: true,
            winPrediction: {
              score: winPrediction.score,
              recommendation: winPrediction.recommendation,
              expectedValue: expValue,
              threshold: Number(process.env.MIN_WIN_THRESHOLD || '0.45'),
              message: `Dispute skipped due to low win probability (${(winPrediction.score * 100).toFixed(1)}%). Threshold: ${(Number(process.env.MIN_WIN_THRESHOLD || '0.45') * 100).toFixed(0)}%`
            },
            dispute
          });
        }
      } catch (error) {
        console.error('[AI] Win prediction failed:', error);
        await publishMetric('ai_error', 1);
        // Continue with submission if AI fails
      }
    }
    
    // Check for timing optimization with REAL AI module
    let timingRecommendation = null;
    let shouldDelay = false;
    
    if (process.env.OPENAI_API_KEY && !forceSubmit) {
      try {
        // Initialize timing optimizer with REAL implementation
        const timingOptimizer = new TimingOptimizer({
          openaiApiKey: process.env.OPENAI_API_KEY,
          model: 'gpt-5', // Using GPT-5 exclusive access
          temperature: Number(process.env.AI_TEMPERATURE || '0.7'),
          maxTokens: Number(process.env.AI_MAX_TOKENS || '500')
        });
        
        // Calculate optimal submission time
        const dueDate = new Date(dispute.evidence_details?.due_by ? dispute.evidence_details.due_by * 1000 : Date.now() + 7 * 24 * 60 * 60 * 1000);
        timingRecommendation = await timingOptimizer.findOptimalTime(
          new Date(),
          dueDate,
          dispute.amount,
          dispute.reason,
          'America/New_York'
        );
        
        // Check if we should delay submission
        shouldDelay = timingRecommendation.shouldDelay;
        
        if (shouldDelay) {
          console.log(`[AI] Timing optimization suggests delay for ${dispute.id}:`, timingRecommendation.reasoning);
          await publishMetric('timing_delayed', 1);
          
          return ok({
            submitted: false,
            delayedByTiming: true,
            timingRecommendation: {
              optimalTime: timingRecommendation.optimalTime,
              reasoning: timingRecommendation.reasoning,
              confidence: timingRecommendation.confidence
            },
            dispute
          });
        }
      } catch (error) {
        console.error('[AI] Timing optimization failed:', error);
        // Continue without timing optimization on error
      }
    }
    
    // Submit the dispute
    console.log(`[SUBMIT] Submitting dispute ${id} for merchant ${merchantId}`);
    const res = await stripeCircuitBreaker(
      'disputes.update',
      () => stripe.disputes.update(id, { submit: true }, { stripeAccount: merchantId }),
      {
        failureThreshold: 4,
        cooldownPeriod: 120_000
      }
    );
    
    // Audit successful submission
    await createAuditLog({
      action: AuditAction.EVIDENCE_SUBMITTED,
      userId: authContext.uid,
      userEmail: authContext.email,
      merchantId: merchantId,
      resourceType: 'dispute',
      resourceId: id,
      success: true,
      metadata: {
        amount: dispute.amount,
        reason: dispute.reason,
        aiPrediction: winPrediction,
        expectedValue: winPrediction ? expectedValue(dispute.amount / 100, winPrediction) : null,
        ce3Eligible: features?.ceEligible || false
      }
    });
    
    // Track AI submission
    if (aiEnabled && winPrediction) {
      await publishMetric('ai_submitted', 1);
    }
    
    // Store submission data
    const submissionData: any = {
      submitted: true,
      submittedAt: new Date().toISOString(),
      dispute: res
    };
    
    // Add AI prediction data if available
    if (winPrediction) {
      submissionData.aiPrediction = {
        score: winPrediction.score,
        recommendation: winPrediction.recommendation,
        topFactors: winPrediction.topFactors,
        expectedValue: expectedValue(dispute.amount / 100, winPrediction)
      };
    }
    
    return ok(submissionData);
    
  } catch (error: any) {
    console.error('Error submitting dispute:', error);
    return bad(`Failed to submit dispute: ${error.message}`);
  }
}
