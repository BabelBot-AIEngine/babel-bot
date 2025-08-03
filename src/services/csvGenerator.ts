import { MediaArticle, EditorialGuidelines, TranslationResult } from "../types";

export interface HumanReviewCsvRow {
  taskId: string;
  originalTitle: string;
  originalText: string;
  targetLanguage: string;
  translatedText: string;
  complianceScore: number;
  tone: string;
  style: string;
  targetAudience: string;
  restrictions: string;
  requirements: string;
  reviewNotes: string;
}

export class CsvGeneratorService {
  static generateHumanReviewCsv(
    taskId: string,
    article: MediaArticle,
    guidelines: EditorialGuidelines,
    translation: TranslationResult
  ): string {
    const rows: HumanReviewCsvRow[] = [{
      taskId,
      originalTitle: article.title || '',
      originalText: article.text,
      targetLanguage: translation.language,
      translatedText: translation.translatedText,
      complianceScore: translation.complianceScore || 0,
      tone: guidelines.tone || '',
      style: guidelines.style || '',
      targetAudience: guidelines.targetAudience || '',
      restrictions: guidelines.restrictions?.join('; ') || '',
      requirements: guidelines.requirements?.join('; ') || '',
      reviewNotes: translation.reviewNotes?.join('; ') || ''
    }];

    return this.convertToCsv(rows);
  }

  private static convertToCsv(rows: HumanReviewCsvRow[]): string {
    const headers = [
      'Task ID',
      'Original Title', 
      'Original Text',
      'Target Language',
      'Translated Text',
      'Compliance Score',
      'Tone Guidelines',
      'Style Guidelines',
      'Target Audience',
      'Restrictions',
      'Requirements',
      'Review Notes'
    ];

    const csvRows = [
      headers.join(','),
      ...rows.map(row => [
        this.escapeCsvField(row.taskId),
        this.escapeCsvField(row.originalTitle),
        this.escapeCsvField(row.originalText),
        this.escapeCsvField(row.targetLanguage),
        this.escapeCsvField(row.translatedText),
        row.complianceScore.toString(),
        this.escapeCsvField(row.tone),
        this.escapeCsvField(row.style),
        this.escapeCsvField(row.targetAudience),
        this.escapeCsvField(row.restrictions),
        this.escapeCsvField(row.requirements),
        this.escapeCsvField(row.reviewNotes)
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