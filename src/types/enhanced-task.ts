export type TaskStatus =
  | "pending" // Initial creation
  | "processing" // Languages being processed
  | "review_pending" // Waiting for human review
  | "review_active" // Human review in progress
  | "finalizing" // Consolidating results
  | "completed" // All done
  | "failed"; // Unrecoverable error

export type LanguageSubTaskStatus =
  | "pending" // Waiting to start
  | "translating" // AI translation in progress
  | "translation_complete" // Translation done
  | "llm_verifying" // LLM verification in progress
  | "llm_verified" // LLM verification complete
  | "review_ready" // Ready for human review
  | "review_queued" // Added to Prolific batch
  | "review_active" // Human review in progress
  | "review_complete" // Human review done, needs LLM re-verification
  | "llm_reverifying" // Post-human LLM verification in progress
  | "iteration_complete" // One review cycle done
  | "finalized" // All processing complete (max loops or sufficient score)
  | "failed"; // Processing failed

export interface ReviewIteration {
  iterationNumber: number; // 1, 2, or 3
  startedAt: string;
  completedAt?: string;
  llmVerification: {
    score: number;
    feedback: string;
    confidence: number;
    completedAt: string;
  };
  humanReview?: {
    prolificStudyId: string;
    score: number;
    feedback: string;
    reviewerIds: string[];
    completedAt: string;
  };
  llmReverification?: {
    score: number;
    feedback: string;
    confidence: number;
    completedAt: string;
  };
  combinedScore?: number;
  needsAnotherIteration?: boolean;
  finalReason?: "threshold_met" | "max_iterations_reached" | "failed";
}

export interface LanguageSubTask {
  language: string;
  status: LanguageSubTaskStatus;
  currentIteration: number;
  maxIterations: number;
  confidenceThreshold: number;
  iterations: ReviewIteration[];
  translatedText?: string;
  createdAt: string;
  updatedAt: string;
  processingStartTime?: string;
  processingEndTime?: string;
  prolificBatchIds: string[]; // Can be in multiple batches
  webhooksPending: string[]; // Track which webhooks need delivery
}

export interface WebhookAttempt {
  eventType: string;
  url: string;
  attempt: number;
  status: "pending" | "success" | "failed" | "queued_for_retry";
  createdAt: string;
  lastAttemptAt?: string;
  qstashMessageId?: string; // If handed off to QStash
}

export interface ProlificStudyMapping {
  batchId: string;
  languages: string[];
  iterationNumbers: { [lang: string]: number };
  createdAt: string;
  studyStatus?: string;
}

export interface EnhancedTranslationTask {
  // Base task fields
  id: string;
  status: TaskStatus;
  mediaArticle: {
    text: string;
    title?: string;
    metadata?: Record<string, any>;
  };
  editorialGuidelines: Record<string, any>;
  destinationLanguages: string[];
  createdAt: string;
  updatedAt: string;
  progress?: number;
  guide?: string;
  useFullMarkdown?: boolean;
  error?: string;

  // Enhanced fields for webhook architecture
  maxReviewIterations: number;
  confidenceThreshold: number;
  languageSubTasks: {
    [language: string]: LanguageSubTask;
  };
  prolificStudyMappings: {
    [studyId: string]: ProlificStudyMapping;
  };
  webhookDeliveryLog: WebhookAttempt[];

  // Results and legacy compatibility
  result?: any;
  humanReviewBatches?: any[]; // Keep for legacy compatibility
}

// Webhook event types for the new architecture
export interface TaskWebhookEvent {
  event: string;
  taskId: string;
  subTaskId?: string;
  timestamp: number;
  data: any;
  _retryCount?: number;
}

// Specific webhook event types
export interface TaskCreatedEvent extends TaskWebhookEvent {
  event: "task.created";
  data: {
    destinationLanguages: string[];
    status: TaskStatus;
    maxReviewIterations: number;
    confidenceThreshold: number;
  };
}

