import { EvidenceBundler } from '../ce3-engine/evidenceBundler';
import { 
  collectEvidence, 
  generateNarrative,
  isAIEnabled,
  type EvidenceBundle
} from '../ai';
import { CloudWatch, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { ddb } from "../shared/ddb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { withErrorHandling } from "../shared/errorHandling.js";

// ML Enhancement Imports (Safe - with fallbacks)
let patternCache: any = null;
let scoreCache: any = null;
let fraudTracker: any = null;

// Only import ML if feature flags are enabled
if (process.env.ENABLE_PATTERN_CACHE === 'true') {
  try {
    patternCache = require('../cache/patternCache').patternCache;
    console.log('✅ Pattern cache ML enabled');
  } catch (e) {
    console.log('Pattern cache not available, using standard flow');
  }
}

if (process.env.ENABLE_SCORE_CACHE === 'true') {
  try {
    scoreCache = require('../cache/scoreCache').scoreCache;
    console.log('✅ Score cache ML enabled');
  } catch (e) {
    console.log('Score cache not available, using standard flow');
  }
}

if (process.env.ENABLE_FRAUD_ML === 'true') {
  try {
    fraudTracker = require('../cache/fraudTracker').fraudTracker;
    console.log('✅ Fraud ML detection enabled');
  } catch (e) {
    console.log('Fraud ML not available, using standard flow');
  }
}

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

async function baseHandler(evt:any){
  const { dispute, charge, payment_intent, merchant } = evt;
  
  // Use merchant's OAuth token for connected accounts, fallback to global secret
  const stripeKey = merchant?.access_token || process.env.STRIPE_SECRET || '';
  if (!stripeKey) {
    console.error('No Stripe key available for merchant:', merchant?.id);
    throw new Error('Missing Stripe authentication for merchant');
  }
  
  // Initialize the evidence bundler with the correct key
  const bundler = new EvidenceBundler(stripeKey);
  
  // Track if AI is enabled
  const aiEnabled = process.env.AI_ENABLED === 'true' && isAIEnabled();
  
  // ML Pattern Cache Check (Safe - with fallback)
  let cachedWinProbability: number | null = null;
  let fraudDetected: boolean = false;
  
  if (patternCache && process.env.ENABLE_PATTERN_CACHE === 'true') {
    try {
      // Generate pattern key from dispute characteristics
      const patternKey = {
        amount: charge?.amount || 0,
        reason: dispute?.reason || 'unknown',
        mcc: merchant?.mcc || 'unknown',
        customerHistory: charge?.customer ? 'returning' : 'new',
        shipping: payment_intent?.shipping ? 'tracked' : 'none'
      };
      
      // Microsecond lookup for instant win probability
      const cachedPattern = await patternCache.lookup(patternKey);
      if (cachedPattern && cachedPattern.confidence > 0.8) {
        cachedWinProbability = cachedPattern.winRate;
        console.log(`⚡ ML Pattern Cache Hit: ${(cachedWinProbability * 100).toFixed(1)}% win probability (confidence: ${cachedPattern.confidence})`);
        await publishMetric('ml_pattern_cache_hit', 1);
        
        // Early exit if win probability too low
        if (cachedWinProbability < 0.20) {
          console.log('🛑 ML: Very low win probability, minimal evidence mode');
          await publishMetric('ml_early_exit_low_probability', 1);
        }
      }
    } catch (error) {
      console.log('Pattern cache lookup failed, continuing with standard flow:', error);
      await publishMetric('ml_pattern_cache_error', 1);
    }
  }
  
  // Fraud Detection Layer (Safe - with fallback)
  if (fraudTracker && process.env.ENABLE_FRAUD_ML === 'true') {
    try {
      const fraudSignals = {
        ip: charge?.metadata?.ip || '',
        email: charge?.billing_details?.email || '',
        cardFingerprint: charge?.payment_method_details?.card?.fingerprint || '',
        amount: charge?.amount || 0,
        merchantId: merchant?.id || 'unknown'
      };
      
      const fraudScore = await fraudTracker.analyze(fraudSignals);
      if (fraudScore > 0.85) {
        fraudDetected = true;
        console.log(`🚨 ML Fraud Detection: High fraud probability (${(fraudScore * 100).toFixed(1)}%)`);
        await publishMetric('ml_fraud_detected', 1);
      }
    } catch (error) {
      console.log('Fraud detection failed, continuing without fraud signals:', error);
      await publishMetric('ml_fraud_detection_error', 1);
    }
  }
  
  try {
    // Use the advanced evidence bundler for CE3.0 and reason-specific evidence
    const evidencePackage = await bundler.assembleEvidencePackage(
      dispute, 
      merchant?.id || 'default',
      merchant?.stripeAccountId
    );
    
    // ML Score Cache Integration (Safe - with fallback)
    let mlOptimizedEvidence: any = null;
    let adjustedWinProbability = evidencePackage?.winProbability;
    
    if (scoreCache && process.env.ENABLE_SCORE_CACHE === 'true') {
      try {
        // Use cached win probability or calculate new one
        const winProbability = cachedWinProbability || evidencePackage?.winProbability || 0.5;
        
        // Optimize evidence based on win probability
        if (winProbability > 0.75) {
          console.log(`🚀 ML: High win probability (${(winProbability * 100).toFixed(1)}%), using aggressive evidence strategy`);
          mlOptimizedEvidence = {
            strategy: 'aggressive',
            emphasizeCE3: true,
            includeAll: true,
            narrativeTone: 'assertive'
          };
          await publishMetric('ml_strategy_aggressive', 1);
        } else if (winProbability > 0.45) {
          console.log(`⚡ ML: Medium win probability (${(winProbability * 100).toFixed(1)}%), using balanced evidence strategy`);
          mlOptimizedEvidence = {
            strategy: 'balanced',
            emphasizeCE3: evidencePackage.ce3Eligible,
            includeAll: false,
            narrativeTone: 'professional'
          };
          await publishMetric('ml_strategy_balanced', 1);
        } else {
          console.log(`⚠️ ML: Low win probability (${(winProbability * 100).toFixed(1)}%), using defensive evidence strategy`);
          mlOptimizedEvidence = {
            strategy: 'defensive',
            emphasizeCE3: false,
            includeAll: false,
            narrativeTone: 'empathetic'
          };
          await publishMetric('ml_strategy_defensive', 1);
        }
        
        // Update win probability with ML adjustment
        if (cachedWinProbability) {
          adjustedWinProbability = cachedWinProbability;
          evidencePackage.winProbability = adjustedWinProbability;
        }
        
        // Store optimized score in cache for future reference
        await scoreCache.store(dispute.id, {
          winProbability: adjustedWinProbability,
          strategy: mlOptimizedEvidence.strategy,
          fraudDetected,
          timestamp: Date.now()
        });
        
      } catch (error) {
        console.log('Score cache optimization failed, using standard strategy:', error);
        await publishMetric('ml_score_cache_error', 1);
      }
    }
    
    // Apply ML optimizations if available
    if (mlOptimizedEvidence && fraudDetected) {
      console.log('🚨 ML: Fraud detected, adding extra verification evidence');
      (evidencePackage as any).fraudWarning = true;
    }
    
    // Extract the evidence object for Stripe submission
    let evidence = evidencePackage.evidence;
    
    // Add any additional fields from the basic implementation if missing
    if (!evidence.customer_name && (charge?.billing_details?.name || payment_intent?.shipping?.name)) {
      evidence.customer_name = charge?.billing_details?.name || payment_intent?.shipping?.name || '';
    }
    if (!evidence.customer_email_address && charge?.billing_details?.email) {
      evidence.customer_email_address = charge?.billing_details?.email || '';
    }
    if (!evidence.receipt && charge?.receipt_url) {
      evidence.receipt = charge?.receipt_url || '';
    }
    
    // Collect smart evidence and generate narrative with AI if enabled
    let aiBundle: EvidenceBundle | null = null;
    let aiNarrative: string | undefined = undefined;
    
    if (aiEnabled) {
      try {
        // Build comprehensive evidence bundle
        aiBundle = await collectEvidence({
          disputeId: dispute.id,
          merchantId: merchant?.id || merchant?.stripeAccountId || 'default',
          options: {
            includeShipping: true,
            includeCommunications: true,
            includeUsageSignals: true,
            maxPriorTransactions: 10,
            lookbackDays: 365
          }
        });
        
        // Generate compelling narrative with ML-optimized tone
        const narrativeTone = mlOptimizedEvidence?.narrativeTone || 'professional';
        aiNarrative = await generateNarrative(aiBundle, {
          tone: narrativeTone as any, // Use ML-optimized tone
          maxWords: 220,
          includeTimeline: true,
          emphasizeCE3: mlOptimizedEvidence?.emphasizeCE3 !== false ? evidencePackage.ce3Eligible : false
        });
        
        if (aiNarrative) {
          // Add narrative to evidence
          evidence.customer_communication = aiNarrative;
          evidencePackage.narrative = aiNarrative;
          
          // Track metrics
          const wordCount = aiNarrative.split(/\s+/).length;
          console.log('[AI] Narrative generated:', wordCount, 'words');
          await publishMetric('ai_narrative_generated', 1);
          await publishMetric('ai_narrative_words', wordCount, 'None');
        }
        
        // Merge AI-collected evidence with CE3 evidence
        if (aiBundle) {
          // Add any shipping evidence
          if (aiBundle.shipping?.tracking) {
            evidence.shipping_tracking_number = aiBundle.shipping.tracking;
          }
          if (aiBundle.shipping?.carrier) {
            evidence.shipping_carrier = aiBundle.shipping.carrier;
          }
          if (aiBundle.shipping?.delivered) {
            evidence.shipping_documentation = 'Delivery confirmed';
          }
          
          // Add CE3 candidates info if found
          if (aiBundle.ceCandidates.length > 0) {
            const ceInfo = aiBundle.ceCandidates
              .slice(0, 3)
              .map(c => `Prior transaction ${c.chargeId.slice(-8)} with ${c.signalOverlap.join(', ')}`)
              .join('; ');
            evidence.duplicate_charge_explanation = evidence.duplicate_charge_explanation || ceInfo;
          }
          
          console.log('[AI] Evidence bundle collected:', {
            ceCandidates: aiBundle.ceCandidates.length,
            hasShipping: !!aiBundle.shipping,
            hasCommunications: !!aiBundle.communications,
            hasUsageSignals: !!aiBundle.usageSignals
          });
          
          await publishMetric('ai_evidence_collected', 1);
        }
      } catch (error) {
        console.error('[AI] Evidence collection/narrative generation failed:', error);
        await publishMetric('ai_error', 1);
      }
    }
    
    // Store ML prediction for later learning (when dispute resolves)
    if (process.env.CASES_TABLE && merchant?.stripe_account_id && dispute?.id) {
      try {
        await ddb.send(new PutCommand({
          TableName: process.env.CASES_TABLE,
          Item: {
            pk: `MERCHANT#${merchant.stripe_account_id}`,
            sk: `ML_PREDICTION#${dispute.id}`,
            disputeId: dispute.id,
            mlPrediction: {
              probability: evidencePackage.winProbability,
              ce3Eligible: evidencePackage.ce3Eligible,
              features: (evidencePackage as any).features || {},
              timestamp: Date.now(),
              modelVersion: 'heuristic-v1'
            },
            ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
          }
        }));
        console.log(`📊 ML: Stored prediction for dispute ${dispute.id}: ${(evidencePackage.winProbability * 100).toFixed(1)}%`);
      } catch (error) {
        console.error('Failed to store ML prediction:', error);
      }
    }
    
    // Return enhanced event with evidence package
    return { 
      ...evt, 
      evidence,
      evidencePackage, // Include full package for logging/debugging
      ce3Eligible: evidencePackage.ce3Eligible,
      winProbability: evidencePackage.winProbability,
      aiNarrative, // Include AI narrative if generated
      aiBundle, // Include full AI bundle for debugging
      aiEnhanced: aiEnabled && (!!aiNarrative || !!aiBundle), // Flag to indicate AI enhancement
      mlEnhanced: !!(cachedWinProbability || mlOptimizedEvidence || fraudDetected), // Flag for ML enhancement
      mlMetrics: {
        cachedProbability: cachedWinProbability,
        fraudDetected,
        strategy: mlOptimizedEvidence?.strategy || 'standard',
        patternCacheHit: !!cachedWinProbability,
        adjustedWinProbability: adjustedWinProbability || evidencePackage.winProbability
      }
    };
    
  } catch (error) {
    console.error('Error in advanced evidence bundler, falling back to basic:', error);
    
    // Fallback to basic evidence if advanced bundler fails
    const customer_name = charge?.billing_details?.name || payment_intent?.shipping?.name || '';
    const customer_email = charge?.billing_details?.email || '';
    const shipping = payment_intent?.shipping
      ? `${payment_intent.shipping.address?.line1 || ''} ${payment_intent.shipping.address?.city || ''} ${payment_intent.shipping.address?.postal_code || ''} ${payment_intent.shipping.address?.country || ''}`.trim()
      : '';

    const evidence:any = {
      product_description: charge?.description || 'Goods/Services as described on receipt',
      customer_name,
      customer_email_address: customer_email,
      shipping_address: shipping,
      customer_purchase_ip: '',
      receipt: charge?.receipt_url || '',
      uncategorized_text: `Charge ${charge?.id} on ${new Date((charge?.created||0)*1000).toISOString()} for ${(charge?.amount||0)/100} ${charge?.currency || ''}.`
    };

    return { ...evt, evidence };
  }
}

export const handler = withErrorHandling('buildEvidence', baseHandler);
