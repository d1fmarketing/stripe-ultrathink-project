import Stripe from 'stripe';
import { StartExecutionCommand, SFNClient } from "@aws-sdk/client-sfn";
import { upsertCase } from "../shared/db.js";
import { getMerchantWinRate } from "../shared/db-helpers.js";
import { handleSubscriptionEvent } from "./subscriptionManager.js";
import { WebhookIdempotencyService } from "../shared/webhookIdempotency.js";
import { getMerchantWebhookSecret, validateWebhookSignature } from "../shared/webhookSecrets.js";
import { setCorrelationContext, withRequestLogging } from "../shared/logger.js";
import { 
  analyzeDispute, 
  quickAssessRisk,
  isAIEnabled,
  type DisputeAnalysis 
} from '../ai';
import { CloudWatch, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { ddb } from "../shared/ddb.js";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { FeatureExtractor } from '../ml-predictor/featureExtractor';
import { FeedbackLoop } from '../ml/feedbackLoop';

// ML Enhancement Imports (Safe - with fallbacks)
let patternCache: any = null;
let scoreCache: any = null;
let modelUpdater: any = null;

// Only import ML if feature flags are enabled
if (process.env.ENABLE_PATTERN_CACHE === 'true') {
  try {
    patternCache = require('../cache/patternCache').patternCache;
    console.log('✅ Webhook: Pattern cache ML enabled');
  } catch (e) {
    console.log('Webhook: Pattern cache not available');
  }
}

if (process.env.ENABLE_SCORE_CACHE === 'true') {
  try {
    scoreCache = require('../cache/scoreCache').scoreCache;
    console.log('✅ Webhook: Score cache ML enabled');
  } catch (e) {
    console.log('Webhook: Score cache not available');
  }
}

if (process.env.ENABLE_MODEL_UPDATER === 'true') {
  try {
    modelUpdater = require('../ml/modelUpdater').modelUpdater;
    console.log('✅ Webhook: Model updater ML enabled');
  } catch (e) {
    console.log('Webhook: Model updater not available');
  }
}

const stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion: '2025-07-30.basil' });
const sfn = new SFNClient({});
const cloudwatch = new CloudWatch({});
const WEBHOOK_EVENTS_TABLE = process.env.CASES_TABLE!; // Reuse cases table for webhook events

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

// Check if we've already processed this webhook event
async function isEventProcessed(eventId: string): Promise<boolean> {
  try {
    const result = await ddb.send(new GetCommand({
      TableName: WEBHOOK_EVENTS_TABLE,
      Key: {
        pk: `WEBHOOK#${eventId}`,
        sk: `EVENT#${eventId}`
      }
    }));
    return !!result.Item;
  } catch (error) {
    console.error('Error checking event idempotency:', error);
    return false;
  }
}

// Mark an event as processed
async function markEventProcessed(eventId: string, eventType: string): Promise<void> {
  try {
    await ddb.send(new PutCommand({
      TableName: WEBHOOK_EVENTS_TABLE,
      Item: {
        pk: `WEBHOOK#${eventId}`,
        sk: `EVENT#${eventId}`,
        event_id: eventId,
        event_type: eventType,
        processed_at: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // TTL: 7 days
      }
    }));
  } catch (error) {
    console.error('Error marking event as processed:', error);
  }
}

