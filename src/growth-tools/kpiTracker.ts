import type { Lead, EngagementMetrics } from './leadScoring';
import type { CampaignMetrics, EmailCampaign } from './outreachAutomation';
import type { LandingPage, PageMetrics } from './landingPageGen';

type LeadStage = Lead['status'];

export interface TrendPoint {
  timestamp: string;
  value: number;
}

export interface PipelineSummary {
  totalLeads: number;
  stageBreakdown: Record<LeadStage, number>;
  weightedPipelineValue: number;
  expectedRevenueNext30Days: number;
  averageLeadScore: number;
  pipelineValue: number;
  leadVelocityRate: number;
  averageDealCycleDays: number;
}

export interface MarketingSummary {
  email: {
    sent: number;
    opened: number;
    clicked: number;
    responded: number;
    converted: number;
    openRate: number;
    clickRate: number;
    responseRate: number;
    conversionRate: number;
    revenueAttributed: number;
    costPerAcquisition: number;
  };
  landingPages: {
    totalViews: number;
    totalConversions: number;
    averageConversionRate: number;
    averageBounceRate: number;
  };
  topLandingPages: Array<{
    id: string;
    conversionRate: number;
    views: number;
    conversions: number;
  }>;
}

export interface RevenueSummary {
  currentMRR: number;
  arr: number;
  newMRR: number;
  expansionMRR: number;
  churnMRR: number;
  netRevenueRetention: number;
  churnRate: number;
  lifetimeValue: number;
  activeCustomers: number;
}

export interface BusinessKPISnapshot {
  generatedAt: string;
  pipeline: PipelineSummary;
  marketing: MarketingSummary;
  revenue: RevenueSummary;
  health: {
    pipelineCoverage: number;
    forecastMRR: number;
    targetMRR: number;
    averageEngagementsPerLead: number;
  };
  trends: {
    mrr: TrendPoint[];
    pipeline: TrendPoint[];
    expectedRevenue: TrendPoint[];
  };
}

interface RevenueEvent {
  type: 'new' | 'expansion' | 'churn';
  amount: number;
  date: Date;
  notes?: string;
}

export interface KPITrackerTargets {
  monthlyMRR?: number;
  pipelineCoverage?: number;
  cac?: number;
  grossMargin?: number;
}

interface CampaignSnapshot {
  metrics: CampaignMetrics;
  recipients: number;
  updated: Date;
}

interface LandingPageSnapshot {
  metrics: PageMetrics;
  updated: Date;
}

export class BusinessKPITracker {
  private leadStageCounts: Record<LeadStage, number> = {
    new: 0,
    nurturing: 0,
    qualified: 0,
    sales_ready: 0,
    customer: 0,
    lost: 0
  };

  private leadStages = new Map<string, LeadStage>();
  private leadScores = new Map<string, number>();
  private leadValues = new Map<string, number>();
  private leadProbabilities = new Map<string, number>();
  private leadCreatedAt = new Map<string, Date>();
  private leadCreationHistory: Date[] = [];
  private engagementEvents = new Map<string, number>();
  private dealCycleDurations: number[] = [];

  private campaignSnapshots = new Map<string, CampaignSnapshot>();
  private campaignSpend = new Map<string, number>();

  private landingPageSnapshots = new Map<string, LandingPageSnapshot>();

  private revenueEvents: RevenueEvent[] = [];
  private currentMRR = 0;
  private newMRR = 0;
  private expansionMRR = 0;
  private churnMRR = 0;
  private activeCustomers = 0;
  private totalCustomers = 0;
  private churnedCustomers = 0;

  private trendHistory = new Map<string, TrendPoint[]>();

  private targets: Required<KPITrackerTargets> = {
    monthlyMRR: 80000,
    pipelineCoverage: 3,
    cac: 1500,
    grossMargin: 0.8
  };

  /**
   * Override default targets for KPI calculations.
   */
  updateTargets(targets: KPITrackerTargets): void {
    this.targets = { ...this.targets, ...targets };
  }

