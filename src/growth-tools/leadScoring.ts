export interface Lead {
  id: string;
  email: string;
  name: string;
  company: string;
  industry: string;
  website?: string;
  phone?: string;
  source: LeadSource;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  signals: LeadSignal[];
  engagement: EngagementMetrics;
  attributes: LeadAttributes;
  status: 'new' | 'qualified' | 'nurturing' | 'sales_ready' | 'customer' | 'lost';
  created: Date;
  updated: Date;
}

export interface LeadSource {
  type: 'organic' | 'paid' | 'referral' | 'direct' | 'social' | 'email';
  campaign?: string;
  medium?: string;
  referrer?: string;
}

export interface LeadSignal {
  type: string;
  value: any;
  weight: number;
  timestamp: Date;
}

export interface EngagementMetrics {
  websiteVisits: number;
  pageViews: number;
  emailOpens: number;
  emailClicks: number;
  contentDownloads: number;
  demoRequests: number;
  supportTickets: number;
  lastActivity: Date | null;
}

export interface LeadAttributes {
  companySize?: 'small' | 'medium' | 'large' | 'enterprise';
  monthlyVolume?: number;
  currentProvider?: string;
  disputeRate?: number;
  urgency?: 'low' | 'medium' | 'high' | 'immediate';
  budget?: number;
  decisionTimeframe?: string;
  painPoints?: string[];
  technicalFit?: number;
}

export interface ScoringRule {
  field: string;
  condition: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'exists';
  value: any;
  points: number;
  category: 'demographic' | 'behavioral' | 'firmographic' | 'engagement';
}

export class LeadScoring {
  private leads: Map<string, Lead>;
  private scoringRules: ScoringRule[];
  private gradeThresholds: { [key: string]: number };
  
  constructor() {
    this.leads = new Map();
    this.scoringRules = this.initializeScoringRules();
    this.gradeThresholds = {
      'A': 80,
      'B': 60,
      'C': 40,
      'D': 20,
      'F': 0
    };
  }
  
  private initializeScoringRules(): ScoringRule[] {
    return [
      // Firmographic scoring
      { field: 'industry', condition: 'equals', value: 'gambling', points: 20, category: 'firmographic' },
      { field: 'industry', condition: 'equals', value: 'crypto', points: 18, category: 'firmographic' },
      { field: 'industry', condition: 'equals', value: 'forex', points: 17, category: 'firmographic' },
      { field: 'industry', condition: 'equals', value: 'supplements', points: 16, category: 'firmographic' },
      { field: 'industry', condition: 'equals', value: 'travel', points: 15, category: 'firmographic' },
      { field: 'industry', condition: 'equals', value: 'subscription', points: 12, category: 'firmographic' },
      { field: 'industry', condition: 'equals', value: 'digital_goods', points: 12, category: 'firmographic' },
      { field: 'industry', condition: 'equals', value: 'ecommerce', points: 10, category: 'firmographic' },
      
      // Volume scoring
      { field: 'monthlyVolume', condition: 'greater_than', value: 1000000, points: 20, category: 'firmographic' },
      { field: 'monthlyVolume', condition: 'greater_than', value: 500000, points: 15, category: 'firmographic' },
      { field: 'monthlyVolume', condition: 'greater_than', value: 100000, points: 10, category: 'firmographic' },
      { field: 'monthlyVolume', condition: 'greater_than', value: 50000, points: 5, category: 'firmographic' },
      
      // Behavioral scoring
      { field: 'websiteVisits', condition: 'greater_than', value: 5, points: 10, category: 'behavioral' },
      { field: 'pageViews', condition: 'greater_than', value: 10, points: 8, category: 'behavioral' },
      { field: 'emailOpens', condition: 'greater_than', value: 3, points: 5, category: 'behavioral' },
      { field: 'emailClicks', condition: 'greater_than', value: 1, points: 10, category: 'behavioral' },
      { field: 'contentDownloads', condition: 'greater_than', value: 0, points: 15, category: 'behavioral' },
      { field: 'demoRequests', condition: 'greater_than', value: 0, points: 25, category: 'behavioral' },
      
      // Engagement scoring
      { field: 'source.type', condition: 'equals', value: 'organic', points: 8, category: 'engagement' },
      { field: 'source.type', condition: 'equals', value: 'paid', points: 5, category: 'engagement' },
      { field: 'source.type', condition: 'equals', value: 'referral', points: 12, category: 'engagement' },
      
      // Urgency scoring
      { field: 'urgency', condition: 'equals', value: 'immediate', points: 20, category: 'demographic' },
      { field: 'urgency', condition: 'equals', value: 'high', points: 15, category: 'demographic' },
      { field: 'urgency', condition: 'equals', value: 'medium', points: 8, category: 'demographic' },
      
      // Competition scoring
      { field: 'currentProvider', condition: 'exists', value: true, points: 15, category: 'firmographic' },
      { field: 'currentProvider', condition: 'equals', value: 'Chargeflow', points: 10, category: 'firmographic' },
      { field: 'currentProvider', condition: 'equals', value: 'ChargePay', points: 10, category: 'firmographic' },
      
      // Problem fit scoring
      { field: 'disputeRate', condition: 'greater_than', value: 0.02, points: 15, category: 'firmographic' },
      { field: 'disputeRate', condition: 'greater_than', value: 0.01, points: 10, category: 'firmographic' },
      { field: 'disputeRate', condition: 'greater_than', value: 0.005, points: 5, category: 'firmographic' }
    ];
  }
  
