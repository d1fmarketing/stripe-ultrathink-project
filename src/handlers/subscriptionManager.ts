import { ok, bad, createErrorResponse, getRequestOrigin, handleCorsPreflight } from "../shared/responses.js";
import { requireAuth, verifyMerchantOwnership } from "../shared/auth.js";
import { createAuditLog, AuditAction } from "../shared/auditLog.js";
import { putMerchant, getCase } from "../shared/db.js";
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion: '2025-07-30.basil' });

// Handle subscription lifecycle events
export async function handleSubscriptionEvent(event: any, subscriptionEvent: any) {
  const { type, data } = subscriptionEvent;
  const subscription = data.object;
  const merchantId = event.account || subscription.metadata?.merchant_id;
  
  if (!merchantId) {
    console.error('No merchant ID found for subscription event');
    return;
  }
  
  // Get merchant data from cases table
  const merchant = await getCase(merchantId, 'MERCHANT');
  if (!merchant) {
    console.error(`Merchant not found: ${merchantId}`);
    return;
  }
  
  switch (type) {
    case 'customer.subscription.created':
      await handleSubscriptionCreated(merchantId, subscription);
      break;
      
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(merchantId, subscription);
      break;
      
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(merchantId, subscription);
      break;
      
    case 'customer.subscription.trial_will_end':
      await handleTrialWillEnd(merchantId, subscription);
      break;
      
    case 'customer.subscription.paused':
      await handleSubscriptionPaused(merchantId, subscription);
      break;
      
    case 'customer.subscription.resumed':
      await handleSubscriptionResumed(merchantId, subscription);
      break;
      
    default:
      console.log(`Unhandled subscription event type: ${type}`);
  }
  
  // Audit the subscription event
  await createAuditLog({
    action: AuditAction.WEBHOOK_RECEIVED,
    merchantId: merchantId,
    resourceType: 'subscription',
    resourceId: subscription.id,
    success: true,
    metadata: {
      event_type: type,
      status: subscription.status,
      customer: subscription.customer,
      items: subscription.items?.data?.map((item: any) => ({
        price: item.price.id,
        quantity: item.quantity
      }))
    }
  });
}

async function handleSubscriptionCreated(merchantId: string, subscription: any) {
  console.log(`[SUBSCRIPTION] Created for merchant ${merchantId}: ${subscription.id}`);
  
  // Update merchant with subscription info
  await putMerchant({
    merchant_id: merchantId,
    subscription_id: subscription.id,
    subscription_status: subscription.status,
    subscription_current_period_end: subscription.current_period_end,
    subscription_cancel_at_period_end: subscription.cancel_at_period_end,
    subscription_created_at: new Date(subscription.created * 1000).toISOString(),
    plan_id: subscription.items?.data?.[0]?.price?.id,
    customer_id: subscription.customer
  });
  
  // If this is the first paid subscription, activate premium features
  if (subscription.status === 'active' && !subscription.trial_end) {
    await activatePremiumFeatures(merchantId);
  }
}

async function handleSubscriptionUpdated(merchantId: string, subscription: any) {
  console.log(`[SUBSCRIPTION] Updated for merchant ${merchantId}: ${subscription.id}`);
  
  // Update subscription status
  await putMerchant({
    merchant_id: merchantId,
    subscription_status: subscription.status,
    subscription_current_period_end: subscription.current_period_end,
    subscription_cancel_at_period_end: subscription.cancel_at_period_end,
    plan_id: subscription.items?.data?.[0]?.price?.id
  });
  
  // Handle status changes
  if (subscription.status === 'past_due') {
    await handlePastDueSubscription(merchantId);
  } else if (subscription.status === 'canceled') {
    await deactivatePremiumFeatures(merchantId);
  } else if (subscription.status === 'active') {
    await activatePremiumFeatures(merchantId);
  }
}