  /**
   * Record creation of a new lead and seed baseline metrics.
   */
  recordLeadCreated(lead: Lead, estimatedDealValue?: number): void {
    this.leadStages.set(lead.id, lead.status);
    this.leadStageCounts[lead.status] = (this.leadStageCounts[lead.status] || 0) + 1;
    this.leadScores.set(lead.id, lead.score);
    this.leadProbabilities.set(lead.id, this.deriveProbabilityFromScore(lead.score));
    this.leadValues.set(lead.id, estimatedDealValue ?? this.estimateLeadValue(lead));
    this.leadCreatedAt.set(lead.id, lead.created);
    this.leadCreationHistory.push(lead.created);

    this.recordTrend('pipeline', this.getPipelineValue());
    this.recordTrend('expectedRevenue', this.getExpectedRevenue());
    this.recordTrend('avgLeadScore', this.getAverageLeadScore());
  }

  /**
   * Update lead level metrics (score, probability, stage) when recalculated.
   */
  recordLeadUpdated(lead: Lead, conversionProbability?: number, estimatedDealValue?: number): void {
    const previousStage = this.leadStages.get(lead.id);

    if (!previousStage) {
      this.recordLeadCreated(lead, estimatedDealValue);
    } else if (previousStage !== lead.status) {
      this.recordLeadStageChange(lead.id, previousStage, lead.status, lead.score, estimatedDealValue);
    }

    this.leadScores.set(lead.id, lead.score);
    if (conversionProbability !== undefined) {
      this.leadProbabilities.set(lead.id, conversionProbability);
    } else {
      this.leadProbabilities.set(lead.id, this.deriveProbabilityFromScore(lead.score));
    }

    if (estimatedDealValue !== undefined) {
      this.leadValues.set(lead.id, estimatedDealValue);
    } else if (!this.leadValues.has(lead.id)) {
      this.leadValues.set(lead.id, this.estimateLeadValue(lead));
    }

    this.recordTrend('pipeline', this.getPipelineValue());
    this.recordTrend('expectedRevenue', this.getExpectedRevenue());
    this.recordTrend('avgLeadScore', this.getAverageLeadScore());
  }

  /**
   * Track engagement signals for a lead to measure pipeline activity health.
   */
  recordLeadEngagement(leadId: string, action: string, metrics?: EngagementMetrics): void {
    const current = this.engagementEvents.get(leadId) || 0;
    this.engagementEvents.set(leadId, current + 1);

    if (metrics) {
      this.leadScores.set(leadId, this.leadScores.get(leadId) || 0);
      this.leadProbabilities.set(leadId, this.leadProbabilities.get(leadId) || this.deriveProbabilityFromScore(this.leadScores.get(leadId) || 0));
    }

    this.recordTrend('pipeline', this.getPipelineValue());
  }

  /**
   * Explicitly move a lead between stages and track conversion velocity.
   */
  recordLeadStageChange(
    leadId: string,
    fromStage: LeadStage | undefined,
    toStage: LeadStage,
    leadScore?: number,
    estimatedDealValue?: number
  ): void {
    if (fromStage) {
      this.leadStageCounts[fromStage] = Math.max(0, (this.leadStageCounts[fromStage] || 0) - 1);
    }

    this.leadStageCounts[toStage] = (this.leadStageCounts[toStage] || 0) + 1;
    this.leadStages.set(leadId, toStage);

    if (leadScore !== undefined) {
      this.leadScores.set(leadId, leadScore);
    }

    if (estimatedDealValue !== undefined) {
      this.leadValues.set(leadId, estimatedDealValue);
    }

    if (toStage === 'lost') {
      this.leadProbabilities.set(leadId, 0);
    }

    this.recordTrend('pipeline', this.getPipelineValue());
    this.recordTrend('expectedRevenue', this.getExpectedRevenue());
  }

