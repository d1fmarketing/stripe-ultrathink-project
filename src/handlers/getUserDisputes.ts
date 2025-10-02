import { ok, bad } from "../shared/responses.js";
import { listCases } from "../shared/db.js";
import { requireAuth } from "../shared/auth.js";
import { withRequestResponseValidation } from "../shared/httpValidation.js";

/**
 * Get disputes for the authenticated user only
 * No merchant parameter needed - uses user's own merchant account
 */
export const handler = withRequestResponseValidation(async (event: any) => {
  // REQUIRE AUTHENTICATION
  const authResult = await requireAuth(event);
  if ('statusCode' in authResult) {
    return authResult; // Return 401 if not authenticated
  }
  const authContext = authResult;
  
  // Check if user has a connected Stripe account
  if (!authContext.merchant_id) {
    return ok({
      items: [],
      message: 'No Stripe account connected. Please connect your Stripe account to see disputes.'
    });
  }
  
  // Get query parameters
  const qs = event.queryStringParameters || {};
  const status = qs.status; // optional filter by status
  
  try {
    // Get disputes for this user's merchant account only
    const items = await listCases(authContext.merchant_id, status);
    
    // Format response
    const disputes = items.map((item: any) => ({
      dispute_id: item.dispute_id,
      amount_cents: item.amount_cents,
      currency: item.currency,
      reason: item.reason,
      status: item.status,
      ce3_eligible: item.ce3_eligible || false,
      created_at: item.created_at_epoch ? new Date(item.created_at_epoch * 1000).toISOString() : null,
      due_by: item.due_by_epoch ? new Date(item.due_by_epoch * 1000).toISOString() : null,
      evidence_submitted: item.evidence_submitted || false,
      win_likelihood: item.win_likelihood || 'unknown'
    }));
    
    // Calculate stats
    const stats = {
      total: disputes.length,
      pending: disputes.filter((d: any) => d.status === 'pending').length,
      won: disputes.filter((d: any) => d.status === 'won').length,
      lost: disputes.filter((d: any) => d.status === 'lost').length,
      win_rate: disputes.length > 0 ? 
        Math.round((disputes.filter((d: any) => d.status === 'won').length / disputes.length) * 100) : 0
    };
    
    return ok({
      items: disputes,
      stats,
      merchant_id: authContext.merchant_id
    });
    
  } catch (error: any) {
    console.error('Error fetching user disputes:', error);
    return bad('Failed to fetch disputes: ' + error.message);
  }
});