export const handler = withRequestLogging(async (event:any) => {
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  const rawBody = event.body;
  const account = (event.headers['stripe-account'] || event.headers['Stripe-Account']) as string | undefined;
  
  // Get the webhook secret from environment variable
  // For production, use different secrets for account vs platform webhooks
  const webhookSecret = account 
    ? process.env.STRIPE_CONNECT_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test'
    : process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test';
  
  if (!webhookSecret || webhookSecret === 'whsec_test') {
    console.warn('Using test webhook secret - configure STRIPE_WEBHOOK_SECRET for production');
  }
  
  let evt: Stripe.Event;
  try{
    evt = stripe.webhooks.constructEvent(rawBody, sig!, webhookSecret);
    setCorrelationContext({ eventId: evt.id, merchantId: account || (evt as any).account });
  }catch(e:any){
    console.error(`Webhook signature verification failed for account ${account}:`, e.message);
    return { statusCode:400, body:`bad sig: ${e.message}` };
  }

  // Check idempotency - prevent duplicate processing
  if (await WebhookIdempotencyService.isDuplicate(evt.id)) {
    console.log(`Event ${evt.id} already processed, skipping`);
    return { statusCode: 200, body: 'duplicate event ignored' };
  }

  // Extract account from event if not in headers
  const eventAccount = account || (evt as any).account;

  // Handle checkout session completed (for subscriptions)
  if(evt.type === 'checkout.session.completed'){
    const session = evt.data.object as Stripe.Checkout.Session;
    
    // Link subscription to user
    if(session.client_reference_id && session.subscription){
      try {
        // Update user's subscription status in DynamoDB
        await upsertCase('SYSTEM', {
          id: `SUB#${session.client_reference_id}`,
          subscription_id: session.subscription,
          customer_id: session.customer,
          status: 'active',
          trial_end: (session as any).trial_end || null,
          metadata: session.metadata
        }, {
          type: 'subscription',
          firebase_uid: session.metadata?.firebase_uid || session.client_reference_id,
          updated_at: new Date().toISOString()
        });
        
        console.log('Subscription linked to user:', session.client_reference_id);
      } catch (error) {
        console.error('Failed to link subscription:', error);
      }
    }
    
    await WebhookIdempotencyService.markProcessed(evt.id, { type: evt.type });
    return { statusCode: 200, body: 'subscription processed' };
  }
  
  // Handle subscription updates with complete state management
  if(evt.type.startsWith('customer.subscription.')){
    const subscription = evt.data.object as Stripe.Subscription;
    
    try {
      const firebase_uid = subscription.metadata?.firebase_uid;
      const customer_email = subscription.metadata?.email;
      
      if(!firebase_uid){
        console.warn('Subscription event without firebase_uid:', subscription.id);
        await WebhookIdempotencyService.markProcessed(evt.id, { type: evt.type });
        return { statusCode: 200, body: 'subscription ignored - no user link' };
      }
      
      // Determine the action based on event type
      let action = 'updated';
      let userAccess = 'active';
      
      switch(evt.type) {
        case 'customer.subscription.created':
          action = 'created';
          userAccess = subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : 'pending';
          break;
          
        case 'customer.subscription.updated':
          // Check for important status transitions
          if(subscription.status === 'canceled' || subscription.status === 'unpaid') {
            userAccess = 'suspended';
          } else if(subscription.status === 'active' || subscription.status === 'trialing') {
            userAccess = 'active';
          } else {
            userAccess = 'pending';
          }
          break;
          
        case 'customer.subscription.deleted':
          action = 'deleted';
          userAccess = 'terminated';
          break;
          
        case 'customer.subscription.trial_will_end':
          // Send notification 3 days before trial ends
          console.log('Trial ending soon for user:', firebase_uid);
          // TODO: Send email notification
          break;
          
        case 'customer.subscription.paused':
          userAccess = 'paused';
          break;
          
        case 'customer.subscription.resumed':
          userAccess = 'active';
          break;
      }
      
      // Store complete subscription state
      await upsertCase('SYSTEM', {
        id: `SUB#${firebase_uid}`,
        subscription_id: subscription.id,
        customer_id: subscription.customer,
        status: subscription.status,
        current_period_start: (subscription as any).current_period_start,
        current_period_end: (subscription as any).current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at,
        trial_start: subscription.trial_start,
        trial_end: subscription.trial_end,
        user_access: userAccess,
        price_id: subscription.items.data[0]?.price.id,
        amount: subscription.items.data[0]?.price.unit_amount,
        currency: subscription.items.data[0]?.price.currency,
        interval: subscription.items.data[0]?.price.recurring?.interval
      }, {
        type: 'subscription',
        action,
        firebase_uid,
        customer_email,
        event_type: evt.type,
        updated_at: new Date().toISOString()
      });
      
      // Store subscription history for audit trail
      await upsertCase('SYSTEM', {
        id: `SUBHIST#${subscription.id}#${Date.now()}`,
        subscription_id: subscription.id,
        firebase_uid,
        event_type: evt.type,
        status: subscription.status,
        user_access: userAccess,
        timestamp: new Date().toISOString()
      }, {
        type: 'subscription_history'
      });
      
      console.log(`Subscription ${action} for user ${firebase_uid}: ${subscription.status} (access: ${userAccess})`);
      
      // Handle payment failure notifications
      if(subscription.status === 'unpaid' || subscription.status === 'past_due') {
        console.log('Payment failed for subscription:', subscription.id);
        // TODO: Send payment failure email
        // TODO: Grace period logic
      }
      
    } catch (error) {
      console.error('Failed to process subscription event:', error);
      // Still mark as processed to avoid retries
    }
    
    await WebhookIdempotencyService.markProcessed(evt.id, { type: evt.type });
    return { statusCode: 200, body: `subscription ${evt.type} processed` };
  }
  
  // Handle invoice payment failures
  if(evt.type === 'invoice.payment_failed'){
    const invoice = evt.data.object as Stripe.Invoice;
    
    if((invoice as any).subscription && (invoice as any).billing_reason === 'subscription_cycle'){
      console.log('Subscription payment failed:', (invoice as any).subscription);
      
      // Update subscription status
      const subscription_id = typeof (invoice as any).subscription === 'string' ? 
        (invoice as any).subscription : (invoice as any).subscription.id;
      
      // TODO: Send payment retry email
      // TODO: Update user access after grace period
    }
    
    await WebhookIdempotencyService.markProcessed(evt.id, { type: evt.type });
    return { statusCode: 200, body: 'payment failure processed' };
  }

  if(evt.type === 'charge.dispute.created' || evt.type === 'charge.dispute.updated'){
    const dispute = evt.data.object as Stripe.Dispute;
    
    // Initialize AI analysis
    let aiAnalysis: DisputeAnalysis | null = null;
    let riskLevel = 'medium';
    
    // Only run AI if enabled via feature flag
    if (process.env.AI_ENABLED === 'true' && isAIEnabled()) {
      // Analyze dispute with new AI module when created
      if(evt.type === 'charge.dispute.created'){
        try {
          // Get charge data for analysis
          const charge = await stripe.charges.retrieve(dispute.charge as string, { stripeAccount: eventAccount });
          
          // Quick risk assessment first
          riskLevel = quickAssessRisk(dispute);
          
          // Full AI analysis with REAL merchant win rate
          const merchantWinRate = eventAccount ? await getMerchantWinRate(eventAccount) : 0.5;
          aiAnalysis = await analyzeDispute({
            dispute,
            charge,
            merchantWinRate // REAL data from database
          });
          
          console.log('[AI] Dispute Analysis:', {
            disputeId: dispute.id,
            weaknesses: aiAnalysis.weaknesses.length,
            bestEvidence: aiAnalysis.bestEvidence.length,
            riskLevel: aiAnalysis.riskLevel,
            estimatedWinProbability: aiAnalysis.estimatedWinProbability
          });
          
          // Publish metrics
          await publishMetric('ai_analyzed', 1);
          if (aiAnalysis.estimatedWinProbability) {
            await publishMetric('ai_win_probability', aiAnalysis.estimatedWinProbability * 100, 'Percent');
          }
          
        } catch (error) {
          console.error('[AI] Analysis failed:', error);
          await publishMetric('ai_error', 1);
        }
      }
    }
    
    // Store case with AI analysis
    await upsertCase(eventAccount!, dispute, {
      aiAnalysis: aiAnalysis ? {
        weaknesses: aiAnalysis.weaknesses,
        bestEvidence: aiAnalysis.bestEvidence,
        winHints: aiAnalysis.winHints,
        riskLevel: aiAnalysis.riskLevel,
        estimatedWinProbability: aiAnalysis.estimatedWinProbability,
        recommendedActions: aiAnalysis.recommendedActions
      } : null,
      riskLevel,
      aiEnhanced: !!aiAnalysis
    });
    
    if(evt.type === 'charge.dispute.created'){
      // Include AI analysis in Step Functions input
      const sfnInput = {
        merchant: { stripe_account_id: eventAccount },
        dispute_id: dispute.id,
        aiAnalysis,
        riskLevel
      };
      
      // Only start Step Functions if configured
      if (process.env.SFN_ARN) {
        await sfn.send(new StartExecutionCommand({
          stateMachineArn: process.env.SFN_ARN,
          input: JSON.stringify(sfnInput)
        }));
      }
    }
    
    // NEW: Automatic ML data collection for resolved disputes
    if (evt.type === 'charge.dispute.updated' && ['won', 'lost', 'warning_closed'].includes(dispute.status)) {
      console.log(`📊 ML: Dispute ${dispute.id} resolved as ${dispute.status}`);
      
      try {
        // 1. Extract all features (34+ features)
        const featureExtractor = new FeatureExtractor(process.env.STRIPE_SECRET!);
        const features = await featureExtractor.extractAllFeatures(dispute);
        
        // 2. Get our original prediction (if exists)
        const caseData = await ddb.send(new GetCommand({
          TableName: process.env.CASES_TABLE!,
          Key: {
            pk: `MERCHANT#${eventAccount}`,
            sk: `DISPUTE#${dispute.id}`
          }
        }));
        
        const originalPrediction = caseData.Item?.aiAnalysis?.estimatedWinProbability || 0.5;
        
        // 3. Record outcome in FeedbackLoop (updates Redis weights)
        const feedbackLoop = FeedbackLoop.getInstance();
        await feedbackLoop.recordOutcome(
          dispute as any,
          features as any,
          {
            score: originalPrediction,
            recommendation: originalPrediction > 0.5 ? 'FIGHT' : 'ACCEPT'
          },
          dispute.evidence_details?.submission_count ? 'Auto submitted' : undefined
        );
        
        // 4. Save to DynamoDB for future batch training
        await ddb.send(new PutCommand({
          TableName: 'chargeback-ml-training-data',
          Item: {
            disputeId: dispute.id,
            timestamp: Date.now(),
            status: dispute.status,
            reason: dispute.reason,
            amount: dispute.amount,
            features: features,
            originalPrediction: originalPrediction,
            merchantId: eventAccount,
            chargeId: dispute.charge,
            created: dispute.created,
            autoCollected: true,
            ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
          }
        }));
        
        // 5. Publish metrics
        await publishMetric('MLDataCollected', 1);
        await publishMetric(`Dispute_${dispute.status}`, 1);
        
        // Calculate learning metrics
        const predictionError = dispute.status === 'won' ? 
          (1 - originalPrediction) : originalPrediction;
        await publishMetric('MLPredictionError', predictionError * 100, 'Percent');
        
        console.log(`✅ ML: Training data collected for ${dispute.id}`);
        console.log(`   - Features extracted: ${Object.keys(features).length}`);
        console.log(`   - Original prediction: ${(originalPrediction * 100).toFixed(1)}%`);
        console.log(`   - Actual outcome: ${dispute.status}`);
        console.log(`   - Prediction error: ${(predictionError * 100).toFixed(1)}%`);
        
        // 6. Update pattern cache with outcome (Safe - with fallback)
        if (patternCache && process.env.ENABLE_PATTERN_CACHE === 'true') {
          try {
            const charge = await stripe.charges.retrieve(dispute.charge as string, { stripeAccount: eventAccount });
            const patternKey = {
              amount: charge?.amount || 0,
              reason: dispute?.reason || 'unknown',
              mcc: (charge as any)?.merchant_data?.category || 'unknown',
              customerHistory: charge?.customer ? 'returning' : 'new',
              shipping: charge?.shipping ? 'tracked' : 'none'
            };
            
            // Update pattern with actual outcome
            const won = dispute.status === 'won';
            await patternCache.update(patternKey, won);
            console.log(`⚡ ML: Pattern cache updated with ${won ? 'WIN' : 'LOSS'} outcome`);
            await publishMetric('ml_pattern_cache_updated', 1);
          } catch (error) {
            console.log('Failed to update pattern cache:', error);
          }
        }
        
        // 7. Update score cache with validated outcome (Safe - with fallback)
        if (scoreCache && process.env.ENABLE_SCORE_CACHE === 'true') {
          try {
            const actualScore = dispute.status === 'won' ? 1.0 : 0.0;
            await scoreCache.updateWithOutcome(dispute.id, actualScore);
            console.log(`📊 ML: Score cache updated with actual outcome: ${actualScore}`);
            await publishMetric('ml_score_cache_validated', 1);
          } catch (error) {
            console.log('Failed to update score cache:', error);
          }
        }
        
        // 8. Trigger model update if threshold reached (Safe - with fallback)
        if (modelUpdater && process.env.ENABLE_MODEL_UPDATER === 'true') {
          try {
            const shouldUpdate = await modelUpdater.checkUpdateThreshold();
            if (shouldUpdate) {
              console.log('🚀 ML: Triggering model update based on new training data');
              await modelUpdater.triggerUpdate();
              await publishMetric('ml_model_update_triggered', 1);
            }
          } catch (error) {
            console.log('Failed to check model update threshold:', error);
          }
        }
        
      } catch (error) {
        console.error('❌ ML: Failed to collect training data:', error);
        await publishMetric('MLDataCollectionError', 1);
      }
    }
  }

  await markEventProcessed(evt.id, evt.type);
  return { statusCode:200, body:'ok' };
});
