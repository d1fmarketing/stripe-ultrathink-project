import logger from '../shared/logger';

export interface EmailCampaign {
  id: string;
  name: string;
  targetIndustry: string;
  sequence: EmailSequence[];
  recipients: Recipient[];
  status: 'draft' | 'active' | 'paused' | 'completed';
  metrics: CampaignMetrics;
  created: Date;
  started?: Date;
}

export interface EmailSequence {
  step: number;
  delayDays: number;
  subject: string;
  body: string;
  callToAction: string;
  followUpTrigger?: string;
}

export interface Recipient {
  email: string;
  name: string;
  company: string;
  industry: string;
  currentStep: number;
  status: 'pending' | 'active' | 'responded' | 'unsubscribed' | 'bounced';
  opens: number;
  clicks: number;
  lastActivity?: Date;
}

export interface CampaignMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  responded: number;
  unsubscribed: number;
  bounced: number;
  converted: number;
  revenue: number;
}

export class OutreachAutomation {
  private campaigns: Map<string, EmailCampaign>;
  private templates: Map<string, EmailSequence[]>;
  
  constructor() {
    this.campaigns = new Map();
    this.templates = this.initializeTemplates();
  }
  
  private initializeTemplates(): Map<string, EmailSequence[]> {
    const templates = new Map<string, EmailSequence[]>();
    
    templates.set('high_risk_cold', [
      {
        step: 1,
        delayDays: 0,
        subject: 'Quick question about {company}\'s chargeback rate',
        body: `Hi {firstName},

I noticed {company} processes payments in the {industry} space. With industry dispute rates at {disputeRate}%, I'm curious - how are you currently handling chargebacks?

Most {industry} businesses lose 45% of disputes. We help similar companies achieve 75% win rates with CE3.0 automation.

Worth a quick chat?

Best,
{senderName}`,
        callToAction: 'Book 15-min call',
        followUpTrigger: 'no_open_3_days'
      },
      {
        step: 2,
        delayDays: 3,
        subject: 'Re: {company}\'s chargeback rate',
        body: `Hi {firstName},

Following up on my previous note. 

Just helped another {industry} company recover $47k in disputed transactions last month using CE3.0 auto-wins.

Here's a 2-minute video showing how it works: [link]

Worth exploring for {company}?

{senderName}`,
        callToAction: 'Watch 2-min demo',
        followUpTrigger: 'opened_no_click'
      },
      {
        step: 3,
        delayDays: 7,
        subject: 'Last check-in',
        body: `Hi {firstName},

I'll keep this brief - 

If {company} is happy with your current chargeback win rate, please ignore this.

If not, we're offering 50% off for {industry} businesses this month only.

Free dispute analysis here: [link]

{senderName}

P.S. - This is my last email unless you reply.`,
        callToAction: 'Get free analysis'
      }
    ]);
    
    templates.set('warm_lead', [
      {
        step: 1,
        delayDays: 0,
        subject: 'Your chargeback automation inquiry',
        body: `Hi {firstName},

Thanks for your interest in Chargeback Autopilot!

Based on {company} being in {industry}, you're likely seeing:
• {disputeRate}% dispute rate
• 45% average win rate
• {estimatedLoss}/month in losses

With our CE3.0 automation, similar businesses achieve:
✅ 75% win rate (30% improvement)
✅ 95% auto-win on eligible disputes
✅ {estimatedSavings}/month saved

Can we schedule a quick demo this week?

Available times: [calendar link]

Best,
{senderName}`,
        callToAction: 'Schedule demo'
      },
      {
        step: 2,
        delayDays: 2,
        subject: 'CE3.0 could save {company} {estimatedSavings}/month',
        body: `Hi {firstName},

Quick update - I analyzed {company}'s potential with our system:

Current situation:
• Estimated {monthlyDisputes} disputes/month
• Losing ~{losingCount} disputes
• Cost: {currentCost}

With Chargeback Autopilot:
• Win ~{winningCount} disputes
• CE3.0 auto-wins: {ce3Count}
• Save: {estimatedSavings}/month

ROI in first month: {roiPercentage}%

Ready to start saving?

{senderName}`,
        callToAction: 'Start free trial'
      }
    ]);
    
    templates.set('trial_nurture', [
      {
        step: 1,
        delayDays: 1,
        subject: 'Welcome to Chargeback Autopilot! Here\'s your setup guide',
        body: `Hi {firstName},

Welcome aboard! Let's get {company} winning more disputes immediately.

Quick setup checklist:
☐ Connect Stripe account (2 min)
☐ Configure CE3.0 detection (automatic)
☐ Set evidence preferences (optional)
☐ Test with sample dispute (included)

Need help? Book a setup call: [link]

Your success manager,
{senderName}`,
        callToAction: 'Complete setup'
      },
      {
        step: 2,
        delayDays: 3,
        subject: 'First win incoming! CE3.0 detected for {company}',
        body: `Great news {firstName}!

Our system just detected CE3.0 eligibility for one of your disputes:
• Dispute ID: {disputeId}
• Amount: {amount}
• Win probability: 95%
• Status: Evidence submitted

This dispute should auto-win within 48 hours.

See full details in your dashboard: [link]

{senderName}`,
        callToAction: 'View dashboard'
      }
    ]);
    
    return templates;
  }
  
  createCampaign(
    name: string,
    industry: string,
    templateType: 'high_risk_cold' | 'warm_lead' | 'trial_nurture'
  ): EmailCampaign {
    const campaignId = this.generateCampaignId();
    const template = this.templates.get(templateType) || this.templates.get('high_risk_cold')!;
    
    const campaign: EmailCampaign = {
      id: campaignId,
      name: name,
      targetIndustry: industry,
      sequence: [...template],
      recipients: [],
      status: 'draft',
      metrics: {
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        responded: 0,
        unsubscribed: 0,
        bounced: 0,
        converted: 0,
        revenue: 0
      },
      created: new Date()
    };
    
    this.campaigns.set(campaignId, campaign);
    return campaign;
  }
  
