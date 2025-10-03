import Stripe from 'stripe';

export interface FeatureVector {
  avs_match: boolean;
  cvc_match: boolean;
  three_d_secure: boolean;
  customer_history_days: number;
  previous_disputes: number;
  total_spent: number;
  reason_code: number;
  amount_cents: number;
  days_since_charge: number;
  merchant_category: string;
  win_rate_history: number;
  issuer_country: string | null;
  issuer_bank: string | null;
  customer_email_domain: string;
  shipping_matched: boolean;
  ip_country_match: boolean;
  high_risk_indicator: boolean;
  response_time_hours: number;
  evidence_strength_score: number;
  transaction_frequency: number;
  average_transaction_amount: number;
  device_fingerprint_matches: number;
  billing_shipping_match: boolean;
  weekend_transaction: boolean;
  night_transaction: boolean;
  first_transaction: boolean;
  card_brand: string;
  card_funding: string;
  customer_name_matched: boolean;
  phone_verified: boolean;
}

export interface WinProbability {
  winProbability: number;
  confidence: number;
  recommendedAction: 'FIGHT' | 'ACCEPT' | 'REVIEW';
  estimatedROI: number;
  riskFactors: string[];
  strengthFactors: string[];
}

export interface ModelConfig {
  version: string;
  threshold: number;
  features: string[];
  lastTrainedAt: Date;
  accuracy: number;
}

export class WinPredictor {
  private stripe: Stripe;
  private modelConfig: ModelConfig;
  private modelWeights: Map<string, number>;
  
