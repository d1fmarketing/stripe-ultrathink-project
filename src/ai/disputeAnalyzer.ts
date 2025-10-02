import OpenAI from 'openai';
import Stripe from 'stripe';

// Initialize clients
const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const MODEL = process.env.AI_MODEL || 'gpt-5';

export type DisputeAnalysis = {
  weaknesses: string[];
  bestEvidence: string[];
  winHints: string[];
  riskLevel: 'low' | 'medium' | 'high';
  recommendedActions: string[];
  estimatedWinProbability?: number;
};

export type AnalysisInput = {
  dispute: Stripe.Dispute;
  charge?: Stripe.Charge;
  customer?: any;
  history?: Array<{ type: string; value: string }>;
  priorDisputes?: number;
  merchantWinRate?: number;
};

/**
 * Analyze dispute to identify weaknesses and best evidence strategy
 */
export async function analyze(input: AnalysisInput): Promise<DisputeAnalysis> {
  const { dispute, charge, customer, history = [], priorDisputes = 0, merchantWinRate } = input;
  
  // If AI not configured, use rule-based analysis
  if (!openai) {
    return ruleBasedAnalysis(input);
  }
  
  try {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(dispute, charge, customer, history, priorDisputes, merchantWinRate);
    
    // GPT-5 requires special configuration
    const isGpt5 = MODEL === 'gpt-5';
    const completionParams: any = {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    };
    
    if (isGpt5) {
      // GPT-5 specific parameters
      completionParams.store = true;  // CRITICAL for GPT-5
      completionParams.temperature = 1;  // Required for GPT-5
    } else {
      // Fallback for other models
      completionParams.temperature = 0.7;
    }
    
    const response = await openai.chat.completions.create(completionParams);
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }
    
    const parsed = JSON.parse(content);
    
    return {
      weaknesses: parsed.weaknesses || [],
      bestEvidence: parsed.bestEvidence || [],
      winHints: parsed.winHints || [],
      riskLevel: parsed.riskLevel || 'medium',
      recommendedActions: parsed.recommendedActions || [],
      estimatedWinProbability: parsed.estimatedWinProbability
    };
  } catch (error) {
    console.error('[disputeAnalyzer] Error analyzing dispute:', error);
    return ruleBasedAnalysis(input);
  }
}

/**
 * Build system prompt for dispute analysis
 */
function buildSystemPrompt(): string {
  return `You are an expert payment dispute analyst specializing in card network chargeback rules and evidence requirements.

Your role:
1. Identify weaknesses in the merchant's position
2. Recommend the strongest evidence to collect
3. Provide strategic hints to maximize win probability
4. Assess risk level objectively
5. Suggest specific actions to strengthen the case

Output format: JSON with these keys:
- weaknesses: array of specific vulnerabilities
- bestEvidence: array of evidence types that would be most compelling
- winHints: array of strategic tips
- riskLevel: "low", "medium", or "high"
- recommendedActions: array of immediate actions to take
- estimatedWinProbability: number between 0 and 1

Be specific, actionable, and realistic. Focus on what can actually be proven.`;
}

/**
 * Build user prompt with dispute details
 */
