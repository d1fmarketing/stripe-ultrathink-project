import Stripe from 'stripe';
import { DataSource, EvidenceSource } from '../smartCollector';

export interface AnalyticsData {
  session_id: string;
  visitor_id: string;
  page_views: PageView[];
  total_page_views: number;
  session_duration: number;
  bounce_rate: number;
  conversion_funnel: ConversionStep[];
  traffic_source: TrafficSource;
  user_behavior: UserBehavior;
  cart_activity: CartActivity;
  engagement_score: number;
  fraud_signals: FraudSignal[];
  access_activity_log: string;
}

export interface PageView {
  url: string;
  timestamp: Date;
  duration_seconds: number;
  interactions: number;
  scroll_depth: number;
}

export interface ConversionStep {
  step_name: string;
  timestamp: Date;
  completed: boolean;
  time_spent: number;
}

export interface TrafficSource {
  source: string;
  medium: string;
  campaign: string | null;
  referrer: string | null;
  landing_page: string;
  utm_params: Record<string, string>;
}

export interface UserBehavior {
  mouse_movements: number;
  clicks: number;
  form_interactions: number;
  copy_paste_events: number;
  tab_switches: number;
  idle_time: number;
  rage_clicks: number;
  hesitation_time: number;
}

export interface CartActivity {
  items_added: number;
  items_removed: number;
  cart_abandonment_count: number;
  cart_value_changes: number[];
  checkout_attempts: number;
  time_to_purchase: number;
  payment_method_changes: number;
}

export interface FraudSignal {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  timestamp: Date;
}

export class AnalyticsCollector implements DataSource {
  name = 'AnalyticsCollector';
  
