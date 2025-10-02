/**
 * Real-time Fraud Tracker with Redis
 * Detects serial fraudsters and patterns INSTANTLY!
 * This is how we prevent losses before they happen
 */

import { cache, redis } from './redisClient';
import crypto from 'crypto';

export interface FraudIndicator {
  customerId?: string;
  email?: string;
  ip?: string;
  cardFingerprint?: string;
  deviceId?: string;
  shippingAddress?: string;
  timestamp: number;
}

export interface FraudProfile {
  id: string;
  risk_score: number; // 0-100
  total_disputes: number;
  disputes_last_30d: number;
  disputes_last_7d: number;
  unique_cards_used: number;
  unique_ips: Set<string>;
  unique_emails: Set<string>;
  dispute_velocity: number; // disputes per day
  blacklisted: boolean;
  suspicious_patterns: string[];
  last_activity: number;
  total_dispute_amount: number;
}

export interface FraudNetwork {
  primary_id: string;
  connected_entities: string[];
  network_size: number;
  total_network_disputes: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
}

export class FraudTracker {
  private static instance: FraudTracker;
  private readonly FRAUD_PREFIX = 'fraud:';
  private readonly BLACKLIST_KEY = 'blacklist:customers';
  private readonly VELOCITY_WINDOW = 3600; // 1 hour window for velocity tracking
  private readonly NETWORK_PREFIX = 'network:';
  
  // Thresholds for fraud detection
  private readonly THRESHOLDS = {
    velocity: 3, // More than 3 disputes per hour
    disputes_7d: 5, // More than 5 disputes in 7 days
    disputes_30d: 10, // More than 10 disputes in 30 days
    unique_cards: 5, // Using more than 5 different cards
    risk_score_blacklist: 80, // Auto-blacklist above this score
    network_size_suspicious: 3 // Connected to 3+ other fraudulent entities
  };
  
  private constructor() {}
  
  static getInstance(): FraudTracker {
    if (!FraudTracker.instance) {
      FraudTracker.instance = new FraudTracker();
    }
    return FraudTracker.instance;
  }
  
  /**
   * Track dispute activity in real-time
   * THIS RUNS ON EVERY DISPUTE TO CATCH FRAUDSTERS INSTANTLY!
   */
  async trackDispute(indicator: FraudIndicator, disputeAmount: number): Promise<FraudProfile> {
    const profileId = this.generateProfileId(indicator);
    const now = Date.now();
    
    // Track in multiple data structures for different queries
    
    // 1. Increment dispute counters
    await redis.hincrby(`${this.FRAUD_PREFIX}${profileId}:stats`, 'total_disputes', 1);
    await redis.hincrby(`${this.FRAUD_PREFIX}${profileId}:stats`, 'total_amount', disputeAmount);
    
    // 2. Track time-based activity (for velocity)
    await redis.zadd(
      `${this.FRAUD_PREFIX}${profileId}:timeline`,
      now,
      `${now}:${disputeAmount}`
    );
    
    // 3. Track unique identifiers
    if (indicator.ip) {
      await redis.sadd(`${this.FRAUD_PREFIX}${profileId}:ips`, indicator.ip);
    }
    if (indicator.email) {
      await redis.sadd(`${this.FRAUD_PREFIX}${profileId}:emails`, indicator.email);
    }
    if (indicator.cardFingerprint) {
      await redis.sadd(`${this.FRAUD_PREFIX}${profileId}:cards`, indicator.cardFingerprint);
    }
    
    // 4. Update velocity tracker (sliding window)
    await this.updateVelocity(profileId);
    
    // 5. Calculate risk score
    const profile = await this.calculateRiskScore(profileId, indicator);
    
    // 6. Check for fraud patterns
    await this.detectPatterns(profile, indicator);
    
    // 7. Network analysis (find connected fraudsters)
    await this.analyzeNetwork(profile, indicator);
    
    // 8. Auto-blacklist if necessary
    if (profile.risk_score >= this.THRESHOLDS.risk_score_blacklist) {
      await this.blacklist(profileId, 'AUTO: High risk score');
      profile.blacklisted = true;
    }
    
    // 9. Publish alert if high risk
    if (profile.risk_score >= 70) {
      await this.publishFraudAlert(profile, indicator);
    }
    
    console.log(`🚨 Fraud tracked: ${profileId} - Risk: ${profile.risk_score} - Disputes: ${profile.total_disputes}`);
    
    return profile;
  }
  
