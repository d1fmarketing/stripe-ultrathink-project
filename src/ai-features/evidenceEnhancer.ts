/**
 * AI Evidence Enhancer for Professional Evidence Presentation
 * ULTRATHINK: Better Evidence Quality
 */

import OpenAI from 'openai';
import type { EvidenceEnhancement, AIConfig } from './types';

export class EvidenceEnhancer {
  private openai: OpenAI;
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = {
      maxTokens: 400,
      temperature: 0.3,
      model: 'gpt-5',
      ...config
    };
    
    this.openai = new OpenAI({
      apiKey: this.config.openaiApiKey
    });
  }

  /**
   * Enhance raw evidence with AI
   */
  async enhanceEvidence(evidence: any): Promise<EvidenceEnhancement> {
    try {
      const enhancements: any = {};
      const additions: any[] = [];
      
      // Enhance each evidence field
      for (const [key, value] of Object.entries(evidence || {})) {
        if (value && typeof value === 'string' && value.length > 10) {
          const enhanced = await this.enhanceField(key, value);
          if (enhanced !== value) {
            enhancements[key] = enhanced;
            additions.push({
              field: key,
              value: enhanced,
              type: 'ai_enhanced'
            });
          }
        } else {
          enhancements[key] = value;
        }
      }

      // Generate additional evidence descriptions
      const additionalEvidence = await this.generateAdditionalEvidence(evidence);
      for (const item of additionalEvidence) {
        additions.push(item);
      }

      // Generate professional summary
      const summary = await this.generateEvidenceSummary(enhancements);

      return {
        originalEvidence: evidence,
        enhancedEvidence: enhancements,
        additions,
        summary
      };
      
    } catch (error) {
      console.error('Error enhancing evidence:', error);
      return {
        originalEvidence: evidence,
        enhancedEvidence: evidence,
        additions: [],
        summary: 'Evidence provided as submitted.'
      };
    }
  }

  /**
   * Enhance individual evidence field
   */
  private async enhanceField(fieldName: string, content: string): Promise<string> {
    // Skip URLs and IDs
    if (content.startsWith('http') || content.length < 20 || content.includes('_id')) {
      return content;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        temperature: 0.2,
        max_tokens: 150,
        messages: [
          {
            role: 'system',
            content: 'Enhance this evidence description to be more professional and compelling. Keep it factual and concise.'
          },
          {
            role: 'user',
            content: `Field: ${fieldName}\nContent: ${content}\n\nProvide enhanced version (max 100 words):`
          }
        ]
      });

      const enhanced = response.choices[0]?.message?.content?.trim() || content;
      
      // Add AI marker
      if (enhanced !== content) {
        return `[AI-ENHANCED] ${enhanced}`;
      }
      
      return content;
      
    } catch (error) {
      return content;
    }
  }

  /**
   * Generate additional evidence descriptions
   */
  private async generateAdditionalEvidence(evidence: any): Promise<any[]> {
    const additions: any[] = [];
    
    // Generate behavior analysis if customer data exists
    if (evidence.customer_email_address || evidence.customer_name) {
      const behaviorAnalysis = await this.generateBehaviorAnalysis(evidence);
      if (behaviorAnalysis) {
        additions.push({
          field: 'customer_behavior_analysis',
          value: behaviorAnalysis,
          type: 'ai_generated'
        });
      }
    }

    // Generate fraud pattern analysis
    if (evidence.customer_purchase_ip || evidence.access_activity_log) {
      const fraudAnalysis = await this.generateFraudAnalysis(evidence);
      if (fraudAnalysis) {
        additions.push({
          field: 'fraud_pattern_analysis',
          value: fraudAnalysis,
          type: 'ai_generated'
        });
      }
    }

    // Generate professional evidence description
    const professionalDescription = await this.generateProfessionalDescription(evidence);
    if (professionalDescription) {
      additions.push({
        field: 'evidence_description',
        value: professionalDescription,
        type: 'ai_generated'
      });
    }

    return additions;
  }

  /**
   * Generate behavior analysis
   */
  private async generateBehaviorAnalysis(evidence: any): Promise<string | null> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        temperature: 0.3,
        max_tokens: 150,
        messages: [
          {
            role: 'system',
            content: 'Generate a professional customer behavior analysis based on the evidence. Focus on patterns that support transaction legitimacy.'
          },
          {
            role: 'user',
            content: `Evidence: ${JSON.stringify(evidence, null, 2)}\n\nGenerate behavior analysis (max 100 words):`
          }
        ]
      });

      const analysis = response.choices[0]?.message?.content?.trim();
      return analysis ? `[AI-GENERATED BEHAVIOR ANALYSIS]\n${analysis}` : null;
      
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate fraud pattern analysis
   */
  private async generateFraudAnalysis(evidence: any): Promise<string | null> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        temperature: 0.2,
        max_tokens: 150,
        messages: [
          {
            role: 'system',
            content: 'Analyze evidence for fraud patterns. Focus on indicators that support transaction legitimacy and dispute any fraud claims.'
          },
          {
            role: 'user',
            content: `Evidence: ${JSON.stringify(evidence, null, 2)}\n\nGenerate fraud pattern analysis showing NO fraud (max 100 words):`
          }
        ]
      });

      const analysis = response.choices[0]?.message?.content?.trim();
      return analysis ? `[AI-GENERATED FRAUD ANALYSIS]\n${analysis}` : null;
      
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate professional evidence description
   */
  private async generateProfessionalDescription(evidence: any): Promise<string | null> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        temperature: 0.3,
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content: 'Create a professional, comprehensive description of the evidence provided. Be factual and persuasive.'
          },
          {
            role: 'user',
            content: `Evidence fields: ${Object.keys(evidence).join(', ')}\n\nGenerate professional evidence description (max 150 words):`
          }
        ]
      });

      const description = response.choices[0]?.message?.content?.trim();
      return description ? `[AI-GENERATED EVIDENCE DESCRIPTION]\n${description}` : null;
      
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate evidence summary
   */
  private async generateEvidenceSummary(evidence: any): Promise<string> {
    try {
      const evidenceCount = Object.keys(evidence).filter(k => evidence[k]).length;
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        temperature: 0.3,
        max_tokens: 100,
        messages: [
          {
            role: 'system',
            content: 'Create a brief, professional summary of the evidence package.'
          },
          {
            role: 'user',
            content: `We have provided ${evidenceCount} pieces of evidence including: ${Object.keys(evidence).slice(0, 5).join(', ')}. Generate a 2-sentence summary.`
          }
        ]
      });

      return response.choices[0]?.message?.content?.trim() || 
        `Comprehensive evidence package containing ${evidenceCount} supporting documents and data points.`;
        
    } catch (error) {
      return `Evidence package contains ${Object.keys(evidence).length} supporting items.`;
    }
  }

  /**
   * Validate enhanced evidence
   */
  validateEnhancement(enhancement: EvidenceEnhancement): boolean {
    // Ensure no fabrication
    for (const addition of enhancement.additions) {
      if (addition.type === 'ai_generated' && !addition.value.includes('[AI-GENERATED')) {
        return false;
      }
      if (addition.type === 'ai_enhanced' && !addition.value.includes('[AI-ENHANCED')) {
        return false;
      }
    }
    
    // Ensure original evidence preserved
    const originalKeys = Object.keys(enhancement.originalEvidence);
    const enhancedKeys = Object.keys(enhancement.enhancedEvidence);
    
    return originalKeys.every(key => enhancedKeys.includes(key));
  }

  /**
   * Generate evidence quality score
   */
  async scoreEvidenceQuality(evidence: any): Promise<number> {
    const scores = {
      hasReceipt: evidence.receipt ? 20 : 0,
      hasShipping: evidence.shipping_documentation ? 20 : 0,
      hasCustomerComm: evidence.customer_communication ? 15 : 0,
      hasSignature: evidence.customer_signature ? 15 : 0,
      hasActivityLog: evidence.access_activity_log ? 10 : 0,
      hasIPData: evidence.customer_purchase_ip ? 10 : 0,
      hasDuplicateInfo: evidence.duplicate_charge_documentation ? 10 : 0
    };
    
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
    
    // Bonus for completeness
    const fieldCount = Object.values(evidence).filter(v => v).length;
    const completenessBonus = fieldCount > 10 ? 10 : fieldCount > 5 ? 5 : 0;
    
    return Math.min(100, totalScore + completenessBonus);
  }
}