import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAuth, verifyMerchantOwnership } from '../shared/auth.js';
import { listCases } from '../shared/db.js';
import { validationMiddleware, commonSchemas } from '../shared/validation.js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET!, { apiVersion: '2025-07-30.basil' });

interface Dispute {
  id: string;
  object: string;
  amount: number;
  amount_cents: number;
  currency: string;
  reason: string;
  status: string;
  created: number;
  evidence_due_by: number;
  charge: string;
  payment_intent: string;
  merchant_name: string;
  customer_email: string;
  ce3_eligible: boolean;
  win_probability: number;
  ai_recommendation: string;
  evidence_submitted: boolean;
  last_updated: number;
}

// Now using REAL Stripe data - no more mocks!

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  
  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,OPTIONS'
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    // Validate input
    const validationSchema = commonSchemas.merchantId
      .merge(commonSchemas.disputeStatus)
      .merge(commonSchemas.pagination)
      .strict();
    const validationResult = await validationMiddleware(event, validationSchema);
    if (validationResult) {
      return validationResult; // Return 400 if validation fails
    }
    
    // REQUIRE AUTHENTICATION
    const authResult = await requireAuth(event);
    if ('statusCode' in authResult) {
      return authResult; // Return 401 if not authenticated
    }
    const authContext = authResult;
    
    // Use validated input
    const input = ((event as any).validatedInput ?? {}) as {
      merchant?: string;
      status?: string;
      limit?: number;
      offset?: number;
    };
    let merchantId = input.merchant || authContext.merchant_id || '';
    
    if (!merchantId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No merchant account specified or connected' })
      };
    }
    
    // VERIFY USER OWNS THIS MERCHANT ACCOUNT
    const hasAccess = await verifyMerchantOwnership(authContext, merchantId);
    if (!hasAccess) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Access denied to this merchant account' })
      };
    }
    
    // Get REAL disputes from Stripe
    const stripeDisputes = await stripe.disputes.list(
      { limit: 100 },
      { stripeAccount: merchantId }
    );
    
    // Get additional case data from database
    const dbCases = await listCases(merchantId, input.status);
    const caseMap = new Map(dbCases.map((c: any) => [c.dispute_id, c]));
    
    // Merge Stripe data with database data
    const disputes = stripeDisputes.data.map(dispute => {
      const dbCase = caseMap.get(dispute.id) || {};
      return {
        id: dispute.id,
        object: dispute.object,
        amount: dispute.amount,
        amount_cents: dispute.amount,
        currency: dispute.currency,
        reason: dispute.reason,
        status: dispute.status,
        created: dispute.created,
        evidence_due_by: dispute.evidence_details?.due_by || 0,
        charge: dispute.charge as string,
        payment_intent: dispute.payment_intent as string,
        merchant_name: merchantId,
        customer_email: (dispute.charge as any)?.billing_details?.email || '',
        ce3_eligible: dbCase.ce3_eligible || false,
        win_probability: dbCase.win_probability || 0,
        ai_recommendation: dbCase.ai_recommendation || '',
        evidence_submitted: dispute.evidence_details?.submission_count > 0,
        last_updated: dbCase.updated_at || dispute.created
      };
    });
    
    // Calculate summary statistics
    const summary = {
      total: disputes.length,
      pending: disputes.filter(d => d.status === 'warning_needs_response').length,
      under_review: disputes.filter(d => d.status.includes('under_review')).length,
      won: disputes.filter(d => d.status === 'won' || d.status === 'warning_closed').length,
      lost: disputes.filter(d => d.status === 'lost').length,
      ce3_eligible: disputes.filter(d => d.ce3_eligible).length,
      total_amount: disputes.reduce((sum, d) => sum + d.amount, 0),
      average_win_probability: parseFloat((disputes.reduce((sum, d) => sum + d.win_probability, 0) / disputes.length).toFixed(2))
    };
    
    const processingTime = Date.now() - startTime;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        authenticated: true,
        merchant_id: merchantId,
        data: {
          disputes,
          summary
        },
        processingTime: `${processingTime}ms`,
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('Error in disputes handler:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        processingTime: `${Date.now() - startTime}ms`
      })
    };
  }
};