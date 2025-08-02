export interface MediaArticle {
  text: string;
  title?: string;
  metadata?: Record<string, any>;
}

export interface EditorialGuidelines {
  tone?: string;
  style?: string;
  targetAudience?: string;
  restrictions?: string[];
  requirements?: string[];
}

export interface TranslationRequest {
  mediaArticle: MediaArticle;
  editorialGuidelines: EditorialGuidelines;
  destinationLanguages: string[];
}

export interface TranslationResult {
  language: string;
  translatedText: string;
  reviewNotes?: string[];
  complianceScore?: number;
}

export interface TranslationResponse {
  originalArticle: MediaArticle;
  translations: TranslationResult[];
  processedAt: string;
}