  createLead(leadData: Partial<Lead>): Lead {
    const leadId = this.generateLeadId();
    
    const lead: Lead = {
      id: leadId,
      email: leadData.email || '',
      name: leadData.name || '',
      company: leadData.company || '',
      industry: leadData.industry || 'unknown',
      website: leadData.website,
      phone: leadData.phone,
      source: leadData.source || { type: 'direct' },
      score: 0,
      grade: 'F',
      signals: [],
      engagement: leadData.engagement || {
        websiteVisits: 0,
        pageViews: 0,
        emailOpens: 0,
        emailClicks: 0,
        contentDownloads: 0,
        demoRequests: 0,
        supportTickets: 0,
        lastActivity: null
      },
      attributes: leadData.attributes || {},
      status: 'new',
      created: new Date(),
      updated: new Date()
    };
    
    // Calculate initial score
    this.scoreLead(lead);
    
    this.leads.set(leadId, lead);
    return lead;
  }
  
  scoreLead(lead: Lead): number {
    let totalScore = 0;
    const signals: LeadSignal[] = [];
    
    // Apply scoring rules
    this.scoringRules.forEach(rule => {
      if (this.evaluateRule(rule, lead)) {
        totalScore += rule.points;
        signals.push({
          type: `${rule.category}:${rule.field}`,
          value: this.getFieldValue(lead, rule.field),
          weight: rule.points,
          timestamp: new Date()
        });
      }
    });
    
    // Behavioral decay - reduce score for inactivity
    if (lead.engagement.lastActivity) {
      const daysSinceActivity = Math.floor(
        (Date.now() - lead.engagement.lastActivity.getTime()) / (1000 * 86400)
      );
      
      if (daysSinceActivity > 30) {
        totalScore -= 10;
        signals.push({
          type: 'decay:inactivity',
          value: daysSinceActivity,
          weight: -10,
          timestamp: new Date()
        });
      }
    }
    
    // Update lead
    lead.score = Math.max(0, Math.min(100, totalScore));
    lead.grade = this.calculateGrade(lead.score);
    lead.signals = signals;
    lead.updated = new Date();
    
    // Update status based on score
    this.updateLeadStatus(lead);
    
    return lead.score;
  }
  
  private evaluateRule(rule: ScoringRule, lead: Lead): boolean {
    const value = this.getFieldValue(lead, rule.field);
    
    switch (rule.condition) {
      case 'equals':
        return value === rule.value;
      case 'contains':
        return String(value).includes(String(rule.value));
      case 'greater_than':
        return Number(value) > Number(rule.value);
      case 'less_than':
        return Number(value) < Number(rule.value);
      case 'exists':
        return value !== undefined && value !== null && value !== '';
      default:
        return false;
    }
  }
  