  /**
   * Calculate comprehensive risk score
   * Combines multiple signals for accurate fraud detection
   */
  private async calculateRiskScore(profileId: string, indicator: FraudIndicator): Promise<FraudProfile> {
    const stats = await redis.hgetall(`${this.FRAUD_PREFIX}${profileId}:stats`);
    const ips = await redis.scard(`${this.FRAUD_PREFIX}${profileId}:ips`);
    const emails = await redis.scard(`${this.FRAUD_PREFIX}${profileId}:emails`);
    const cards = await redis.scard(`${this.FRAUD_PREFIX}${profileId}:cards`);
    
    // Get time-based disputes
    const now = Date.now();
    const disputes7d = await redis.zcount(
      `${this.FRAUD_PREFIX}${profileId}:timeline`,
      now - (7 * 86400000),
      now
    );
    const disputes30d = await redis.zcount(
      `${this.FRAUD_PREFIX}${profileId}:timeline`,
      now - (30 * 86400000),
      now
    );
    
    // Get velocity
    const velocity = await this.getVelocity(profileId);
    
    // Calculate risk score (0-100)
    let riskScore = 0;
    
    // Velocity is highest risk factor
    if (velocity >= this.THRESHOLDS.velocity) {
      riskScore += 30;
    } else {
      riskScore += (velocity / this.THRESHOLDS.velocity) * 20;
    }
    
    // Recent disputes
    if (disputes7d >= this.THRESHOLDS.disputes_7d) {
      riskScore += 25;
    } else {
      riskScore += (disputes7d / this.THRESHOLDS.disputes_7d) * 15;
    }
    
    // Monthly disputes
    if (disputes30d >= this.THRESHOLDS.disputes_30d) {
      riskScore += 20;
    } else {
      riskScore += (disputes30d / this.THRESHOLDS.disputes_30d) * 10;
    }
    
    // Multiple cards is suspicious
    if (cards >= this.THRESHOLDS.unique_cards) {
      riskScore += 15;
    } else {
      riskScore += (cards / this.THRESHOLDS.unique_cards) * 10;
    }
    
    // Multiple IPs/emails
    if (ips > 3) riskScore += 10;
    if (emails > 2) riskScore += 5;
    
    // Check if already blacklisted
    const blacklisted = await this.isBlacklisted(profileId);
    if (blacklisted) riskScore = Math.max(riskScore, 90);
    
    // Cap at 100
    riskScore = Math.min(100, riskScore);
    
    const profile: FraudProfile = {
      id: profileId,
      risk_score: Math.round(riskScore),
      total_disputes: parseInt(stats.total_disputes || '0'),
      disputes_last_30d: disputes30d,
      disputes_last_7d: disputes7d,
      unique_cards_used: cards,
      unique_ips: new Set(),
      unique_emails: new Set(),
      dispute_velocity: velocity,
      blacklisted,
      suspicious_patterns: [],
      last_activity: now,
      total_dispute_amount: parseInt(stats.total_amount || '0')
    };
    
    // Cache the profile
    await cache.set(`${this.FRAUD_PREFIX}profile:${profileId}`, profile, 3600);
    
    return profile;
  }
  
  /**
   * Update velocity tracking (sliding window)
   */
  private async updateVelocity(profileId: string): Promise<void> {
    const key = `${this.FRAUD_PREFIX}velocity:${profileId}`;
    const now = Date.now();
    
    // Add current timestamp
    await redis.zadd(key, now, now.toString());
    
    // Remove old entries (outside window)
    await redis.zremrangebyscore(key, 0, now - (this.VELOCITY_WINDOW * 1000));
    
    // Set expiry
    await redis.expire(key, this.VELOCITY_WINDOW);
  }
  
  /**
   * Get current velocity (disputes per hour)
   */
  private async getVelocity(profileId: string): Promise<number> {
    const key = `${this.FRAUD_PREFIX}velocity:${profileId}`;
    return await redis.zcard(key);
  }
  