function buildUserPrompt(
  dispute: Stripe.Dispute,
  charge?: Stripe.Charge,
  customer?: any,
  history: Array<{ type: string; value: string }> = [],
  priorDisputes: number = 0,
  merchantWinRate?: number
): string {
  const amount = `${(dispute.amount / 100).toFixed(2)} ${dispute.currency.toUpperCase()}`;
  
  // Build context sections
  const sections = [
    `Dispute Details:`,
    `- ID: ${dispute.id}`,
    `- Amount: ${amount}`,
    `- Reason: ${dispute.reason}`,
    `- Status: ${dispute.status}`,
    `- Network: ${dispute.network_reason_code ? `${dispute.network_reason_code}` : 'Unknown'}`,
    ''
  ];
  
  if (charge) {
    sections.push(
      `Transaction Details:`,
      `- Date: ${new Date(charge.created * 1000).toISOString()}`,
      `- Payment Method: ${charge.payment_method_details?.type || 'card'}`,
      `- Customer ID: ${charge.customer || 'guest'}`,
      `- Description: ${charge.description || 'N/A'}`,
      `- Statement Descriptor: ${charge.statement_descriptor || 'N/A'}`,
      ''
    );
    
    // Add risk indicators if available
    if (charge.outcome) {
      sections.push(
        `Risk Indicators:`,
        `- Risk Level: ${charge.outcome.risk_level || 'unknown'}`,
        `- Risk Score: ${charge.outcome.risk_score || 'N/A'}`,
        `- Network Status: ${charge.outcome.network_status || 'N/A'}`,
        ''
      );
    }
  }
  
  if (customer) {
    sections.push(
      `Customer Profile:`,
      `- Email: ${customer.email || 'N/A'}`,
      `- Created: ${customer.created ? new Date(customer.created * 1000).toISOString() : 'N/A'}`,
      `- Currency: ${customer.currency || 'N/A'}`,
      `- Total Purchases: ${customer.metadata?.total_purchases || 'Unknown'}`,
      ''
    );
  }
  
  if (history.length > 0) {
    sections.push(
      `Transaction History:`,
      ...history.map(h => `- ${h.type}: ${h.value}`),
      ''
    );
  }
  
  sections.push(
    `Additional Context:`,
    `- Prior Disputes: ${priorDisputes}`,
    `- Merchant Win Rate: ${merchantWinRate ? `${(merchantWinRate * 100).toFixed(1)}%` : 'Unknown'}`,
    '',
    `Analyze this dispute and provide strategic guidance.`
  );
  
  return sections.join('\n');
}

/**
 * Rule-based analysis fallback when AI unavailable
 */
function ruleBasedAnalysis(input: AnalysisInput): DisputeAnalysis {
  const { dispute, charge, priorDisputes = 0 } = input;
  const weaknesses: string[] = [];
  const bestEvidence: string[] = [];
  const winHints: string[] = [];
  const recommendedActions: string[] = [];
  
  // Analyze by dispute reason
  switch (dispute.reason) {
    case 'fraudulent':
      weaknesses.push('Fraud claims are challenging without strong authentication evidence');
      bestEvidence.push('3D Secure authentication', 'CVV match', 'AVS match', 'Prior undisputed transactions');
      winHints.push('Emphasize any prior successful transactions with same payment method');
      recommendedActions.push('Collect IP address logs', 'Gather device fingerprints', 'Document account activity');
      break;
      
    case 'subscription_canceled':
      weaknesses.push('Need clear proof of cancellation terms and timing');
      bestEvidence.push('Cancellation policy', 'Subscription agreement', 'Usage after cancellation attempt');
      winHints.push('Show service was provided during disputed period');
      recommendedActions.push('Generate usage report', 'Compile cancellation policy documentation');
      break;
      
    case 'product_not_received':
      weaknesses.push('Requires delivery confirmation');
      bestEvidence.push('Tracking information', 'Delivery confirmation', 'Signature proof');
      winHints.push('Include screenshots of tracking showing delivery');
      recommendedActions.push('Contact shipping carrier for proof of delivery', 'Get signature image if available');
      break;
      
    case 'product_unacceptable':
      weaknesses.push('Subjective quality disputes are difficult');
      bestEvidence.push('Product description accuracy', 'Return policy', 'Customer communications');
      winHints.push('Show product matched description and return policy was clear');
      recommendedActions.push('Document all customer communications', 'Prepare detailed product specifications');
      break;
      
    case 'duplicate':
      weaknesses.push('Need to prove each charge was intentional');
      bestEvidence.push('Distinct order IDs', 'Different products/services', 'Customer confirmation');
      winHints.push('Clearly differentiate each transaction');
      recommendedActions.push('Create transaction comparison table', 'Gather order confirmations');
      break;
      
    case 'credit_not_processed':
      weaknesses.push('Must show refund was issued or not warranted');
      bestEvidence.push('Refund policy', 'Refund records', 'Return status');
      winHints.push('Document why refund was not issued if applicable');
      recommendedActions.push('Pull refund processing records', 'Document return policy compliance');
      break;
      
    default:
      weaknesses.push('General dispute requires comprehensive evidence');
      bestEvidence.push('Transaction authorization', 'Customer communications', 'Service/product delivery proof');
      winHints.push('Build complete timeline of customer interaction');
      recommendedActions.push('Compile all available evidence', 'Create detailed timeline');
  }
  
  // Add common weaknesses
  if (!charge?.outcome || charge.outcome.risk_level === 'elevated' || charge.outcome.risk_level === 'highest') {
    weaknesses.push('Transaction flagged as risky by payment processor');
  }
  
  if (priorDisputes > 2) {
    weaknesses.push(`Customer has ${priorDisputes} prior disputes - pattern of dispute behavior`);
  }
  
  if (!charge?.customer) {
    weaknesses.push('Guest checkout - limited customer history available');
  }
  
  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' = 'medium';
  if (weaknesses.length <= 1 && dispute.reason !== 'fraudulent') {
    riskLevel = 'low';
  } else if (weaknesses.length >= 3 || dispute.reason === 'fraudulent' || priorDisputes > 2) {
    riskLevel = 'high';
  }
  
  // Estimate win probability based on reason and evidence
  const winProbabilityMap: Record<string, number> = {
    'duplicate': 0.70,
    'subscription_canceled': 0.65,
    'credit_not_processed': 0.60,
    'product_not_received': 0.55,
    'product_unacceptable': 0.45,
    'fraudulent': 0.40,
    'general': 0.50
  };
  
  let estimatedWinProbability = winProbabilityMap[dispute.reason] || 0.50;
  
  // Adjust based on evidence availability
  if (charge?.outcome?.network_status === 'approved_by_network') {
    estimatedWinProbability += 0.10;
  }
  if (charge?.customer) {
    estimatedWinProbability += 0.05;
  }
  if (priorDisputes > 2) {
    estimatedWinProbability -= 0.15;
  }
  
  estimatedWinProbability = Math.max(0.1, Math.min(0.9, estimatedWinProbability));
  
  return {
    weaknesses,
    bestEvidence,
    winHints,
    riskLevel,
    recommendedActions,
    estimatedWinProbability
  };
}

