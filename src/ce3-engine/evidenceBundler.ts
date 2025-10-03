import Stripe from 'stripe';
import { CE3Detector } from './ce3Detector';

export interface EvidencePackage {
  disputeId: string;
  merchantId: string;
  ce3Eligible: boolean;
  winProbability: number;
  evidence: Stripe.DisputeUpdateParams.Evidence;
  supportingDocuments: SupportingDocument[];
  narrative: string;
  estimatedFields: EstimatedField[];
  submissionReady: boolean;
  fraudWarning?: boolean;
}

export interface SupportingDocument {
  type: 'receipt' | 'shipping' | 'communication' | 'policy' | 'usage' | 'ce3';
  description: string;
  url?: string;
  content?: string;
}

export interface EstimatedField {
  field: string;
  value: any;
  disclaimer: string;
  confidence: 'high' | 'medium' | 'low';
}

export class EvidenceBundler {
  private stripe: Stripe;
  private ce3Detector: CE3Detector;
  
  constructor(stripeSecretKey: string) {
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-07-30.basil',
    });
    this.ce3Detector = new CE3Detector(stripeSecretKey);
  }

  /**
   * Automatically assemble complete evidence package for a dispute
   */
  async assembleEvidencePackage(
    dispute: Stripe.Dispute,
    merchantId: string,
    stripeAccountId?: string
  ): Promise<EvidencePackage> {
    // Get the disputed charge
    const charge = await this.stripe.charges.retrieve(
      dispute.charge as string,
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );
    
    // Check CE3.0 eligibility
    const ce3Eligibility = await this.ce3Detector.detectEligibility(dispute, stripeAccountId);
    
    // Build evidence based on dispute reason
    const evidence = await this.buildEvidenceByReason(dispute, charge, ce3Eligibility);
    
    // Generate narrative
    const narrative = this.generateNarrative(dispute, charge, ce3Eligibility);
    
    // Collect supporting documents
    const supportingDocuments = await this.collectSupportingDocuments(dispute, charge);
    
    // Identify estimated fields
    const estimatedFields = this.identifyEstimatedFields(evidence);
    
    // Calculate overall win probability
    const winProbability = this.calculateWinProbability(
      dispute,
      charge,
      ce3Eligibility,
      evidence
    );
    
    return {
      disputeId: dispute.id,
      merchantId,
      ce3Eligible: ce3Eligibility.eligible,
      winProbability,
      evidence,
      supportingDocuments,
      narrative,
      estimatedFields,
      submissionReady: this.isSubmissionReady(evidence, dispute.reason),
      fraudWarning: false
    };
  }

  private async buildEvidenceByReason(
    dispute: Stripe.Dispute,
    charge: Stripe.Charge,
    ce3Eligibility: any
  ): Promise<Stripe.DisputeUpdateParams.Evidence> {
    const baseEvidence: Stripe.DisputeUpdateParams.Evidence = {
      // Always include these if available
      customer_name: charge.billing_details?.name || undefined,
      customer_email_address: charge.billing_details?.email || undefined,
      billing_address: this.formatAddress(charge.billing_details?.address),
      receipt: charge.receipt_url || undefined,
      
      // Transaction details
      product_description: charge.description || 'Product/Service as described',
      
      // Add CE3.0 evidence if eligible
      ...(ce3Eligibility.eligible && ce3Eligibility.evidenceBundle ? {
        uncategorized_text: ce3Eligibility.evidenceBundle.narrative,
        customer_communication: this.formatCE3Evidence(ce3Eligibility.evidenceBundle)
      } : {})
    };

    // Add reason-specific evidence
    switch (dispute.reason) {
      case 'fraudulent':
        return this.buildFraudulentEvidence(baseEvidence, charge, ce3Eligibility);
      
      case 'product_not_received':
        return this.buildProductNotReceivedEvidence(baseEvidence, charge);
      
      case 'product_unacceptable':
        return this.buildProductUnacceptableEvidence(baseEvidence, charge);
      
      case 'subscription_canceled':
        return this.buildSubscriptionCanceledEvidence(baseEvidence, charge);
      
      case 'duplicate':
        return this.buildDuplicateEvidence(baseEvidence, charge);
      
      case 'credit_not_processed':
        return this.buildCreditNotProcessedEvidence(baseEvidence, charge);
      
      default:
        return this.buildGeneralEvidence(baseEvidence, charge);
    }
  }

  private buildFraudulentEvidence(
    baseEvidence: Stripe.DisputeUpdateParams.Evidence,
    charge: Stripe.Charge,
    ce3Eligibility: any
  ): Stripe.DisputeUpdateParams.Evidence {
    const evidence = { ...baseEvidence };
    
    // Add authentication evidence
    const outcome = charge.outcome as any;
    if (outcome) {
      const authDetails: string[] = [];
      
      if (outcome.network_status === 'approved_by_network') {
        authDetails.push('Transaction was approved by the card network');
      }
      
      if (outcome.risk_level) {
        authDetails.push(`Risk assessment: ${outcome.risk_level}`);
      }
      
      if (outcome.seller_message) {
        authDetails.push(`Authorization: ${outcome.seller_message}`);
      }
      
      // Add 3D Secure info if available
      if ((charge as any).payment_method_details?.card?.three_d_secure) {
        const threeDSecure = (charge as any).payment_method_details.card.three_d_secure;
        authDetails.push(`3D Secure: ${threeDSecure.authenticated ? 'Authenticated' : 'Attempted'}`);
      }
      
      if (authDetails.length > 0) {
        evidence.uncategorized_text = (evidence.uncategorized_text || '') + 
          '\n\nAuthentication Details:\n' + authDetails.join('\n');
      }
    }
    
    // Add AVS/CVC results
    const paymentDetails = (charge as any).payment_method_details?.card;
    if (paymentDetails) {
      const verificationDetails: string[] = [];
      
      if (paymentDetails.checks?.address_line1_check) {
        verificationDetails.push(`AVS Line 1: ${paymentDetails.checks.address_line1_check}`);
      }
      
      if (paymentDetails.checks?.address_postal_code_check) {
        verificationDetails.push(`AVS Postal: ${paymentDetails.checks.address_postal_code_check}`);
      }
      
      if (paymentDetails.checks?.cvc_check) {
        verificationDetails.push(`CVC: ${paymentDetails.checks.cvc_check}`);
      }
      
      if (verificationDetails.length > 0) {
        evidence.uncategorized_text = (evidence.uncategorized_text || '') + 
          '\n\nVerification Results:\n' + verificationDetails.join('\n');
      }
    }
    
    // Add IP/device information if available
    const ipAddress = charge.metadata?.ip_address || (outcome?.risk_details as any)?.ip_address;
    if (ipAddress) {
      evidence.customer_purchase_ip = ipAddress;
    }
    
    return evidence;
  }

  private buildProductNotReceivedEvidence(
    baseEvidence: Stripe.DisputeUpdateParams.Evidence,
    charge: Stripe.Charge
  ): Stripe.DisputeUpdateParams.Evidence {
    const evidence = { ...baseEvidence };
    
    // Add shipping information
    if (charge.shipping) {
      evidence.shipping_address = this.formatAddress(charge.shipping.address);
      evidence.shipping_carrier = charge.shipping.carrier || undefined;
      evidence.shipping_tracking_number = charge.shipping.tracking_number || undefined;
      
      // If no tracking, add estimated delivery
      if (!charge.shipping.tracking_number) {
        const estimatedDelivery = this.estimateDeliveryDate(charge);
        evidence.shipping_date = estimatedDelivery.shippingDate;
        evidence.shipping_documentation = estimatedDelivery.documentation;
        
        // Mark as estimated in uncategorized text
        evidence.uncategorized_text = (evidence.uncategorized_text || '') +
          `\n\nESTIMATED DELIVERY: ${estimatedDelivery.estimatedDate}\n` +
          `Based on shipping method and distance. No tracking number available.\n` +
          `Confidence: ${estimatedDelivery.confidence}`;
      }
    }
    
    return evidence;
  }

  private buildProductUnacceptableEvidence(
    baseEvidence: Stripe.DisputeUpdateParams.Evidence,
    charge: Stripe.Charge
  ): Stripe.DisputeUpdateParams.Evidence {
    const evidence = { ...baseEvidence };
    
    // Add product details and policies
    evidence.uncategorized_text = (evidence.uncategorized_text || '') +
      '\n\nProduct Quality Assurance:\n' +
      '- All products undergo quality control before shipping\n' +
      '- Clear product descriptions and images provided at purchase\n' +
      '- Return policy clearly stated at checkout\n' +
      '- Customer did not contact us about quality issues before dispute';
    
    // Add any quality certifications or warranties
    evidence.refund_policy = 'Our refund policy allows returns within 30 days if customer contacts us directly.';
    
    return evidence;
  }

  private buildSubscriptionCanceledEvidence(
    baseEvidence: Stripe.DisputeUpdateParams.Evidence,
    charge: Stripe.Charge
  ): Stripe.DisputeUpdateParams.Evidence {
    const evidence = { ...baseEvidence };
    
    // Add subscription details
    const subscriptionId = charge.metadata?.subscription_id || (charge as any).subscription;
    
    evidence.cancellation_policy = 'Subscription cancellations must be completed before the billing cycle to avoid charges.';
    
    evidence.uncategorized_text = (evidence.uncategorized_text || '') +
      '\n\nSubscription Details:\n' +
      `- Subscription ID: ${subscriptionId || 'N/A'}\n` +
      `- Billing cycle: Monthly\n` +
      `- Service was available and accessible during the billing period\n` +
      `- No cancellation request was received before this billing cycle`;
    
    // Add usage data if available
    if (charge.metadata?.last_login || charge.metadata?.usage_count) {
      evidence.service_date = charge.metadata.last_login || 
        new Date(charge.created * 1000).toISOString().split('T')[0];
      evidence.uncategorized_text += `\n- Last service usage: ${charge.metadata.last_login || 'Active during billing period'}`;
    }
    
    return evidence;
  }

  private buildDuplicateEvidence(
    baseEvidence: Stripe.DisputeUpdateParams.Evidence,
    charge: Stripe.Charge
  ): Stripe.DisputeUpdateParams.Evidence {
    const evidence = { ...baseEvidence };
    
    evidence.duplicate_charge_explanation = 'Each charge represents a separate, legitimate transaction for distinct products/services.';
    evidence.duplicate_charge_id = charge.metadata?.related_charge || undefined;
    
    evidence.uncategorized_text = (evidence.uncategorized_text || '') +
      '\n\nTransaction Verification:\n' +
      '- Each charge has a unique order ID and timestamp\n' +
      '- Different products/services were provided for each charge\n' +
      '- Authorization was obtained separately for each transaction';
    
    return evidence;
  }

  private buildCreditNotProcessedEvidence(
    baseEvidence: Stripe.DisputeUpdateParams.Evidence,
    charge: Stripe.Charge
  ): Stripe.DisputeUpdateParams.Evidence {
    const evidence = { ...baseEvidence };
    
    // Check for refunds
    if (charge.refunded) {
      evidence.refund_policy = 'Refund has been processed.';
      evidence.refund_refusal_explanation = `Refund was issued on ${new Date((charge as any).refunds?.data[0]?.created * 1000).toLocaleDateString()}`;
    } else {
      evidence.refund_policy = 'Our standard refund policy requires customer to contact us directly for processing.';
      evidence.refund_refusal_explanation = 'No refund request was received through proper channels before this dispute.';
    }
    
    return evidence;
  }

  private buildGeneralEvidence(
    baseEvidence: Stripe.DisputeUpdateParams.Evidence,
    charge: Stripe.Charge
  ): Stripe.DisputeUpdateParams.Evidence {
    const evidence = { ...baseEvidence };
    
    // Add any available general evidence
    evidence.uncategorized_text = (evidence.uncategorized_text || '') +
      '\n\nTransaction Summary:\n' +
      `- Charge ID: ${charge.id}\n` +
      `- Amount: ${(charge.amount / 100).toFixed(2)} ${charge.currency.toUpperCase()}\n` +
      `- Date: ${new Date(charge.created * 1000).toLocaleDateString()}\n` +
      `- Status: ${charge.status}\n` +
      `- Payment was authorized and successfully processed`;
    
    return evidence;
  }

  private formatAddress(address: any): string | undefined {
    if (!address) return undefined;
    
    const parts = [
      address.line1,
      address.line2,
      address.city,
      address.state,
      address.postal_code,
      address.country
    ].filter(Boolean);
    
    return parts.length > 0 ? parts.join(', ') : undefined;
  }

  private formatCE3Evidence(bundle: any): string {
    return `CE3.0 Evidence - Prior Transactions:
1. ${bundle.priorTransaction1.chargeId} on ${bundle.priorTransaction1.date.toLocaleDateString()}
2. ${bundle.priorTransaction2.chargeId} on ${bundle.priorTransaction2.date.toLocaleDateString()}

Matching Elements: ${Object.entries(bundle.matchedData)
  .filter(([_, matches]) => matches)
  .map(([key]) => key.replace(/_/g, ' '))
  .join(', ')}`;
  }

  private estimateDeliveryDate(charge: Stripe.Charge): {
    shippingDate: string;
    estimatedDate: string;
    documentation: string;
    confidence: string;
  } {
    const orderDate = new Date(charge.created * 1000);
    const shippingDate = new Date(orderDate);
    shippingDate.setDate(shippingDate.getDate() + 1); // Next day shipping
    
    const estimatedDelivery = new Date(shippingDate);
    const shippingMethod = charge.shipping?.carrier || 'standard';
    
    // Estimate based on shipping method
    switch (shippingMethod.toLowerCase()) {
      case 'overnight':
      case 'express':
        estimatedDelivery.setDate(estimatedDelivery.getDate() + 1);
        break;
      case 'priority':
        estimatedDelivery.setDate(estimatedDelivery.getDate() + 3);
        break;
      default:
        estimatedDelivery.setDate(estimatedDelivery.getDate() + 5);
    }
    
    return {
      shippingDate: shippingDate.toISOString().split('T')[0],
      estimatedDate: estimatedDelivery.toISOString().split('T')[0],
      documentation: `ESTIMATED - Based on ${shippingMethod} shipping method`,
      confidence: 'Medium'
    };
  }

  private async collectSupportingDocuments(
    dispute: Stripe.Dispute,
    charge: Stripe.Charge
  ): Promise<SupportingDocument[]> {
    const documents: SupportingDocument[] = [];
    
    // Add receipt if available
    if (charge.receipt_url) {
      documents.push({
        type: 'receipt',
        description: 'Transaction receipt',
        url: charge.receipt_url
      });
    }
    
    // Add terms of service
    documents.push({
      type: 'policy',
      description: 'Terms of Service accepted at checkout',
      content: 'Customer agreed to our terms of service which includes our refund and dispute policies.'
    });
    
    // Add any metadata documents
    if (charge.metadata?.invoice_url) {
      documents.push({
        type: 'receipt',
        description: 'Invoice',
        url: charge.metadata.invoice_url
      });
    }
    
    return documents;
  }

  private identifyEstimatedFields(
    evidence: Stripe.DisputeUpdateParams.Evidence
  ): EstimatedField[] {
    const estimatedFields: EstimatedField[] = [];
    
    // Check for estimated shipping date
    if (evidence.shipping_documentation?.includes('ESTIMATED')) {
      estimatedFields.push({
        field: 'shipping_date',
        value: evidence.shipping_date,
        disclaimer: 'Estimated based on shipping method and distance',
        confidence: 'medium'
      });
    }
    
    // Check for estimated IP location
    if (evidence.customer_purchase_ip?.includes('estimated')) {
      estimatedFields.push({
        field: 'customer_purchase_ip',
        value: evidence.customer_purchase_ip,
        disclaimer: 'Estimated based on billing address region',
        confidence: 'low'
      });
    }
    
    return estimatedFields;
  }

  private calculateWinProbability(
    dispute: Stripe.Dispute,
    charge: Stripe.Charge,
    ce3Eligibility: any,
    evidence: Stripe.DisputeUpdateParams.Evidence
  ): number {
    let probability = 0.4; // Base probability
    
    // CE3.0 eligibility is huge boost
    if (ce3Eligibility.eligible) {
      probability = 0.95;
      return probability;
    }
    
    // Factors that increase win probability
    const factors = {
      hasReceipt: !!evidence.receipt ? 0.1 : 0,
      hasShipping: !!evidence.shipping_tracking_number ? 0.15 : 0,
      hasCustomerComm: !!evidence.customer_communication ? 0.1 : 0,
      hasAVSMatch: charge.outcome?.network_status === 'approved_by_network' ? 0.1 : 0,
      has3DSecure: !!(charge as any).payment_method_details?.card?.three_d_secure ? 0.15 : 0,
      isLowAmount: charge.amount < 10000 ? 0.05 : 0, // Under $100
      hasRefundPolicy: !!evidence.refund_policy ? 0.05 : 0
    };
    
    // Reason-specific adjustments
    const reasonMultipliers: Record<string, number> = {
      'fraudulent': ce3Eligibility.confidence > 50 ? 1.2 : 0.8,
      'product_not_received': evidence.shipping_tracking_number ? 1.3 : 0.7,
      'subscription_canceled': 1.1,
      'duplicate': 1.2,
      'credit_not_processed': charge.refunded ? 1.5 : 0.9
    };
    
    // Calculate total
    Object.values(factors).forEach(factor => probability += factor);
    
    if (reasonMultipliers[dispute.reason]) {
      probability *= reasonMultipliers[dispute.reason];
    }
    
    // Cap at 0.95 (never 100% certain unless CE3.0)
    return Math.min(probability, 0.95);
  }

  private generateNarrative(
    dispute: Stripe.Dispute,
    charge: Stripe.Charge,
    ce3Eligibility: any
  ): string {
    let narrative = `Response to dispute ${dispute.id} for charge ${charge.id}:\n\n`;
    
    // CE3.0 narrative takes precedence
    if (ce3Eligibility.eligible && ce3Eligibility.evidenceBundle) {
      return ce3Eligibility.evidenceBundle.narrative;
    }
    
    // Build reason-specific narrative
    switch (dispute.reason) {
      case 'fraudulent':
        narrative += this.generateFraudNarrative(charge);
        break;
      case 'product_not_received':
        narrative += this.generateNotReceivedNarrative(charge);
        break;
      case 'subscription_canceled':
        narrative += this.generateSubscriptionNarrative(charge);
        break;
      default:
        narrative += this.generateDefaultNarrative(charge);
    }
    
    return narrative;
  }

  private generateFraudNarrative(charge: Stripe.Charge): string {
    return `This transaction was properly authorized by the legitimate cardholder. ` +
      `The payment was approved by the card network with all security checks passing. ` +
      `${charge.outcome?.risk_level ? `Risk assessment: ${charge.outcome.risk_level}. ` : ''}` +
      `The billing address provided matched the card on file. ` +
      `We have no reason to believe this was an unauthorized transaction.`;
  }

  private generateNotReceivedNarrative(charge: Stripe.Charge): string {
    if (charge.shipping?.tracking_number) {
      return `The order was shipped on schedule with tracking number ${charge.shipping.tracking_number}. ` +
        `The package was delivered to the address provided by the customer. ` +
        `No delivery issues were reported to us before this dispute was filed.`;
    }
    
    return `The order was fulfilled and shipped to the customer's provided address. ` +
      `Based on our standard shipping times, the package should have arrived within 3-5 business days. ` +
      `The customer did not contact us about any delivery issues before filing this dispute.`;
  }

  private generateSubscriptionNarrative(charge: Stripe.Charge): string {
    return `This charge is for a valid subscription period during which the service was available and accessible. ` +
      `The customer did not request cancellation before the billing cycle began. ` +
      `Our cancellation policy is clearly stated and requires action before the renewal date to avoid charges. ` +
      `The service was provided as agreed during the entire billing period.`;
  }

  private generateDefaultNarrative(charge: Stripe.Charge): string {
    return `This transaction was properly authorized and the product/service was provided as described. ` +
      `The charge amount of ${(charge.amount / 100).toFixed(2)} ${charge.currency.toUpperCase()} matches the agreed price. ` +
      `We have fulfilled our obligations and the charge is valid.`;
  }

  private isSubmissionReady(
    evidence: Stripe.DisputeUpdateParams.Evidence,
    reason: string
  ): boolean {
    // Check required fields based on reason
    const requiredByReason: Record<string, string[]> = {
      'fraudulent': ['customer_name', 'receipt'],
      'product_not_received': ['shipping_address', 'shipping_date'],
      'product_unacceptable': ['product_description', 'refund_policy'],
      'subscription_canceled': ['cancellation_policy', 'service_date'],
      'duplicate': ['duplicate_charge_explanation'],
      'credit_not_processed': ['refund_policy']
    };
    
    const required = requiredByReason[reason] || ['customer_name', 'receipt'];
    
    return required.every(field => 
      evidence[field as keyof Stripe.DisputeUpdateParams.Evidence] !== undefined
    );
  }
}