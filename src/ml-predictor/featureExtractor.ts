import Stripe from 'stripe';

export interface DisputeFeatures {
  basic: BasicFeatures;
  payment: PaymentFeatures;
  customer: CustomerFeatures;
  merchant: MerchantFeatures;
  behavioral: BehavioralFeatures;
  temporal: TemporalFeatures;
  evidence: EvidenceFeatures;
}

export interface BasicFeatures {
  disputeId: string;
  reason: string;
  reasonCode: number;
  amount: number;
  currency: string;
  status: string;
  network: string;
}

export interface PaymentFeatures {
  avsCheck: string | null;
  cvcCheck: string | null;
  threeDSecure: boolean;
  cardBrand: string | null;
  cardFunding: string | null;
  cardCountry: string | null;
  cardFingerprint: string | null;
  paymentMethod: string;
  statementDescriptor: string | null;
  riskLevel: string | null;
  riskScore: number | null;
  declineCode: string | null;
}

export interface CustomerFeatures {
  customerId: string | null;
  customerEmail: string | null;
  emailDomain: string | null;
  emailRisk: 'low' | 'medium' | 'high';
  customerName: string | null;
  customerPhone: string | null;
  customerCreated: Date | null;
  customerAge: number;
  previousCharges: number;
  previousDisputes: number;
  totalSpent: number;
  averageOrderValue: number;
  daysSinceLastOrder: number;
}

export interface MerchantFeatures {
  merchantId: string;
  merchantCategory: string;
  merchantCountry: string;
  averageTicketSize: number;
  monthlyVolume: number;
  disputeRate: number;
  winRate: number;
  averageResponseTime: number;
}

export interface BehavioralFeatures {
  ipAddress: string | null;
  ipCountry: string | null;
  ipRisk: 'low' | 'medium' | 'high';
  deviceFingerprint: string | null;
  userAgent: string | null;
  browserLanguage: string | null;
  sessionDuration: number;
  pageViews: number;
  repeatVisitor: boolean;
  referralSource: string | null;
}

export interface TemporalFeatures {
  chargeDate: Date;
  disputeDate: Date;
  daysBetweenChargeAndDispute: number;
  hourOfDay: number;
  dayOfWeek: number;
  isWeekend: boolean;
  isHoliday: boolean;
  isEndOfMonth: boolean;
  seasonality: 'spring' | 'summer' | 'fall' | 'winter';
}

export interface EvidenceFeatures {
  hasReceipt: boolean;
  hasCustomerCommunication: boolean;
  hasShippingDoc: boolean;
  hasServiceDoc: boolean;
  hasSignature: boolean;
  hasRefundPolicy: boolean;
  hasCancellationPolicy: boolean;
  hasProductDescription: boolean;
  evidenceCount: number;
  evidenceQualityScore: number;
  submissionCount: number;
  daysUntilDue: number;
}

export class FeatureExtractor {
  private stripe: Stripe;
  private cache: Map<string, any>;
  private stripeAccount?: string;

