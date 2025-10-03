import Stripe from 'stripe';
import { DataSource, EvidenceSource } from '../smartCollector';

export interface CustomerHistoryData {
  customer_id: string;
  account_created: Date;
  account_age_days: number;
  total_transactions: number;
  successful_transactions: number;
  total_spent: number;
  average_order_value: number;
  last_transaction_date: Date;
  dispute_history: DisputeHistory;
  payment_methods: PaymentMethod[];
  shipping_addresses: string[];
  service_usage: ServiceUsage;
  loyalty_status: 'new' | 'regular' | 'vip';
  risk_profile: 'low' | 'medium' | 'high';
  notes: string[];
  estimated?: boolean;
  estimation_details?: string[];
}

export interface DisputeHistory {
  total_disputes: number;
  won_disputes: number;
  lost_disputes: number;
  pending_disputes: number;
  dispute_rate: number;
  last_dispute_date: Date | null;
}

export interface PaymentMethod {
  type: string;
  last4: string;
  brand: string;
  country: string;
  exp_month: number;
  exp_year: number;
  uses_count: number;
}

export interface ServiceUsage {
  login_count: number;
  last_login: Date | null;
  features_used: string[];
  subscription_tier: string | null;
  api_calls: number;
  support_tickets: number;
  satisfaction_score: number | null;
}

export class CustomerHistory implements DataSource {
  name = 'CustomerHistory';
  private stripe: Stripe;
  
  constructor(stripeClient: Stripe) {
    this.stripe = stripeClient;
  }
  
  async gather(dispute: Stripe.Dispute, charge?: Stripe.Charge): Promise<EvidenceSource> {
    try {
      const historyData = await this.getCustomerHistory(dispute, charge);
      
      return {
        name: this.name,
        status: historyData ? (historyData.estimated ? 'partial' : 'success') : 'partial',
        data: historyData,
        confidence: this.getConfidence(historyData),
        timestamp: new Date()
      };
    } catch (error) {
      return {
        name: this.name,
        status: 'failed',
        data: null,
        error: (error as Error).message,
        confidence: 0,
        timestamp: new Date()
      };
    }
  }
  
  private async getCustomerHistory(
    dispute: Stripe.Dispute,
    charge?: Stripe.Charge
  ): Promise<CustomerHistoryData | null> {
    const customerId = charge?.customer as string;
    
    if (!customerId) {
      return this.generateEstimatedHistory(dispute, charge);
    }
    
    try {
      // Fetch customer from Stripe
      const customer = await this.stripe.customers.retrieve(customerId) as Stripe.Customer;
      
      // Fetch transaction history
      const charges = await this.stripe.charges.list({
        customer: customerId,
        limit: 100
      });
      
      // Fetch payment methods
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        limit: 10
      });
      
      // Fetch disputes
      const allDisputes = await this.stripe.disputes.list({
        limit: 100
      });
      
      // Filter disputes for this customer
      const customerDisputes = allDisputes.data.filter(d => {
        const disputeCharge = d.charge as string;
        return charges.data.some(c => c.id === disputeCharge);
      });
      
