import Stripe from 'stripe';
import { DataSource, EvidenceSource } from '../smartCollector';

export class StripeDataSource implements DataSource {
  name = 'StripeDataSource';
  private stripe: Stripe;
  
  constructor(stripe: Stripe) {
    this.stripe = stripe;
  }
  
  async gather(dispute: Stripe.Dispute, charge?: Stripe.Charge): Promise<EvidenceSource> {
    const startTime = Date.now();
    
    try {
      // Retrieve charge if not provided
      if (!charge && dispute.charge) {
        charge = await this.stripe.charges.retrieve(dispute.charge as string);
      }
      
      // Retrieve payment intent if available
      let paymentIntent: Stripe.PaymentIntent | undefined;
      if (dispute.payment_intent) {
        paymentIntent = await this.stripe.paymentIntents.retrieve(dispute.payment_intent as string);
      }
      
      // Retrieve customer if available
      let customer: Stripe.Customer | undefined;
      if (charge?.customer) {
        customer = await this.stripe.customers.retrieve(charge.customer as string) as Stripe.Customer;
      }
      
      // Extract evidence data
      const data = {
        receipt: charge?.receipt_url || charge?.receipt_email || '',
        customer_name: charge?.billing_details?.name || customer?.name || '',
        customer_email: charge?.billing_details?.email || customer?.email || '',
        billing_address: this.formatAddress(charge?.billing_details?.address),
        shipping_address: paymentIntent?.shipping ? this.formatAddress(paymentIntent.shipping.address) : '',
        customer_purchase_ip: charge?.metadata?.ip_address || '',
        statement_descriptor: charge?.statement_descriptor || '',
        payment_method: charge?.payment_method_details?.type || '',
        card_brand: charge?.payment_method_details?.card?.brand || '',
        card_last4: charge?.payment_method_details?.card?.last4 || '',
        card_country: charge?.payment_method_details?.card?.country || '',
        outcome: charge?.outcome ? {
          network_status: charge.outcome.network_status,
          risk_level: charge.outcome.risk_level,
          risk_score: charge.outcome.risk_score,
          seller_message: charge.outcome.seller_message,
          type: charge.outcome.type
        } : null,
        metadata: {
          ...charge?.metadata,
          ...paymentIntent?.metadata
        },
        customer_history: await this.getCustomerHistory(customer?.id as string),
        refunds: await this.getRefunds(charge?.id as string),
        payment_method_details: charge?.payment_method_details,
        three_d_secure: charge?.payment_method_details?.card?.three_d_secure,
        shipping_details: paymentIntent?.shipping,
        billing_details: charge?.billing_details
      };
      
      return {
        name: this.name,
        status: 'success',
        data,
        confidence: this.calculateConfidence(data),
        timestamp: new Date()
      };
      
    } catch (error) {
      console.error('StripeDataSource error:', error);
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
  
  private formatAddress(address: any): string {
    if (!address) return '';
    
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
  
  private async getCustomerHistory(customerId: string): Promise<any> {
    if (!customerId) return null;
    
    try {
      const charges = await this.stripe.charges.list({
        customer: customerId,
        limit: 100
      });
      
      const disputes = charges.data.filter(c => c.disputed);
      const successfulCharges = charges.data.filter(c => c.status === 'succeeded' && !c.disputed);
      
      return {
        total_charges: charges.data.length,
        successful_charges: successfulCharges.length,
        disputed_charges: disputes.length,
        total_spent: charges.data.reduce((sum, c) => sum + c.amount, 0),
        first_charge_date: charges.data[charges.data.length - 1]?.created,
        last_charge_date: charges.data[0]?.created,
        average_amount: charges.data.length > 0 
          ? charges.data.reduce((sum, c) => sum + c.amount, 0) / charges.data.length 
          : 0
      };
    } catch (error) {
      console.error('Failed to get customer history:', error);
      return null;
    }
  }
  
  private async getRefunds(chargeId: string): Promise<any> {
    if (!chargeId) return null;
    
    try {
      const refunds = await this.stripe.refunds.list({
        charge: chargeId,
        limit: 10
      });
      
      return {
        count: refunds.data.length,
        total_amount: refunds.data.reduce((sum, r) => sum + r.amount, 0),
        refunds: refunds.data.map(r => ({
          id: r.id,
          amount: r.amount,
          reason: r.reason,
          status: r.status,
          created: r.created
        }))
      };
    } catch (error) {
      console.error('Failed to get refunds:', error);
      return null;
    }
  }
  
  validate(data: any): boolean {
    return !!(data && (data.receipt || data.customer_name || data.customer_email));
  }
  
  getConfidence(data: any): number {
    return this.calculateConfidence(data);
  }
  
  private calculateConfidence(data: any): number {
    let confidence = 0;
    const maxConfidence = 1.0;
    
    // Core fields (50%)
    if (data.receipt) confidence += 0.15;
    if (data.customer_name) confidence += 0.10;
    if (data.customer_email) confidence += 0.10;
    if (data.billing_address) confidence += 0.08;
    if (data.shipping_address) confidence += 0.07;
    
    // Payment details (20%)
    if (data.payment_method_details) confidence += 0.10;
    if (data.three_d_secure?.authenticated) confidence += 0.10;
    
    // Customer history (20%)
    if (data.customer_history) {
      if (data.customer_history.successful_charges > 5) confidence += 0.10;
      if (data.customer_history.disputed_charges === 0) confidence += 0.10;
    }
    
    // Risk assessment (10%)
    if (data.outcome?.risk_level === 'normal') confidence += 0.05;
    if (data.outcome?.network_status === 'approved_by_network') confidence += 0.05;
    
    return Math.min(confidence, maxConfidence);
  }
}