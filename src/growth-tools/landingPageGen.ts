import logger from '../shared/logger';

export interface LandingPage {
  id: string;
  url: string;
  industry: string;
  template: string;
  headline: string;
  subheadline: string;
  benefits: string[];
  testimonials: PageTestimonial[];
  cta: CallToAction;
  metrics: PageMetrics;
  created: Date;
  updated: Date;
}

export interface PageTestimonial {
  name: string;
  company: string;
  quote: string;
  avatar?: string;
}

export interface CallToAction {
  primary: string;
  secondary?: string;
  urgency?: string;
  discount?: string;
}

export interface PageMetrics {
  views: number;
  conversions: number;
  conversionRate: number;
  bounceRate: number;
  avgTimeOnPage: number;
}

export class LandingPageGenerator {
  private templates: Map<string, PageTemplate>;
  
  constructor() {
    this.templates = this.initializeTemplates();
  }
  
  private initializeTemplates(): Map<string, PageTemplate> {
    const templates = new Map<string, PageTemplate>();
    
    templates.set('gambling', {
      industry: 'gambling',
      headline: 'Stop Losing 3.5% to Chargebacks',
      subheadline: 'CE3.0 Auto-Wins for Gaming & Betting Sites',
      benefits: [
        '95% win rate on Visa disputes',
        'Automatic CE3.0 detection',
        'Save $50k+/year vs competitors',
        'No percentage fees'
      ],
      urgency: 'Limited spots for high-risk merchants'
    });
    
    templates.set('subscription', {
      industry: 'subscription',
      headline: 'End Subscription Chargeback Headaches',
      subheadline: 'Automated Defense for Recurring Billing',
      benefits: [
        'Handle "canceled subscription" disputes',
        'Automatic evidence collection',
        '75% win rate guarantee',
        'Flat monthly pricing'
      ],
      urgency: 'Prices increase next month'
    });
    
    templates.set('digital_goods', {
      industry: 'digital_goods',
      headline: 'Protect Digital Sales from Disputes',
      subheadline: 'Smart Evidence for Intangible Products',
      benefits: [
        'Prove digital delivery',
        'Track usage & access logs',
        'Fight friendly fraud',
        '68% cheaper than competitors'
      ],
      urgency: 'Only 10 slots available this month'
    });
    
    templates.set('ecommerce', {
      industry: 'ecommerce',
      headline: 'Automate E-commerce Chargeback Defense',
      subheadline: 'From Shipping Proof to Win',
      benefits: [
        'Auto-gather shipping evidence',
        'CE3.0 eligibility detection',
        'Save 20 hours/month',
        'Integrate with Shopify/WooCommerce'
      ],
      urgency: 'Special launch pricing'
    });
    
    return templates;
  }
  
  generatePage(industry: string, merchantName?: string): LandingPage {
    const template = this.templates.get(industry) || this.templates.get('ecommerce')!;
    const pageId = this.generatePageId();
    
    return {
      id: pageId,
      url: `https://chargebackautopilot.com/lp/${industry}/${pageId}`,
      industry: industry,
      template: template.industry,
      headline: template.headline,
      subheadline: template.subheadline,
      benefits: template.benefits,
      testimonials: this.generateTestimonials(industry),
      cta: {
        primary: 'Start Free Trial',
        secondary: 'See Live Demo',
        urgency: template.urgency,
        discount: '50% off first month'
      },
      metrics: {
        views: 0,
        conversions: 0,
        conversionRate: 0,
        bounceRate: 0,
        avgTimeOnPage: 0
      },
      created: new Date(),
      updated: new Date()
    };
  }
  