/**
 * Generate dispute response strategy
 */
export async function generateStrategy(
  analysis: DisputeAnalysis,
  availableEvidence: string[]
): Promise<string> {
  const strategy: string[] = [];
  
  // Priority 1: Address weaknesses
  strategy.push('Priority 1: Address Key Weaknesses');
  analysis.weaknesses.forEach(w => {
    strategy.push(`- ${w}`);
  });
  
  // Priority 2: Gather best evidence
  strategy.push('\nPriority 2: Evidence Collection');
  const missingEvidence = analysis.bestEvidence.filter(e => !availableEvidence.includes(e));
  if (missingEvidence.length > 0) {
    strategy.push('Missing critical evidence:');
    missingEvidence.forEach(e => {
      strategy.push(`- [ ] ${e}`);
    });
  }
  
  // Priority 3: Strategic positioning
  strategy.push('\nPriority 3: Strategic Approach');
  analysis.winHints.forEach(h => {
    strategy.push(`- ${h}`);
  });
  
  // Risk assessment
  strategy.push(`\nRisk Assessment: ${analysis.riskLevel.toUpperCase()}`);
  if (analysis.estimatedWinProbability) {
    strategy.push(`Estimated Win Probability: ${(analysis.estimatedWinProbability * 100).toFixed(0)}%`);
  }
  
  // Recommended actions
  if (analysis.recommendedActions.length > 0) {
    strategy.push('\nImmediate Actions Required:');
    analysis.recommendedActions.forEach(a => {
      strategy.push(`1. ${a}`);
    });
  }
  
  return strategy.join('\n');
}

/**
 * Quick risk assessment for batch processing
 */
export function quickAssessRisk(dispute: Stripe.Dispute): 'low' | 'medium' | 'high' {
  // High risk indicators
  if (
    dispute.reason === 'fraudulent' ||
    dispute.amount > 50000 || // Over $500
    dispute.status === 'warning_closed'
  ) {
    return 'high';
  }
  
  // Low risk indicators
  if (
    dispute.reason === 'duplicate' ||
    dispute.amount < 5000 || // Under $50
    dispute.evidence_details?.due_by && 
    (dispute.evidence_details.due_by - Date.now() / 1000) > 604800 // More than 7 days
  ) {
    return 'low';
  }
  
  return 'medium';
}