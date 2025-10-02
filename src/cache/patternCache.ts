/**
 * Pattern Caching System for ULTRATHINK
 * Caches dispute patterns for instant win probability lookup
 * This is where we achieve microsecond response times!
 */

import { cache } from './redisClient';
import crypto from 'crypto';
import type Stripe from 'stripe';
import logger from '../shared/logger';

export interface DisputePattern {
  reason: string;
  amount_range: string;
  merchant_category?: string;
  customer_type: 'new' | 'returning' | 'vip';
  has_delivery: boolean;
  has_ce3: boolean;
  ip_match: boolean;
  days_since_charge: number;
  fingerprint: string;
}

export interface PatternStats {
  total_seen: number;
  total_won: number;
  win_rate: number;
  last_updated: number;
  confidence: number; // Based on sample size
  avg_processing_time: number;
  successful_narratives: string[];
}

export class PatternCache {
  private static instance: PatternCache;
  private readonly PATTERN_PREFIX = 'pattern:';
  private readonly STATS_PREFIX = 'stats:';
  private readonly NARRATIVE_PREFIX = 'narrative:';
  private readonly DEFAULT_TTL = 86400 * 7; // 7 days
  
  private constructor() {}
  
  static getInstance(): PatternCache {
    if (!PatternCache.instance) {
      PatternCache.instance = new PatternCache();
    }
    return PatternCache.instance;
  }
  
