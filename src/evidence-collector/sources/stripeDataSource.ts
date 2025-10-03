import Stripe from 'stripe';
import { DataSource, EvidenceSource } from '../smartCollector';

export class StripeDataSource implements DataSource {
  name = 'StripeDataSource';
  private stripe: Stripe;
  
  constructor(stripe: Stripe) {
    this.stripe = stripe;
  }
  
  async gather(dispute: Stripe.Dispute, charge?: Stripe.Charge): Promise<EvidenceSource> {
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

      const refunds = await this.getRefunds(charge?.id as string);
      const avsSummary = this.formatAVSResult(charge?.payment_method_details?.card?.checks || null);
      const paymentIntentError = this.formatPaymentIntentError(paymentIntent);
      const disputeSummary = this.formatDisputeSummary(dispute);
      const chargeTimeline = this.buildChargeTimeline(dispute, charge, paymentIntent, refunds);
      const refundsSummary = this.formatRefunds(refunds);
      const balanceSummary = await this.getBalanceTransactionSummary(charge);
      const fraudSummary = this.formatFraudDetails(charge);

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
        avs_summary: avsSummary,
        cvc_check: charge?.payment_method_details?.card?.checks?.cvc_check || '',
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
        refunds,
        refunds_summary: refundsSummary,
        payment_method_details: charge?.payment_method_details,
        three_d_secure: charge?.payment_method_details?.card?.three_d_secure,
        shipping_details: paymentIntent?.shipping,
        billing_details: charge?.billing_details,
        payment_intent_status: paymentIntent?.status,
        payment_intent_error: paymentIntentError,
        dispute_summary: disputeSummary,
        charge_timeline: chargeTimeline,
        balance_transaction_summary: balanceSummary,
        fraud_summary: fraudSummary
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

  private async getBalanceTransactionSummary(charge?: Stripe.Charge): Promise<string | null> {
    if (!charge?.balance_transaction) return null;

    try {
      let balanceTx: Stripe.BalanceTransaction | null = null;
      if (typeof charge.balance_transaction === 'string') {
        balanceTx = await this.stripe.balanceTransactions.retrieve(charge.balance_transaction);
      } else {
        balanceTx = charge.balance_transaction as Stripe.BalanceTransaction;
      }

      return this.formatBalanceTransaction(balanceTx);
    } catch (error) {
      console.error('Failed to get balance transaction:', error);
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

  private formatAVSResult(checks: Stripe.Charge.PaymentMethodDetails.Card.Checks | null): string | null {
    if (!checks) return null;

    const parts = [
      checks.address_line1_check ? `Line1: ${checks.address_line1_check}` : '',
      checks.address_postal_code_check ? `Postal: ${checks.address_postal_code_check}` : '',
      checks.cvc_check ? `CVC: ${checks.cvc_check}` : ''
    ].filter(Boolean);

    if (parts.length === 0) return null;
    return `AVS/CVV Results -> ${parts.join(' | ')}`;
  }

  private formatPaymentIntentError(paymentIntent?: Stripe.PaymentIntent): string | null {
    if (!paymentIntent?.last_payment_error) return null;

    const error = paymentIntent.last_payment_error;
    return `Last error (${error.code || error.type || 'unknown'}): ${error.message || 'No message provided'}`;
  }

  private formatRefunds(refunds: any): string | null {
    if (!refunds || !refunds.refunds || refunds.refunds.length === 0) {
      return null;
    }

    const lines = [
      `Total refunds: ${refunds.count} | Amount: $${(refunds.total_amount / 100).toFixed(2)}`
    ];

    for (const refund of refunds.refunds) {
      lines.push(`- ${refund.id}: $${(refund.amount / 100).toFixed(2)} ${refund.status}${refund.reason ? ` (${refund.reason})` : ''}`);
    }

    return lines.join('\n');
  }

  private formatDisputeSummary(dispute: Stripe.Dispute): string {
    const created = new Date(dispute.created * 1000).toISOString();
    const dueBy = dispute.evidence_details?.due_by
      ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
      : 'N/A';

    return `Status: ${dispute.status} | Reason: ${dispute.reason}\nCreated: ${created}\nEvidence due: ${dueBy}\nEvidence submitted: ${dispute.evidence_details?.submission_count || 0}`;
  }

  private buildChargeTimeline(
    dispute: Stripe.Dispute,
    charge?: Stripe.Charge,
    paymentIntent?: Stripe.PaymentIntent,
    refunds?: any
  ): string | null {
    const entries: string[] = [];

    if (paymentIntent) {
      entries.push(`Payment intent ${paymentIntent.id} created ${new Date(paymentIntent.created * 1000).toISOString()}`);
      if (paymentIntent.status) {
        entries.push(`Payment intent status: ${paymentIntent.status}`);
      }
      const errorSummary = this.formatPaymentIntentError(paymentIntent);
      if (errorSummary) {
        entries.push(errorSummary);
      }
    }

    if (charge) {
      entries.push(`Charge ${charge.id} created ${new Date(charge.created * 1000).toISOString()}`);
      if (charge.captured) {
        entries.push('Charge captured successfully');
      }
      if (charge.outcome?.seller_message) {
        entries.push(`Processor outcome: ${charge.outcome.seller_message}`);
      }
    }

    if (refunds?.refunds?.length) {
      for (const refund of refunds.refunds) {
        entries.push(`Refund ${refund.id} of $${(refund.amount / 100).toFixed(2)} ${refund.status}`);
      }
    }

    if (dispute) {
      entries.push(`Dispute opened ${new Date(dispute.created * 1000).toISOString()} (status ${dispute.status})`);
    }

    if (entries.length === 0) {
      return null;
    }

    return entries.join('\n');
  }

  private formatBalanceTransaction(tx?: Stripe.BalanceTransaction | null): string | null {
    if (!tx) return null;

    const net = (tx.net / 100).toFixed(2);
    const fee = (tx.fee / 100).toFixed(2);
    const amount = (tx.amount / 100).toFixed(2);

    return `Balance transaction ${tx.id}: amount $${amount}, fee $${fee}, net $${net}, status ${tx.status}`;
  }

  private formatFraudDetails(charge?: Stripe.Charge | null): string | null {
    if (!charge?.fraud_details) return null;
    const details = charge.fraud_details;
    const entries: string[] = [];

    Object.entries(details).forEach(([key, value]) => {
      if (value) {
        entries.push(`${key}: ${value}`);
      }
    });

    if (entries.length === 0) return null;
    return `Stripe fraud assessment -> ${entries.join(', ')}`;
  }
}