  constructor(stripeSecretKey: string, stripeAccount?: string) {
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-07-30.basil',
    });
    this.cache = new Map();
    this.stripeAccount = stripeAccount;
  }
  
  async extractAllFeatures(
    dispute: Stripe.Dispute,
    charge?: Stripe.Charge,
    paymentIntent?: Stripe.PaymentIntent
  ): Promise<DisputeFeatures> {
    if (!charge && dispute.charge) {
      charge = await this.getCharge(dispute.charge as string);
    }
    
    if (!paymentIntent && dispute.payment_intent) {
      paymentIntent = await this.getPaymentIntent(dispute.payment_intent as string);
    }
    
    const [basic, payment, customer, merchant, behavioral, temporal, evidence] = await Promise.all([
      this.extractBasicFeatures(dispute),
      this.extractPaymentFeatures(dispute, charge),
      this.extractCustomerFeatures(dispute, charge),
      this.extractMerchantFeatures(dispute),
      this.extractBehavioralFeatures(dispute, charge, paymentIntent),
      this.extractTemporalFeatures(dispute, charge),
      this.extractEvidenceFeatures(dispute)
    ]);
    
    return {
      basic,
      payment,
      customer,
      merchant,
      behavioral,
      temporal,
      evidence
    };
  }
  
  private async getCharge(chargeId: string): Promise<Stripe.Charge | undefined> {
    const cacheKey = `charge:${chargeId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const charge = this.stripeAccount
        ? await this.stripe.charges.retrieve(chargeId, undefined, { stripeAccount: this.stripeAccount })
        : await this.stripe.charges.retrieve(chargeId);
      this.cache.set(cacheKey, charge);
      return charge;
    } catch (error) {
      console.error(`Failed to retrieve charge ${chargeId}:`, error);
      return undefined;
    }
  }

  private async getPaymentIntent(piId: string): Promise<Stripe.PaymentIntent | undefined> {
    const cacheKey = `pi:${piId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const pi = this.stripeAccount
        ? await this.stripe.paymentIntents.retrieve(piId, undefined, { stripeAccount: this.stripeAccount })
        : await this.stripe.paymentIntents.retrieve(piId);
      this.cache.set(cacheKey, pi);
      return pi;
    } catch (error) {
      console.error(`Failed to retrieve payment intent ${piId}:`, error);
      return undefined;
    }
  }
  
  private extractBasicFeatures(dispute: Stripe.Dispute): BasicFeatures {
    return {
      disputeId: dispute.id,
      reason: dispute.reason,
      reasonCode: this.encodeReason(dispute.reason),
      amount: dispute.amount,
      currency: dispute.currency,
      status: dispute.status,
      network: dispute.network_reason_code || 'unknown'
    };
  }
  
  private extractPaymentFeatures(dispute: Stripe.Dispute, charge?: Stripe.Charge): PaymentFeatures {
    const card = charge?.payment_method_details?.card;
    const outcome = charge?.outcome;
    
    return {
      avsCheck: card?.checks?.address_line1_check || null,
      cvcCheck: card?.checks?.cvc_check || null,
      threeDSecure: (card?.three_d_secure as any)?.authenticated || false,
      cardBrand: card?.brand || null,
      cardFunding: card?.funding || null,
      cardCountry: card?.country || null,
      cardFingerprint: card?.fingerprint || null,
      paymentMethod: charge?.payment_method_details?.type || 'unknown',
      statementDescriptor: charge?.statement_descriptor || null,
      riskLevel: outcome?.risk_level || null,
      riskScore: outcome?.risk_score || null,
      declineCode: outcome?.reason || null
    };
  }
  
  private async extractCustomerFeatures(dispute: Stripe.Dispute, charge?: Stripe.Charge): Promise<CustomerFeatures> {
    let customer: Stripe.Customer | null = null;
    let customerCharges: Stripe.Charge[] = [];
    
    if (charge?.customer) {
      try {
        customer = await this.stripe.customers.retrieve(charge.customer as string) as Stripe.Customer;
        const chargesList = await this.stripe.charges.list({
          customer: charge.customer as string,
          limit: 100
        });
        customerCharges = chargesList.data;
      } catch (error) {
        console.error('Failed to get customer data:', error);
      }
    }
    
    const email = charge?.billing_details?.email || customer?.email || null;
    const emailDomain = email ? email.split('@')[1] : null;
    
    const previousDisputes = customerCharges.filter(c => c.disputed).length;
    const totalSpent = customerCharges.reduce((sum, c) => sum + c.amount, 0);
    const averageOrderValue = customerCharges.length > 0 ? totalSpent / customerCharges.length : 0;
    
    const lastOrderDate = customerCharges
      .filter(c => c.id !== charge?.id)
      .sort((a, b) => b.created - a.created)[0]?.created;
    
    const daysSinceLastOrder = lastOrderDate 
      ? Math.floor((Date.now() / 1000 - lastOrderDate) / 86400)
      : 999;
    
    return {
      customerId: charge?.customer as string || null,
      customerEmail: email,
      emailDomain: emailDomain,
      emailRisk: this.assessEmailRisk(emailDomain),
      customerName: charge?.billing_details?.name || customer?.name || null,
      customerPhone: charge?.billing_details?.phone || customer?.phone || null,
      customerCreated: customer?.created ? new Date(customer.created * 1000) : null,
      customerAge: customer?.created ? Math.floor((Date.now() / 1000 - customer.created) / 86400) : 0,
      previousCharges: customerCharges.length,
      previousDisputes: previousDisputes,
      totalSpent: totalSpent,
      averageOrderValue: averageOrderValue,
      daysSinceLastOrder: daysSinceLastOrder
    };
  }
  
  private extractMerchantFeatures(dispute: Stripe.Dispute): MerchantFeatures {
    return {
      merchantId: 'default',
      merchantCategory: 'general',
      merchantCountry: 'US',
      averageTicketSize: 5000,
      monthlyVolume: 100000,
      disputeRate: 0.01,
      winRate: 0.45,
      averageResponseTime: 72
    };
  }
  
  private extractBehavioralFeatures(
    dispute: Stripe.Dispute,
    charge?: Stripe.Charge,
    paymentIntent?: Stripe.PaymentIntent
  ): BehavioralFeatures {
    const metadata = charge?.metadata || paymentIntent?.metadata || {};
    
    return {
      ipAddress: metadata.ip_address || null,
      ipCountry: metadata.ip_country || null,
      ipRisk: this.assessIpRisk(metadata.ip_country),
      deviceFingerprint: metadata.device_fingerprint || null,
      userAgent: metadata.user_agent || null,
      browserLanguage: metadata.browser_language || null,
      sessionDuration: parseInt(metadata.session_duration || '0'),
      pageViews: parseInt(metadata.page_views || '0'),
      repeatVisitor: metadata.repeat_visitor === 'true',
      referralSource: metadata.referral_source || null
    };
  }
  
  private extractTemporalFeatures(dispute: Stripe.Dispute, charge?: Stripe.Charge): TemporalFeatures {
    const chargeDate = charge ? new Date(charge.created * 1000) : new Date(dispute.created * 1000);
    const disputeDate = new Date(dispute.created * 1000);
    
    const daysBetween = Math.floor((disputeDate.getTime() - chargeDate.getTime()) / (1000 * 86400));
    
    return {
      chargeDate: chargeDate,
      disputeDate: disputeDate,
      daysBetweenChargeAndDispute: daysBetween,
      hourOfDay: chargeDate.getHours(),
      dayOfWeek: chargeDate.getDay(),
      isWeekend: chargeDate.getDay() === 0 || chargeDate.getDay() === 6,
      isHoliday: this.isHoliday(chargeDate),
      isEndOfMonth: chargeDate.getDate() >= 28,
      seasonality: this.getSeason(chargeDate)
    };
  }
  
  private extractEvidenceFeatures(dispute: Stripe.Dispute): EvidenceFeatures {
    const evidence = dispute.evidence;
    const evidenceDetails = dispute.evidence_details;
    
    const evidenceCount = Object.values(evidence || {}).filter(v => v).length;
    
    const dueDate = evidenceDetails?.due_by;
    const daysUntilDue = dueDate 
      ? Math.floor((dueDate - Date.now() / 1000) / 86400)
      : 0;
    
    return {
      hasReceipt: !!evidence?.receipt,
      hasCustomerCommunication: !!evidence?.customer_communication,
      hasShippingDoc: !!evidence?.shipping_documentation,
      hasServiceDoc: !!evidence?.service_documentation,
      hasSignature: !!evidence?.customer_signature,
      hasRefundPolicy: !!evidence?.refund_policy,
      hasCancellationPolicy: !!evidence?.cancellation_policy,
      hasProductDescription: !!evidence?.product_description,
      evidenceCount: evidenceCount,
      evidenceQualityScore: this.calculateEvidenceQuality(evidence),
      submissionCount: evidenceDetails?.submission_count || 0,
      daysUntilDue: daysUntilDue
    };
  }
  
  private encodeReason(reason: string): number {
    const reasonMap: { [key: string]: number } = {
      'fraudulent': 1,
      'subscription_canceled': 2,
      'product_unacceptable': 3,
      'unrecognized': 4,
      'duplicate': 5,
      'product_not_received': 6,
      'credit_not_processed': 7,
      'general': 8,
      'bank_cannot_process': 9,
      'check_returned': 10
    };
    return reasonMap[reason] || 0;
  }
  
  private assessEmailRisk(domain: string | null): 'low' | 'medium' | 'high' {
    if (!domain) return 'medium';
    
    const highRiskDomains = [
      'mailinator.com', 'guerrillamail.com', 'maildrop.cc',
      'throwaway.email', 'temp-mail.org', '10minutemail.com'
    ];
    
    const lowRiskDomains = [
      'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
      'icloud.com', 'aol.com'
    ];
    
    if (highRiskDomains.includes(domain.toLowerCase())) return 'high';
    if (lowRiskDomains.includes(domain.toLowerCase())) return 'low';
    
    return 'medium';
  }
  
  private assessIpRisk(country: string | null): 'low' | 'medium' | 'high' {
    if (!country) return 'medium';
    
    const highRiskCountries = ['NG', 'GH', 'PK', 'BD', 'CN', 'RU'];
    const lowRiskCountries = ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'JP'];
    
    if (highRiskCountries.includes(country)) return 'high';
    if (lowRiskCountries.includes(country)) return 'low';
    
    return 'medium';
  }
  
  private isHoliday(date: Date): boolean {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    const holidays = [
      { month: 1, day: 1 },   // New Year
      { month: 7, day: 4 },   // Independence Day
      { month: 12, day: 25 }, // Christmas
      { month: 11, day: 11 }, // Veterans Day
      { month: 2, day: 14 },  // Valentine's Day
    ];
    
    return holidays.some(h => h.month === month && h.day === day);
  }
  
  private getSeason(date: Date): 'spring' | 'summer' | 'fall' | 'winter' {
    const month = date.getMonth() + 1;
    
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'fall';
    return 'winter';
  }
  
  private calculateEvidenceQuality(evidence: any): number {
    if (!evidence) return 0;
    
    let score = 0;
    const weights = {
      receipt: 20,
      customer_communication: 20,
      shipping_documentation: 15,
      service_documentation: 10,
      customer_signature: 15,
      billing_address: 5,
      product_description: 5,
      refund_policy: 5,
      cancellation_policy: 5
    };
    
    Object.entries(weights).forEach(([key, weight]) => {
      if (evidence[key]) {
        score += weight;
      }
    });
    
    return score;
  }
  
  flattenFeatures(features: DisputeFeatures): Record<string, any> {
    const flat: Record<string, any> = {};
    
    Object.entries(features).forEach(([category, values]) => {
      Object.entries(values).forEach(([key, value]) => {
        flat[`${category}_${key}`] = value;
      });
    });
    
    return flat;
  }
}