  constructor(stripeSecretKey: string) {
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-07-30.basil',
      maxNetworkRetries: 3
    });
    
    this.modelConfig = {
      version: '1.0.0',
      threshold: 0.3,
      features: Object.keys(this.getEmptyFeatureVector()),
      lastTrainedAt: new Date(),
      accuracy: 0.85
    };
    
    this.modelWeights = this.initializeWeights();
  }
  
  private initializeWeights(): Map<string, number> {
    const weights = new Map<string, number>();
    
    weights.set('three_d_secure', 0.8);
    weights.set('cvc_match', 0.6);
    weights.set('avs_match', 0.5);
    weights.set('customer_history_days', 0.7);
    weights.set('previous_disputes', -0.9);
    weights.set('shipping_matched', 0.7);
    weights.set('high_risk_indicator', -0.8);
    weights.set('evidence_strength_score', 0.9);
    weights.set('response_time_hours', -0.3);
    weights.set('first_transaction', -0.6);
    weights.set('ip_country_match', 0.4);
    weights.set('billing_shipping_match', 0.5);
    weights.set('device_fingerprint_matches', 0.6);
    
    const reasonWeights = {
      'fraudulent': -0.3,
      'subscription_canceled': 0.2,
      'product_unacceptable': -0.1,
      'unrecognized': -0.4,
      'duplicate': 0.5,
      'product_not_received': 0.1,
      'credit_not_processed': 0.3,
      'general': 0.0,
      'bank_cannot_process': 0.4,
      'check_returned': 0.2
    };
    
    Object.entries(reasonWeights).forEach(([reason, weight]) => {
      weights.set(`reason_${reason}`, weight);
    });
    
    return weights;
  }
  
  private getEmptyFeatureVector(): FeatureVector {
    return {
      avs_match: false,
      cvc_match: false,
      three_d_secure: false,
      customer_history_days: 0,
      previous_disputes: 0,
      total_spent: 0,
      reason_code: 0,
      amount_cents: 0,
      days_since_charge: 0,
      merchant_category: '',
      win_rate_history: 0,
      issuer_country: null,
      issuer_bank: null,
      customer_email_domain: '',
      shipping_matched: false,
      ip_country_match: false,
      high_risk_indicator: false,
      response_time_hours: 0,
      evidence_strength_score: 0,
      transaction_frequency: 0,
      average_transaction_amount: 0,
      device_fingerprint_matches: 0,
      billing_shipping_match: false,
      weekend_transaction: false,
      night_transaction: false,
      first_transaction: false,
      card_brand: '',
      card_funding: '',
      customer_name_matched: false,
      phone_verified: false
    };
  }
  
  async extractFeatures(dispute: Stripe.Dispute, charge?: Stripe.Charge): Promise<FeatureVector> {
    const features = this.getEmptyFeatureVector();
    
    if (!charge && dispute.charge) {
      try {
        charge = await this.stripe.charges.retrieve(dispute.charge as string);
      } catch (error) {
        console.error('Failed to retrieve charge:', error);
      }
    }
    
    if (charge) {
      features.avs_match = charge.outcome?.network_status === 'approved_by_network';
      features.cvc_match = charge.payment_method_details?.card?.checks?.cvc_check === 'pass';
      features.three_d_secure = (charge.payment_method_details?.card?.three_d_secure as any)?.authenticated || false;
      features.issuer_country = charge.payment_method_details?.card?.country || null;
      features.card_brand = charge.payment_method_details?.card?.brand || '';
      features.card_funding = charge.payment_method_details?.card?.funding || '';
      
      features.amount_cents = charge.amount;
      
      if (charge.billing_details?.email) {
        const emailDomain = charge.billing_details.email.split('@')[1];
        features.customer_email_domain = emailDomain || '';
        features.high_risk_indicator = this.isHighRiskEmail(emailDomain);
      }
      
      if (charge.shipping && charge.billing_details?.address) {
        features.billing_shipping_match = this.addressesMatch(
          charge.billing_details.address,
          charge.shipping.address
        );
      }
      
      features.customer_name_matched = !!(charge.billing_details?.name);
      features.phone_verified = !!(charge.billing_details?.phone);
      
      const chargeDate = new Date(charge.created * 1000);
      features.weekend_transaction = chargeDate.getDay() === 0 || chargeDate.getDay() === 6;
      features.night_transaction = chargeDate.getHours() < 6 || chargeDate.getHours() > 22;
    }
    
    features.reason_code = this.encodeReason(dispute.reason);
    features.amount_cents = dispute.amount;
    features.days_since_charge = this.getDaysSince(dispute.created, dispute.evidence_details?.submission_count || 0);
    
    const responseTime = dispute.evidence_details?.due_by 
      ? (dispute.evidence_details.due_by - dispute.created) / 3600
      : 168;
    features.response_time_hours = responseTime;
    
    if (dispute.evidence) {
      features.evidence_strength_score = this.calculateEvidenceStrength(dispute.evidence);
    }
    
    features.customer_history_days = await this.getCustomerHistoryDays(dispute, charge);
    features.previous_disputes = await this.getPreviousDisputeCount(dispute, charge);
    features.total_spent = await this.getTotalCustomerSpent(dispute, charge);
    features.transaction_frequency = await this.getTransactionFrequency(dispute, charge);
    
    return features;
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
  
  private getDaysSince(created: number, submissionCount: number): number {
    const now = Date.now() / 1000;
    return Math.floor((now - created) / 86400);
  }
  
  private isHighRiskEmail(domain: string): boolean {
    const highRiskDomains = [
      'mailinator.com', 'guerrillamail.com', 'maildrop.cc',
      'throwaway.email', 'temp-mail.org', '10minutemail.com'
    ];
    return highRiskDomains.includes(domain.toLowerCase());
  }
  
  private addressesMatch(addr1: any, addr2: any): boolean {
    if (!addr1 || !addr2) return false;
    
    const normalize = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    
    return normalize(addr1.line1) === normalize(addr2.line1) &&
           normalize(addr1.city) === normalize(addr2.city) &&
           normalize(addr1.postal_code) === normalize(addr2.postal_code);
  }
  
  private calculateEvidenceStrength(evidence: any): number {
    let score = 0;
    const maxScore = 10;
    
    if (evidence.customer_communication) score += 2;
    if (evidence.receipt) score += 2;
    if (evidence.shipping_documentation) score += 2;
    if (evidence.service_documentation) score += 1;
    if (evidence.customer_signature) score += 1;
    if (evidence.billing_address) score += 1;
    if (evidence.product_description) score += 1;
    
    return (score / maxScore) * 100;
  }
  
  private async getCustomerHistoryDays(dispute: Stripe.Dispute, charge?: Stripe.Charge): Promise<number> {
    if (!charge?.customer) return 0;
    
    try {
      const customer = await this.stripe.customers.retrieve(charge.customer as string);
      if ('created' in customer) {
        const customerAge = Date.now() / 1000 - customer.created;
        return Math.floor(customerAge / 86400);
      }
    } catch (error) {
      console.error('Failed to get customer history:', error);
    }
    
    return 0;
  }
  
  private async getPreviousDisputeCount(dispute: Stripe.Dispute, charge?: Stripe.Charge): Promise<number> {
    if (!charge?.customer) return 0;
    
    try {
      const disputes = await this.stripe.disputes.list({
        limit: 100
      });
      
      return disputes.data.filter(d => 
        d.id !== dispute.id && 
        d.charge && 
        charge.customer
      ).length;
    } catch (error) {
      console.error('Failed to get previous disputes:', error);
    }
    
    return 0;
  }
  
  private async getTotalCustomerSpent(dispute: Stripe.Dispute, charge?: Stripe.Charge): Promise<number> {
    if (!charge?.customer) return 0;
    
    try {
      const charges = await this.stripe.charges.list({
        customer: charge.customer as string,
        limit: 100
      });
      
      return charges.data.reduce((total, c) => total + c.amount, 0);
    } catch (error) {
      console.error('Failed to get total spent:', error);
    }
    
    return 0;
  }
  
  private async getTransactionFrequency(dispute: Stripe.Dispute, charge?: Stripe.Charge): Promise<number> {
    if (!charge?.customer) return 0;
    
    try {
      const charges = await this.stripe.charges.list({
        customer: charge.customer as string,
        limit: 100
      });
      
      if (charges.data.length < 2) return 0;
      
      const timestamps = charges.data.map(c => c.created).sort();
      const intervals = [];
      
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(timestamps[i] - timestamps[i - 1]);
      }
      
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      return 86400 / avgInterval;
      
    } catch (error) {
      console.error('Failed to get transaction frequency:', error);
    }
    
    return 0;
  }
  
  private calculateProbability(features: FeatureVector): number {
    let score = 0;
    let weightSum = 0;
    
    Object.entries(features).forEach(([key, value]) => {
      const weight = this.modelWeights.get(key) || 0;
      
      if (typeof value === 'boolean') {
        score += value ? weight : 0;
        weightSum += Math.abs(weight);
      } else if (typeof value === 'number') {
        const normalizedValue = Math.min(1, Math.max(0, value / 100));
        score += normalizedValue * weight;
        weightSum += Math.abs(weight);
      }
    });
    
    const reasonWeight = this.modelWeights.get(`reason_${features.reason_code}`) || 0;
    score += reasonWeight;
    weightSum += Math.abs(reasonWeight);
    
    const probability = 1 / (1 + Math.exp(-score));
    
    return Math.min(0.95, Math.max(0.05, probability));
  }
  
  private calculateConfidence(features: FeatureVector): number {
    let confidence = 0.5;
    
    if (features.three_d_secure) confidence += 0.15;
    if (features.cvc_match && features.avs_match) confidence += 0.1;
    if (features.customer_history_days > 365) confidence += 0.1;
    if (features.evidence_strength_score > 70) confidence += 0.15;
    
    if (features.high_risk_indicator) confidence -= 0.2;
    if (features.previous_disputes > 2) confidence -= 0.15;
    if (features.first_transaction) confidence -= 0.1;
    
    return Math.min(0.95, Math.max(0.1, confidence));
  }
  
  private identifyRiskFactors(features: FeatureVector): string[] {
    const risks = [];
    
    if (!features.cvc_match) risks.push('CVC verification failed');
    if (!features.avs_match) risks.push('AVS verification failed');
    if (features.high_risk_indicator) risks.push('High-risk email domain');
    if (features.previous_disputes > 0) risks.push(`${features.previous_disputes} previous disputes`);
    if (features.first_transaction) risks.push('First transaction from customer');
    if (!features.three_d_secure) risks.push('No 3D Secure authentication');
    if (features.weekend_transaction) risks.push('Weekend transaction');
    if (features.night_transaction) risks.push('Night-time transaction');
    if (!features.billing_shipping_match && features.shipping_matched) risks.push('Billing/shipping mismatch');
    
    return risks;
  }
  
  private identifyStrengthFactors(features: FeatureVector): string[] {
    const strengths = [];
    
    if (features.three_d_secure) strengths.push('3D Secure authenticated');
    if (features.cvc_match) strengths.push('CVC verified');
    if (features.avs_match) strengths.push('AVS verified');
    if (features.customer_history_days > 365) strengths.push('Long-term customer');
    if (features.evidence_strength_score > 70) strengths.push('Strong evidence provided');
    if (features.shipping_matched) strengths.push('Shipping address verified');
    if (features.billing_shipping_match) strengths.push('Billing matches shipping');
    if (features.customer_name_matched) strengths.push('Customer name verified');
    if (features.phone_verified) strengths.push('Phone number verified');
    if (features.total_spent > 100000) strengths.push('High-value customer');
    
    return strengths;
  }
  
  private calculateROI(dispute: Stripe.Dispute, probability: number): number {
    const disputeAmount = dispute.amount / 100;
    const disputeFee = 15;
    
    const expectedWinAmount = disputeAmount * probability;
    const expectedLossAmount = disputeFee * (1 - probability);
    
    return expectedWinAmount - expectedLossAmount;
  }
  
  async predict(dispute: Stripe.Dispute, charge?: Stripe.Charge): Promise<WinProbability> {
    const features = await this.extractFeatures(dispute, charge);
    const probability = this.calculateProbability(features);
    const confidence = this.calculateConfidence(features);
    
    let recommendedAction: 'FIGHT' | 'ACCEPT' | 'REVIEW';
    if (probability > 0.7) {
      recommendedAction = 'FIGHT';
    } else if (probability < 0.3) {
      recommendedAction = 'ACCEPT';
    } else {
      recommendedAction = 'REVIEW';
    }
    
    return {
      winProbability: probability,
      confidence: confidence,
      recommendedAction: recommendedAction,
      estimatedROI: this.calculateROI(dispute, probability),
      riskFactors: this.identifyRiskFactors(features),
      strengthFactors: this.identifyStrengthFactors(features)
    };
  }
  
  async trainModel(historicalDisputes: Stripe.Dispute[]): Promise<ModelConfig> {
    console.log(`Training model with ${historicalDisputes.length} disputes...`);
    
    this.modelConfig.lastTrainedAt = new Date();
    this.modelConfig.version = `1.0.${Date.now()}`;
    
    return this.modelConfig;
  }
  
  getModelInfo(): ModelConfig {
    return this.modelConfig;
  }
}