  /**
   * Detect suspicious patterns
   */
  private async detectPatterns(profile: FraudProfile, indicator: FraudIndicator): Promise<void> {
    const patterns: string[] = [];
    
    // Pattern 1: Rapid-fire disputes
    if (profile.dispute_velocity >= this.THRESHOLDS.velocity) {
      patterns.push('RAPID_FIRE_DISPUTES');
    }
    
    // Pattern 2: Card cycling
    if (profile.unique_cards_used >= this.THRESHOLDS.unique_cards) {
      patterns.push('CARD_CYCLING');
    }
    
    // Pattern 3: Always same dispute reason
    const reasons = await redis.hgetall(`${this.FRAUD_PREFIX}${profile.id}:reasons`);
    const reasonCounts = Object.values(reasons).map(v => parseInt(v));
    if (reasonCounts.length === 1 && reasonCounts[0] > 5) {
      patterns.push('SINGLE_REASON_PATTERN');
    }
    
    // Pattern 4: Round amounts (possible testing)
    if (indicator.customerId) {
      const amounts = await redis.zrange(
        `${this.FRAUD_PREFIX}${profile.id}:timeline`,
        -10,
        -1
      );
      const roundAmounts = amounts.filter(a => {
        const amount = parseInt(a.split(':')[1] || '0');
        return amount % 10000 === 0; // Checks for $100, $200, etc
      });
      if (roundAmounts.length > 3) {
        patterns.push('ROUND_AMOUNT_TESTING');
      }
    }
    
    // Pattern 5: Geographic anomaly
    if (indicator.ip) {
      const ips = await redis.smembers(`${this.FRAUD_PREFIX}${profile.id}:ips`);
      if (ips.length > 5) {
        patterns.push('GEOGRAPHIC_HOPPING');
      }
    }
    
    profile.suspicious_patterns = patterns;
    
    // Store patterns
    if (patterns.length > 0) {
      await redis.hset(
        `${this.FRAUD_PREFIX}${profile.id}:metadata`,
        'patterns',
        JSON.stringify(patterns)
      );
    }
  }
  
  /**
   * Analyze fraud networks (connected entities)
   */
  private async analyzeNetwork(profile: FraudProfile, indicator: FraudIndicator): Promise<FraudNetwork | null> {
    const connections = new Set<string>();
    
    // Find entities sharing same identifiers
    if (indicator.ip) {
      const sharing = await this.findEntitiesByIndicator('ip', indicator.ip);
      sharing.forEach(e => connections.add(e));
    }
    
    if (indicator.cardFingerprint) {
      const sharing = await this.findEntitiesByIndicator('card', indicator.cardFingerprint);
      sharing.forEach(e => connections.add(e));
    }
    
    if (indicator.deviceId) {
      const sharing = await this.findEntitiesByIndicator('device', indicator.deviceId);
      sharing.forEach(e => connections.add(e));
    }
    
    // Remove self
    connections.delete(profile.id);
    
    if (connections.size >= this.THRESHOLDS.network_size_suspicious) {
      const network: FraudNetwork = {
        primary_id: profile.id,
        connected_entities: Array.from(connections),
        network_size: connections.size + 1,
        total_network_disputes: profile.total_disputes,
        risk_level: connections.size > 10 ? 'critical' : connections.size > 5 ? 'high' : 'medium'
      };
      
      // Store network
      await cache.set(`${this.NETWORK_PREFIX}${profile.id}`, network, 86400);
      
      // Mark all connected entities as network members
      for (const entityId of connections) {
        await redis.sadd(`${this.NETWORK_PREFIX}members:${profile.id}`, entityId);
      }
      
      console.log(`🕸️ Fraud network detected! Size: ${network.network_size}, Risk: ${network.risk_level}`);
      
      return network;
    }
    
    return null;
  }
  
  /**
   * Find entities by shared indicator
   */
  private async findEntitiesByIndicator(type: string, value: string): Promise<string[]> {
    // In production, use Redis Search for this
    // For now, simplified lookup
    const key = `${this.FRAUD_PREFIX}reverse:${type}:${value}`;
    const entities = await redis.smembers(key);
    return Array.from(entities);
  }
  
