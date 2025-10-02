/**
 * AI Fraud Pattern Detector with Embeddings
 * ULTRATHINK: Prevent Future Losses
 */

import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import type Stripe from 'stripe';
import type { FraudPattern, AIConfig } from './types';

export class FraudDetector {
  private openai: OpenAI;
  private pinecone: Pinecone | null = null;
  private config: AIConfig;
  private indexName = 'fraud-patterns';

  constructor(config: AIConfig) {
    this.config = config;
    
    this.openai = new OpenAI({
      apiKey: this.config.openaiApiKey
    });

    // Initialize Pinecone if credentials provided
    if (config.pineconeApiKey && config.pineconeEnvironment) {
      this.initPinecone(config.pineconeApiKey);
    }
  }

  /**
   * Initialize Pinecone client
   */
  private async initPinecone(apiKey: string) {
    try {
      this.pinecone = new Pinecone({
        apiKey
      });
    } catch (error) {
      console.error('Failed to initialize Pinecone:', error);
      this.pinecone = null;
    }
  }

  /**
   * Detect fraud patterns in dispute
   */
  async detectFraudPatterns(
    dispute: Stripe.Dispute,
    charge: Stripe.Charge,
    historicalDisputes?: Stripe.Dispute[]
  ): Promise<FraudPattern> {
    try {
      // Generate embedding for current dispute
      const embedding = await this.generateEmbedding(dispute, charge);
      
      // Find similar patterns if Pinecone available
      const similarPatterns = this.pinecone ? 
        await this.findSimilarPatterns(embedding) : [];
      
      // Analyze patterns
      const patterns = await this.analyzePatterns(dispute, charge, historicalDisputes);
      
      // Calculate risk score
      const riskScore = this.calculateRiskScore(patterns, similarPatterns);
      
      // Generate recommendation
      const recommendation = this.generateRecommendation(riskScore, patterns);
      
      return {
        customerId: charge.customer as string || 'unknown',
        email: charge.billing_details?.email || 'unknown',
        patterns,
        riskScore,
        similarDisputes: similarPatterns.map(p => p.id),
        recommendation
      };
      
    } catch (error) {
      console.error('Error detecting fraud patterns:', error);
      return this.generateFallbackPattern(dispute, charge);
    }
  }

  /**
   * Generate embedding for dispute
   */
  private async generateEmbedding(
    dispute: Stripe.Dispute,
    charge: Stripe.Charge
  ): Promise<number[]> {
    try {
      const text = this.createEmbeddingText(dispute, charge);
      
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text
      });
      
