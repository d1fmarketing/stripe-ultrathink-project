import Stripe from 'stripe';
import { StripeDataSource } from './sources/stripeDataSource';
import { ShippingTracker } from './sources/shippingTracker';
import { EmailParser } from './sources/emailParser';
import { IPGeolocation } from './sources/ipGeolocation';
import { DeviceFingerprint } from './sources/deviceFingerprint';
import { CustomerHistory } from './sources/customerHistory';
import { AnalyticsCollector } from './sources/analyticsCollector';
import { SocialProof } from './sources/socialProof';

export interface EvidenceBundle {
  disputeId: string;
  collectedAt: Date;
  sources: EvidenceSource[];
  evidence: CollectedEvidence;
  qualityScore: number;
  completeness: number;
  recommendations: string[];
  missingEvidence: string[];
}

export interface EvidenceSource {
  name: string;
  status: 'success' | 'partial' | 'failed';
  data: any;
  error?: string;
  confidence: number;
  timestamp: Date;
}

export interface CollectedEvidence {
  customer_communication?: string;
  customer_communication_summary?: string;
  receipt?: string;
  shipping_documentation?: string;
  service_documentation?: string;
  customer_signature?: string;
  billing_address?: string;
  shipping_address?: string;
  product_description?: string;
  refund_policy?: string;
  cancellation_policy?: string;
  duplicate_charge_documentation?: string;
  customer_name?: string;
  customer_email_address?: string;
  customer_purchase_ip?: string;
  ip_geolocation?: string;
  uncategorized_text?: string;
  uncategorized_file?: string;
  access_activity_log?: string;
  shipping_carrier?: string;
  shipping_tracking_number?: string;
  shipping_date?: string;
  shipping_status?: string;
  shipping_last_location?: string;
  delivery_confirmation?: string;
  transaction_history?: string;
  payment_intent_status?: string;
  payment_intent_failure?: string;
  refund_activity?: string;
  avs_check?: string;
  cvv_result?: string;
  fraud_signals?: string;
  device_fingerprint?: string;
  dispute_status?: string;
  analytics_session?: string;
  [key: string]: string | undefined;
}

export interface DataSource {
  name: string;
  gather(dispute: Stripe.Dispute, charge?: Stripe.Charge): Promise<EvidenceSource>;
  validate(data: any): boolean;
  getConfidence(data: any): number;
}

export interface CollectorConfig {
  parallel: boolean;
  timeout: number;
  retryAttempts: number;
  cacheEnabled: boolean;
  cacheDuration: number;
  markEstimates: boolean;
}

export class SmartEvidenceCollector {
  private stripe: Stripe;
  private sources: DataSource[];
  private config: CollectorConfig;
  private cache: Map<string, { data: any; timestamp: number }>;
  