  /**
   * Blacklist an entity
   */
  async blacklist(profileId: string, reason: string): Promise<void> {
    await redis.sadd(this.BLACKLIST_KEY, profileId);
    await redis.hset(
      `${this.FRAUD_PREFIX}${profileId}:metadata`,
      'blacklist_reason',
      reason
    );
    await redis.hset(
      `${this.FRAUD_PREFIX}${profileId}:metadata`,
      'blacklist_time',
      Date.now().toString()
    );
    
    console.log(`⛔ Entity blacklisted: ${profileId} - Reason: ${reason}`);
  }
  
  /**
   * Check if entity is blacklisted
   */
  async isBlacklisted(profileId: string): Promise<boolean> {
    return await redis.sismember(this.BLACKLIST_KEY, profileId) === 1;
  }
  
  /**
   * Publish fraud alert for monitoring
   */
  private async publishFraudAlert(profile: FraudProfile, indicator: FraudIndicator): Promise<void> {
    const alert = {
      timestamp: Date.now(),
      profile_id: profile.id,
      risk_score: profile.risk_score,
      total_disputes: profile.total_disputes,
      velocity: profile.dispute_velocity,
      patterns: profile.suspicious_patterns,
      indicator
    };
    
    // Add to stream for processing
    await cache.xadd('fraud:alerts', alert);
    
    // Publish to channel for real-time monitoring
    await redis.publish('fraud:alerts:channel', JSON.stringify(alert));
  }
  
  /**
   * Get fraud statistics
   */
  async getFraudStats(): Promise<{
    total_tracked: number;
    blacklisted: number;
    high_risk: number;
    networks_detected: number;
    disputes_prevented: number;
    amount_saved: number;
  }> {
    const blacklisted = await redis.scard(this.BLACKLIST_KEY);
    
    // Would implement more comprehensive stats
    return {
      total_tracked: 0,
      blacklisted,
      high_risk: 0,
      networks_detected: 0,
      disputes_prevented: 0,
      amount_saved: 0
    };
  }
  
  /**
   * Real-time fraud check (INSTANT!)
   */
  async checkFraud(indicator: FraudIndicator): Promise<{
    allow: boolean;
    risk_score: number;
    reason?: string;
  }> {
    const profileId = this.generateProfileId(indicator);
    
    // Check blacklist first (instant)
    if (await this.isBlacklisted(profileId)) {
      return {
        allow: false,
        risk_score: 100,
        reason: 'BLACKLISTED'
      };
    }
    
    // Get cached profile
    const profile = await cache.get<FraudProfile>(`${this.FRAUD_PREFIX}profile:${profileId}`);
    
    if (profile) {
      if (profile.risk_score >= 80) {
        return {
          allow: false,
          risk_score: profile.risk_score,
          reason: 'HIGH_RISK_PROFILE'
        };
      }
      
      if (profile.dispute_velocity >= this.THRESHOLDS.velocity) {
        return {
          allow: false,
          risk_score: profile.risk_score,
          reason: 'VELOCITY_LIMIT'
        };
      }
    }
    
    return {
      allow: true,
      risk_score: profile?.risk_score || 0
    };
  }
  
  /**
   * Generate deterministic profile ID
   */
  private generateProfileId(indicator: FraudIndicator): string {
    // Priority: customerId > email > cardFingerprint > ip
    if (indicator.customerId) return `cust:${indicator.customerId}`;
    if (indicator.email) return `email:${crypto.createHash('md5').update(indicator.email).digest('hex').substring(0, 12)}`;
    if (indicator.cardFingerprint) return `card:${indicator.cardFingerprint}`;
    if (indicator.ip) return `ip:${indicator.ip.replace(/\./g, '_')}`;
    return `unknown:${Date.now()}`;
  }
}

// Export singleton instance
export const fraudTracker = FraudTracker.getInstance();

// Real-time monitoring
setInterval(async () => {
  const stats = await fraudTracker.getFraudStats();
  if (stats.blacklisted > 0) {
    console.log(`🚨 Fraud Stats - Blacklisted: ${stats.blacklisted} | High Risk: ${stats.high_risk} | Prevented: $${stats.amount_saved}`);
  }
}, 300000); // Every 5 minutes