export interface LanguageSubTaskCreatedEvent extends TaskWebhookEvent {
  event: "language_subtask.created";
  data: {
    language: string;
    status: LanguageSubTaskStatus;
    parentTaskId: string;
    currentIteration: number;
    maxIterations: number;
    iterations: ReviewIteration[];
  };
}

export interface TranslationStartedEvent extends TaskWebhookEvent {
  event: "subtask.translation.started";
  data: {
    language: string;
    status: LanguageSubTaskStatus;
    currentIteration: number;
  };
}

export interface TranslationCompletedEvent extends TaskWebhookEvent {
  event: "subtask.translation.completed";
  data: {
    language: string;
    status: LanguageSubTaskStatus;
    translatedText: string;
    translationTime: number; // milliseconds
    currentIteration: number;
  };
}

export interface LLMVerificationStartedEvent extends TaskWebhookEvent {
  event: "subtask.llm_verification.started";
  data: {
    language: string;
    status: LanguageSubTaskStatus;
    currentIteration: number;
    verificationType: "initial" | "post_human";
  };
}

export interface LLMVerificationCompletedEvent extends TaskWebhookEvent {
  event: "subtask.llm_verification.completed";
  data: {
    language: string;
    status: LanguageSubTaskStatus;
    verificationScore: number;
    issues: string[];
    currentIteration: number;
    needsHumanReview: boolean;
  };
}

export interface ReviewBatchCreatedEvent extends TaskWebhookEvent {
  event: "review_batch.created";
  data: {
    batchId: string;
    readyLanguages: string[];
    status: string;
    prolificStudyId?: string;
    iterationNumbers: { [lang: string]: number };
  };
}

export interface ProlificStudyCreatedEvent extends TaskWebhookEvent {
  event: "prolific_study.created";
  data: {
    batchId: string;
    prolificStudyId: string;
    languages: string[];
    status: string;
    iterationInfo: {
      [lang: string]: {
        iteration: number;
        previousScore: number;
      };
    };
  };
}

export interface ProlificStudyPublishedEvent extends TaskWebhookEvent {
  event: "prolific_study.published";
  data: {
    prolificStudyId: string;
    publicUrl: string;
    estimatedCompletionTime: string;
  };
}

export interface ProlificResultsReceivedEvent extends TaskWebhookEvent {
  event: "prolific_results.received";
  data: {
    prolificStudyId: string;
    completedLanguages: string[];
    reviewResults: {
      [lang: string]: {
        score: number;
        feedback: string;
        iteration: number;
      };
    };
  };
}

export interface LLMReverificationStartedEvent extends TaskWebhookEvent {
  event: "subtask.llm_reverification.started";
  data: {
    language: string;
    status: LanguageSubTaskStatus;
    currentIteration: number;
    humanReviewScore: number;
    verificationType: "post_human";
  };
}

export interface LLMReverificationCompletedEvent extends TaskWebhookEvent {
  event: "subtask.llm_reverification.completed";
  data: {
    language: string;
    status: LanguageSubTaskStatus;
    postHumanScore: number;
    currentIteration: number;
    combinedScore: number;
    needsAnotherIteration: boolean;
    maxIterationsReached: boolean;
  };
}

export interface IterationContinuingEvent extends TaskWebhookEvent {
  event: "subtask.iteration.continuing";
  data: {
    language: string;
    status: LanguageSubTaskStatus;
    currentIteration: number;
    iterationHistory: ReviewIteration[];
    needsAnotherIteration: boolean;
  };
}

export interface SubTaskFinalizedEvent extends TaskWebhookEvent {
  event: "subtask.finalized";
  data: {
    language: string;
    status: LanguageSubTaskStatus;
    finalScore: number;
    totalIterations: number;
    processingTime: number;
    completedAt: string;
    finalReason: "threshold_met" | "max_iterations_reached";
  };
}

export interface TaskCompletedEvent extends TaskWebhookEvent {
  event: "task.completed";
  data: {
    status: TaskStatus;
    completedLanguages: string[];
    totalProcessingTime: number;
    averageScore: number;
    iterationSummary: {
      [lang: string]: {
        iterations: number;
        finalScore: number;
        reason: string;
      };
    };
    completedAt: string;
  };
}