async function handleSubscriptionDeleted(merchantId: string, subscription: any) {
  console.log(`[SUBSCRIPTION] Deleted for merchant ${merchantId}: ${subscription.id}`);
  
  // Mark subscription as canceled
  await putMerchant({
    merchant_id: merchantId,
    subscription_status: 'canceled',
    subscription_canceled_at: new Date().toISOString(),
    premium_features_active: false
  });
  
  // Deactivate premium features
  await deactivatePremiumFeatures(merchantId);
}

async function handleTrialWillEnd(merchantId: string, subscription: any) {
  console.log(`[SUBSCRIPTION] Trial ending soon for merchant ${merchantId}: ${subscription.id}`);
  
  // Send notification about trial ending (implement email/notification service)
  // For now, just log it
  await putMerchant({
    merchant_id: merchantId,
    trial_ending_notification_sent: new Date().toISOString()
  });
}

async function handleSubscriptionPaused(merchantId: string, subscription: any) {
  console.log(`[SUBSCRIPTION] Paused for merchant ${merchantId}: ${subscription.id}`);
  
  await putMerchant({
    merchant_id: merchantId,
    subscription_status: 'paused',
    subscription_paused_at: new Date().toISOString(),
    premium_features_active: false
  });
  
  // Temporarily deactivate features
  await deactivatePremiumFeatures(merchantId);
}

async function handleSubscriptionResumed(merchantId: string, subscription: any) {
  console.log(`[SUBSCRIPTION] Resumed for merchant ${merchantId}: ${subscription.id}`);
  
  await putMerchant({
    merchant_id: merchantId,
    subscription_status: 'active',
    subscription_resumed_at: new Date().toISOString(),
    premium_features_active: true
  });
  
  // Reactivate features
  await activatePremiumFeatures(merchantId);
}

async function handlePastDueSubscription(merchantId: string) {
  console.log(`[SUBSCRIPTION] Handling past due for merchant ${merchantId}`);
  
  // Limit features for past due accounts
  await putMerchant({
    merchant_id: merchantId,
    premium_features_limited: true,
    past_due_notification_sent: new Date().toISOString()
  });
}

async function activatePremiumFeatures(merchantId: string) {
  console.log(`[FEATURES] Activating premium features for merchant ${merchantId}`);
  
  await putMerchant({
    merchant_id: merchantId,
    premium_features_active: true,
    ai_enabled: true,
    ce3_detection_enabled: true,
    auto_submit_enabled: true,
    advanced_analytics_enabled: true,
    api_rate_limit: 10000, // Premium rate limit
    max_disputes_per_month: -1, // Unlimited
    features_activated_at: new Date().toISOString()
  });
}

async function deactivatePremiumFeatures(merchantId: string) {
  console.log(`[FEATURES] Deactivating premium features for merchant ${merchantId}`);
  
  await putMerchant({
    merchant_id: merchantId,
    premium_features_active: false,
    ai_enabled: false,
    ce3_detection_enabled: false,
    auto_submit_enabled: false,
    advanced_analytics_enabled: false,
    api_rate_limit: 100, // Free tier rate limit
    max_disputes_per_month: 10, // Free tier limit
    features_deactivated_at: new Date().toISOString()
  });
}