  addRecipients(campaignId: string, recipients: Partial<Recipient>[]): void {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    
    const fullRecipients: Recipient[] = recipients.map(r => ({
      email: r.email!,
      name: r.name || 'there',
      company: r.company || 'your company',
      industry: r.industry || campaign.targetIndustry,
      currentStep: 0,
      status: 'pending',
      opens: 0,
      clicks: 0
    }));
    
    campaign.recipients.push(...fullRecipients);
  }
  
  startCampaign(campaignId: string): void {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    
    campaign.status = 'active';
    campaign.started = new Date();
    
    // In production, this would integrate with:
    // - SendGrid
    // - Mailgun
    // - Amazon SES
    // - Postmark
    
    logger.info('Starting outreach campaign', {
      campaignName: campaign.name,
      recipientCount: campaign.recipients.length,
    });
    this.processNextBatch(campaignId);
  }
  
  private processNextBatch(campaignId: string): void {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.status !== 'active') return;
    
    const now = new Date();
    const recipientsToProcess = campaign.recipients.filter(r => {
      if (r.status !== 'active' && r.status !== 'pending') return false;
      
      const currentSequence = campaign.sequence[r.currentStep];
      if (!currentSequence) return false;
      
      if (r.lastActivity) {
        const daysSinceLastActivity = Math.floor(
          (now.getTime() - r.lastActivity.getTime()) / (1000 * 86400)
        );
        return daysSinceLastActivity >= currentSequence.delayDays;
      }
      
      return r.currentStep === 0;
    });
    
    recipientsToProcess.forEach(recipient => {
      this.sendEmail(campaign, recipient);
    });
  }
  
  private sendEmail(campaign: EmailCampaign, recipient: Recipient): void {
    const sequence = campaign.sequence[recipient.currentStep];
    if (!sequence) return;
    
    const personalizedEmail = this.personalizeEmail(sequence, recipient, campaign);
    
    logger.info('Sending outreach email', {
      campaignId: campaign.id,
      recipientEmail: recipient.email,
      subject: personalizedEmail.subject,
      preview: personalizedEmail.body.substring(0, 100) + '...',
    });
    
    // Update recipient
    recipient.status = 'active';
    recipient.lastActivity = new Date();
    recipient.currentStep++;
    
    // Update metrics
    campaign.metrics.sent++;
    campaign.metrics.delivered++; // Assume delivered for now
  }
  
  private personalizeEmail(
    sequence: EmailSequence,
    recipient: Recipient,
    campaign: EmailCampaign
  ): { subject: string; body: string } {
    const variables: { [key: string]: string } = {
      firstName: recipient.name.split(' ')[0],
      company: recipient.company,
      industry: recipient.industry,
      senderName: 'Sarah',
      disputeRate: this.getIndustryDisputeRate(recipient.industry),
      estimatedLoss: '$' + this.estimateMonthlyLoss(recipient.industry),
      estimatedSavings: '$' + this.estimateMonthlySavings(recipient.industry),
      monthlyDisputes: '20-30',
      losingCount: '10-15',
      winningCount: '15-20',
      currentCost: '$5000',
      ce3Count: '5-8',
      roiPercentage: '400',
      disputeId: 'dp_demo_' + Math.random().toString(36).substr(2, 9),
      amount: '$299.99'
    };
    
    let subject = sequence.subject;
    let body = sequence.body;
    
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{${key}}`, 'g');
      subject = subject.replace(regex, value);
      body = body.replace(regex, value);
    });
    
    return { subject, body };
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
  
  private estimateMonthlyLoss(industry: string): string {
    const losses: { [key: string]: string } = {
      'gambling': '25000',
      'crypto': '20000',
      'forex': '18000',
      'supplements': '12000',
      'travel': '10000',
      'digital_goods': '8000',
      'ecommerce': '5000',
      'subscription': '6000'
    };
    return losses[industry] || '5000';
  }
  
  private estimateMonthlySavings(industry: string): string {
    const loss = parseInt(this.estimateMonthlyLoss(industry));
    return Math.floor(loss * 0.6).toString();
  }
  
  trackOpen(campaignId: string, recipientEmail: string): void {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return;
    
    const recipient = campaign.recipients.find(r => r.email === recipientEmail);
    if (recipient) {
      recipient.opens++;
      campaign.metrics.opened++;
    }
  }
  
  trackClick(campaignId: string, recipientEmail: string): void {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return;
    
    const recipient = campaign.recipients.find(r => r.email === recipientEmail);
    if (recipient) {
      recipient.clicks++;
      campaign.metrics.clicked++;
    }
  }
  
  trackResponse(campaignId: string, recipientEmail: string): void {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return;
    
    const recipient = campaign.recipients.find(r => r.email === recipientEmail);
    if (recipient) {
      recipient.status = 'responded';
      campaign.metrics.responded++;
    }
  }
  
  private generateCampaignId(): string {
    return 'campaign_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  
  getCampaignPerformance(campaignId: string): CampaignMetrics | null {
    const campaign = this.campaigns.get(campaignId);
    return campaign ? campaign.metrics : null;
  }
  
  pauseCampaign(campaignId: string): void {
    const campaign = this.campaigns.get(campaignId);
    if (campaign) {
      campaign.status = 'paused';
    }
  }
  
  resumeCampaign(campaignId: string): void {
    const campaign = this.campaigns.get(campaignId);
    if (campaign && campaign.status === 'paused') {
      campaign.status = 'active';
      this.processNextBatch(campaignId);
    }
  }
}