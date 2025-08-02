export type GuideType = "financialtimes" | "monzo" | "prolific";

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
  useFullMarkdown?: boolean;
}

export type LanguageTaskStatus =
  | "pending"
  | "translating"
  | "llm_verification"
  | "human_review"
  | "done"
  | "failed";

export interface TranslationResult {
  language: string;
  translatedText: string;
  reviewNotes?: string[];
  complianceScore?: number;
  status?: LanguageTaskStatus;
}

export interface TranslationResponse {
  originalArticle: MediaArticle;
  translations: TranslationResult[];
  processedAt: string;
}

export interface TranslationTask {
  id: string;
  status:
    | "pending"
    | "translating"
    | "llm_verification"
    | "human_review"
    | "done"
    | "failed";
  mediaArticle: MediaArticle;
  editorialGuidelines: EditorialGuidelines;
  destinationLanguages: string[];
  guide?: GuideType;
  useFullMarkdown?: boolean;
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

export const getLanguageStatesForTask = (
  task: TranslationTask
): Map<string, LanguageTaskStatus> => {
  const states = new Map<string, LanguageTaskStatus>();

  if (!task.result?.translations) {
    task.destinationLanguages.forEach((lang) => {
      states.set(lang, task.status);
    });
    return states;
  }

  task.result.translations.forEach((translation) => {
    states.set(translation.language, translation.status || task.status);
  });

  task.destinationLanguages.forEach((lang) => {
    if (!states.has(lang)) {
      states.set(lang, task.status);
    }
  });

  return states;
};

export const hasMultipleLanguageStates = (task: TranslationTask): boolean => {
  const states = getLanguageStatesForTask(task);
  const uniqueStates = new Set(states.values());
  return uniqueStates.size > 1;
};

// Prolific Filter Types
export interface ProlificFilterChoice {
  [key: string]: string;
}

export interface ProlificFilter {
  filter_id: string;
  title: string;
  description: string;
  question?: string;
  tags: string[];
  type: "select" | "range";
  data_type:
    | "ChoiceID"
    | "integer"
    | "float"
    | "date"
    | "ParticipantID"
    | "StudyID"
    | "ParticipantGroupID";
  choices?: ProlificFilterChoice;
  min?: number | string;
  max?: number | string;
}

export interface ProlificFiltersResponse {
  results: ProlificFilter[];
  _links: {
    self: { href: string; title: string };
    next: { href: string | null; title: string };
    previous: { href: string | null; title: string };
    last: { href: string; title: string };
  };
  meta: {
    count: number;
  };
}

export interface FilterRecommendation {
  filter_id: string;
  title: string;
  reasoning: string;
  confidence: number; // 1-100
  recommended_values?: {
    choices?: string[];
    min?: number | string;
    max?: number | string;
  };
}

export interface FilterRecommendationRequest {
  article: MediaArticle;
  targetLanguages: string[];
  evaluationContext?: {
    taskType?:
      | "translation_quality"
      | "cultural_adaptation"
      | "technical_accuracy"
      | "general_evaluation";
    expertiseLevel?: "beginner" | "intermediate" | "expert";
    domainSpecific?: boolean;
  };
}

export interface FilterRecommendationResponse {
  recommendations: FilterRecommendation[];
  reasoning: string;
  confidence: number;
}

// Anthropic API Types
export interface AnthropicContent {
  type: "text";
  text: string;
}

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface AnthropicMessage {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContent[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}
