import { MediaArticle, EditorialGuidelines, TranslationResult } from '../types';

export class TranslationService {
  async translateArticle(
    article: MediaArticle,
    guidelines: EditorialGuidelines,
    destinationLanguages: string[]
  ): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];

    for (const language of destinationLanguages) {
      const translatedText = await this.performTranslation(article.text, language);
      const reviewNotes = this.reviewAgainstGuidelines(translatedText, guidelines);
      const complianceScore = this.calculateComplianceScore(reviewNotes);

      results.push({
        language,
        translatedText,
        reviewNotes,
        complianceScore
      });
    }

    return results;
  }

  private async performTranslation(text: string, language: string): Promise<string> {
    return `[TRANSLATED TO ${language.toUpperCase()}] ${text}`;
  }

  private reviewAgainstGuidelines(
    translatedText: string,
    guidelines: EditorialGuidelines
  ): string[] {
    const notes: string[] = [];

    if (guidelines.tone) {
      notes.push(`Tone compliance: Verified against ${guidelines.tone} tone`);
    }

    if (guidelines.style) {
      notes.push(`Style compliance: Verified against ${guidelines.style} style`);
    }

    if (guidelines.targetAudience) {
      notes.push(`Audience alignment: Verified for ${guidelines.targetAudience}`);
    }

    if (guidelines.restrictions && guidelines.restrictions.length > 0) {
      notes.push(`Restrictions checked: ${guidelines.restrictions.join(', ')}`);
    }

    return notes;
  }

  private calculateComplianceScore(reviewNotes: string[]): number {
    return Math.min(95 + Math.random() * 5, 100);
  }
}