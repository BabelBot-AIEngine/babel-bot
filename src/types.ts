export type GuideType = 'financialtimes' | 'monzo' | 'prolific';

export interface HumanReviewConfig {
  confidenceThreshold: number;
  workspaceId: string;
  taskDetails: {
    taskName: string;
    taskIntroduction: string;
    taskSteps: string;
  };
}

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

export type LanguageTaskStatus = 'pending' | 'translating' | 'llm_verification' | 'human_review' | 'done' | 'failed';

export interface TranslationResult {
  language: string;
  translatedText: string;
  reviewNotes?: string[];
  complianceScore?: number;
  status?: LanguageTaskStatus;
  batchId?: string;
  studyId?: string;
}

export interface TranslationResponse {
  originalArticle: MediaArticle;
  translations: TranslationResult[];
  processedAt: string;
}

export interface HumanReviewBatch {
  language: string;
  batchId: string;
  studyId: string;
  datasetId: string;
  projectId: string;
  createdAt: string;
}

export interface TranslationTask {
  id: string;
  status: 'pending' | 'translating' | 'llm_verification' | 'human_review' | 'done' | 'failed';
  mediaArticle: MediaArticle;
  editorialGuidelines: EditorialGuidelines;
  destinationLanguages: string[];
  guide?: GuideType;
  result?: TranslationResponse;
  error?: string;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  humanReviewBatches?: HumanReviewBatch[];
}

export interface TaskStatusResponse {
  task: TranslationTask;
}

export interface TaskListResponse {
  tasks: TranslationTask[];
}

export const getLanguageStatesForTask = (task: TranslationTask): Map<string, LanguageTaskStatus> => {
  const states = new Map<string, LanguageTaskStatus>();
  
  if (!task.result?.translations) {
    task.destinationLanguages.forEach(lang => {
      states.set(lang, task.status);
    });
    return states;
  }
  
  task.result.translations.forEach(translation => {
    states.set(translation.language, translation.status || task.status);
  });
  
  task.destinationLanguages.forEach(lang => {
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