import Stripe from 'stripe';

interface CE3Criteria {
  eligible: boolean;
  confidence: number;
  autoWinProbability: number;
  matchedElements: string[];
  priorTransactions: Stripe.Charge[];
  evidenceBundle?: CE3EvidenceBundle;
}

interface CE3EvidenceBundle {
  disputeId: string;
  priorTransaction1: TransactionEvidence;
  priorTransaction2: TransactionEvidence;
  matchedData: {
    ipAddress?: boolean;
    deviceFingerprint?: boolean;
    shippingAddress?: boolean;
    customerEmail?: boolean;
  };
  narrative: string;
}

interface TransactionEvidence {
  chargeId: string;
  date: Date;
  amount: number;
  ipAddress?: string;
  deviceId?: string;
  shippingAddress?: string;
  customerEmail?: string;
}

export class CE3Detector {
  private stripe: Stripe;
  
  constructor(stripeSecretKey: string) {
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-07-30.basil',
    });
  }

  /**
   * Detect CE3.0 eligibility for a dispute
   * Visa CE3.0 requires:
   * - 2 prior undisputed transactions (120-365 days old)
   * - Matching IP OR device fingerprint
   * - Plus one other matching element (shipping, email)
   */
  async detectEligibility(
    dispute: Stripe.Dispute,
    stripeAccountId?: string
  ): Promise<CE3Criteria> {
    try {
      // Get the disputed charge details
      const charge = await this.getCharge(dispute.charge as string, stripeAccountId);
      
      // Get customer's transaction history
      const priorCharges = await this.getPriorTransactions(
        charge,
        dispute.created,
        stripeAccountId
      );
      
      // Check CE3.0 criteria
      const eligibility = this.evaluateCE3Criteria(charge, priorCharges, dispute);
      
      // If eligible, compile evidence bundle
      if (eligibility.eligible) {
        eligibility.evidenceBundle = await this.compileEvidenceBundle(
          dispute,
          charge,
          eligibility.priorTransactions
        );
      }
      
      return eligibility;
    } catch (error) {
      console.error('CE3.0 detection error:', error);
      return {
        eligible: false,
        confidence: 0,
        autoWinProbability: 0,
        matchedElements: [],
        priorTransactions: []
      };
    }
  }

  private async getCharge(
    chargeId: string,
    stripeAccountId?: string
  ): Promise<Stripe.Charge> {
    return await this.stripe.charges.retrieve(
      chargeId,
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );
  }

  private async getPriorTransactions(
    currentCharge: Stripe.Charge,
    disputeCreated: number,
    stripeAccountId?: string
  ): Promise<Stripe.Charge[]> {
    const minDate = disputeCreated - (365 * 24 * 60 * 60); // 365 days ago
    const maxDate = disputeCreated - (120 * 24 * 60 * 60); // 120 days ago
    
    // Get charges for the same customer
    const customerId = currentCharge.customer as string;
    if (!customerId) return [];
    
    const charges = await this.stripe.charges.list(
      {
        customer: customerId,
        created: {
          gte: minDate,
          lte: maxDate
        },
        limit: 100
      },
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );
    
    // Filter out disputed charges
    return charges.data.filter(charge => 
      !charge.disputed && 
      charge.status === 'succeeded' &&
      charge.id !== currentCharge.id
    );
  }

  private evaluateCE3Criteria(
    disputedCharge: Stripe.Charge,
    priorCharges: Stripe.Charge[],
    dispute: Stripe.Dispute
  ): CE3Criteria {
    // Need at least 2 prior transactions
    if (priorCharges.length < 2) {
      return {
        eligible: false,
        confidence: 0,
        autoWinProbability: 0,
        matchedElements: [],
        priorTransactions: []
      };
    }
    
    // Sort by date and take the most recent qualifying transactions
    const sortedPriors = priorCharges
      .sort((a, b) => b.created - a.created)
      .slice(0, 10); // Check up to 10 most recent
    
    // Find best matching pair
    let bestMatch: CE3Criteria | null = null;
    
    for (let i = 0; i < sortedPriors.length - 1; i++) {
      for (let j = i + 1; j < sortedPriors.length; j++) {
        const match = this.checkTransactionMatch(
          disputedCharge,
          [sortedPriors[i], sortedPriors[j]]
        );
        
        if (match.eligible && (!bestMatch || match.confidence > bestMatch.confidence)) {
          bestMatch = {
            ...match,
            priorTransactions: [sortedPriors[i], sortedPriors[j]]
          };
        }
      }
    }
    
    return bestMatch || {
      eligible: false,
      confidence: 0,
      autoWinProbability: 0,
      matchedElements: [],
      priorTransactions: []
    };
  }

  private checkTransactionMatch(
    disputedCharge: Stripe.Charge,
    priorCharges: Stripe.Charge[]
  ): CE3Criteria {
    const matchedElements: string[] = [];
    let hasIPOrDevice = false;
    let additionalMatches = 0;
    
    // Check IP address match (from metadata or Stripe Radar)
    const disputedIP = this.extractIPAddress(disputedCharge);
    const prior1IP = this.extractIPAddress(priorCharges[0]);
    const prior2IP = this.extractIPAddress(priorCharges[1]);
    
    if (disputedIP && prior1IP && prior2IP &&
        disputedIP === prior1IP && disputedIP === prior2IP) {
      matchedElements.push('ip_address');
      hasIPOrDevice = true;
    }
    
    // Check device fingerprint match (from metadata or Stripe Radar)
    const disputedDevice = this.extractDeviceFingerprint(disputedCharge);
    const prior1Device = this.extractDeviceFingerprint(priorCharges[0]);
    const prior2Device = this.extractDeviceFingerprint(priorCharges[1]);
    
    if (disputedDevice && prior1Device && prior2Device &&
        disputedDevice === prior1Device && disputedDevice === prior2Device) {
      matchedElements.push('device_fingerprint');
      hasIPOrDevice = true;
    }
    
    // Check shipping address match
    if (this.shippingAddressMatches(disputedCharge, priorCharges)) {
      matchedElements.push('shipping_address');
      additionalMatches++;
    }
    
    // Check customer email match
    if (this.customerEmailMatches(disputedCharge, priorCharges)) {
      matchedElements.push('customer_email');
      additionalMatches++;
    }
    
    // CE3.0 requires IP OR device match PLUS at least one other element
    const eligible = hasIPOrDevice && additionalMatches >= 1;
    
    return {
      eligible,
      confidence: eligible ? 100 : (matchedElements.length * 25),
      autoWinProbability: eligible ? 0.95 : 0.3,
      matchedElements,
      priorTransactions: priorCharges
    };
  }

  private extractIPAddress(charge: Stripe.Charge): string | null {
    // Check multiple possible locations for IP
    const metadata = charge.metadata || {};
    const outcome = charge.outcome as any;
    
    return metadata.ip_address || 
           metadata.customer_ip ||
           outcome?.risk_details?.ip_address ||
           null;
  }

  private extractDeviceFingerprint(charge: Stripe.Charge): string | null {
    // Check for device fingerprint in metadata or Radar data
    const metadata = charge.metadata || {};
    const outcome = charge.outcome as any;
    
    return metadata.device_id || 
           metadata.device_fingerprint ||
           outcome?.risk_details?.device_id ||
           null;
  }

  private shippingAddressMatches(
    disputedCharge: Stripe.Charge,
    priorCharges: Stripe.Charge[]
  ): boolean {
    const disputedAddr = this.normalizeAddress(disputedCharge.shipping?.address);
    if (!disputedAddr) return false;
    
    const prior1Addr = this.normalizeAddress(priorCharges[0].shipping?.address);
    const prior2Addr = this.normalizeAddress(priorCharges[1].shipping?.address);
    
    return disputedAddr === prior1Addr && disputedAddr === prior2Addr;
  }

  private customerEmailMatches(
    disputedCharge: Stripe.Charge,
    priorCharges: Stripe.Charge[]
  ): boolean {
    const disputedEmail = disputedCharge.billing_details?.email?.toLowerCase();
    if (!disputedEmail) return false;
    
    const prior1Email = priorCharges[0].billing_details?.email?.toLowerCase();
    const prior2Email = priorCharges[1].billing_details?.email?.toLowerCase();
    
    return disputedEmail === prior1Email && disputedEmail === prior2Email;
  }

  private normalizeAddress(address: any): string | null {
    if (!address) return null;
    
    // Create normalized string for comparison
    const parts = [
      address.line1,
      address.city,
      address.state,
      address.postal_code,
      address.country
    ].filter(Boolean);
    
    return parts.length > 0 ? parts.join('|').toLowerCase() : null;
  }

  private async compileEvidenceBundle(
    dispute: Stripe.Dispute,
    disputedCharge: Stripe.Charge,
    priorTransactions: Stripe.Charge[]
  ): Promise<CE3EvidenceBundle> {
    const narrative = this.generateCE3Narrative(
      disputedCharge,
      priorTransactions,
      dispute
    );
    
    return {
      disputeId: dispute.id,
      priorTransaction1: this.extractTransactionEvidence(priorTransactions[0]),
      priorTransaction2: this.extractTransactionEvidence(priorTransactions[1]),
      matchedData: {
        ipAddress: this.extractIPAddress(disputedCharge) === this.extractIPAddress(priorTransactions[0]),
        deviceFingerprint: this.extractDeviceFingerprint(disputedCharge) === this.extractDeviceFingerprint(priorTransactions[0]),
        shippingAddress: this.shippingAddressMatches(disputedCharge, priorTransactions),
        customerEmail: this.customerEmailMatches(disputedCharge, priorTransactions)
      },
      narrative
    };
  }

  private extractTransactionEvidence(charge: Stripe.Charge): TransactionEvidence {
    return {
      chargeId: charge.id,
      date: new Date(charge.created * 1000),
      amount: charge.amount,
      ipAddress: this.extractIPAddress(charge) || undefined,
      deviceId: this.extractDeviceFingerprint(charge) || undefined,
      shippingAddress: this.normalizeAddress(charge.shipping?.address) || undefined,
      customerEmail: charge.billing_details?.email || undefined
    };
  }

  private generateCE3Narrative(
    disputedCharge: Stripe.Charge,
    priorTransactions: Stripe.Charge[],
    dispute: Stripe.Dispute
  ): string {
    const prior1Date = new Date(priorTransactions[0].created * 1000).toLocaleDateString();
    const prior2Date = new Date(priorTransactions[1].created * 1000).toLocaleDateString();
    const disputeDate = new Date(disputedCharge.created * 1000).toLocaleDateString();
    
    return `This dispute qualifies for Visa Compelling Evidence 3.0 (CE3.0) as the cardholder has an established transaction history with our business.

Prior Transaction 1: ${prior1Date} - Amount: $${(priorTransactions[0].amount / 100).toFixed(2)} - Charge ID: ${priorTransactions[0].id}
Prior Transaction 2: ${prior2Date} - Amount: $${(priorTransactions[1].amount / 100).toFixed(2)} - Charge ID: ${priorTransactions[1].id}
Disputed Transaction: ${disputeDate} - Amount: $${(disputedCharge.amount / 100).toFixed(2)} - Charge ID: ${disputedCharge.id}

All three transactions share the same device fingerprint and/or IP address, along with matching customer information, demonstrating that the cardholder participated in and authorized these transactions. The two prior transactions were not disputed and occurred within the 120-365 day window required by CE3.0 guidelines.

This evidence conclusively demonstrates that the disputed transaction was authorized by the legitimate cardholder, consistent with their established pattern of purchases from our business.`;
  }

  /**
   * Submit CE3.0 evidence to Stripe
   */
  async submitCE3Evidence(
    disputeId: string,
    evidenceBundle: CE3EvidenceBundle,
    stripeAccountId?: string
  ): Promise<Stripe.Dispute> {
    const evidence: Stripe.DisputeUpdateParams.Evidence = {
      uncategorized_text: evidenceBundle.narrative,
      customer_communication: `CE3.0 Qualifying Transactions:
Transaction 1: ${evidenceBundle.priorTransaction1.chargeId} on ${evidenceBundle.priorTransaction1.date.toLocaleDateString()}
Transaction 2: ${evidenceBundle.priorTransaction2.chargeId} on ${evidenceBundle.priorTransaction2.date.toLocaleDateString()}`,
      
      // Add any additional evidence fields as needed
      customer_email_address: evidenceBundle.priorTransaction1.customerEmail,
      shipping_address: evidenceBundle.priorTransaction1.shippingAddress
    };
    
    return await this.stripe.disputes.update(
      disputeId,
      { 
        evidence,
        submit: false // Stage evidence first, can be submitted later
      },
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );
  }
}