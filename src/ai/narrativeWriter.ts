import type { EvidenceBundle } from './smartEvidenceCollector';
import { getOpenAIClient } from '../shared/openaiClient';

// Use GPT-5 Exclusive
const MODEL = process.env.AI_MODEL || 'gpt-5';
const TEMPERATURE = 1; // Required temperature for GPT-5

export type NarrativeOptions = {
  tone?: 'professional' | 'assertive' | 'empathetic';
  maxWords?: number;
  includeTimeline?: boolean;
  emphasizeCE3?: boolean;
};

/**
 * Compose a compelling dispute narrative (150-220 words)
 * Professional tone optimized for card network reviewers
 */
export async function compose(
  bundle: EvidenceBundle,
  options: NarrativeOptions = {}
): Promise<string | undefined> {
  const openai = await getOpenAIClient();
  if (!openai) {
    console.warn('[narrativeWriter] OpenAI not configured, skipping narrative generation');
    return undefined;
  }
  
  try {
    const {
      tone = 'professional',
      maxWords = 220,
      includeTimeline = true,
      emphasizeCE3 = bundle.ceCandidates.length > 0
    } = options;
    
    const systemPrompt = buildSystemPrompt(tone, maxWords);
    const userPrompt = buildUserPrompt(bundle, includeTimeline, emphasizeCE3);
    
    // GPT-5 requires special configuration
    const isGpt5 = MODEL === 'gpt-5';
    const completionParams: any = {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };
    
    if (isGpt5) {
      // GPT-5 specific parameters (as documented in GPT5-FIX-SUMMARY.md)
      completionParams.store = true;  // CRITICAL for GPT-5
      completionParams.temperature = 1;  // Required to be 1 for GPT-5
      // NO max_tokens for GPT-5
    } else {
      // Fallback parameters for other models
      completionParams.temperature = TEMPERATURE;
      completionParams.max_tokens = Math.ceil(maxWords * 1.5);
    }
    
    const response = await openai.chat.completions.create(completionParams);
    
    const narrative = response.choices[0]?.message?.content?.trim();
    
    // Validate word count
    if (narrative) {
      const wordCount = narrative.split(/\s+/).length;
      if (wordCount < 150 || wordCount > maxWords + 20) {
        console.warn(`[narrativeWriter] Generated narrative has ${wordCount} words (target: 150-${maxWords})`);
      }
    }
    
    return narrative || undefined;
  } catch (error) {
    console.error('[narrativeWriter] Error generating narrative:', error);
    return fallbackNarrative(bundle);
  }
}

/**
 * Build system prompt based on tone
 */
function buildSystemPrompt(tone: string, maxWords: number): string {
  const toneInstructions = {
    professional: 'neutral, factual, and respectful',
    assertive: 'confident, direct, and firm',
    empathetic: 'understanding but firm on facts'
  };
  
  return `You are a payment dispute specialist drafting narratives for card network reviewers.

Requirements:
- Write exactly 150-${maxWords} words
- Tone: ${toneInstructions[tone as keyof typeof toneInstructions] || toneInstructions.professional}
- Focus on facts and evidence
- No emotional language or accusations
- Clear structure: context, evidence, conclusion
- End with direct request to uphold the charge

Style:
- Short, clear sentences
- Active voice
- Professional terminology
- Reviewer-friendly formatting`;
}

/**
 * Build user prompt with case details
 */
function buildUserPrompt(
  bundle: EvidenceBundle,
  includeTimeline: boolean,
  emphasizeCE3: boolean
): string {
  const { charge, customer, ceCandidates, shipping, communications } = bundle;
  
  // Format charge details
  const chargeInfo = `Charge ${charge.id} for ${formatAmount(charge.amount, charge.currency)} on ${formatDate(charge.created)}`;
  
  // Format customer info
  const customerInfo = [
    customer?.email && `Email: ${customer.email}`,
    customer?.name && `Name: ${customer.name}`,
    customer?.ip && `IP: ${customer.ip}`
  ].filter(Boolean).join(', ') || 'Customer details on file';
  
  // Format CE3 evidence
  const ceInfo = emphasizeCE3 && ceCandidates.length > 0 
    ? formatCE3Evidence(ceCandidates)
    : '';
  
  // Format shipping
  const shippingInfo = shipping?.delivered 
    ? `Delivery confirmed${shipping.tracking ? ` (${shipping.tracking})` : ''}`
    : shipping?.tracking 
    ? `Shipped with tracking ${shipping.tracking}`
    : '';
  
  // Format communications
  const commInfo = communications && communications.length > 0
    ? `${communications.length} customer interactions documented`
    : '';
  
  // Build timeline if requested
  const timeline = includeTimeline ? buildTimeline(bundle) : '';
  
  return `Write a dispute narrative for a card network reviewer.

Transaction Details:
${chargeInfo}
${customerInfo}

${ceInfo ? `Prior Undisputed Transactions (CE3.0):
${ceInfo}

` : ''}${shippingInfo ? `Fulfillment:
${shippingInfo}

` : ''}${commInfo ? `Customer Engagement:
${commInfo}

` : ''}${timeline ? `Timeline:
${timeline}

` : ''}Key Points to Emphasize:
1. ${emphasizeCE3 && ceCandidates.length > 0 ? 'Multiple prior undisputed transactions with matching identifiers' : 'Legitimate transaction with supporting evidence'}
2. ${shipping?.delivered ? 'Confirmed delivery to customer' : 'Transaction fulfilled as described'}
3. ${customer?.email ? 'Verified customer identity and purchase intent' : 'Customer authentication verified'}

Request: Draft a 150-${bundle.narrative ? '220' : '200'} word narrative that demonstrates this was a legitimate, authorized transaction that should be upheld.`;
}

