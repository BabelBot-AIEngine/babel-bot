import { MediaArticle, EditorialGuidelines, TranslationResult, GuideType } from '../types';

export interface StudyEstimate {
  estimatedCompletionTimeMinutes: number;
  rewardPence: number;
  maxAllowedTimeMinutes: number;
  reasoning: string[];
}

export interface EstimationFactors {
  baseTimeMinutes: number;
  textComplexityMultiplier: number;
  guidelinesComplexityMultiplier: number;
  qualityScoreAdjustment: number;
  totalAdjustments: string[];
}

export class StudyEstimationService {
  private static readonly MIN_TIME_MINUTES = 5;
  private static readonly MAX_TIME_MINUTES = 30;
  private static readonly MIN_REWARD_PENCE = 50; // £0.50 (meets £6/hour for 5min minimum)
  private static readonly MAX_REWARD_PENCE = 400; // £4.00
  private static readonly HOURLY_RATE_PENCE = 600; // £6.00/hour minimum (Prolific requirement)
  private static readonly GENEROSITY_MULTIPLIER = 1.2; // 20% bonus for fair compensation
  
  static estimateStudyParameters(
    article: MediaArticle,
    guidelines: EditorialGuidelines,
    translation: TranslationResult,
    guide?: GuideType
  ): StudyEstimate {
    const factors = this.calculateEstimationFactors(article, guidelines, translation, guide);
    
    // Calculate estimated time
    let estimatedTime = factors.baseTimeMinutes * 
                       factors.textComplexityMultiplier * 
                       factors.guidelinesComplexityMultiplier + 
                       factors.qualityScoreAdjustment;
    
    // Apply bounds
    estimatedTime = Math.max(this.MIN_TIME_MINUTES, Math.min(this.MAX_TIME_MINUTES, estimatedTime));
    estimatedTime = Math.round(estimatedTime);
    
    // Calculate reward based on time and minimum hourly rate, with generosity bonus
    let reward = Math.ceil((estimatedTime / 60) * this.HOURLY_RATE_PENCE * this.GENEROSITY_MULTIPLIER);
    reward = Math.max(this.MIN_REWARD_PENCE, Math.min(this.MAX_REWARD_PENCE, reward));
    
    // Max allowed time is 2-3x the estimated time, capped at MAX_TIME_MINUTES
    const maxTime = Math.min(Math.round(estimatedTime * 2.5), this.MAX_TIME_MINUTES);
    
    return {
      estimatedCompletionTimeMinutes: estimatedTime,
      rewardPence: reward,
      maxAllowedTimeMinutes: maxTime,
      reasoning: factors.totalAdjustments
    };
  }
  
  private static calculateEstimationFactors(
    article: MediaArticle,
    guidelines: EditorialGuidelines,
    translation: TranslationResult,
    guide?: GuideType
  ): EstimationFactors {
    const adjustments: string[] = [];
    
    // Base time depends on guidelines complexity
    const baseTime = this.getBaseTimeForGuideType(guide);
    adjustments.push(`Base time: ${baseTime}min (${guide || 'default'} guidelines)`);
    
    // Text complexity based on length and structure
    const textComplexity = this.calculateTextComplexityMultiplier(article, translation);
    if (textComplexity.multiplier !== 1.0) {
      adjustments.push(`Text complexity: ${textComplexity.reasoning}`);
    }
    
    // Guidelines complexity based on content
    const guidelinesComplexity = this.calculateGuidelinesComplexityMultiplier(guidelines);
    if (guidelinesComplexity.multiplier !== 1.0) {
      adjustments.push(`Guidelines complexity: ${guidelinesComplexity.reasoning}`);
    }
    
    // Quality score adjustment - lower scores need more review time
    const qualityAdjustment = this.calculateQualityScoreAdjustment(translation);
    if (qualityAdjustment.adjustment !== 0) {
      adjustments.push(`Quality adjustment: ${qualityAdjustment.reasoning}`);
    }
    
    return {
      baseTimeMinutes: baseTime,
      textComplexityMultiplier: textComplexity.multiplier,
      guidelinesComplexityMultiplier: guidelinesComplexity.multiplier,
      qualityScoreAdjustment: qualityAdjustment.adjustment,
      totalAdjustments: adjustments
    };
  }
  
