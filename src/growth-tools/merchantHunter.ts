import Stripe from 'stripe';

export interface TargetMerchant {
  merchantId: string;
  businessName: string;
  industry: string;
  estimatedVolume: number;
  disputeRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  currentProvider: string | null;
  contactInfo: ContactInfo;
  score: number;
  signals: string[];
}

export interface ContactInfo {
  email?: string;
  phone?: string;
  website?: string;
  socialMedia?: {
    twitter?: string;
    linkedin?: string;
    facebook?: string;
  };
  decisionMaker?: {
    name?: string;
    title?: string;
    email?: string;
    linkedin?: string;
  };
}

export interface HuntingStrategy {
  name: string;
  sources: string[];
  filters: SearchFilter[];
  priority: number;
}

export interface SearchFilter {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'in';
  value: any;
}

export class MerchantHunter {
  private stripe: Stripe;
  private strategies: HuntingStrategy[];
  private industryRiskScores: Map<string, number>;
  
  constructor(stripeSecretKey: string) {
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-07-30.basil',
    });
    
    this.strategies = this.initializeStrategies();
    this.industryRiskScores = this.initializeIndustryScores();
  }
  
  private initializeStrategies(): HuntingStrategy[] {
    return [
      {
        name: 'High-Risk Industries',
        sources: ['stripe_connect', 'industry_directories', 'business_registries'],
        filters: [
          { field: 'industry', operator: 'in', value: ['gambling', 'crypto', 'forex', 'adult', 'supplements'] },
          { field: 'monthly_volume', operator: 'greater_than', value: 50000 }
        ],
        priority: 1
      },
      {
        name: 'Digital Goods & Services',
        sources: ['app_stores', 'saas_directories', 'digital_marketplaces'],
        filters: [
          { field: 'product_type', operator: 'in', value: ['software', 'digital_download', 'subscription'] },
          { field: 'dispute_rate', operator: 'greater_than', value: 0.01 }
        ],
        priority: 2
      },
      {
        name: 'E-commerce High Volume',
        sources: ['shopify', 'woocommerce', 'bigcommerce'],
        filters: [
          { field: 'platform', operator: 'in', value: ['shopify', 'woocommerce', 'magento'] },
          { field: 'monthly_transactions', operator: 'greater_than', value: 1000 }
        ],
        priority: 3
      },
      {
        name: 'Travel & Hospitality',
        sources: ['travel_agencies', 'booking_platforms', 'tour_operators'],
        filters: [
          { field: 'industry', operator: 'equals', value: 'travel' },
          { field: 'advance_booking_days', operator: 'greater_than', value: 30 }
        ],
        priority: 4
      },
      {
        name: 'Subscription Services',
        sources: ['subscription_directories', 'recurring_billing_platforms'],
        filters: [
          { field: 'billing_model', operator: 'equals', value: 'subscription' },
          { field: 'churn_rate', operator: 'greater_than', value: 0.05 }
        ],
        priority: 5
      }
    ];
  }
  
  private initializeIndustryScores(): Map<string, number> {
    const scores = new Map<string, number>();
    
    // Very High Risk (80-100)
    scores.set('gambling', 95);
    scores.set('crypto', 90);
    scores.set('forex', 88);
    scores.set('adult', 85);
    scores.set('cbd', 85);
    scores.set('supplements', 82);
    scores.set('tobacco', 80);
    
    // High Risk (60-79)
    scores.set('travel', 75);
    scores.set('digital_goods', 72);
    scores.set('dating', 70);
    scores.set('gaming', 68);
    scores.set('subscription_box', 65);
    scores.set('dropshipping', 63);
    scores.set('info_products', 60);
    
    // Medium Risk (40-59)
    scores.set('saas', 55);
    scores.set('ecommerce', 50);
    scores.set('marketplace', 48);
    scores.set('education', 45);
    scores.set('fitness', 42);
    scores.set('entertainment', 40);
    
    // Low Risk (0-39)
    scores.set('b2b_services', 30);
    scores.set('utilities', 25);
    scores.set('government', 20);
    scores.set('nonprofit', 15);
    
    return scores;
  }
  
  async findTargets(limit: number = 100): Promise<TargetMerchant[]> {
    console.log(`Starting merchant hunt with ${this.strategies.length} strategies...`);
    
    const targets: TargetMerchant[] = [];
    
    for (const strategy of this.strategies) {
      console.log(`Executing strategy: ${strategy.name}`);
      const strategyTargets = await this.executeStrategy(strategy, limit - targets.length);
      targets.push(...strategyTargets);
      
      if (targets.length >= limit) break;
    }
    
    // Score and rank targets
    const scoredTargets = targets.map(target => ({
      ...target,
      score: this.scoreTarget(target)
    }));
    
    // Sort by score (highest first)
    scoredTargets.sort((a, b) => b.score - a.score);
    
    console.log(`Found ${scoredTargets.length} potential targets`);
    return scoredTargets.slice(0, limit);
  }
  
  private async executeStrategy(strategy: HuntingStrategy, limit: number): Promise<TargetMerchant[]> {
    const targets: TargetMerchant[] = [];
    
    // Simulate data source queries
    // In production, this would connect to real data sources
    
    if (strategy.name === 'High-Risk Industries') {
      targets.push(...this.generateHighRiskTargets(limit));
    } else if (strategy.name === 'Digital Goods & Services') {
      targets.push(...this.generateDigitalGoodsTargets(limit));
    } else if (strategy.name === 'E-commerce High Volume') {
      targets.push(...this.generateEcommerceTargets(limit));
    } else if (strategy.name === 'Travel & Hospitality') {
      targets.push(...this.generateTravelTargets(limit));
    } else if (strategy.name === 'Subscription Services') {
      targets.push(...this.generateSubscriptionTargets(limit));
    }
    
    return targets;
  }
  
  private generateHighRiskTargets(count: number): TargetMerchant[] {
    const industries = ['gambling', 'crypto', 'forex', 'supplements', 'cbd'];
    const targets: TargetMerchant[] = [];
    
    for (let i = 0; i < Math.min(count, 20); i++) {
      const industry = industries[i % industries.length];
      targets.push({
        merchantId: `high_risk_${Date.now()}_${i}`,
        businessName: `${industry.charAt(0).toUpperCase() + industry.slice(1)} Ventures ${i + 1}`,
        industry: industry,
        estimatedVolume: 50000 + Math.random() * 450000,
        disputeRisk: 'VERY_HIGH',
        currentProvider: Math.random() > 0.5 ? 'Chargeflow' : null,
        contactInfo: {
          email: `contact@${industry}ventures${i + 1}.com`,
          website: `https://${industry}ventures${i + 1}.com`,
          decisionMaker: {
            title: 'CEO',
            name: `John Smith ${i + 1}`
          }
        },
        score: 0,
        signals: [
          'High transaction volume',
          'Industry dispute rate >2%',
          'International transactions >40%'
        ]
      });
    }
    
    return targets;
  }
  
  private generateDigitalGoodsTargets(count: number): TargetMerchant[] {
    const types = ['SaaS', 'Digital Downloads', 'Online Courses', 'Software', 'Apps'];
    const targets: TargetMerchant[] = [];
    
    for (let i = 0; i < Math.min(count, 15); i++) {
      const type = types[i % types.length];
      targets.push({
        merchantId: `digital_${Date.now()}_${i}`,
        businessName: `${type} Pro ${i + 1}`,
        industry: 'digital_goods',
        estimatedVolume: 30000 + Math.random() * 270000,
        disputeRisk: 'HIGH',
        currentProvider: Math.random() > 0.7 ? 'Disputifier' : null,
        contactInfo: {
          email: `sales@${type.toLowerCase().replace(' ', '')}pro${i + 1}.com`,
          website: `https://${type.toLowerCase().replace(' ', '')}pro${i + 1}.com`
        },
        score: 0,
        signals: [
          'Instant delivery product',
          'No physical goods',
          'Subscription model'
        ]
      });
    }
    
    return targets;
  }
  
  private generateEcommerceTargets(count: number): TargetMerchant[] {
    const categories = ['Fashion', 'Electronics', 'Home Goods', 'Beauty', 'Sports'];
    const targets: TargetMerchant[] = [];
    
    for (let i = 0; i < Math.min(count, 10); i++) {
      const category = categories[i % categories.length];
      targets.push({
        merchantId: `ecom_${Date.now()}_${i}`,
        businessName: `${category} Direct ${i + 1}`,
        industry: 'ecommerce',
        estimatedVolume: 100000 + Math.random() * 900000,
        disputeRisk: 'MEDIUM',
        currentProvider: null,
        contactInfo: {
          email: `operations@${category.toLowerCase()}direct${i + 1}.com`,
          website: `https://${category.toLowerCase()}direct${i + 1}.com`
        },
        score: 0,
        signals: [
          'High order volume',
          'International shipping',
          'Peak season spikes'
        ]
      });
    }
    
    return targets;
  }
  
  private generateTravelTargets(count: number): TargetMerchant[] {
    const types = ['Tours', 'Hotels', 'Flights', 'Cruises', 'Car Rentals'];
    const targets: TargetMerchant[] = [];
    
    for (let i = 0; i < Math.min(count, 8); i++) {
      const type = types[i % types.length];
      targets.push({
        merchantId: `travel_${Date.now()}_${i}`,
        businessName: `${type} Booker ${i + 1}`,
        industry: 'travel',
        estimatedVolume: 200000 + Math.random() * 800000,
        disputeRisk: 'HIGH',
        currentProvider: Math.random() > 0.6 ? 'ChargePay' : null,
        contactInfo: {
          email: `bookings@${type.toLowerCase().replace(' ', '')}booker${i + 1}.com`,
          website: `https://${type.toLowerCase().replace(' ', '')}booker${i + 1}.com`
        },
        score: 0,
        signals: [
          'Advanced bookings',
          'Cancellation disputes common',
          'High ticket value'
        ]
      });
    }
    
    return targets;
  }
  
  private generateSubscriptionTargets(count: number): TargetMerchant[] {
    const types = ['Streaming', 'Box Subscription', 'Membership', 'Newsletter', 'Cloud Service'];
    const targets: TargetMerchant[] = [];
    
    for (let i = 0; i < Math.min(count, 5); i++) {
      const type = types[i % types.length];
      targets.push({
        merchantId: `subscription_${Date.now()}_${i}`,
        businessName: `${type} Plus ${i + 1}`,
        industry: 'subscription',
        estimatedVolume: 50000 + Math.random() * 450000,
        disputeRisk: 'MEDIUM',
        currentProvider: null,
        contactInfo: {
          email: `support@${type.toLowerCase().replace(' ', '')}plus${i + 1}.com`,
          website: `https://${type.toLowerCase().replace(' ', '')}plus${i + 1}.com`
        },
        score: 0,
        signals: [
          'Recurring billing',
          'Free trial offers',
          'Churn rate >5%'
        ]
      });
    }
    
    return targets;
  }
  
  private scoreTarget(target: TargetMerchant): number {
    let score = 0;
    
    // Industry risk score (0-40 points)
    const industryScore = this.industryRiskScores.get(target.industry) || 50;
    score += (industryScore / 100) * 40;
    
    // Volume score (0-30 points)
    if (target.estimatedVolume > 500000) score += 30;
    else if (target.estimatedVolume > 200000) score += 20;
    else if (target.estimatedVolume > 50000) score += 10;
    
    // Competition score (0-20 points)
    if (target.currentProvider) {
      score += 20; // They're already paying for a solution
    }
    
    // Risk level score (0-10 points)
    switch (target.disputeRisk) {
      case 'VERY_HIGH': score += 10; break;
      case 'HIGH': score += 7; break;
      case 'MEDIUM': score += 4; break;
      case 'LOW': score += 1; break;
    }
    
    return Math.round(score);
  }
  
  async enrichContact(target: TargetMerchant): Promise<TargetMerchant> {
    console.log(`Enriching contact info for ${target.businessName}...`);
    
    // In production, this would use services like:
    // - Clearbit for company data
    // - Hunter.io for email finding
    // - LinkedIn API for decision makers
    // - Crunchbase for funding info
    
    if (!target.contactInfo.decisionMaker?.email) {
      target.contactInfo.decisionMaker = {
        ...target.contactInfo.decisionMaker,
        email: `ceo@${target.businessName.toLowerCase().replace(/\s+/g, '')}.com`
      };
    }
    
    return target;
  }
  
  generateOutreachStrategy(target: TargetMerchant): string {
    const strategies = {
      'VERY_HIGH': `
Urgent: Your ${target.industry} business is at extreme risk for chargebacks.

Hi {firstName},

I noticed ${target.businessName} processes over $${(target.estimatedVolume/1000).toFixed(0)}k monthly in ${target.industry}.

With dispute rates averaging ${this.getIndustryDisputeRate(target.industry)}% in your industry, you're likely losing $${(target.estimatedVolume * 0.02).toFixed(0)} monthly to chargebacks.

Our CE3.0 automation recovers 95% of eligible disputes automatically. ${target.currentProvider ? `Unlike ${target.currentProvider} who charges 25% of recoveries, we` : 'We'} charge a flat $799/mo.

Worth a quick call to save $${(target.estimatedVolume * 0.02 * 12).toFixed(0)}/year?

Best,
[Your Name]`,
      
      'HIGH': `
Subject: Recover 75% of your ${target.industry} chargebacks

Hi {firstName},

${target.businessName}'s transaction volume suggests you're dealing with 10-20 disputes monthly.

${target.currentProvider ? `If you're using ${target.currentProvider}, you're paying ~$${(target.estimatedVolume * 0.003).toFixed(0)}/mo in success fees alone.` : 'Most merchants your size are losing 45% of disputes.'}

We help ${target.industry} businesses:
• Auto-win 35% of disputes with CE3.0
• Achieve 75% overall win rate
• Save 68% vs percentage-based pricing

Free dispute analysis: [link]

Best,
[Your Name]`,
      
      'MEDIUM': `
Subject: Quick question about ${target.businessName}'s dispute management

Hi {firstName},

How does ${target.businessName} currently handle Stripe disputes?

We've helped similar ${target.industry} businesses improve win rates from 45% to 75% while cutting costs by 68%.

Interested in a 5-minute demo?

Best,
[Your Name]`,
      
      'LOW': `
Subject: Automate ${target.businessName}'s chargeback defense

Hi {firstName},

Even with low dispute rates, manual chargeback management costs your team valuable time.

Our automation handles everything for $399/mo flat.

Worth exploring?

Best,
[Your Name]`
    };
    
    return strategies[target.disputeRisk] || strategies['MEDIUM'];
  }
  
  private getIndustryDisputeRate(industry: string): string {
    const rates: { [key: string]: string } = {
      'gambling': '3.5',
      'crypto': '2.8',
      'forex': '2.5',
      'supplements': '2.2',
      'travel': '1.8',
      'digital_goods': '1.5',
      'ecommerce': '0.8',
      'subscription': '1.2'
    };
    return rates[industry] || '1.0';
  }
  
  async exportToCSV(targets: TargetMerchant[]): Promise<string> {
    const headers = [
      'Business Name',
      'Industry',
      'Estimated Volume',
      'Dispute Risk',
      'Current Provider',
      'Score',
      'Email',
      'Website',
      'Decision Maker',
      'Signals'
    ];
    
    const rows = targets.map(t => [
      t.businessName,
      t.industry,
      t.estimatedVolume.toString(),
      t.disputeRisk,
      t.currentProvider || 'None',
      t.score.toString(),
      t.contactInfo.email || '',
      t.contactInfo.website || '',
      t.contactInfo.decisionMaker?.name || '',
      t.signals.join('; ')
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    return csv;
  }
}