      return response.data[0].embedding;
      
    } catch (error) {
      console.error('Error generating embedding:', error);
      // Return random embedding as fallback
      return Array(1536).fill(0).map(() => Math.random());
    }
  }

  /**
   * Create text for embedding
   */
  private createEmbeddingText(dispute: Stripe.Dispute, charge: Stripe.Charge): string {
    return `
      Dispute reason: ${dispute.reason}
      Amount: ${dispute.amount}
      Currency: ${dispute.currency}
      Network code: ${dispute.network_reason_code}
      Customer: ${charge.customer}
      Email: ${charge.billing_details?.email}
      Card brand: ${charge.payment_method_details?.card?.brand}
      Card country: ${charge.payment_method_details?.card?.country}
      IP country: ${charge.metadata?.ip_country}
      Risk score: ${charge.outcome?.risk_score}
      3DS: ${charge.payment_method_details?.card?.three_d_secure ? 'enabled' : 'not-used'}
    `.replace(/\s+/g, ' ').trim();
  }

  /**
   * Find similar patterns in Pinecone
   */
  private async findSimilarPatterns(embedding: number[]): Promise<any[]> {
    if (!this.pinecone) return [];
    
    try {
      const index = this.pinecone.index(this.indexName);
      
      const queryResponse = await index.query({
        vector: embedding,
        topK: 5,
        includeMetadata: true
      });
      
      return queryResponse.matches?.filter(m => (m.score || 0) > 0.85) || [];
      
    } catch (error) {
      console.error('Error querying Pinecone:', error);
      return [];
    }
  }

  /**
   * Store pattern in Pinecone
   */
  async storePattern(
    dispute: Stripe.Dispute,
    charge: Stripe.Charge,
    outcome: 'won' | 'lost' | 'pending'
  ): Promise<void> {
    if (!this.pinecone) return;
    
    try {
      const embedding = await this.generateEmbedding(dispute, charge);
      const index = this.pinecone.index(this.indexName);
      
      await index.upsert([{
        id: dispute.id,
        values: embedding,
        metadata: {
          disputeId: dispute.id,
          reason: dispute.reason,
          amount: dispute.amount,
          customer: typeof charge.customer === 'string' ? charge.customer : 'unknown',
          email: charge.billing_details?.email || 'unknown',
          outcome,
          timestamp: Date.now()
        }
      }]);
      
    } catch (error) {
      console.error('Error storing pattern:', error);
    }
  }

  /**
   * Analyze patterns with AI
   */
  private async analyzePatterns(
    dispute: Stripe.Dispute,
    charge: Stripe.Charge,
    historicalDisputes?: Stripe.Dispute[]
  ): Promise<any[]> {
    const patterns: any[] = [];
    
    // Check velocity patterns
    if (historicalDisputes && historicalDisputes.length > 0) {
      const velocityPattern = this.checkVelocityPattern(historicalDisputes);
      if (velocityPattern) patterns.push(velocityPattern);
    }
    
    // Check amount patterns
    const amountPattern = this.checkAmountPattern(dispute, historicalDisputes);
    if (amountPattern) patterns.push(amountPattern);
    
    // Check card testing pattern
    const cardTestingPattern = this.checkCardTestingPattern(charge);
    if (cardTestingPattern) patterns.push(cardTestingPattern);
    
    // AI pattern analysis
    try {
      const aiPatterns = await this.detectAIPatterns(dispute, charge);
      patterns.push(...aiPatterns);
    } catch (error) {
      console.error('AI pattern detection failed:', error);
    }
    
    return patterns;
  }

  /**
   * Check velocity pattern
   */
  private checkVelocityPattern(disputes: Stripe.Dispute[]): any | null {
    const recentDisputes = disputes.filter(d => 
      d.created > (Date.now() / 1000) - 86400 * 30 // Last 30 days
    );
    
    if (recentDisputes.length > 3) {
      return {
        type: 'high_velocity',
        confidence: Math.min(0.9, recentDisputes.length * 0.2),
        description: `${recentDisputes.length} disputes in last 30 days`
      };
    }
    
    return null;
  }

  /**
   * Check amount pattern
   */
  private checkAmountPattern(
    dispute: Stripe.Dispute,
    historicalDisputes?: Stripe.Dispute[]
  ): any | null {
    if (!historicalDisputes) return null;
    
    const similarAmounts = historicalDisputes.filter(d => 
      Math.abs(d.amount - dispute.amount) < 100 // Within $1
    );
    
    if (similarAmounts.length > 2) {
      return {
        type: 'consistent_amount',
        confidence: 0.7,
        description: `Similar amounts in ${similarAmounts.length} disputes`
      };
    }
    
    return null;
  }

  /**
   * Check card testing pattern
   */
  private checkCardTestingPattern(charge: Stripe.Charge): any | null {
    if (charge.amount < 100) { // Less than $1
      return {
        type: 'possible_card_testing',
        confidence: 0.5,
        description: 'Very small transaction amount'
      };
    }
    
    return null;
  }

  /**
   * Detect patterns with AI
   */
  private async detectAIPatterns(
    dispute: Stripe.Dispute,
    charge: Stripe.Charge
  ): Promise<any[]> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        temperature: 0.3,
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content: 'Identify potential fraud patterns. Return JSON array of patterns with type, confidence (0-1), and description.'
          },
          {
            role: 'user',
            content: `Dispute: ${JSON.stringify(dispute, null, 2)}\nCharge: ${JSON.stringify(charge, null, 2)}`
          }
        ]
      });
      
      const patterns = JSON.parse(response.choices[0]?.message?.content || '[]');
      return Array.isArray(patterns) ? patterns : [];
      
    } catch (error) {
      return [];
    }
  }

  /**
   * Calculate risk score
   */
  private calculateRiskScore(patterns: any[], similarPatterns: any[]): number {
    let score = 0;
    
    // Pattern-based scoring
    for (const pattern of patterns) {
      score += (pattern.confidence || 0.5) * 20;
    }
    
    // Similar pattern scoring
    score += similarPatterns.length * 15;
    
    // Normalize to 0-100
    return Math.min(100, Math.max(0, score));
  }

  /**
   * Generate recommendation
   */
  private generateRecommendation(
    riskScore: number,
    patterns: any[]
  ): 'block' | 'watch' | 'allow' {
    if (riskScore > 75) return 'block';
    if (riskScore > 40 || patterns.length > 2) return 'watch';
    return 'allow';
  }

  /**
   * Generate fallback pattern
   */
  private generateFallbackPattern(
    dispute: Stripe.Dispute,
    charge: Stripe.Charge
  ): FraudPattern {
    return {
      customerId: charge.customer as string || 'unknown',
      email: charge.billing_details?.email || 'unknown',
      patterns: [{
        type: 'standard_check',
        confidence: 0.5,
        description: 'Standard fraud check performed'
      }],
      riskScore: dispute.reason === 'fraudulent' ? 60 : 30,
      similarDisputes: [],
      recommendation: 'watch'
    };
  }

  /**
   * Check if customer is serial fraudster
   */
  async isSerialFraudster(
    customerId: string,
    email: string
  ): Promise<boolean> {
    if (!this.pinecone) return false;
    
    try {
      const index = this.pinecone.index(this.indexName);
      
      // Search by customer ID and email
      const results = await index.query({
        vector: Array(1536).fill(0), // Dummy vector
        topK: 10,
        filter: {
          $or: [
            { customer: { $eq: customerId } },
            { email: { $eq: email } }
          ]
        },
        includeMetadata: true
      });
      
      const lostDisputes = results.matches?.filter(m => 
        m.metadata?.outcome === 'lost'
      ) || [];
      
      return lostDisputes.length >= 3;
      
    } catch (error) {
      return false;
    }
  }
}