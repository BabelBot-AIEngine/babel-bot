import { MediaArticle, EditorialGuidelines, TranslationResult } from "../types";

export interface HumanReviewCsvRow {
  originalText: string;
  translatedText: string;
  editorialReviewPoints: string;
}

export class CsvGeneratorService {
  static generateHumanReviewCsv(
    taskId: string,
    article: MediaArticle,
    guidelines: EditorialGuidelines,
    translation: TranslationResult
  ): string {
    // Combine all editorial guidelines into clear review points
    const reviewPoints: string[] = [];
    
    if (guidelines.tone) {
      reviewPoints.push(`Tone: ${guidelines.tone}`);
    }
    if (guidelines.style) {
      reviewPoints.push(`Style: ${guidelines.style}`);
    }
    if (guidelines.targetAudience) {
      reviewPoints.push(`Target Audience: ${guidelines.targetAudience}`);
    }
    if (guidelines.restrictions && guidelines.restrictions.length > 0) {
      reviewPoints.push(`Restrictions: ${guidelines.restrictions.join(', ')}`);
    }
    if (guidelines.requirements && guidelines.requirements.length > 0) {
      reviewPoints.push(`Requirements: ${guidelines.requirements.join(', ')}`);
    }
    
    // Include LLM review notes if available
    if (translation.reviewNotes && translation.reviewNotes.length > 0) {
      reviewPoints.push(`Previous Review Notes: ${translation.reviewNotes.join('; ')}`);
    }

    const rows: HumanReviewCsvRow[] = [{
      originalText: article.text,
      translatedText: translation.translatedText,
      editorialReviewPoints: reviewPoints.join(' | ')
    }];

    return this.convertToCsv(rows);
  }

  private static convertToCsv(rows: HumanReviewCsvRow[]): string {
    const headers = [
      'Original Text',
      'Translated Text',
      'Editorial Review Points'
    ];

    const csvRows = [
      headers.join(','),
      ...rows.map(row => [
        this.escapeCsvField(row.originalText),
        this.escapeCsvField(row.translatedText),
        this.escapeCsvField(row.editorialReviewPoints)
      ].join(','))
    ];

    return csvRows.join('\n');
  }

  private static escapeCsvField(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  static generateBatchName(taskId: string, language: string): string {
    return `translation-review-${taskId}-${language}-${Date.now()}`;
  }

  static generateDatasetName(taskId: string, language: string): string {
    return `dataset-${taskId}-${language}-${Date.now()}`;
  }
}