import { ok, bad, createErrorResponse, getRequestOrigin, handleCorsPreflight } from "../shared/responses.js";
import { getCase } from "../shared/db.js";
import { requireAuth, verifyMerchantOwnership } from "../shared/auth.js";
import { StartExecutionCommand, SFNClient } from "@aws-sdk/client-sfn";
import Stripe from 'stripe';

const sfn = new SFNClient({});
const stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion: '2025-07-30.basil' });

export async function handler(event: any) {
  const origin = getRequestOrigin(event);
  const preflight = handleCorsPreflight(event, 'POST,OPTIONS');
  if (preflight) return preflight;

  // REQUIRE AUTHENTICATION
  const authResult = await requireAuth(event);
  if ('statusCode' in authResult) {
    return authResult; // Return 401 if not authenticated
  }
  const authContext = authResult;
  
  const disputeId = event.pathParameters?.id;
  if (!disputeId) {
    return bad("Missing dispute ID", { origin });
  }
  
  // Get merchant ID from auth context or query params
  const merchantId = authContext.merchant_id || event.queryStringParameters?.merchant;
  if (!merchantId) {
    return bad("No merchant account connected", { origin });
  }
  
  // VERIFY USER OWNS THIS MERCHANT ACCOUNT
  const hasAccess = await verifyMerchantOwnership(authContext, merchantId);
  if (!hasAccess) {
    return createErrorResponse(403, 'Access denied', {
      error: 'You do not have access to this merchant account'
    }, { origin });
  }
  
  try {
    // Get the case from database
    const caseData = await getCase(merchantId, disputeId);
    if (!caseData) {
      return createErrorResponse(404, 'Not found', {
        error: 'Dispute not found'
      }, { origin });
    }
    
    // Check if dispute is in a retryable state
    const retryableStatuses = ['needs_response', 'warning_needs_response', 'warning_under_review'];
    if (!retryableStatuses.includes(caseData.status)) {
      return createErrorResponse(400, 'Invalid state', {
        error: `Cannot retry dispute in status: ${caseData.status}`,
        allowedStatuses: retryableStatuses
      }, { origin });
    }
    
    // Get fresh dispute data from Stripe
    let stripeOptions: any = {};
    if (merchantId !== 'direct') {
      stripeOptions = { stripeAccount: merchantId };
    }
    
    const dispute = await stripe.disputes.retrieve(disputeId, stripeOptions);
    
    // Check if evidence deadline has passed
    if (dispute.evidence_details?.due_by) {
      const deadline = new Date(dispute.evidence_details.due_by * 1000);
      if (deadline < new Date()) {
        return createErrorResponse(400, 'Deadline passed', {
          error: 'Evidence submission deadline has passed',
          deadline: deadline.toISOString()
        }, { origin });
      }
    }
    
    // Prepare input for Step Functions
    const sfnInput = {
      merchant: { 
        stripe_account_id: merchantId,
        access_token: caseData.merchant_access_token // Include OAuth token if available
      },
      dispute_id: disputeId,
      retry: true,
      retry_reason: event.body ? JSON.parse(event.body).reason : 'Manual retry requested',
      retry_timestamp: new Date().toISOString()
    };
    
    // Start Step Functions execution for retry
    if (process.env.SFN_ARN) {
      const executionName = `retry-${disputeId}-${Date.now()}`;
      await sfn.send(new StartExecutionCommand({
        stateMachineArn: process.env.SFN_ARN,
        name: executionName,
        input: JSON.stringify(sfnInput)
      }));
      
      console.log(`Started retry for dispute ${disputeId} with execution: ${executionName}`);
      
      return ok({
        message: 'Retry initiated successfully',
        dispute_id: disputeId,
        execution_name: executionName,
        status: caseData.status,
        deadline: dispute.evidence_details?.due_by ?
          new Date(dispute.evidence_details.due_by * 1000).toISOString() : null
      }, { origin });
    } else {
      // Fallback: Direct evidence collection and submission
      console.log('No Step Functions configured, attempting direct retry');
      
      try {
        // Import the necessary handlers dynamically
        const { handler: getDisputeHandler } = await import('./getDispute.js');
        const { handler: getChargeHandler } = await import('./getCharge.js');
        const { handler: getPaymentIntentHandler } = await import('./getPaymentIntent.js');
        const { handler: buildEvidenceHandler } = await import('./buildEvidence.js');
        const { handler: stageEvidenceHandler } = await import('./stripeStageEvidence.js');
        const { handler: submitEvidenceHandler } = await import('./stripeSubmitEvidence.js');
        
        console.log('Starting direct retry workflow for dispute:', disputeId);
        
        // Step 1: Get fresh dispute data
        const disputeEvent = {
          pathParameters: { id: disputeId },
          queryStringParameters: { merchant: merchantId }
        };
        const disputeResponse = await getDisputeHandler(disputeEvent);
        const freshDispute = JSON.parse(disputeResponse.body);
        
        // Step 2: Get charge data
        let charge = null;
        if (freshDispute.charge) {
          const chargeEvent = {
            pathParameters: { id: freshDispute.charge },
            queryStringParameters: { merchant: merchantId }
          };
          const chargeResponse = await getChargeHandler(chargeEvent);
          charge = JSON.parse(chargeResponse.body);
        }
        
        // Step 3: Get payment intent data (optional)
        let paymentIntent = null;
        if (freshDispute.payment_intent) {
          try {
            const paymentIntentEvent = {
              pathParameters: { id: freshDispute.payment_intent },
              queryStringParameters: { merchant: merchantId }
            };
            const paymentIntentResponse = await getPaymentIntentHandler(paymentIntentEvent);
            paymentIntent = JSON.parse(paymentIntentResponse.body);
          } catch (piError) {
            console.log('Payment intent not found, continuing without it');
          }
        }
        
        // Step 4: Build evidence
        const buildEvidenceEvent = {
          dispute: freshDispute,
          charge,
          payment_intent: paymentIntent,
          merchant: {
            stripe_account_id: merchantId,
            access_token: caseData.merchant_access_token,
            settings: { autoSubmit: true } // Force submit on retry
          }
        };
        const evidenceResult = await buildEvidenceHandler(buildEvidenceEvent);
        
        // Step 5: Stage evidence
        const stageEvent = {
          dispute: freshDispute,
          evidence: evidenceResult.evidence,
          merchant: {
            stripe_account_id: merchantId,
            access_token: caseData.merchant_access_token
          }
        };
        const stageResult = await stageEvidenceHandler(stageEvent);
        
        // Step 6: Submit evidence if staging succeeded
        if (stageResult.staged) {
          const submitEvent = {
            dispute: freshDispute,
            merchant: {
              stripe_account_id: merchantId,
              access_token: caseData.merchant_access_token
            }
          };
          const submitResult = await submitEvidenceHandler(submitEvent);
          
          console.log('Direct retry completed successfully:', submitResult);
          
          return ok({
            message: 'Evidence submitted successfully via direct retry',
            dispute_id: disputeId,
            evidence_submitted: true,
            submission_result: submitResult,
            workflow: 'direct'
          }, { origin });
        } else {
          return ok({
            message: 'Evidence staged but not submitted (manual review required)',
            dispute_id: disputeId,
            evidence_staged: true,
            workflow: 'direct'
          }, { origin });
        }

      } catch (directRetryError: any) {
        console.error('Direct retry failed:', directRetryError);

        return createErrorResponse(500, 'Direct retry failed', {
          error: 'Failed to retry dispute processing',
          details: directRetryError.message,
          dispute_id: disputeId,
          workflow: 'direct'
        }, { origin });
      }
    }

  } catch (error: any) {
    console.error('Error retrying dispute:', error);
    return createErrorResponse(500, 'Internal error', {
      error: 'Failed to retry dispute',
      details: error.message
    }, { origin });
  }
}