  private static getBaseTimeForGuideType(guide?: GuideType): number {
    switch (guide) {
      case 'financialtimes':
        return 12; // Complex technical guidelines
      case 'prolific':
        return 10; // Medium complexity structured guidelines
      case 'monzo':
        return 9;  // Medium complexity guidelines
      default:
        return 8;  // Basic guidelines
    }
  }
  
  private static calculateTextComplexityMultiplier(
    article: MediaArticle, 
    translation: TranslationResult
  ): { multiplier: number; reasoning: string } {
    const originalLength = (article.text || '').length;
    const translatedLength = translation.translatedText.length;
    const avgLength = (originalLength + translatedLength) / 2;
    
    // Base multiplier on text length
    let multiplier = 1.0;
    let reasoning = '';
    
    if (avgLength > 2000) {
      multiplier = 1.4;
      reasoning = '+40% for very long text (>2000 chars)';
    } else if (avgLength > 1000) {
      multiplier = 1.2;
      reasoning = '+20% for long text (>1000 chars)';
    } else if (avgLength > 500) {
      multiplier = 1.1;
      reasoning = '+10% for medium text (>500 chars)';
    } else if (avgLength < 200) {
      multiplier = 0.9;
      reasoning = '-10% for short text (<200 chars)';
    }
    
    // Additional complexity factors
    const originalWords = (article.text || '').split(/\s+/).length;
    const avgWordsPerSentence = originalWords / ((article.text || '').split(/[.!?]+/).length || 1);
    
    if (avgWordsPerSentence > 25) {
      multiplier += 0.1;
      reasoning += '; +10% for complex sentences';
    }
    
    return { multiplier, reasoning: reasoning || 'standard length' };
  }
  
  private static calculateGuidelinesComplexityMultiplier(
    guidelines: EditorialGuidelines
  ): { multiplier: number; reasoning: string } {
    let complexity = 0;
    const factors: string[] = [];
    
    // Count guideline categories and complexity
    if (guidelines.tone) {
      complexity += 1;
      factors.push('tone guidelines');
    }
    if (guidelines.style) {
      complexity += 1;
      factors.push('style guidelines');
    }
    if (guidelines.targetAudience) {
      complexity += 1;
      factors.push('audience requirements');
    }
    if (guidelines.restrictions && guidelines.restrictions.length > 0) {
      complexity += guidelines.restrictions.length * 0.5;
      factors.push(`${guidelines.restrictions.length} restrictions`);
    }
    if (guidelines.requirements && guidelines.requirements.length > 0) {
      complexity += guidelines.requirements.length * 0.5;
      factors.push(`${guidelines.requirements.length} requirements`);
    }
    
    let multiplier = 1.0;
    let reasoning = 'standard guidelines';
    
    if (complexity >= 5) {
      multiplier = 1.3;
      reasoning = '+30% for complex guidelines';
    } else if (complexity >= 3) {
      multiplier = 1.1;
      reasoning = '+10% for detailed guidelines';
    } else if (complexity <= 1) {
      multiplier = 0.9;
      reasoning = '-10% for simple guidelines';
    }
    
    if (factors.length > 0) {
      reasoning += ` (${factors.join(', ')})`;
    }
    
    return { multiplier, reasoning };
  }
  
  private static calculateQualityScoreAdjustment(
    translation: TranslationResult
  ): { adjustment: number; reasoning: string } {
    const score = translation.complianceScore || 50;
    const reviewNotesCount = (translation.reviewNotes || []).length;
    
    let adjustment = 0;
    const factors: string[] = [];
    
    // Lower compliance scores need more review time
    if (score < 40) {
      adjustment += 3;
      factors.push('very low compliance score (<40)');
    } else if (score < 60) {
      adjustment += 2;
      factors.push('low compliance score (<60)');
    } else if (score < 70) {
      adjustment += 1;
      factors.push('moderate compliance score (<70)');
    }
    
    // More review notes indicate more issues to evaluate
    if (reviewNotesCount > 3) {
      adjustment += 1;
      factors.push(`${reviewNotesCount} review notes`);
    }
    
    const reasoning = factors.length > 0 
      ? `+${adjustment}min for ${factors.join(', ')}`
      : 'no quality adjustments';
    
    return { adjustment, reasoning };
  }
}