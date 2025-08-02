export type GuideType = 'financialtimes' | 'monzo' | 'prolific';

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
  guide?: GuideType;
}

export interface AnthropicReviewResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  role: 'assistant';
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ParsedReviewResult {
  notes: string[];
  score: number;
}

export interface TranslationResult {
  language: string;
  translatedText: string;
  reviewNotes: string[];
  complianceScore: number;
}

export interface TranslationResponse {
  originalArticle: MediaArticle;
  translations: TranslationResult[];
  processedAt: string;
}

export interface TranslationTask {
  id: string;
  status: 'pending' | 'translating' | 'llm_verification' | 'human_review' | 'done' | 'failed';
  mediaArticle: MediaArticle;
  editorialGuidelines: EditorialGuidelines;
  destinationLanguages: string[];
  result?: TranslationResponse;
  error?: string;
  createdAt: string;
  updatedAt: string;
  progress?: number;
}

export interface TaskStatusResponse {
  task: TranslationTask;
}

export interface TaskListResponse {
  tasks: TranslationTask[];
}