/**
 * Format CE3 evidence for prompt
 */
function formatCE3Evidence(candidates: EvidenceBundle['ceCandidates']): string {
  return candidates.slice(0, 5).map((c, i) => {
    const date = formatDate(c.created);
    const signals = c.signalOverlap.join(', ') || 'account match';
    return `${i + 1}. Transaction ${c.chargeId.slice(-8)} on ${date} (${signals})`;
  }).join('\n');
}

/**
 * Build transaction timeline
 */
function buildTimeline(bundle: EvidenceBundle): string {
  const events: Array<{ date: number; event: string }> = [];
  
  // Add main charge
  events.push({
    date: bundle.charge.created,
    event: 'Transaction processed'
  });
  
  // Add prior transactions
  bundle.ceCandidates.slice(0, 2).forEach(c => {
    events.push({
      date: c.created,
      event: 'Prior transaction (undisputed)'
    });
  });
  
  // Add shipping if available
  if (bundle.shipping?.delivered) {
    events.push({
      date: bundle.charge.created + 86400 * 3, // Estimate 3 days
      event: 'Order delivered'
    });
  }
  
  // Sort by date
  events.sort((a, b) => a.date - b.date);
  
  return events.map(e => `${formatDate(e.date)}: ${e.event}`).join('\n');
}

/**
 * Fallback narrative when AI unavailable
 */
function fallbackNarrative(bundle: EvidenceBundle): string {
  const { charge, customer, ceCandidates, shipping } = bundle;
  const amount = formatAmount(charge.amount, charge.currency);
  const date = formatDate(charge.created);
  
  let narrative = `This dispute concerns transaction ${charge.id} for ${amount} processed on ${date}. `;
  
  // Add customer info
  if (customer?.email) {
    narrative += `The transaction was authorized by the cardholder associated with email ${customer.email}. `;
  }
  
  // Add CE3 evidence
  if (ceCandidates.length > 0) {
    narrative += `Our records show ${ceCandidates.length} prior undisputed transaction(s) from this customer with matching identifiers, demonstrating an established purchasing relationship. `;
  }
  
  // Add shipping
  if (shipping?.delivered) {
    narrative += `The order was successfully delivered as confirmed by tracking ${shipping.tracking || 'records'}. `;
  }
  
  // Add conclusion
  narrative += `The evidence clearly demonstrates this was a legitimate, authorized transaction. `;
  narrative += `We respectfully request the issuer uphold this charge based on the compelling evidence provided.`;
  
  return narrative;
}

/**
 * Format amount for display
 */
function formatAmount(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  return `${currency.toUpperCase()} ${amount}`;
}

/**
 * Format Unix timestamp to readable date
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().split('T')[0];
}

/**
 * Generate multiple narrative variations for A/B testing
 */
export async function generateVariations(
  bundle: EvidenceBundle,
  count: number = 3
): Promise<string[]> {
  const tones: Array<'professional' | 'assertive' | 'empathetic'> = ['professional', 'assertive', 'empathetic'];
  const narratives: string[] = [];
  
  for (let i = 0; i < Math.min(count, 3); i++) {
    const narrative = await compose(bundle, { tone: tones[i] });
    if (narrative) narratives.push(narrative);
  }
  
  return narratives;
}

/**
 * Enhance existing narrative with additional context
 */
export async function enhance(
  existingNarrative: string,
  additionalContext: string
): Promise<string | undefined> {
  const openai = await getOpenAIClient();
  if (!openai) return existingNarrative;
  
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: TEMPERATURE,
      messages: [
        {
          role: 'system',
          content: 'You enhance dispute narratives by incorporating new evidence while maintaining the original structure and tone. Keep the result under 250 words.'
        },
        {
          role: 'user',
          content: `Original narrative:\n${existingNarrative}\n\nAdditional context to incorporate:\n${additionalContext}\n\nEnhance the narrative with this new information.`
        }
      ]
    });
    
    return response.choices[0]?.message?.content?.trim() || existingNarrative;
  } catch (error) {
    console.error('[narrativeWriter] Error enhancing narrative:', error);
    return existingNarrative;
  }
}