  /**
   * Generate unique fingerprint for dispute pattern
   * This is the magic that enables instant lookups!
   */
  generateFingerprint(dispute: Partial<Stripe.Dispute>): string {
    const pattern = {
      reason: dispute.reason || 'unknown',
      amount_range: this.getAmountRange(dispute.amount || 0),
      merchant_category: dispute.evidence?.product_description?.slice(0, 20) || 'general',
      customer_type: this.getCustomerType(dispute),
      has_delivery: !!dispute.evidence?.shipping_documentation,
      has_ce3: this.checkCE3Eligibility(dispute),
      ip_match: !!dispute.evidence?.customer_purchase_ip,
      days_since: this.getDaysSinceCharge(dispute)
    };
    
    // Create deterministic hash
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(pattern));
    return hash.digest('hex').substring(0, 16);
  }
  
  /**
   * Get cached win probability for pattern
   * THIS IS WHERE THE SPEED HAPPENS - REDIS LOOKUP IN <1MS!
   */
  async getCachedScore(fingerprint: string): Promise<number | null> {
    const key = `${this.PATTERN_PREFIX}${fingerprint}`;
    const stats = await cache.get<PatternStats>(key);
    
    if (!stats) return null;
    
    // Update access count for LRU tracking
    await cache.incr(`${this.PATTERN_PREFIX}access:${fingerprint}`);
    
    // Return win rate if we have enough confidence
    if (stats.confidence > 0.7 && stats.total_seen >= 10) {
      logger.debug('Pattern cache hit', {
        winRate: stats.win_rate,
        totalSeen: stats.total_seen,
        fingerprint,
      });
      return stats.win_rate;
    }
    
    return null;
  }
  
  /**
   * Cache pattern with win probability
   * Updates running statistics for continuous learning
   */
  async cachePattern(
    fingerprint: string, 
    won: boolean,
    processingTime: number,
    narrative?: string
  ): Promise<void> {
    const key = `${this.PATTERN_PREFIX}${fingerprint}`;
    const statsKey = `${this.STATS_PREFIX}${fingerprint}`;
    
    // Get existing stats or create new
    let stats = await cache.get<PatternStats>(statsKey) || {
      total_seen: 0,
      total_won: 0,
      win_rate: 0,
      last_updated: Date.now(),
      confidence: 0,
      avg_processing_time: 0,
      successful_narratives: []
    };
    
    // Update statistics
    stats.total_seen++;
    if (won) {
      stats.total_won++;
      if (narrative && stats.successful_narratives.length < 10) {
        stats.successful_narratives.push(narrative.substring(0, 200));
      }
    }
    
    // Calculate new win rate
    stats.win_rate = (stats.total_won / stats.total_seen) * 100;
    
    // Update confidence based on sample size (sigmoid function)
    stats.confidence = 1 - Math.exp(-stats.total_seen / 20);
    
    // Update average processing time
    stats.avg_processing_time = 
      (stats.avg_processing_time * (stats.total_seen - 1) + processingTime) / stats.total_seen;
    
    stats.last_updated = Date.now();
    
    // Save to Redis with TTL
    await cache.set(key, stats, this.DEFAULT_TTL);
    await cache.set(statsKey, stats, this.DEFAULT_TTL * 2);
    
    // Add to sorted set for ranking
    await cache.zadd('pattern:rankings', stats.win_rate, fingerprint);
    
    logger.debug('Pattern updated', {
      fingerprint,
      winRate: Number(stats.win_rate.toFixed(1)),
      totalSamples: stats.total_seen,
    });
  }
  
  /**
   * Get top performing patterns
   * Useful for identifying what types of disputes we excel at
   */
  async getTopPatterns(limit: number = 10): Promise<Array<{fingerprint: string, stats: PatternStats}>> {
    const topFingerprints = await cache.zrevrange('pattern:rankings', 0, limit - 1);
    const patterns = [];
    
    for (const fingerprint of topFingerprints) {
      const stats = await cache.get<PatternStats>(`${this.STATS_PREFIX}${fingerprint}`);
      if (stats) {
        patterns.push({ fingerprint, stats });
      }
    }
    
    return patterns;
  }
  
  /**
   * Find similar patterns using fuzzy matching
   * When exact match not found, find closest patterns
   */
  async findSimilarPatterns(dispute: Partial<Stripe.Dispute>, maxDistance: number = 3): Promise<PatternStats[]> {
    // Get all pattern keys (in production, use Redis Search for efficiency)
    const patterns: PatternStats[] = [];
    
    // For now, return empty - would implement with Redis Search
    // FUTURE: Use RedisSearch for similarity matching
    return patterns;
  }
  
  /**
   * Bulk load patterns (for ML model training)
   */
  async bulkLoadPatterns(): Promise<Map<string, PatternStats>> {
    const patternMap = new Map<string, PatternStats>();
    
    // In production, use SCAN to iterate efficiently
    // For now, get top 1000 patterns
    const topPatterns = await this.getTopPatterns(1000);
    
    for (const { fingerprint, stats } of topPatterns) {
      patternMap.set(fingerprint, stats);
    }
    
    return patternMap;
  }
  
  /**
   * Clear all pattern cache (use with caution!)
   */
  async clearCache(): Promise<void> {
    // Would implement pattern-based deletion
    logger.warn('Pattern cache clear requested - not implemented for safety');
  }
  
  // Helper methods
  private getAmountRange(amount: number): string {
    const dollars = amount / 100;
    if (dollars < 50) return '0-50';
    if (dollars < 100) return '50-100';
    if (dollars < 250) return '100-250';
    if (dollars < 500) return '250-500';
    if (dollars < 1000) return '500-1000';
    return '1000+';
  }
  
  private getCustomerType(dispute: any): 'new' | 'returning' | 'vip' {
    // Would check customer history
    // For now, simplified logic
    const metadata = dispute.metadata || {};
    if (metadata.customer_type) return metadata.customer_type;
    if (metadata.order_count > 10) return 'vip';
    if (metadata.order_count > 1) return 'returning';
    return 'new';
  }
  
  private checkCE3Eligibility(dispute: any): boolean {
    // Check for CE3.0 eligibility indicators
    return !!(
      dispute.evidence?.customer_purchase_ip &&
      dispute.evidence?.receipt &&
      dispute.metadata?.prior_undisputed_transactions
    );
  }
  
  private getDaysSinceCharge(dispute: any): number {
    if (!dispute.created) return 0;
    const msPerDay = 86400000;
    const daysSince = Math.floor((Date.now() - dispute.created * 1000) / msPerDay);
    
    // Bucket into ranges
    if (daysSince <= 7) return 7;
    if (daysSince <= 30) return 30;
    if (daysSince <= 60) return 60;
    if (daysSince <= 90) return 90;
    return 120;
  }
  
  /**
   * Get pattern insights for analytics
   */
  async getPatternInsights(): Promise<{
    total_patterns: number;
    avg_win_rate: number;
    best_performing_category: string;
    worst_performing_category: string;
    high_confidence_patterns: number;
  }> {
    const allPatterns = await this.getTopPatterns(1000);
    
    if (allPatterns.length === 0) {
      return {
        total_patterns: 0,
        avg_win_rate: 0,
        best_performing_category: 'N/A',
        worst_performing_category: 'N/A',
        high_confidence_patterns: 0
      };
    }
    
    const totalWinRate = allPatterns.reduce((sum, p) => sum + p.stats.win_rate, 0);
    const highConfidence = allPatterns.filter(p => p.stats.confidence > 0.8).length;
    
    return {
      total_patterns: allPatterns.length,
      avg_win_rate: totalWinRate / allPatterns.length,
      best_performing_category: allPatterns[0]?.fingerprint || 'N/A',
      worst_performing_category: allPatterns[allPatterns.length - 1]?.fingerprint || 'N/A',
      high_confidence_patterns: highConfidence
    };
  }
}

// Export singleton instance
export const patternCache = PatternCache.getInstance();

// Auto-warm cache on startup (optional)
export async function warmCache(): Promise<void> {
  logger.info('Warming pattern cache');
  const patterns = await patternCache.bulkLoadPatterns();
  logger.info('Pattern cache warmed', { loadedPatterns: patterns.size });
}