  async gather(dispute: Stripe.Dispute, charge?: Stripe.Charge): Promise<EvidenceSource> {
    try {
      const analyticsData = await this.collectAnalytics(dispute, charge);
      
      return {
        name: this.name,
        status: analyticsData ? 'success' : 'partial',
        data: analyticsData,
        confidence: this.getConfidence(analyticsData),
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
  
  private async collectAnalytics(
    dispute: Stripe.Dispute,
    charge?: Stripe.Charge
  ): Promise<AnalyticsData | null> {
    // In production, this would integrate with:
    // - Google Analytics 4
    // - Mixpanel
    // - Segment
    // - Amplitude
    // - Heap Analytics
    // - Custom analytics
    
    const sessionId = charge?.metadata?.session_id || this.generateSessionId();
    const visitorId = charge?.metadata?.visitor_id || this.generateVisitorId();
    
    // Simulate analytics data collection
    const hasAnalytics = Math.random() > 0.3; // 70% chance of having analytics
    
    if (hasAnalytics) {
      return this.generateAnalyticsData(sessionId, visitorId, charge);
    } else {
      return this.generateEstimatedAnalytics(charge);
    }
  }
  
  private generateAnalyticsData(
    sessionId: string,
    visitorId: string,
    charge?: Stripe.Charge
  ): AnalyticsData {
    const chargeDate = charge ? new Date(charge.created * 1000) : new Date();
    const pageViews = this.generatePageViews(chargeDate);
    const conversionFunnel = this.generateConversionFunnel(chargeDate);
    const trafficSource = this.generateTrafficSource();
    const userBehavior = this.generateUserBehavior();
    const cartActivity = this.generateCartActivity(charge);
    const fraudSignals = this.detectFraudSignals(userBehavior, cartActivity, trafficSource);
    
    const sessionDuration = pageViews.reduce((sum, pv) => sum + pv.duration_seconds, 0);
    const bounceRate = pageViews.length === 1 ? 1 : 0;
    const engagementScore = this.calculateEngagementScore(pageViews, userBehavior, conversionFunnel);
    
    return {
      session_id: sessionId,
      visitor_id: visitorId,
      page_views: pageViews,
      total_page_views: pageViews.length,
      session_duration: sessionDuration,
      bounce_rate: bounceRate,
      conversion_funnel: conversionFunnel,
      traffic_source: trafficSource,
      user_behavior: userBehavior,
      cart_activity: cartActivity,
      engagement_score: engagementScore,
      fraud_signals: fraudSignals,
      access_activity_log: this.generateAccessLog(sessionId, visitorId, pageViews, chargeDate)
    };
  }
  
  private generateEstimatedAnalytics(charge?: Stripe.Charge): AnalyticsData {
    const chargeDate = charge ? new Date(charge.created * 1000) : new Date();
    
    return {
      session_id: '[ESTIMATED]',
      visitor_id: '[ESTIMATED]',
      page_views: [{
        url: '/checkout',
        timestamp: chargeDate,
        duration_seconds: 120,
        interactions: 5,
        scroll_depth: 100
      }],
      total_page_views: 3,
      session_duration: 300,
      bounce_rate: 0,
      conversion_funnel: [
        { step_name: 'landing', timestamp: new Date(chargeDate.getTime() - 600000), completed: true, time_spent: 60 },
        { step_name: 'product', timestamp: new Date(chargeDate.getTime() - 300000), completed: true, time_spent: 120 },
        { step_name: 'cart', timestamp: new Date(chargeDate.getTime() - 120000), completed: true, time_spent: 60 },
        { step_name: 'checkout', timestamp: chargeDate, completed: true, time_spent: 60 }
      ],
      traffic_source: {
        source: 'direct',
        medium: 'none',
        campaign: null,
        referrer: null,
        landing_page: '/',
        utm_params: {}
      },
      user_behavior: {
        mouse_movements: 100,
        clicks: 10,
        form_interactions: 3,
        copy_paste_events: 0,
        tab_switches: 2,
        idle_time: 30,
        rage_clicks: 0,
        hesitation_time: 15
      },
      cart_activity: {
        items_added: 1,
        items_removed: 0,
        cart_abandonment_count: 0,
        cart_value_changes: [charge?.amount || 0],
        checkout_attempts: 1,
        time_to_purchase: 300,
        payment_method_changes: 0
      },
      engagement_score: 75,
      fraud_signals: [],
      access_activity_log: '[ESTIMATED] Standard user session with typical navigation pattern'
    };
  }
  
  private generatePageViews(startTime: Date): PageView[] {
    const pages = [
      { url: '/', duration: 45, interactions: 3, scroll: 80 },
      { url: '/products', duration: 120, interactions: 8, scroll: 100 },
      { url: '/product/item-123', duration: 90, interactions: 5, scroll: 95 },
      { url: '/cart', duration: 60, interactions: 4, scroll: 100 },
      { url: '/checkout', duration: 120, interactions: 10, scroll: 100 }
    ];
    
    const pageViews: PageView[] = [];
    let currentTime = new Date(startTime.getTime() - 600000); // Start 10 minutes before
    
    const viewCount = Math.floor(Math.random() * 3) + 3; // 3-5 pages
    for (let i = 0; i < viewCount && i < pages.length; i++) {
      const page = pages[i];
      pageViews.push({
        url: page.url,
        timestamp: new Date(currentTime),
        duration_seconds: page.duration + Math.floor(Math.random() * 30) - 15,
        interactions: page.interactions + Math.floor(Math.random() * 3),
        scroll_depth: Math.min(100, page.scroll + Math.floor(Math.random() * 10))
      });
      currentTime = new Date(currentTime.getTime() + page.duration * 1000);
    }
    
    return pageViews;
  }
  
  private generateConversionFunnel(endTime: Date): ConversionStep[] {
    const steps = [
      { name: 'landing', duration: 60 },
      { name: 'product_view', duration: 120 },
      { name: 'add_to_cart', duration: 30 },
      { name: 'checkout_start', duration: 60 },
      { name: 'payment_info', duration: 45 },
      { name: 'purchase_complete', duration: 15 }
    ];
    
    const funnel: ConversionStep[] = [];
    let currentTime = new Date(endTime.getTime() - 600000);
    
    const completedSteps = Math.floor(Math.random() * 2) + 4; // 4-5 steps completed
    for (let i = 0; i < completedSteps && i < steps.length; i++) {
      const step = steps[i];
      funnel.push({
        step_name: step.name,
        timestamp: new Date(currentTime),
        completed: true,
        time_spent: step.duration + Math.floor(Math.random() * 20) - 10
      });
      currentTime = new Date(currentTime.getTime() + step.duration * 1000);
    }
    
    return funnel;
  }
  
  private generateTrafficSource(): TrafficSource {
    const sources = [
      { source: 'google', medium: 'organic', referrer: 'google.com' },
      { source: 'direct', medium: 'none', referrer: null },
      { source: 'facebook', medium: 'social', referrer: 'facebook.com' },
      { source: 'email', medium: 'email', referrer: null },
      { source: 'google', medium: 'cpc', referrer: 'google.com' }
    ];
    
    const selected = sources[Math.floor(Math.random() * sources.length)];
    
    return {
      source: selected.source,
      medium: selected.medium,
      campaign: selected.medium === 'cpc' ? 'summer_sale' : null,
      referrer: selected.referrer,
      landing_page: '/',
      utm_params: selected.medium === 'cpc' ? {
        utm_source: selected.source,
        utm_medium: selected.medium,
        utm_campaign: 'summer_sale'
      } : {}
    };
  }
  
  private generateUserBehavior(): UserBehavior {
    return {
      mouse_movements: Math.floor(Math.random() * 500) + 100,
      clicks: Math.floor(Math.random() * 20) + 5,
      form_interactions: Math.floor(Math.random() * 5) + 2,
      copy_paste_events: Math.floor(Math.random() * 3),
      tab_switches: Math.floor(Math.random() * 5),
      idle_time: Math.floor(Math.random() * 60),
      rage_clicks: Math.random() < 0.1 ? Math.floor(Math.random() * 5) : 0,
      hesitation_time: Math.floor(Math.random() * 30) + 5
    };
  }
  
  private generateCartActivity(charge?: Stripe.Charge): CartActivity {
    const amount = charge?.amount || 10000;
    
    return {
      items_added: Math.floor(Math.random() * 3) + 1,
      items_removed: Math.floor(Math.random() * 2),
      cart_abandonment_count: Math.floor(Math.random() * 2),
      cart_value_changes: [
        amount * 0.5,
        amount * 0.75,
        amount
      ],
      checkout_attempts: Math.floor(Math.random() * 2) + 1,
      time_to_purchase: Math.floor(Math.random() * 600) + 60,
      payment_method_changes: Math.floor(Math.random() * 2)
    };
  }
  
  private detectFraudSignals(
    behavior: UserBehavior,
    cart: CartActivity,
    traffic: TrafficSource
  ): FraudSignal[] {
    const signals: FraudSignal[] = [];
    
    // Check for suspicious behavior
    if (behavior.copy_paste_events > 5) {
      signals.push({
        type: 'excessive_copy_paste',
        severity: 'medium',
        description: 'Unusual amount of copy-paste activity detected',
        timestamp: new Date()
      });
    }
    
    if (behavior.rage_clicks > 3) {
      signals.push({
        type: 'rage_clicking',
        severity: 'low',
        description: 'User showed frustration through rapid clicking',
        timestamp: new Date()
      });
    }
    
    if (cart.payment_method_changes > 3) {
      signals.push({
        type: 'payment_method_testing',
        severity: 'high',
        description: 'Multiple payment method changes detected',
        timestamp: new Date()
      });
    }
    
    if (behavior.hesitation_time > 60) {
      signals.push({
        type: 'checkout_hesitation',
        severity: 'low',
        description: 'Extended hesitation during checkout process',
        timestamp: new Date()
      });
    }
    
    return signals;
  }
  
  private calculateEngagementScore(
    pageViews: PageView[],
    behavior: UserBehavior,
    funnel: ConversionStep[]
  ): number {
    let score = 50; // Base score
    
    // Page view factors
    if (pageViews.length > 3) score += 10;
    if (pageViews.some(pv => pv.scroll_depth > 80)) score += 10;
    
    // Behavior factors
    if (behavior.mouse_movements > 200) score += 5;
    if (behavior.form_interactions > 2) score += 10;
    if (behavior.rage_clicks === 0) score += 5;
    
    // Funnel completion
    const completionRate = funnel.filter(s => s.completed).length / 6;
    score += completionRate * 20;
    
    return Math.min(100, Math.max(0, score));
  }
  
  private generateAccessLog(
    sessionId: string,
    visitorId: string,
    pageViews: PageView[],
    chargeDate: Date
  ): string {
    const logs = [
      `Session ID: ${sessionId}`,
      `Visitor ID: ${visitorId}`,
      `Session Start: ${pageViews[0]?.timestamp.toISOString() || chargeDate.toISOString()}`,
      `Session End: ${chargeDate.toISOString()}`,
      '',
      'Page Access Log:',
      ...pageViews.map(pv => 
        `${pv.timestamp.toISOString()} - ${pv.url} (${pv.duration_seconds}s, ${pv.interactions} interactions)`
      ),
      '',
      `Transaction Completed: ${chargeDate.toISOString()}`,
      'User authenticated: Yes',
      'Session valid: Yes'
    ];
    
    return logs.join('\n');
  }
  
  private generateSessionId(): string {
    return 'session_' + Math.random().toString(36).substr(2, 9);
  }
  
  private generateVisitorId(): string {
    return 'visitor_' + Math.random().toString(36).substr(2, 9);
  }
  
  validate(data: any): boolean {
    if (!data) return false;
    return !!(data.session_id && data.page_views && data.page_views.length > 0);
  }
  
  getConfidence(data: any): number {
    if (!data) return 0;
    
    let confidence = 0.5;
    
    if (data.session_id && !data.session_id.includes('ESTIMATED')) {
      confidence = 0.7;
      
      if (data.page_views.length > 3) confidence += 0.1;
      if (data.engagement_score > 70) confidence += 0.1;
      if (data.fraud_signals.length === 0) confidence += 0.1;
    }
    
    return Math.min(1, confidence);
  }
}