  private generateTestimonials(industry: string): PageTestimonial[] {
    const testimonialSets: { [key: string]: PageTestimonial[] } = {
      gambling: [
        {
          name: 'Marcus Chen',
          company: 'BetPro Gaming',
          quote: 'Cut our chargeback rate by 60% in the first month. CE3.0 detection is a game-changer.'
        },
        {
          name: 'Sarah Williams',
          company: 'Casino Online Ltd',
          quote: 'Finally, a solution that understands high-risk processing. Saving $30k/month.'
        }
      ],
      subscription: [
        {
          name: 'David Park',
          company: 'SaaS Metrics Pro',
          quote: 'Handles cancellation disputes perfectly. Win rate went from 30% to 78%.'
        },
        {
          name: 'Jennifer Adams',
          company: 'Subscription Box Co',
          quote: 'Automated evidence collection saves us 15 hours per week.'
        }
      ],
      digital_goods: [
        {
          name: 'Alex Rivera',
          company: 'Digital Downloads Inc',
          quote: 'Proves digital delivery every time. Haven\'t lost a dispute in 3 months.'
        },
        {
          name: 'Tom Bradley',
          company: 'Software Direct',
          quote: 'The usage tracking feature alone is worth the price. Incredible ROI.'
        }
      ],
      ecommerce: [
        {
          name: 'Lisa Chang',
          company: 'Fashion Forward',
          quote: 'Seamless Shopify integration. Set it and forget it - disputes handle themselves.'
        },
        {
          name: 'Michael Foster',
          company: 'Tech Gadgets Plus',
          quote: 'Reduced dispute losses by 70%. Best investment we\'ve made this year.'
        }
      ]
    };
    
    return testimonialSets[industry] || testimonialSets['ecommerce'];
  }
  
  generateHTML(page: LandingPage): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${page.headline} | Chargeback Autopilot</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .hero { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 60px 20px; text-align: center; }
        .headline { font-size: 48px; margin-bottom: 20px; }
        .subheadline { font-size: 24px; opacity: 0.9; }
        .benefits { padding: 40px 20px; max-width: 800px; margin: 0 auto; }
        .benefit { margin: 20px 0; padding: 20px; background: #f7f7f7; border-radius: 8px; }
        .cta-button { background: #10b981; color: white; padding: 16px 32px; font-size: 18px; border: none; border-radius: 8px; cursor: pointer; }
        .testimonial { padding: 20px; margin: 20px 0; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 8px; }
        .urgency { background: #fef3c7; color: #92400e; padding: 10px; text-align: center; font-weight: bold; }
    </style>
</head>
<body>
    ${page.cta.urgency ? `<div class="urgency">⚡ ${page.cta.urgency}</div>` : ''}
    
    <div class="hero">
        <h1 class="headline">${page.headline}</h1>
        <p class="subheadline">${page.subheadline}</p>
        <button class="cta-button">${page.cta.primary}</button>
    </div>
    
    <div class="benefits">
        <h2>Why ${page.industry} Businesses Choose Us</h2>
        ${page.benefits.map(b => `<div class="benefit">✅ ${b}</div>`).join('')}
    </div>
    
    <div class="testimonials" style="max-width: 800px; margin: 0 auto; padding: 20px;">
        <h2>What Our Customers Say</h2>
        ${page.testimonials.map(t => `
            <div class="testimonial">
                <p>"${t.quote}"</p>
                <strong>${t.name}</strong>, ${t.company}
            </div>
        `).join('')}
    </div>
    
    <div style="text-align: center; padding: 40px;">
        <button class="cta-button">${page.cta.primary}</button>
        ${page.cta.discount ? `<p style="color: #10b981; font-weight: bold;">${page.cta.discount}</p>` : ''}
    </div>
</body>
</html>`;
  }
  
  private generatePageId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  
  updateMetrics(pageId: string, metrics: Partial<PageMetrics>): void {
    logger.info('Updating landing page metrics', { pageId, metrics });
  }

  getTopPerformers(limit: number = 5): LandingPage[] {
    logger.info('Retrieving top performing pages', { limit });
    return [];
  }
  
  optimizePage(page: LandingPage): LandingPage {
    if (page.metrics.conversionRate < 0.02) {
      page.cta.primary = 'Get Instant Access';
      page.cta.urgency = 'Only 3 spots left today!';
    }
    
    if (page.metrics.bounceRate > 0.7) {
      page.benefits = page.benefits.slice(0, 3);
      page.headline = `${page.headline} (Takes 2 Minutes)`;
    }
    
    return page;
  }
}

interface PageTemplate {
  industry: string;
  headline: string;
  subheadline: string;
  benefits: string[];
  urgency?: string;
}