  constructor(stripeSecretKey: string, config?: Partial<CollectorConfig>) {
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16' as Stripe.StripeConfig['apiVersion'],
    });
    
    this.config = {
      parallel: true,
      timeout: 10000,
      retryAttempts: 3,
      cacheEnabled: true,
      cacheDuration: 300000, // 5 minutes
      markEstimates: true,
      ...config
    };
    
    this.cache = new Map();
    
    this.sources = [
      new StripeDataSource(this.stripe),
      new ShippingTracker(),
      new EmailParser(),
      new IPGeolocation(),
      new DeviceFingerprint(),
      new CustomerHistory(this.stripe),
      new AnalyticsCollector(),
      new SocialProof()
    ];
  }
  
  async collect(
    dispute: Stripe.Dispute,
    charge?: Stripe.Charge,
    paymentIntent?: Stripe.PaymentIntent
  ): Promise<EvidenceBundle> {
    const startTime = Date.now();
    
    if (!charge && dispute.charge) {
      try {
        charge = await this.stripe.charges.retrieve(dispute.charge as string);
      } catch (error) {
        console.error('Failed to retrieve charge:', error);
      }
    }
    
    const evidenceSources = await this.gatherFromAllSources(dispute, charge);
    
    const evidence = this.assembleEvidence(evidenceSources);
    const qualityScore = this.calculateQualityScore(evidence, evidenceSources);
    const completeness = this.calculateCompleteness(evidence);
    const recommendations = this.generateRecommendations(evidence, evidenceSources);
    const missingEvidence = this.identifyMissingEvidence(evidence, dispute.reason);
    
    console.log(`Evidence collection completed in ${Date.now() - startTime}ms`);
    console.log(`Quality Score: ${qualityScore}/100, Completeness: ${completeness}%`);
    
    return {
      disputeId: dispute.id,
      collectedAt: new Date(),
      sources: evidenceSources,
      evidence,
      qualityScore,
      completeness,
      recommendations,
      missingEvidence
    };
  }
  
  private async gatherFromAllSources(
    dispute: Stripe.Dispute,
    charge?: Stripe.Charge
  ): Promise<EvidenceSource[]> {
    if (this.config.parallel) {
      const promises = this.sources.map(source => 
        this.gatherWithRetry(source, dispute, charge)
      );
      return Promise.all(promises);
    } else {
      const results: EvidenceSource[] = [];
      for (const source of this.sources) {
        const result = await this.gatherWithRetry(source, dispute, charge);
        results.push(result);
      }
      return results;
    }
  }
  
  private async gatherWithRetry(
    source: DataSource,
    dispute: Stripe.Dispute,
    charge?: Stripe.Charge
  ): Promise<EvidenceSource> {
    const cacheKey = `${source.name}:${dispute.id}`;
    
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheDuration) {
        return cached.data;
      }
    }
    
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        const result = await Promise.race([
          source.gather(dispute, charge),
          this.timeout(this.config.timeout)
        ]);
        
        if (this.config.cacheEnabled) {
          this.cache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
          });
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        console.error(`Attempt ${attempt + 1} failed for ${source.name}:`, error);
        
        if (attempt < this.config.retryAttempts - 1) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }
    
    return {
      name: source.name,
      status: 'failed',
      data: null,
      error: lastError?.message || 'Unknown error',
      confidence: 0,
      timestamp: new Date()
    };
  }
  
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), ms)
    );
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private assembleEvidence(sources: EvidenceSource[]): CollectedEvidence {
    const evidence: CollectedEvidence = {};
    
    for (const source of sources) {
      if (source.status === 'success' || source.status === 'partial') {
        const data = source.data;
        
        switch (source.name) {
          case 'StripeDataSource':
            if (data.receipt) evidence.receipt = data.receipt;
            if (data.customer_name) evidence.customer_name = data.customer_name;
            if (data.customer_email) evidence.customer_email_address = data.customer_email;
            if (data.billing_address) evidence.billing_address = data.billing_address;
            if (data.shipping_address) evidence.shipping_address = data.shipping_address;
            if (data.customer_purchase_ip) evidence.customer_purchase_ip = data.customer_purchase_ip;
            if (data.avs_summary) evidence.avs_check = data.avs_summary;
            if (data.cvc_check) evidence.cvv_result = data.cvc_check;
            if (data.charge_timeline) {
              evidence.transaction_history = evidence.transaction_history
                ? `${evidence.transaction_history}\n${data.charge_timeline}`
                : data.charge_timeline;
            }
            if (data.payment_intent_status) evidence.payment_intent_status = data.payment_intent_status;
            if (data.payment_intent_error) evidence.payment_intent_failure = data.payment_intent_error;
            if (data.refunds_summary) evidence.refund_activity = data.refunds_summary;
            if (data.dispute_summary) evidence.dispute_status = data.dispute_summary;
            if (data.balance_transaction_summary) {
              evidence.transaction_history = evidence.transaction_history
                ? `${evidence.transaction_history}\n${data.balance_transaction_summary}`
                : data.balance_transaction_summary;
            }
            if (data.fraud_summary) {
              evidence.fraud_signals = this.appendFraudSignal(evidence.fraud_signals, data.fraud_summary);
            }
            break;

          case 'ShippingTracker':
            if (data.tracking_number) evidence.shipping_tracking_number = data.tracking_number;
            if (data.carrier) evidence.shipping_carrier = data.carrier;
            if (data.ship_date) evidence.shipping_date = data.ship_date;
            if (data.documentation) evidence.shipping_documentation = data.documentation;
            if (data.signature) evidence.customer_signature = data.signature;
            if (data.delivery_confirmation) evidence.delivery_confirmation = data.delivery_confirmation;
            if (data.status) evidence.shipping_status = data.status;
            if (data.last_location) evidence.shipping_last_location = data.last_location;
            if (!evidence.shipping_address && data.shipping_address) {
              evidence.shipping_address = data.shipping_address;
            }
            break;

          case 'EmailParser':
            if (data.customer_communication) {
              evidence.customer_communication = this.config.markEstimates && data.estimated
                ? `[ESTIMATED] ${data.customer_communication}`
                : data.customer_communication;
            }
            if (data.communication_summary) {
              evidence.customer_communication_summary = data.communication_summary;
            }
            break;

          case 'CustomerHistory':
            if (data) {
              const historySummary = this.formatCustomerHistory(data);
              if (historySummary) {
                evidence.transaction_history = evidence.transaction_history
                  ? `${evidence.transaction_history}\n${historySummary}`
                  : historySummary;
              }

              const usageLog = this.formatServiceUsage(data.service_usage);
              if (usageLog) {
                evidence.service_documentation = usageLog;
              }

              const accessLog = this.buildAccessLogFromHistory(data);
              if (accessLog) {
                evidence.access_activity_log = accessLog;
              }
            }
            break;

          case 'IPGeolocation':
            if (data) {
              if (!evidence.customer_purchase_ip && data.ip_address) {
                evidence.customer_purchase_ip = data.ip_address;
              }
              const geoSummary = this.formatIPGeolocation(data);
              if (geoSummary) {
                evidence.ip_geolocation = geoSummary;
              }
              if (typeof data.risk_score === 'number') {
                evidence.fraud_signals = this.appendFraudSignal(
                  evidence.fraud_signals,
                  `IP risk score ${data.risk_score}/100 (VPN: ${data.is_vpn ? 'yes' : 'no'})`
                );
              }
            }
            break;

          case 'DeviceFingerprint':
            if (data) {
              const deviceSummary = this.formatDeviceFingerprint(data);
              if (deviceSummary) {
                evidence.device_fingerprint = deviceSummary;
              }
              if (typeof data.trust_score === 'number') {
                evidence.fraud_signals = this.appendFraudSignal(
                  evidence.fraud_signals,
                  `Device trust score ${data.trust_score}/100 with ${data.previous_visits} previous visits`
                );
              }
            }
            break;

          case 'AnalyticsCollector':
            if (data.access_activity_log) {
              evidence.access_activity_log = data.access_activity_log;
            }
            if (data.fraud_signals?.length) {
              const fraudSummary = this.formatFraudSignals(data.fraud_signals);
              evidence.fraud_signals = this.appendFraudSignal(evidence.fraud_signals, fraudSummary);
            }
            if (data.session_id) {
              evidence.analytics_session = `Session ${data.session_id} (${data.visitor_id}) lasting ${Math.round(data.session_duration)}s`;
            }
            break;

          case 'SocialProof':
            if (data.product_description) {
              evidence.product_description = data.product_description;
            }
            if (data.refund_policy) {
              evidence.refund_policy = data.refund_policy;
            }
            if (data.cancellation_policy) {
              evidence.cancellation_policy = data.cancellation_policy;
            }
            break;

          default:
            if (data.evidence) {
              Object.assign(evidence, data.evidence);
            }
        }
      }
    }
    
    if (this.config.markEstimates) {
      this.markEstimatedFields(evidence);
    }
    
    return evidence;
  }
  
  private markEstimatedFields(evidence: CollectedEvidence): void {
    const estimatedFields = [
      'shipping_date',
      'customer_purchase_ip',
      'access_activity_log',
      'transaction_history'
    ];
    
    for (const field of estimatedFields) {
      if (evidence[field] && !evidence[field]?.startsWith('[ESTIMATED]')) {
        const value = evidence[field];
        if (this.isEstimated(value)) {
          evidence[field] = `[ESTIMATED] ${value}`;
        }
      }
    }
  }
  
  private isEstimated(value: any): boolean {
    if (typeof value !== 'string') return false;
    
    const estimatePatterns = [
      /approximately/i,
      /estimated/i,
      /around/i,
      /roughly/i,
      /about/i
    ];
    
    return estimatePatterns.some(pattern => pattern.test(value));
  }
  
  private calculateQualityScore(evidence: CollectedEvidence, sources: EvidenceSource[]): number {
    let score = 0;
    const weights = {
      receipt: 15,
      customer_communication: 20,
      shipping_documentation: 15,
      shipping_tracking_number: 10,
      service_documentation: 10,
      customer_signature: 10,
      billing_address: 5,
      product_description: 5,
      refund_policy: 5,
      cancellation_policy: 5,
      avs_check: 5,
      cvv_result: 5,
      ip_geolocation: 5,
      device_fingerprint: 5,
      transaction_history: 10,
      delivery_confirmation: 5,
      fraud_signals: 5,
      payment_intent_status: 5
    };
    
    for (const [field, weight] of Object.entries(weights)) {
      if (evidence[field]) {
        score += weight;
        
        if (evidence[field]?.includes('[ESTIMATED]')) {
          score -= weight * 0.3;
        }
      }
    }
    
    const sourceConfidence = sources.reduce((sum, s) => sum + s.confidence, 0) / sources.length;
    score *= sourceConfidence;
    
    return Math.min(100, Math.max(0, score));
  }
  
  private calculateCompleteness(evidence: CollectedEvidence): number {
    const requiredFields = [
      'customer_name',
      'customer_email_address',
      'receipt',
      'product_description'
    ];
    
    const optionalFields = [
      'customer_communication',
      'shipping_documentation',
      'shipping_tracking_number',
      'service_documentation',
      'billing_address',
      'shipping_address',
      'refund_policy',
      'cancellation_policy',
      'customer_purchase_ip',
      'avs_check',
      'cvv_result',
      'ip_geolocation',
      'device_fingerprint',
      'fraud_signals',
      'delivery_confirmation',
      'customer_signature',
      'transaction_history'
    ];
    
    let filledRequired = 0;
    let filledOptional = 0;
    
    for (const field of requiredFields) {
      if (evidence[field]) filledRequired++;
    }
    
    for (const field of optionalFields) {
      if (evidence[field]) filledOptional++;
    }
    
    const requiredScore = (filledRequired / requiredFields.length) * 60;
    const optionalScore = (filledOptional / optionalFields.length) * 40;
    
    return Math.round(requiredScore + optionalScore);
  }
  
  private generateRecommendations(evidence: CollectedEvidence, sources: EvidenceSource[]): string[] {
    const recommendations: string[] = [];
    
    if (!evidence.customer_communication) {
      recommendations.push('Obtain customer communication records (emails, chat logs)');
    }
    
    if (!evidence.shipping_documentation && !evidence.shipping_tracking_number) {
      recommendations.push('Add shipping tracking information or delivery confirmation');
    }

    if (!evidence.receipt) {
      recommendations.push('Include transaction receipt or invoice');
    }

    if (!evidence.service_documentation) {
      recommendations.push('Provide service usage logs or access records');
    }

    if (!evidence.refund_policy || !evidence.cancellation_policy) {
      recommendations.push('Include refund and cancellation policies');
    }

    if (!evidence.avs_check) {
      recommendations.push('Provide AVS address verification results from the payment processor');
    }

    if (!evidence.cvv_result) {
      recommendations.push('Include CVV/CVC verification outcome');
    }

    if (!evidence.ip_geolocation) {
      recommendations.push('Add IP geolocation analysis to prove customer location matches billing/shipping');
    }

    if (!evidence.device_fingerprint) {
      recommendations.push('Capture device fingerprinting evidence showing trusted device history');
    }

    if (!evidence.fraud_signals) {
      recommendations.push('Document fraud screening signals and risk analysis');
    }

    if (!evidence.delivery_confirmation) {
      recommendations.push('Attach final delivery confirmation or proof-of-delivery from carrier');
    }

    if (!evidence.customer_signature) {
      recommendations.push('Capture customer signature confirmation when available');
    }

    if (!evidence.transaction_history) {
      recommendations.push('Summarize customer transaction history to establish legitimacy');
    }

    if (!evidence.payment_intent_status) {
      recommendations.push('Record Stripe payment intent status and latest outcome');
    }

    const failedSources = sources.filter(s => s.status === 'failed');
    if (failedSources.length > 0) {
      recommendations.push(`Retry failed data sources: ${failedSources.map(s => s.name).join(', ')}`);
    }
    
    if (evidence.customer_purchase_ip?.includes('[ESTIMATED]')) {
      recommendations.push('Obtain actual IP address from payment logs');
    }
    
    return recommendations;
  }
  
  private identifyMissingEvidence(evidence: CollectedEvidence, reason: string): string[] {
    const missing: string[] = [];
    
    const reasonRequirements: { [key: string]: string[] } = {
      'fraudulent': [
        'customer_purchase_ip',
        'customer_communication',
        'shipping_documentation',
        'customer_signature',
        'avs_check',
        'cvv_result',
        'ip_geolocation',
        'device_fingerprint',
        'fraud_signals',
        'transaction_history'
      ],
      'subscription_canceled': [
        'cancellation_policy',
        'customer_communication',
        'service_documentation'
      ],
      'product_unacceptable': [
        'product_description',
        'refund_policy',
        'customer_communication',
        'customer_communication_summary'
      ],
      'product_not_received': [
        'shipping_documentation',
        'shipping_tracking_number',
        'shipping_carrier',
        'delivery_confirmation',
        'customer_signature'
      ],
      'duplicate': [
        'duplicate_charge_documentation',
        'receipt',
        'transaction_history'
      ],
      'credit_not_processed': [
        'refund_policy',
        'customer_communication',
        'receipt',
        'refund_activity'
      ]
    };
    
    const required = reasonRequirements[reason] || [];
    
    for (const field of required) {
      if (!evidence[field]) {
        missing.push(field);
      }
    }
    
    return missing;
  }
  
  clearCache(): void {
    this.cache.clear();
  }
  
  getSourceStatus(): { name: string; available: boolean }[] {
    return this.sources.map(source => ({
      name: source.name,
      available: true
    }));
  }

  private formatCustomerHistory(data: any): string {
    if (!data) return '';

    const totalSpent = data.total_spent ? (data.total_spent / 100).toFixed(2) : '0.00';
    const lines = [
      `Customer since ${new Date(data.account_created).toLocaleDateString()} (${data.account_age_days} days)`,
      `Transactions: ${data.successful_transactions}/${data.total_transactions} successful, $${totalSpent} lifetime spend`,
      `Disputes: ${data.dispute_history?.total_disputes || 0} total, ${data.dispute_history?.won_disputes || 0} won`,
      `Risk profile: ${data.risk_profile?.toUpperCase?.() || 'UNKNOWN'} | Loyalty: ${data.loyalty_status || 'unknown'}`
    ];

    if (Array.isArray(data.notes) && data.notes.length > 0) {
      lines.push(`Notes: ${data.notes.join('; ')}`);
    }

    return lines.filter(Boolean).join('\n');
  }

  private formatServiceUsage(serviceUsage: any): string {
    if (!serviceUsage) return '';

    const parts = [
      '=== SERVICE USAGE SUMMARY ===',
      `Logins: ${serviceUsage.login_count || 0}`,
      serviceUsage.last_login ? `Last login: ${new Date(serviceUsage.last_login).toLocaleString()}` : '',
      serviceUsage.features_used?.length ? `Features used: ${serviceUsage.features_used.join(', ')}` : '',
      serviceUsage.subscription_tier ? `Subscription tier: ${serviceUsage.subscription_tier}` : '',
      serviceUsage.api_calls ? `API calls: ${serviceUsage.api_calls}` : '',
      serviceUsage.support_tickets ? `Support tickets: ${serviceUsage.support_tickets}` : ''
    ];

    return parts.filter(Boolean).join('\n');
  }

  private buildAccessLogFromHistory(data: any): string {
    if (!data?.service_usage) return '';

    const { service_usage: usage } = data;
    const lines = [
      `Customer activity timeline for ${data.customer_id || 'unknown'}`,
      `- Total logins: ${usage.login_count || 0}`,
      usage.last_login ? `- Last login: ${new Date(usage.last_login).toISOString()}` : '- Last login: unknown',
      `- Features accessed: ${(usage.features_used || []).join(', ') || 'none recorded'}`,
      `- Support tickets: ${usage.support_tickets || 0}`
    ];

    return lines.join('\n');
  }

  private formatIPGeolocation(data: any): string {
    if (!data) return '';

    const lines = [
      `IP Address: ${data.ip_address}`,
      `Location: ${data.city}, ${data.region}, ${data.country}`,
      `ISP: ${data.isp}`,
      `Matches billing: ${data.matches_billing ? 'Yes' : 'No'} | Matches shipping: ${data.matches_shipping ? 'Yes' : 'No'}`,
      `Distance from billing country: ${data.distance_from_billing} km`,
      `Risk flags - VPN:${data.is_vpn ? 'Yes' : 'No'}, Proxy:${data.is_proxy ? 'Yes' : 'No'}, TOR:${data.is_tor ? 'Yes' : 'No'}`
    ];

    return lines.join('\n');
  }

  private formatDeviceFingerprint(data: any): string {
    if (!data) return '';

    const lines = [
      `Device ID: ${data.device_id}`,
      `Type: ${data.device_type} | OS: ${data.operating_system} | Browser: ${data.browser}`,
      `Resolution: ${data.screen_resolution} | Timezone: ${data.timezone}`,
      `User Agent: ${data.user_agent}`,
      `Trust score: ${data.trust_score} | Previous visits: ${data.previous_visits} | Account associations: ${data.account_associations}`
    ];

    return lines.join('\n');
  }

  private formatFraudSignals(signals: any[]): string {
    if (!signals || signals.length === 0) return '';
    return signals
      .map(signal => `${signal.timestamp ? new Date(signal.timestamp).toISOString() : ''} ${signal.type} (${signal.severity}): ${signal.description}`.trim())
      .join('\n');
  }

  private appendFraudSignal(existing: string | undefined, addition: string): string {
    if (!addition) return existing || '';
    if (!existing) return addition;
    return `${existing}\n${addition}`;
  }
}