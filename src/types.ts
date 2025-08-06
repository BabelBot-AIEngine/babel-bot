export type GuideType = "financialtimes" | "monzo" | "prolific";

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
  humanReviewBatches?: HumanReviewBatch[];
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

export interface TaskCardDisplayInfo {
  task: TranslationTask;
  filteredLanguages: string[];
  isPartialDisplay: boolean;
}

export const getLanguagesForStatus = (
  task: TranslationTask,
  targetStatus: LanguageTaskStatus
): string[] => {
  // Check if this is an enhanced task
  const isEnhancedTask = (task as any).type === "enhanced";

  if (isEnhancedTask) {
    return getLanguagesForStatusEnhanced(task as any, targetStatus);
  }

  const languageStates = getLanguageStatesForTask(task);
  const languages: string[] = [];

  languageStates.forEach((status, language) => {
    if (status === targetStatus) {
      languages.push(language);
    }
  });

  return languages;
};

// Helper function for enhanced tasks
const getLanguagesForStatusEnhanced = (
  enhancedTask: any,
  targetStatus: LanguageTaskStatus
): string[] => {
  const languages: string[] = [];

  // Map enhanced task status to legacy status
  const mapEnhancedStatusToLegacy = (
    enhancedStatus: string
  ): LanguageTaskStatus => {
    switch (enhancedStatus) {
      case "pending":
        return "pending";
      case "processing":
        return "translating";
      case "review_pending":
      case "review_active":
        return "human_review";
      case "finalizing":
        return "translating";
      case "completed":
        return "done";
      case "failed":
        return "failed";
      default:
        return "pending";
    }
  };

  const mapSubTaskStatusToLegacy = (
    subTaskStatus: string
  ): LanguageTaskStatus => {
    switch (subTaskStatus) {
      case "pending":
      case "translating":
        return "translating";
      case "translation_complete":
      case "llm_verifying":
      case "llm_verified":
        return "llm_verification";
      case "review_ready":
      case "review_queued":
      case "review_active":
      case "review_complete":
      case "llm_reverifying":
        return "human_review";
      case "iteration_complete":
      case "finalized":
        return "done";
      case "failed":
        return "failed";
      default:
        return "pending";
    }
  };

  // If task has language sub-tasks, use their individual statuses
  if (enhancedTask.languageSubTasks) {
    Object.entries(enhancedTask.languageSubTasks).forEach(
      ([language, subTask]: [string, any]) => {
        const mappedStatus = mapSubTaskStatusToLegacy(subTask.status);
        if (mappedStatus === targetStatus) {
          languages.push(language);
        }
      }
    );
  } else {
    // Fall back to overall task status for all languages
    const mappedTaskStatus = mapEnhancedStatusToLegacy(enhancedTask.status);
    if (mappedTaskStatus === targetStatus) {
      languages.push(...enhancedTask.destinationLanguages);
    }
  }

  return languages;
};

export const getTaskDisplayInfoForStatus = (
  task: TranslationTask,
  targetStatus: LanguageTaskStatus
): TaskCardDisplayInfo | null => {
  const languagesInStatus = getLanguagesForStatus(task, targetStatus);

  if (languagesInStatus.length === 0) {
    return null;
  }

  const isPartialDisplay = hasMultipleLanguageStates(task);

  return {
    task,
    filteredLanguages: languagesInStatus,
    isPartialDisplay,
  };
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