  private getFieldValue(lead: Lead, field: string): any {
    const path = field.split('.');
    let value: any = lead;
    
    for (const key of path) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return undefined;
      }
    }
    
    return value;
  }
  
  private calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= this.gradeThresholds['A']) return 'A';
    if (score >= this.gradeThresholds['B']) return 'B';
    if (score >= this.gradeThresholds['C']) return 'C';
    if (score >= this.gradeThresholds['D']) return 'D';
    return 'F';
  }
  
  private updateLeadStatus(lead: Lead): void {
    if (lead.status === 'customer') return;
    
    if (lead.score >= 80 && lead.engagement.demoRequests > 0) {
      lead.status = 'sales_ready';
    } else if (lead.score >= 60) {
      lead.status = 'qualified';
    } else if (lead.score >= 40) {
      lead.status = 'nurturing';
    } else {
      lead.status = 'new';
    }
  }
  
  trackEngagement(leadId: string, action: string, value?: any): void {
    const lead = this.leads.get(leadId);
    if (!lead) return;
    
    switch (action) {
      case 'website_visit':
        lead.engagement.websiteVisits++;
        break;
      case 'page_view':
        lead.engagement.pageViews++;
        break;
      case 'email_open':
        lead.engagement.emailOpens++;
        break;
      case 'email_click':
        lead.engagement.emailClicks++;
        break;
      case 'content_download':
        lead.engagement.contentDownloads++;
        break;
      case 'demo_request':
        lead.engagement.demoRequests++;
        break;
    }
    
    lead.engagement.lastActivity = new Date();
    this.scoreLead(lead); // Recalculate score
  }
  
  enrichLead(leadId: string, additionalData: Partial<Lead>): void {
    const lead = this.leads.get(leadId);
    if (!lead) return;
    
    // Merge additional data
    if (additionalData.attributes) {
      lead.attributes = { ...lead.attributes, ...additionalData.attributes };
    }
    
    if (additionalData.website) lead.website = additionalData.website;
    if (additionalData.phone) lead.phone = additionalData.phone;
    if (additionalData.industry) lead.industry = additionalData.industry;
    
    // Recalculate score with new data
    this.scoreLead(lead);
  }
  
  getTopLeads(limit: number = 10): Lead[] {
    const leads = Array.from(this.leads.values());
    return leads
      .filter(l => l.status !== 'customer' && l.status !== 'lost')
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  
  getSalesReadyLeads(): Lead[] {
    return Array.from(this.leads.values())
      .filter(l => l.status === 'sales_ready');
  }
  
  getLeadsByIndustry(industry: string): Lead[] {
    return Array.from(this.leads.values())
      .filter(l => l.industry === industry);
  }
  
  predictConversionProbability(lead: Lead): number {
    let probability = lead.score / 100;
    
    // Boost for high engagement
    if (lead.engagement.demoRequests > 0) probability += 0.3;
    if (lead.engagement.contentDownloads > 2) probability += 0.1;
    if (lead.engagement.emailClicks > 3) probability += 0.1;
    
    // Reduce for inactivity
    if (lead.engagement.lastActivity) {
      const daysSinceActivity = Math.floor(
        (Date.now() - lead.engagement.lastActivity.getTime()) / (1000 * 86400)
      );
      if (daysSinceActivity > 14) probability -= 0.2;
    }
    
    // Industry modifiers
    const highConversionIndustries = ['gambling', 'crypto', 'forex'];
    if (highConversionIndustries.includes(lead.industry)) {
      probability += 0.1;
    }
    
    return Math.max(0, Math.min(1, probability));
  }
  
  getNextBestAction(lead: Lead): string {
    if (lead.engagement.demoRequests > 0 && lead.score >= 70) {
      return 'Schedule sales call immediately';
    }
    
    if (lead.score >= 80 && lead.engagement.emailClicks === 0) {
      return 'Send personalized video demo';
    }
    
    if (lead.score >= 60 && lead.engagement.contentDownloads === 0) {
      return 'Share CE3.0 case study';
    }
    
    if (lead.score >= 40 && lead.engagement.emailOpens < 2) {
      return 'Try different email subject lines';
    }
    
    if (lead.score < 40 && lead.engagement.websiteVisits === 0) {
      return 'Retarget with paid ads';
    }
    
    return 'Continue nurture sequence';
  }
  
  private generateLeadId(): string {
    return 'lead_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  
  exportLeads(status?: string): Lead[] {
    const leads = Array.from(this.leads.values());
    if (status) {
      return leads.filter(l => l.status === status);
    }
    return leads;
  }
}