  /**
   * Mark a lead as closed won and record the MRR impact.
   */
  recordDealWon(leadId: string, mrr: number, closedDate: Date = new Date()): void {
    const previousStage = this.leadStages.get(leadId);
    this.recordLeadStageChange(leadId, previousStage, 'customer');

    this.currentMRR += mrr;
    this.newMRR += mrr;
    this.activeCustomers += 1;
    this.totalCustomers += 1;

    const created = this.leadCreatedAt.get(leadId);
    if (created) {
      const cycleDays = Math.max(1, Math.round((closedDate.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
      this.dealCycleDurations.push(cycleDays);
    }

    this.revenueEvents.push({ type: 'new', amount: mrr, date: closedDate });
    this.recordTrend('mrr', this.currentMRR);
    this.recordTrend('expectedRevenue', this.getExpectedRevenue());
  }

  /**
   * Record expansion revenue from existing customers.
   */
  recordExpansion(customerId: string, mrrDelta: number, date: Date = new Date()): void {
    this.currentMRR += mrrDelta;
    this.expansionMRR += mrrDelta;
    this.revenueEvents.push({ type: 'expansion', amount: mrrDelta, date, notes: customerId });
    this.recordTrend('mrr', this.currentMRR);
  }

  /**
   * Track churned revenue and update retention metrics.
   */
  recordChurn(customerId: string, mrrLost: number, date: Date = new Date()): void {
    this.currentMRR = Math.max(0, this.currentMRR - mrrLost);
    this.churnMRR += mrrLost;
    this.churnedCustomers += 1;
    this.activeCustomers = Math.max(0, this.activeCustomers - 1);
    this.revenueEvents.push({ type: 'churn', amount: mrrLost, date, notes: customerId });
    this.recordTrend('mrr', this.currentMRR);
  }

  /**
   * Update internal spend tracking for a specific campaign.
   */
  recordCampaignSpend(campaignId: string, amount: number): void {
    const current = this.campaignSpend.get(campaignId) || 0;
    this.campaignSpend.set(campaignId, current + amount);
  }

  /**
   * Track a new email campaign and seed KPI context.
   */
  recordCampaignCreated(campaign: EmailCampaign): void {
    this.campaignSnapshots.set(campaign.id, {
      metrics: { ...campaign.metrics },
      recipients: campaign.recipients.length,
      updated: new Date()
    });
  }

  /**
   * Store latest audience count for a campaign (used in CPA calculations).
   */
  recordCampaignAudience(campaignId: string, recipientCount: number): void {
    const snapshot = this.campaignSnapshots.get(campaignId);
    if (snapshot) {
      snapshot.recipients = recipientCount;
      snapshot.updated = new Date();
    } else {
      this.campaignSnapshots.set(campaignId, {
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
        recipients: recipientCount,
        updated: new Date()
      });
    }
  }

  /**
   * Persist campaign performance data to inform marketing KPIs.
   */
  recordCampaignProgress(campaignId: string, metrics: CampaignMetrics): void {
    const snapshot = this.campaignSnapshots.get(campaignId);
    if (snapshot) {
      snapshot.metrics = { ...metrics };
      snapshot.updated = new Date();
    } else {
      this.campaignSnapshots.set(campaignId, {
        metrics: { ...metrics },
        recipients: metrics.sent,
        updated: new Date()
      });
    }
  }

  /**
   * Track landing page creation for funnel attribution.
   */
  recordLandingPageCreated(page: LandingPage): void {
    this.landingPageSnapshots.set(page.id, {
      metrics: { ...page.metrics },
      updated: new Date()
    });
  }

  /**
   * Update landing page performance metrics.
   */
  recordLandingPageMetrics(pageId: string, metrics: PageMetrics): void {
    const snapshot = this.landingPageSnapshots.get(pageId);
    if (snapshot) {
      snapshot.metrics = { ...metrics };
      snapshot.updated = new Date();
    } else {
      this.landingPageSnapshots.set(pageId, {
        metrics: { ...metrics },
        updated: new Date()
      });
    }
  }

  /**
   * Generate a consolidated KPI snapshot for dashboards and reporting.
   */
  getSnapshot(): BusinessKPISnapshot {
    const stageBreakdown: Record<LeadStage, number> = {
      new: this.leadStageCounts.new || 0,
      nurturing: this.leadStageCounts.nurturing || 0,
      qualified: this.leadStageCounts.qualified || 0,
      sales_ready: this.leadStageCounts.sales_ready || 0,
      customer: this.leadStageCounts.customer || 0,
      lost: this.leadStageCounts.lost || 0
    };

    const pipelineValue = this.getPipelineValue();
    const expectedRevenue = this.getExpectedRevenue();

    const marketingSummary = this.getMarketingSummary();

    const churnRate = this.totalCustomers > 0
      ? (this.churnedCustomers / this.totalCustomers) * 100
      : 0;

    const averageRevenuePerCustomer = this.activeCustomers > 0
      ? this.currentMRR / this.activeCustomers
      : this.totalCustomers > 0
        ? this.newMRR / this.totalCustomers
        : 0;

    const churnRateDecimal = Math.max(churnRate / 100, 0.01);
    const lifetimeValue = averageRevenuePerCustomer > 0
      ? (averageRevenuePerCustomer * this.targets.grossMargin) / churnRateDecimal
      : 0;

    const startingMRR = this.currentMRR + this.churnMRR - this.expansionMRR;
    const netRevenueRetention = startingMRR > 0
      ? ((startingMRR - this.churnMRR + this.expansionMRR) / startingMRR) * 100
      : 100;

    const pipeline: PipelineSummary = {
      totalLeads: this.leadStages.size,
      stageBreakdown,
      weightedPipelineValue: expectedRevenue,
      expectedRevenueNext30Days: expectedRevenue,
      averageLeadScore: this.getAverageLeadScore(),
      pipelineValue,
      leadVelocityRate: this.getLeadVelocityRate(),
      averageDealCycleDays: this.getAverageDealCycleDays()
    };

    const revenue: RevenueSummary = {
      currentMRR: this.currentMRR,
      arr: this.currentMRR * 12,
      newMRR: this.newMRR,
      expansionMRR: this.expansionMRR,
      churnMRR: this.churnMRR,
      netRevenueRetention,
      churnRate,
      lifetimeValue,
      activeCustomers: this.activeCustomers
    };

    return {
      generatedAt: new Date().toISOString(),
      pipeline,
      marketing: marketingSummary,
      revenue,
      health: {
        pipelineCoverage: this.targets.monthlyMRR > 0
          ? (expectedRevenue / this.targets.monthlyMRR) * 100
          : 0,
        forecastMRR: this.currentMRR + expectedRevenue,
        targetMRR: this.targets.monthlyMRR,
        averageEngagementsPerLead: this.getAverageEngagementsPerLead()
      },
      trends: {
        mrr: this.getTrend('mrr'),
        pipeline: this.getTrend('pipeline'),
        expectedRevenue: this.getTrend('expectedRevenue')
      }
    };
  }

  private getMarketingSummary(): MarketingSummary {
    const totals: CampaignMetrics = {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      responded: 0,
      unsubscribed: 0,
      bounced: 0,
      converted: 0,
      revenue: 0
    };

    let totalSpend = 0;

    this.campaignSnapshots.forEach((snapshot, campaignId) => {
      totals.sent += snapshot.metrics.sent;
      totals.delivered += snapshot.metrics.delivered;
      totals.opened += snapshot.metrics.opened;
      totals.clicked += snapshot.metrics.clicked;
      totals.responded += snapshot.metrics.responded;
      totals.unsubscribed += snapshot.metrics.unsubscribed;
      totals.bounced += snapshot.metrics.bounced;
      totals.converted += snapshot.metrics.converted;
      totals.revenue += snapshot.metrics.revenue;

      totalSpend += this.campaignSpend.get(campaignId) || 0;
    });

    const emailSummary = {
      sent: totals.sent,
      opened: totals.opened,
      clicked: totals.clicked,
      responded: totals.responded,
      converted: totals.converted,
      openRate: totals.sent > 0 ? (totals.opened / totals.sent) * 100 : 0,
      clickRate: totals.sent > 0 ? (totals.clicked / totals.sent) * 100 : 0,
      responseRate: totals.sent > 0 ? (totals.responded / totals.sent) * 100 : 0,
      conversionRate: totals.sent > 0 ? (totals.converted / totals.sent) * 100 : 0,
      revenueAttributed: totals.revenue,
      costPerAcquisition: totals.converted > 0
        ? totalSpend / totals.converted
        : totalSpend > 0
          ? totalSpend
          : 0
    };

    let totalViews = 0;
    let totalConversions = 0;
    let bounceRateSum = 0;
    let pageCount = 0;

    const topLandingPages = Array.from(this.landingPageSnapshots.entries())
      .map(([id, snapshot]) => {
        totalViews += snapshot.metrics.views;
        totalConversions += snapshot.metrics.conversions;
        bounceRateSum += snapshot.metrics.bounceRate;
        pageCount += 1;

        return {
          id,
          conversionRate: snapshot.metrics.conversionRate,
          views: snapshot.metrics.views,
          conversions: snapshot.metrics.conversions
        };
      })
      .sort((a, b) => b.conversionRate - a.conversionRate)
      .slice(0, 5);

    const landingSummary = {
      totalViews,
      totalConversions,
      averageConversionRate: totalViews > 0 ? totalConversions / totalViews : 0,
      averageBounceRate: pageCount > 0 ? bounceRateSum / pageCount : 0
    };

    return {
      email: emailSummary,
      landingPages: landingSummary,
      topLandingPages
    };
  }

  private getTrend(metric: string): TrendPoint[] {
    return [...(this.trendHistory.get(metric) || [])];
  }

  private recordTrend(metric: string, value: number): void {
    const points = this.trendHistory.get(metric) || [];
    points.push({
      timestamp: new Date().toISOString(),
      value: Number(value.toFixed(2))
    });

    if (points.length > 60) {
      points.shift();
    }

    this.trendHistory.set(metric, points);
  }

  private getAverageEngagementsPerLead(): number {
    if (this.leadStages.size === 0) return 0;
    const totalEvents = Array.from(this.engagementEvents.values()).reduce((acc, value) => acc + value, 0);
    return totalEvents / this.leadStages.size;
  }

  private getLeadVelocityRate(): number {
    const now = Date.now();
    const thirtyDays = 1000 * 60 * 60 * 24 * 30;

    const leadsLast30 = this.leadCreationHistory.filter(date => now - date.getTime() <= thirtyDays).length;
    const leadsPrev30 = this.leadCreationHistory.filter(date => {
      const diff = now - date.getTime();
      return diff > thirtyDays && diff <= thirtyDays * 2;
    }).length;

    if (leadsPrev30 === 0) {
      return leadsLast30 > 0 ? 100 : 0;
    }

    return ((leadsLast30 - leadsPrev30) / leadsPrev30) * 100;
  }

  private getAverageDealCycleDays(): number {
    if (this.dealCycleDurations.length === 0) return 0;
    const total = this.dealCycleDurations.reduce((acc, days) => acc + days, 0);
    return total / this.dealCycleDurations.length;
  }

  private getAverageLeadScore(): number {
    if (this.leadScores.size === 0) return 0;
    const total = Array.from(this.leadScores.values()).reduce((acc, score) => acc + score, 0);
    return total / this.leadScores.size;
  }

  private getPipelineValue(): number {
    let total = 0;
    this.leadValues.forEach((value, leadId) => {
      const stage = this.leadStages.get(leadId);
      if (stage && stage !== 'customer' && stage !== 'lost') {
        total += value;
      }
    });
    return total;
  }

  private getExpectedRevenue(): number {
    let total = 0;
    this.leadValues.forEach((value, leadId) => {
      const probability = this.leadProbabilities.get(leadId) ?? 0;
      const stage = this.leadStages.get(leadId);
      if (stage && stage !== 'customer' && stage !== 'lost') {
        total += value * probability;
      }
    });
    return total;
  }

  private estimateLeadValue(lead: Lead): number {
    const monthlyVolume = lead.attributes?.monthlyVolume ?? 50000;
    const disputeRate = lead.attributes?.disputeRate ?? 0.02;
    const recoveryRate = 0.6 + (lead.score / 100) * 0.3;
    const estimate = monthlyVolume * disputeRate * recoveryRate;
    return Math.max(1000, Math.round(estimate));
  }

  private deriveProbabilityFromScore(score: number): number {
    const base = score / 100;
    return Math.max(0.05, Math.min(0.95, Number(base.toFixed(2))));
  }
}
