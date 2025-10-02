import Stripe from 'stripe';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getStripeClient } from '../shared/stripeClient';

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Evidence bundle schema
export const EvidenceBundleSchema = z.object({
  caseId: z.string(),
  merchantId: z.string(),
  charge: z.object({
    id: z.string(),
    amount: z.number(),
    currency: z.string(),
    created: z.number(),
    description: z.string().optional(),
    statementDescriptor: z.string().optional()
  }),
  customer: z.object({
    id: z.string().optional(),
    email: z.string().optional(),
    name: z.string().optional(),
    ip: z.string().optional(),
    created: z.number().optional()
  }).optional(),
  ceCandidates: z.array(z.object({
    chargeId: z.string(),
    created: z.number(),
    amount: z.number(),
    signalOverlap: z.array(z.string()),
    score: z.number()
  })),
  usageSignals: z.object({
    ipMatch: z.boolean().optional(),
    deviceMatch: z.boolean().optional(),
    loginHistory: z.number().optional(),
    accountAge: z.number().optional()
  }).optional(),
  shipping: z.object({
    delivered: z.boolean().optional(),
    carrier: z.string().optional(),
    tracking: z.string().optional(),
    proofUrl: z.string().optional(),
    deliveryDate: z.string().optional(),
    signature: z.string().optional()
  }).optional(),
  communications: z.array(z.object({
    ts: z.number(),
    channel: z.enum(['email', 'chat', 'phone', 'support']),
    summary: z.string(),
    sentiment: z.enum(['positive', 'neutral', 'negative']).optional()
  })).optional(),
  attachments: z.array(z.object({
    type: z.string(),
    key: z.string(),
    url: z.string().optional(),
    description: z.string().optional()
  })),
  narrative: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

export type CollectorOptions = {
  includeShipping?: boolean;
  includeCommunications?: boolean;
  includeUsageSignals?: boolean;
  maxPriorTransactions?: number;
  lookbackDays?: number;
};

/**
 * Build comprehensive evidence bundle for dispute
 */
export async function buildBundle(params: {
  disputeId: string;
  merchantId: string;
  options?: CollectorOptions;
}): Promise<EvidenceBundle> {
  const { disputeId, merchantId, options = {} } = params;
  const {
    includeShipping = true,
    includeCommunications = true,
    includeUsageSignals = true,
    maxPriorTransactions = 10,
    lookbackDays = 365
  } = options;
  
  try {
    // Fetch dispute with expanded charge
    const stripe = await getStripeClient();
    const dispute = await stripe.disputes.retrieve(disputeId, {
      expand: ['charge', 'charge.customer', 'charge.balance_transaction']
    });
    
    const charge = dispute.charge as Stripe.Charge;
    if (!charge || typeof charge === 'string') {
      throw new Error('Unable to retrieve charge details');
    }
    
    // Extract customer information
    const customer = await extractCustomerInfo(charge);
    
    // Find CE3.0 candidates (prior transactions)
    const ceCandidates = await findCE3Candidates(charge, customer, maxPriorTransactions, lookbackDays);
    
    // Collect shipping evidence if available
    const shipping = includeShipping ? await collectShippingEvidence(charge, merchantId) : undefined;
    
    // Collect communications if available
    const communications = includeCommunications ? await collectCommunications(customer?.id, merchantId) : undefined;
    
    // Collect usage signals if available
    const usageSignals = includeUsageSignals ? await collectUsageSignals(charge, customer, merchantId) : undefined;
    
    // Build attachments list
    const attachments = buildAttachmentsList(shipping, communications);
    
    // Compile the bundle
    const bundle: EvidenceBundle = {
      caseId: dispute.id,
      merchantId,
      charge: {
        id: charge.id,
        amount: charge.amount,
        currency: charge.currency,
        created: charge.created,
        description: charge.description || undefined,
        statementDescriptor: charge.statement_descriptor || undefined
      },
      customer,
      ceCandidates,
      usageSignals,
      shipping,
      communications,
      attachments,
      metadata: {
        collectedAt: Date.now(),
        disputeReason: dispute.reason,
        disputeStatus: dispute.status,
        evidenceDueBy: dispute.evidence_details?.due_by
      }
    };
    
    // Validate the bundle
    return EvidenceBundleSchema.parse(bundle);
  } catch (error) {
    console.error('[smartEvidenceCollector] Error building bundle:', error);
    throw error;
  }
}

/**
 * Extract customer information from charge
 */
async function extractCustomerInfo(charge: Stripe.Charge): Promise<EvidenceBundle['customer'] | undefined> {
  try {
    let customerData: any = {};
    
    // If customer ID exists, fetch full customer object
    if (charge.customer && typeof charge.customer === 'string') {
      const stripe = await getStripeClient();
      const customer = await stripe.customers.retrieve(charge.customer);
      if (!customer.deleted) {
        customerData = customer;
      }
    } else if (charge.customer && typeof charge.customer === 'object') {
      customerData = charge.customer;
    }
    
    // Extract from billing details
    const email = charge.billing_details?.email || customerData.email;
    const name = charge.billing_details?.name || customerData.name;
    
    // Extract IP from source
    let ip: string | undefined;
    if (charge.source && typeof charge.source === 'object' && 'client_ip' in charge.source) {
      const clientIp = charge.source.client_ip;
      ip = (typeof clientIp === 'string' && clientIp) ? clientIp : undefined;
    }
    
    if (!email && !name && !ip && !customerData.id) {
      return undefined;
    }
    
    return {
      id: customerData.id,
      email,
      name,
      ip,
      created: customerData.created
    };
  } catch (error) {
    console.error('[smartEvidenceCollector] Error extracting customer info:', error);
    return undefined;
  }
}

/**
 * Find CE3.0 eligible prior transactions
 */
async function findCE3Candidates(
  charge: Stripe.Charge,
  customer: EvidenceBundle['customer'],
  maxTransactions: number,
  lookbackDays: number
): Promise<EvidenceBundle['ceCandidates']> {
  const candidates: EvidenceBundle['ceCandidates'] = [];

  try {
    const stripe = await getStripeClient();
    // Calculate lookback timestamp
    const lookbackTimestamp = charge.created - (lookbackDays * 86400);
    const minTimestamp = charge.created - (365 * 86400); // Max 365 days
    const maxTimestamp = charge.created - (120 * 86400); // Min 120 days for CE3
    
    // Search by customer ID if available
    if (customer?.id) {
      const charges = await stripe.charges.list({
        customer: customer.id,
        limit: maxTransactions * 2, // Fetch extra to filter
        created: {
          gte: Math.max(lookbackTimestamp, minTimestamp),
          lt: maxTimestamp
        }
      });
      
      for (const priorCharge of charges.data) {
        if (priorCharge.id === charge.id) continue;
        if (!priorCharge.paid || priorCharge.refunded) continue;
        if (priorCharge.disputed) continue;
        
        const overlap = calculateSignalOverlap(charge, priorCharge, customer);
        if (overlap.length > 0) {
          candidates.push({
            chargeId: priorCharge.id,
            created: priorCharge.created,
            amount: priorCharge.amount,
            signalOverlap: overlap,
            score: calculateCE3Score(overlap, priorCharge)
          });
        }
      }
    }
    
    // Search by email if no customer ID
    if (candidates.length === 0 && customer?.email) {
      const charges = await stripe.charges.search({
        query: `metadata["email"]:"${customer.email}" OR billing_details.email:"${customer.email}"`,
        limit: maxTransactions
      });
      
      for (const priorCharge of charges.data) {
        if (priorCharge.id === charge.id) continue;
        if (!priorCharge.paid || priorCharge.refunded) continue;
        if (priorCharge.disputed) continue;
        if (priorCharge.created < minTimestamp || priorCharge.created > maxTimestamp) continue;
        
        const overlap = calculateSignalOverlap(charge, priorCharge, customer);
        if (overlap.length > 0) {
          candidates.push({
            chargeId: priorCharge.id,
            created: priorCharge.created,
            amount: priorCharge.amount,
            signalOverlap: overlap,
            score: calculateCE3Score(overlap, priorCharge)
          });
        }
      }
    }
    
    // Sort by score and limit
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, maxTransactions);
  } catch (error) {
    console.error('[smartEvidenceCollector] Error finding CE3 candidates:', error);
    return [];
  }
}

/**
 * Calculate signal overlap between charges
 */
function calculateSignalOverlap(
  charge1: Stripe.Charge,
  charge2: Stripe.Charge,
  customer: EvidenceBundle['customer']
): string[] {
  const overlap: string[] = [];
  
  // Email match
  const email1 = charge1.billing_details?.email || customer?.email;
  const email2 = charge2.billing_details?.email;
  if (email1 && email2 && email1.toLowerCase() === email2.toLowerCase()) {
    overlap.push('email');
  }
  
  // Customer ID match
  if (charge1.customer && charge2.customer && charge1.customer === charge2.customer) {
    overlap.push('customer_id');
  }
  
  // IP match (if available in metadata or source)
  const ip1 = getChargeIP(charge1) || customer?.ip;
  const ip2 = getChargeIP(charge2);
  if (ip1 && ip2 && ip1 === ip2) {
    overlap.push('ip_address');
  }
  
  // Shipping address match
  if (charge1.shipping && charge2.shipping) {
    const addr1 = charge1.shipping.address;
    const addr2 = charge2.shipping.address;
    if (addr1 && addr2) {
      if (addr1.postal_code === addr2.postal_code && addr1.country === addr2.country) {
        overlap.push('shipping_address');
      }
    }
  }
  
  // Phone match
  const phone1 = charge1.billing_details?.phone || charge1.shipping?.phone;
  const phone2 = charge2.billing_details?.phone || charge2.shipping?.phone;
  if (phone1 && phone2 && normalizePhone(phone1) === normalizePhone(phone2)) {
    overlap.push('phone');
  }
  
  // Device fingerprint (if in metadata)
  if (charge1.metadata?.device_id && charge2.metadata?.device_id && 
      charge1.metadata.device_id === charge2.metadata.device_id) {
    overlap.push('device_fingerprint');
  }
  
  return overlap;
}

/**
 * Calculate CE3 score for a candidate transaction
 */
function calculateCE3Score(overlap: string[], charge: Stripe.Charge): number {
  let score = 0;
  
  // Base score for having any overlap
  if (overlap.length > 0) score = 0.3;
  
  // Strong signals
  if (overlap.includes('customer_id')) score += 0.25;
  if (overlap.includes('device_fingerprint')) score += 0.20;
  if (overlap.includes('email')) score += 0.15;
  if (overlap.includes('ip_address')) score += 0.15;
  
  // Supporting signals
  if (overlap.includes('shipping_address')) score += 0.10;
  if (overlap.includes('phone')) score += 0.10;
  
  // Bonus for multiple signals
  if (overlap.length >= 3) score += 0.15;
  if (overlap.length >= 4) score += 0.10;
  
  // Adjust by transaction age (more recent is better)
  const ageInDays = (Date.now() / 1000 - charge.created) / 86400;
  if (ageInDays < 180) score += 0.05;
  
  // Adjust by amount similarity
  if (charge.amount > 1000) score += 0.05; // Higher value transaction
  
  return Math.min(1, score);
}

/**
 * Collect shipping evidence from various sources
 */
async function collectShippingEvidence(
  charge: Stripe.Charge,
  merchantId: string
): Promise<EvidenceBundle['shipping'] | undefined> {
  try {
    // Check if shipping info exists on charge
    if (charge.shipping) {
      const shipping: EvidenceBundle['shipping'] = {
        carrier: charge.shipping.carrier || undefined,
        tracking: charge.shipping.tracking_number || undefined
      };
      
      // Try to fetch tracking status from DynamoDB (if we store it)
      if (shipping && shipping.tracking) {
        const trackingData = await getTrackingFromDB(shipping.tracking, merchantId);
        if (trackingData && shipping) {
          shipping.delivered = trackingData.delivered;
          shipping.deliveryDate = trackingData.deliveryDate;
          shipping.proofUrl = trackingData.proofUrl;
          shipping.signature = trackingData.signature;
        }
      }
      
      return shipping;
    }
    
    // Check metadata for shipping info
    if (charge.metadata?.tracking_number) {
      return {
        tracking: charge.metadata.tracking_number as string,
        carrier: charge.metadata.carrier as string | undefined
      };
    }
    
    return undefined;
  } catch (error) {
    console.error('[smartEvidenceCollector] Error collecting shipping evidence:', error);
    return undefined;
  }
}

/**
 * Collect customer communications
 */
async function collectCommunications(
  customerId: string | undefined,
  merchantId: string
): Promise<EvidenceBundle['communications'] | undefined> {
  if (!customerId) return undefined;
  
  try {
    // Query communications table in DynamoDB
    const response = await docClient.send(new QueryCommand({
      TableName: process.env.COMMUNICATIONS_TABLE || 'communications',
      KeyConditionExpression: 'merchantId = :merchantId AND customerId = :customerId',
      ExpressionAttributeValues: {
        ':merchantId': merchantId,
        ':customerId': customerId
      },
      Limit: 10,
      ScanIndexForward: false // Most recent first
    }));
    
    if (!response.Items || response.Items.length === 0) {
      return undefined;
    }
    
    return response.Items.map(item => ({
      ts: item.timestamp,
      channel: item.channel as 'email' | 'chat' | 'phone' | 'support',
      summary: item.summary,
      sentiment: item.sentiment as 'positive' | 'neutral' | 'negative' | undefined
    }));
  } catch (error) {
    console.error('[smartEvidenceCollector] Error collecting communications:', error);
    return undefined;
  }
}

/**
 * Collect usage signals and behavioral data
 */
async function collectUsageSignals(
  charge: Stripe.Charge,
  customer: EvidenceBundle['customer'],
  merchantId: string
): Promise<EvidenceBundle['usageSignals'] | undefined> {
  try {
    const signals: EvidenceBundle['usageSignals'] = {};
    
    // Calculate account age if customer exists
    if (customer?.created) {
      signals.accountAge = Math.floor((Date.now() / 1000 - customer.created) / 86400); // Days
    }
    
    // Check for IP/device matches in metadata or DynamoDB
    if (charge.metadata?.last_ip === customer?.ip) {
      signals.ipMatch = true;
    }
    
    if (charge.metadata?.device_id) {
      // Could check against historical device IDs in DB
      signals.deviceMatch = true;
    }
    
    // Query login history if available
    if (customer?.id) {
      try {
        const loginCount = await getLoginHistory(customer.id, merchantId);
        if (loginCount > 0) {
          signals.loginHistory = loginCount;
        }
      } catch (error) {
        // Ignore if table doesn't exist
      }
    }
    
    return Object.keys(signals).length > 0 ? signals : undefined;
  } catch (error) {
    console.error('[smartEvidenceCollector] Error collecting usage signals:', error);
    return undefined;
  }
}

/**
 * Build list of evidence attachments
 */
function buildAttachmentsList(
  shipping?: EvidenceBundle['shipping'],
  communications?: EvidenceBundle['communications']
): EvidenceBundle['attachments'] {
  const attachments: EvidenceBundle['attachments'] = [];
  
  if (shipping?.proofUrl) {
    attachments.push({
      type: 'shipping_proof',
      key: 'delivery_confirmation',
      url: shipping.proofUrl,
      description: 'Proof of delivery from carrier'
    });
  }
  
  if (shipping?.signature) {
    attachments.push({
      type: 'signature',
      key: 'delivery_signature',
      description: 'Recipient signature on delivery'
    });
  }
  
  if (communications && communications.length > 0) {
    attachments.push({
      type: 'communications',
      key: 'customer_communications',
      description: `${communications.length} customer interactions documented`
    });
  }
  
  return attachments;
}

// Helper functions

function getChargeIP(charge: Stripe.Charge): string | undefined {
  if (charge.source && typeof charge.source === 'object' && 'client_ip' in charge.source) {
    const clientIp = charge.source.client_ip;
    return (typeof clientIp === 'string' && clientIp) ? clientIp : undefined;
  }
  if (charge.metadata?.ip_address) {
    return charge.metadata.ip_address as string;
  }
  return undefined;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

async function getTrackingFromDB(trackingNumber: string, merchantId: string): Promise<any> {
  try {
    const response = await docClient.send(new GetCommand({
      TableName: process.env.TRACKING_TABLE || 'tracking',
      Key: {
        merchantId,
        trackingNumber
      }
    }));
    return response.Item;
  } catch (error) {
    return null;
  }
}

async function getLoginHistory(customerId: string, merchantId: string): Promise<number> {
  try {
    const response = await docClient.send(new QueryCommand({
      TableName: process.env.ACTIVITY_TABLE || 'activity',
      KeyConditionExpression: 'merchantId = :merchantId AND customerId = :customerId',
      ExpressionAttributeValues: {
        ':merchantId': merchantId,
        ':customerId': customerId
      },
      Select: 'COUNT'
    }));
    return response.Count || 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Validate and score evidence bundle completeness
 */
export function scoreEvidenceCompleteness(bundle: EvidenceBundle): number {
  let score = 0;
  let maxScore = 0;
  
  // Required evidence
  if (bundle.charge) { score += 10; }
  maxScore += 10;
  
  // Customer identification
  if (bundle.customer?.email) { score += 5; }
  if (bundle.customer?.id) { score += 5; }
  maxScore += 10;
  
  // CE3 candidates
  if (bundle.ceCandidates.length > 0) { score += 10; }
  if (bundle.ceCandidates.length >= 3) { score += 5; }
  maxScore += 15;
  
  // Shipping evidence
  if (bundle.shipping?.tracking) { score += 5; }
  if (bundle.shipping?.delivered) { score += 10; }
  maxScore += 15;
  
  // Communications
  if (bundle.communications && bundle.communications.length > 0) { score += 5; }
  maxScore += 5;
  
  // Narrative
  if (bundle.narrative) { score += 10; }
  maxScore += 10;
  
  // Usage signals
  if (bundle.usageSignals?.ipMatch) { score += 3; }
  if (bundle.usageSignals?.deviceMatch) { score += 3; }
  if (bundle.usageSignals?.loginHistory) { score += 4; }
  maxScore += 10;
  
  return score / maxScore;
}