      return this.compileCustomerHistory(
        customer,
        charges.data,
        paymentMethods.data,
        customerDisputes
      );
    } catch (error) {
      console.error('Error fetching customer history:', error);
      return this.generateEstimatedHistory(dispute, charge);
    }
  }
  
  private compileCustomerHistory(
    customer: Stripe.Customer,
    charges: Stripe.Charge[],
    paymentMethods: Stripe.PaymentMethod[],
    disputes: Stripe.Dispute[]
  ): CustomerHistoryData {
    const accountCreated = new Date(customer.created * 1000);
    const accountAgeDays = Math.floor((Date.now() - accountCreated.getTime()) / (1000 * 86400));
    
    const successfulCharges = charges.filter(c => c.status === 'succeeded');
    const totalSpent = successfulCharges.reduce((sum, c) => sum + c.amount, 0);
    const averageOrderValue = successfulCharges.length > 0 
      ? totalSpent / successfulCharges.length 
      : 0;
    
    const lastTransaction = charges.length > 0
      ? new Date(Math.max(...charges.map(c => c.created)) * 1000)
      : accountCreated;
    
    const disputeHistory: DisputeHistory = {
      total_disputes: disputes.length,
      won_disputes: disputes.filter(d => d.status === 'won').length,
      lost_disputes: disputes.filter(d => d.status === 'lost').length,
      pending_disputes: disputes.filter(d => ['warning_needs_response', 'warning_under_review', 'needs_response', 'under_review'].includes(d.status)).length,
      dispute_rate: charges.length > 0 ? disputes.length / charges.length : 0,
      last_dispute_date: disputes.length > 0 
        ? new Date(Math.max(...disputes.map(d => d.created)) * 1000)
        : null
    };
    
    const uniqueShippingAddresses = this.extractShippingAddresses(charges);
    const serviceUsage = this.extractServiceUsage(customer, charges);
    const loyaltyStatus = this.determineLoyaltyStatus(accountAgeDays, successfulCharges.length, totalSpent);
    const riskProfile = this.calculateRiskProfile(disputeHistory, accountAgeDays, totalSpent);
    
    return {
      customer_id: customer.id,
      account_created: accountCreated,
      account_age_days: accountAgeDays,
      total_transactions: charges.length,
      successful_transactions: successfulCharges.length,
      total_spent: totalSpent,
      average_order_value: averageOrderValue,
      last_transaction_date: lastTransaction,
      dispute_history: disputeHistory,
      payment_methods: this.formatPaymentMethods(paymentMethods),
      shipping_addresses: uniqueShippingAddresses,
      service_usage: serviceUsage,
      loyalty_status: loyaltyStatus,
      risk_profile: riskProfile,
      notes: this.generateCustomerNotes(customer, charges, disputes),
      estimated: false
    };
  }

  private generateEstimatedHistory(
    dispute: Stripe.Dispute,
    charge?: Stripe.Charge
  ): CustomerHistoryData {
    const secondsPerDay = 86400;
    const referenceChargeCreated = charge?.created ?? dispute.created;
    const chargeDate = new Date(referenceChargeCreated * 1000);
    const disputeDate = new Date(dispute.created * 1000);

    const amountCents = charge?.amount ?? dispute.amount ?? 0;
    const normalizedAmount = amountCents > 0 ? amountCents / 100 : 0;

    const chargeToDisputeGapDays = Math.max(
      0,
      Math.floor((dispute.created - referenceChargeCreated) / secondsPerDay)
    );

    const estimatedAccountAge = Math.min(
      730,
      Math.max(30, chargeToDisputeGapDays + 90)
    );

    const accountCreatedTimestamp = Math.max(
      0,
      referenceChargeCreated - estimatedAccountAge * secondsPerDay
    );
    const accountCreated = new Date(accountCreatedTimestamp * 1000);

    const baseTransactionEstimate = normalizedAmount > 0
      ? Math.min(50, Math.max(1, Math.round(normalizedAmount / 200)))
      : 3;
    const loyaltyBonus = estimatedAccountAge > 365 ? 4 : estimatedAccountAge > 180 ? 2 : 1;
    const totalTransactions = Math.max(1, baseTransactionEstimate + loyaltyBonus);
    const successfulTransactions = Math.max(
      1,
      Math.min(totalTransactions, totalTransactions - (estimatedAccountAge > 120 ? 1 : 0))
    );

    const averageChargeAmount = normalizedAmount > 0 ? normalizedAmount : 75;
    const totalSpent = Math.round(successfulTransactions * averageChargeAmount * 100) / 100;
    const averageOrderValue = Math.round((totalSpent / successfulTransactions) * 100) / 100;

    const estimatedDisputes = Math.min(
      totalTransactions,
      Math.max(1, Math.round(totalTransactions * 0.1))
    );
    const wonDisputes = estimatedDisputes > 1 ? 1 : 0;
    const pendingDisputes = Math.max(0, estimatedDisputes - wonDisputes - 1);
    const lostDisputes = Math.max(0, estimatedDisputes - wonDisputes - pendingDisputes);

    const disputeHistory: DisputeHistory = {
      total_disputes: estimatedDisputes,
      won_disputes: wonDisputes,
      lost_disputes: lostDisputes,
      pending_disputes: pendingDisputes,
      dispute_rate: totalTransactions > 0 ? estimatedDisputes / totalTransactions : 0,
      last_dispute_date: disputeDate
    };

    const serviceUsage: ServiceUsage = {
      login_count: Math.max(1, successfulTransactions * 2),
      last_login: chargeDate,
      features_used: amountCents > 5000 ? ['checkout', 'account', 'subscriptions'] : ['checkout'],
      subscription_tier: amountCents > 20000 ? 'premium' : null,
      api_calls: successfulTransactions * 5,
      support_tickets: Math.max(0, estimatedDisputes - wonDisputes),
      satisfaction_score: null
    };

    const loyalty_status: 'new' | 'regular' | 'vip' = estimatedAccountAge > 540
      ? 'vip'
      : estimatedAccountAge > 180
        ? 'regular'
        : 'new';

    const risk_profile = this.calculateRiskProfile(disputeHistory, estimatedAccountAge, totalSpent);

    const estimationDetails = [
      'Derived from dispute timing and charge amount heuristics',
      `Charge reference date: ${chargeDate.toISOString()}`,
      `Account age heuristic: ${estimatedAccountAge} days`
    ];

    return {
      customer_id: '[ESTIMATED]',
      account_created: accountCreated,
      account_age_days: estimatedAccountAge,
      total_transactions: totalTransactions,
      successful_transactions: successfulTransactions,
      total_spent: totalSpent,
      average_order_value: averageOrderValue,
      last_transaction_date: chargeDate,
      dispute_history: disputeHistory,
      payment_methods: [{
        type: 'card',
        last4: charge?.payment_method_details?.card?.last4 || '****',
        brand: charge?.payment_method_details?.card?.brand || 'unknown',
        country: charge?.payment_method_details?.card?.country || 'US',
        exp_month: charge?.payment_method_details?.card?.exp_month || 12,
        exp_year: charge?.payment_method_details?.card?.exp_year || chargeDate.getUTCFullYear() + 1,
        uses_count: successfulTransactions
      }],
      shipping_addresses: charge?.shipping ? [this.formatAddress(charge.shipping.address)] : [],
      service_usage: serviceUsage,
      loyalty_status,
      risk_profile,
      notes: [
        '[ESTIMATED] Customer history inferred from dispute context',
        `[ESTIMATED] Total transactions approximated to ${totalTransactions}`
      ],
      estimated: true,
      estimation_details: estimationDetails
    };
  }
  
  private extractShippingAddresses(charges: Stripe.Charge[]): string[] {
    const addresses = new Set<string>();
    
    charges.forEach(charge => {
      if (charge.shipping?.address) {
        addresses.add(this.formatAddress(charge.shipping.address));
      }
    });
    
    return Array.from(addresses);
  }
  
  private formatAddress(address: any): string {
    const parts = [
      address.line1,
      address.line2,
      address.city,
      address.state,
      address.postal_code,
      address.country
    ].filter(Boolean);
    
    return parts.join(', ');
  }
  
  private extractServiceUsage(customer: Stripe.Customer, charges: Stripe.Charge[]): ServiceUsage {
    // Extract from customer metadata if available
    const metadata = customer.metadata || {};
    
    return {
      login_count: parseInt(metadata.login_count || '0'),
      last_login: metadata.last_login ? new Date(metadata.last_login) : null,
      features_used: metadata.features_used ? metadata.features_used.split(',') : [],
      subscription_tier: metadata.subscription_tier || null,
      api_calls: parseInt(metadata.api_calls || '0'),
      support_tickets: parseInt(metadata.support_tickets || '0'),
      satisfaction_score: metadata.satisfaction_score ? parseFloat(metadata.satisfaction_score) : null
    };
  }
  
  private formatPaymentMethods(paymentMethods: Stripe.PaymentMethod[]): PaymentMethod[] {
    return paymentMethods.map(pm => ({
      type: pm.type,
      last4: pm.card?.last4 || '****',
      brand: pm.card?.brand || 'unknown',
      country: pm.card?.country || 'unknown',
      exp_month: pm.card?.exp_month || 0,
      exp_year: pm.card?.exp_year || 0,
      uses_count: 1 // Would need to count actual usage from charges
    }));
  }
  
  private determineLoyaltyStatus(
    accountAgeDays: number,
    transactionCount: number,
    totalSpent: number
  ): 'new' | 'regular' | 'vip' {
    if (accountAgeDays > 365 && transactionCount > 20 && totalSpent > 100000) {
      return 'vip';
    }
    if (accountAgeDays > 90 && transactionCount > 3) {
      return 'regular';
    }
    return 'new';
  }
  
  private calculateRiskProfile(
    disputeHistory: DisputeHistory,
    accountAgeDays: number,
    totalSpent: number
  ): 'low' | 'medium' | 'high' {
    let riskScore = 0;
    
    // Dispute rate factor
    if (disputeHistory.dispute_rate > 0.05) riskScore += 40;
    else if (disputeHistory.dispute_rate > 0.02) riskScore += 20;
    
    // Account age factor
    if (accountAgeDays < 30) riskScore += 30;
    else if (accountAgeDays < 90) riskScore += 15;
    else if (accountAgeDays > 365) riskScore -= 20;
    
    // Spending factor
    if (totalSpent < 10000) riskScore += 10;
    else if (totalSpent > 100000) riskScore -= 15;
    
    // Lost disputes factor
    if (disputeHistory.lost_disputes > disputeHistory.won_disputes) riskScore += 25;
    
    if (riskScore <= 20) return 'low';
    if (riskScore <= 50) return 'medium';
    return 'high';
  }
  
  private generateCustomerNotes(
    customer: Stripe.Customer,
    charges: Stripe.Charge[],
    disputes: Stripe.Dispute[]
  ): string[] {
    const notes: string[] = [];
    
    // Account status
    if (customer.delinquent) {
      notes.push('Account marked as delinquent');
    }
    
    // Transaction patterns
    const avgDaysBetweenTransactions = this.calculateAverageTransactionInterval(charges);
    if (avgDaysBetweenTransactions > 0) {
      notes.push(`Average ${avgDaysBetweenTransactions} days between transactions`);
    }
    
    // Dispute patterns
    if (disputes.length > 0) {
      const wonRate = disputes.filter(d => d.status === 'won').length / disputes.length;
      notes.push(`Dispute win rate: ${(wonRate * 100).toFixed(0)}%`);
    }
    
    // Payment method variety
    const uniqueCards = new Set(charges.map(c => c.payment_method_details?.card?.fingerprint).filter(Boolean));
    if (uniqueCards.size > 1) {
      notes.push(`Uses ${uniqueCards.size} different payment cards`);
    }
    
    return notes;
  }
  
  private calculateAverageTransactionInterval(charges: Stripe.Charge[]): number {
    if (charges.length < 2) return 0;
    
    const sortedCharges = charges.sort((a, b) => a.created - b.created);
    let totalInterval = 0;
    
    for (let i = 1; i < sortedCharges.length; i++) {
      totalInterval += sortedCharges[i].created - sortedCharges[i - 1].created;
    }
    
    return Math.floor(totalInterval / (sortedCharges.length - 1) / 86400);
  }
  
  validate(data: any): boolean {
    if (!data) return false;
    return !!(data.customer_id && data.account_created && data.total_transactions >= 0);
  }
  
  getConfidence(data: any): number {
    if (!data) return 0;

    if (data.estimated) {
      return 0.2;
    }

    let confidence = 0.5;

    if (data.customer_id && !data.customer_id.includes('ESTIMATED')) {
      confidence = 0.8;
      
      if (data.account_age_days > 365) confidence += 0.1;
      if (data.successful_transactions > 10) confidence += 0.05;
      if (data.risk_profile === 'low') confidence += 0.05;
    }
    
    return Math.min(1, confidence);
  }
}