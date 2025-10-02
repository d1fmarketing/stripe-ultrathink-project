/**
 * AI Timing Optimizer for Strategic Submission
 * ULTRATHINK: Maximize Success with Optimal Timing
 */

import OpenAI from 'openai';
import type { TimingRecommendation, AIConfig } from './types';

export class TimingOptimizer {
  private openai: OpenAI;
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
    this.openai = new OpenAI({
      apiKey: this.config.openaiApiKey
    });
  }

  /**
   * Find optimal submission time for dispute
   */
  async findOptimalTime(
    currentTime: Date,
    dueDate: Date,
    disputeAmount: number,
    disputeReason: string,
    merchantTimezone: string = 'America/New_York'
  ): Promise<TimingRecommendation> {
    try {
      // Analyze timing factors
      const factors = this.analyzeTimingFactors(currentTime, merchantTimezone);
      
      // Calculate optimal time
      const optimalTime = await this.calculateOptimalTime(
        currentTime,
        dueDate,
        factors,
        disputeAmount,
        disputeReason
      );
      
      // Generate recommendation
      const recommendation = this.generateRecommendation(
        currentTime,
        optimalTime,
        factors
      );
      
      return recommendation;
      
    } catch (error) {
      console.error('Error optimizing timing:', error);
      return this.generateFallbackRecommendation(currentTime, dueDate);
    }
  }

  /**
   * Analyze timing factors
   */
  private analyzeTimingFactors(
    currentTime: Date,
    timezone: string
  ): any {
    const hour = this.getHourInTimezone(currentTime, timezone);
    const dayOfWeek = currentTime.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isBusinessHours = hour >= 9 && hour <= 17 && !isWeekend;
    
    // Reviewer availability patterns (based on industry data)
    const reviewerAvailability = this.calculateReviewerAvailability(hour, dayOfWeek);
    
    return {
      timezone,
      currentHour: hour,
      dayOfWeek,
      isWeekend,
      businessHours: isBusinessHours,
      reviewerAvailability
    };
  }

  /**
   * Calculate optimal submission time
   */
  private async calculateOptimalTime(
    currentTime: Date,
    dueDate: Date,
    factors: any,
    amount: number,
    reason: string
  ): Promise<Date> {
    // Best submission windows (based on industry patterns)
    const optimalWindows = [
      { day: 2, hour: 10 }, // Tuesday 10 AM
      { day: 3, hour: 14 }, // Wednesday 2 PM
      { day: 4, hour: 11 }, // Thursday 11 AM
      { day: 1, hour: 15 }, // Monday 3 PM
      { day: 5, hour: 10 }, // Friday 10 AM
    ];
    
    // Find next optimal window
    let optimalTime = new Date(currentTime);
    let found = false;
    
    for (let i = 0; i < 7 && !found; i++) {
      const testDate = new Date(currentTime);
      testDate.setDate(currentTime.getDate() + i);
      
      for (const window of optimalWindows) {
        if (testDate.getDay() === window.day) {
          testDate.setHours(window.hour, 0, 0, 0);
          
          if (testDate > currentTime && testDate < dueDate) {
            optimalTime = testDate;
            found = true;
            break;
          }
        }
      }
    }
    
    // Use AI for complex optimization
    if (amount > 10000 || reason === 'fraudulent') {
      optimalTime = await this.optimizeWithAI(
        currentTime,
        dueDate,
        factors,
        amount,
        reason,
        optimalTime
      );
    }
    
    return optimalTime;
  }

  /**
   * Optimize with AI
   */
  private async optimizeWithAI(
    currentTime: Date,
    dueDate: Date,
    factors: any,
    amount: number,
    reason: string,
    suggestedTime: Date
  ): Promise<Date> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        temperature: 0.3,
        max_tokens: 100,
        messages: [
          {
            role: 'system',
            content: 'You are an expert at timing dispute submissions for maximum success.'
          },
          {
            role: 'user',
            content: `Current: ${currentTime.toISOString()}
Due: ${dueDate.toISOString()}
Suggested: ${suggestedTime.toISOString()}
Amount: $${amount / 100}
Reason: ${reason}
Factors: ${JSON.stringify(factors)}

Should we use the suggested time or wait? If wait, how many hours? Return JSON: {useS suggested: boolean, delayHours: number}`
          }
        ]
      });
      
      const decision = JSON.parse(response.choices[0]?.message?.content || '{}');
      
      if (!decision.useSuggested && decision.delayHours) {
        const optimized = new Date(suggestedTime);
        optimized.setHours(optimized.getHours() + decision.delayHours);
        return optimized;
      }
      
      return suggestedTime;
      
    } catch (error) {
      return suggestedTime;
    }
  }

  /**
   * Calculate reviewer availability
   */
  private calculateReviewerAvailability(hour: number, dayOfWeek: number): number {
    // Based on industry patterns
    const availability: Record<string, number> = {
      // Weekday business hours
      '1-9': 0.9, '1-10': 0.95, '1-11': 0.9, '1-14': 0.85, '1-15': 0.8,
      '2-9': 0.85, '2-10': 1.0, '2-11': 0.95, '2-14': 0.9, '2-15': 0.85,
      '3-9': 0.85, '3-10': 0.95, '3-11': 0.9, '3-14': 0.95, '3-15': 0.85,
      '4-9': 0.85, '4-10': 0.9, '4-11': 0.95, '4-14': 0.85, '4-15': 0.8,
      '5-9': 0.8, '5-10': 0.85, '5-11': 0.8, '5-14': 0.7, '5-15': 0.6,
      // Weekends
      '0-10': 0.3, '0-14': 0.2,
      '6-10': 0.3, '6-14': 0.2
    };
    
    const key = `${dayOfWeek}-${hour}`;
    return availability[key] || 0.5;
  }

  /**
   * Get hour in specific timezone
   */
  private getHourInTimezone(date: Date, timezone: string): number {
    try {
      const options: Intl.DateTimeFormatOptions = {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone
      };
      const formatter = new Intl.DateTimeFormat('en-US', options);
      return parseInt(formatter.format(date));
    } catch (error) {
      return date.getHours();
    }
  }

  /**
   * Generate timing recommendation
   */
  private generateRecommendation(
    currentTime: Date,
    optimalTime: Date,
    factors: any
  ): TimingRecommendation {
    const delayMinutes = Math.floor((optimalTime.getTime() - currentTime.getTime()) / 60000);
    
    let reason = 'Optimal submission window';
    if (factors.isWeekend) {
      reason = 'Waiting for business hours for better reviewer availability';
    } else if (!factors.businessHours) {
      reason = 'Delaying to business hours for faster review';
    } else if (factors.reviewerAvailability < 0.7) {
      reason = 'Waiting for peak reviewer availability window';
    }
    
    return {
      currentTime,
      optimalTime,
      reason,
      delayMinutes,
      confidence: factors.reviewerAvailability,
      factors
    };
  }

  /**
   * Generate fallback recommendation
   */
  private generateFallbackRecommendation(
    currentTime: Date,
    dueDate: Date
  ): TimingRecommendation {
    // Submit 24 hours before deadline or now if less time
    const hoursUntilDue = (dueDate.getTime() - currentTime.getTime()) / 3600000;
    const optimalTime = hoursUntilDue > 24 ? 
      new Date(dueDate.getTime() - 86400000) : // 24 hours before
      currentTime;
    
    return {
      currentTime,
      optimalTime,
      reason: hoursUntilDue > 24 ? 
        'Submitting 24 hours before deadline' : 
        'Urgent submission required',
      delayMinutes: Math.max(0, Math.floor((optimalTime.getTime() - currentTime.getTime()) / 60000)),
      confidence: 0.7,
      factors: {
        timezone: 'UTC',
        businessHours: true,
        reviewerAvailability: 0.7
      }
    };
  }

  /**
   * Should delay submission?
   */
  shouldDelaySubmission(recommendation: TimingRecommendation): boolean {
    // Delay if:
    // 1. More than 30 minutes improvement
    // 2. Confidence is high
    // 3. Not urgent (>48 hours until due)
    
    return recommendation.delayMinutes > 30 && 
           recommendation.confidence > 0.8 &&
           recommendation.delayMinutes < 2880; // Max 48 hours delay
  }

  /**
   * Get submission strategy
   */
  getSubmissionStrategy(
    amount: number,
    reason: string,
    daysUntilDue: number
  ): 'immediate' | 'optimal' | 'strategic' {
    // Immediate for urgent or small amounts
    if (daysUntilDue < 2 || amount < 5000) {
      return 'immediate';
    }
    
    // Strategic for high-value fraudulent disputes
    if (amount > 50000 && reason === 'fraudulent') {
      return 'strategic';
    }
    
    // Optimal for everything else
    return 'optimal';
  }
}