// API endpoint to get subscription status
export async function getSubscriptionStatus(event: any) {
  const origin = getRequestOrigin(event);
  const preflight = handleCorsPreflight(event, 'GET,OPTIONS');
  if (preflight) return preflight;

  // Require authentication
  const authResult = await requireAuth(event);
  if ('statusCode' in authResult) {
    return authResult;
  }
  const authContext = authResult;
  
  const merchantId = event.queryStringParameters?.merchant || authContext.merchant_id;
  
  if (!merchantId) {
    return bad("No merchant account specified", { origin });
  }
  
  // Verify ownership
  const hasAccess = await verifyMerchantOwnership(authContext, merchantId);
  if (!hasAccess) {
    return createErrorResponse(403, 'Access denied to this merchant account', undefined, { origin });
  }
  
  try {
    // Get merchant data
    const merchant = await getCase(merchantId, 'MERCHANT');
    
    // Get subscription from Stripe if ID exists
    let stripeSubscription = null;
    if (merchant?.subscription_id) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(
          merchant.subscription_id,
          { expand: ['customer', 'default_payment_method'] }
        );
      } catch (e) {
        console.error('Error fetching Stripe subscription:', e);
      }
    }
    
    return ok({
      subscription: {
        id: merchant?.subscription_id,
        status: merchant?.subscription_status || 'none',
        current_period_end: merchant?.subscription_current_period_end,
        cancel_at_period_end: merchant?.subscription_cancel_at_period_end,
        plan_id: merchant?.plan_id,
        premium_features_active: merchant?.premium_features_active || false,
        features: {
          ai_enabled: merchant?.ai_enabled || false,
          ce3_detection: merchant?.ce3_detection_enabled || false,
          auto_submit: merchant?.auto_submit_enabled || false,
          advanced_analytics: merchant?.advanced_analytics_enabled || false
        },
        limits: {
          api_rate_limit: merchant?.api_rate_limit || 100,
          max_disputes_per_month: merchant?.max_disputes_per_month || 10
        },
        stripe_subscription: stripeSubscription ? {
          status: stripeSubscription.status,
          trial_end: stripeSubscription.trial_end,
          current_period_start: stripeSubscription.current_period_start,
          current_period_end: stripeSubscription.current_period_end,
          cancel_at: stripeSubscription.cancel_at,
          canceled_at: stripeSubscription.canceled_at
        } : null
      }
    }, { origin });

  } catch (error: any) {
    console.error('Error getting subscription status:', error);
    return bad(`Failed to get subscription status: ${error.message}`, { origin });
  }
}

// API endpoint to cancel subscription
export async function cancelSubscription(event: any) {
  const origin = getRequestOrigin(event);
  const preflight = handleCorsPreflight(event, 'POST,OPTIONS');
  if (preflight) return preflight;

  // Require authentication
  const authResult = await requireAuth(event);
  if ('statusCode' in authResult) {
    return authResult;
  }
  const authContext = authResult;
  
  const merchantId = event.queryStringParameters?.merchant || authContext.merchant_id;
  
  if (!merchantId) {
    return bad("No merchant account specified", { origin });
  }
  
  // Verify ownership
  const hasAccess = await verifyMerchantOwnership(authContext, merchantId);
  if (!hasAccess) {
    return createErrorResponse(403, 'Access denied to this merchant account', undefined, { origin });
  }
  
  try {
    // Get merchant data
    const merchant = await getCase(merchantId, 'MERCHANT');
    
    if (!merchant?.subscription_id) {
      return bad("No active subscription found", { origin });
    }
    
    // Cancel subscription at period end
    const canceledSubscription = await stripe.subscriptions.update(
      merchant.subscription_id,
      { cancel_at_period_end: true }
    );
    
    // Update merchant record
    await putMerchant({
      merchant_id: merchantId,
      subscription_cancel_at_period_end: true,
      subscription_cancel_requested_at: new Date().toISOString()
    });
    
    // Audit the cancellation
    await createAuditLog({
      action: AuditAction.SUBSCRIPTION_CANCELLED,
      userId: authContext.uid,
      userEmail: authContext.email,
      merchantId: merchantId,
      resourceType: 'subscription',
      resourceId: merchant.subscription_id,
      success: true,
      metadata: {
        cancel_at: canceledSubscription.cancel_at,
        current_period_end: (canceledSubscription as any).current_period_end
      }
    });
    
    return ok({
      message: 'Subscription will be canceled at the end of the current billing period',
      subscription: {
        id: canceledSubscription.id,
        status: canceledSubscription.status,
        cancel_at_period_end: canceledSubscription.cancel_at_period_end,
        current_period_end: (canceledSubscription as any).current_period_end
      }
    }, { origin });

  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    return bad(`Failed to cancel subscription: ${error.message}`, { origin });
  }
}