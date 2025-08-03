import { EnhancedDatabaseService } from "../database/enhancedDbService";
import { WebhookSender } from "./webhookSender";
import { TranslationService } from "./translationService";
import { ReviewService } from "./reviewService";
import { ProlificBatchManager } from "./prolificBatchManager";
import {
  EnhancedTranslationTask,
  TaskStatus,
  LanguageSubTaskStatus,
  ReviewIteration,
  TaskCreatedEvent,
  LanguageSubTaskCreatedEvent,
  TranslationStartedEvent,
  TranslationCompletedEvent,
  LLMVerificationStartedEvent,
  LLMVerificationCompletedEvent,
  SubTaskFinalizedEvent,
  TaskCompletedEvent,
} from "../types/enhanced-task";
import {
  MediaArticle,
  EditorialGuidelines,
  GuideType,
} from "../types";

export class EnhancedTaskService {
  private dbService: EnhancedDatabaseService;
  private translationService: TranslationService;
  private reviewService: ReviewService;
  private batchManager: ProlificBatchManager;
  private webhookUrl: string;
  private webhookSecret: string;

  constructor() {
    this.dbService = new EnhancedDatabaseService();
    this.translationService = new TranslationService();
    this.reviewService = new ReviewService();
    this.batchManager = new ProlificBatchManager();
    this.webhookUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/webhooks` 
      : `${process.env.BASE_URL || 'http://localhost:3000'}/api/webhooks`;
    this.webhookSecret = process.env.BABEL_WEBHOOK_SECRET!;

    if (!this.webhookSecret) {
      throw new Error("BABEL_WEBHOOK_SECRET environment variable is required");
    }
  }

  async createTranslationTask(
    mediaArticle: MediaArticle,
    editorialGuidelines: EditorialGuidelines,
    destinationLanguages: string[],
    guide?: GuideType,
    useFullMarkdown?: boolean,
    maxReviewIterations: number = 3,
    confidenceThreshold: number = 4.5
  ): Promise<string> {
    // Create the enhanced task
    const taskId = await this.dbService.createEnhancedTask({
      status: "pending",
      mediaArticle,
      editorialGuidelines,
      destinationLanguages,
      progress: 0,
      guide,
      useFullMarkdown,
      maxReviewIterations,
      confidenceThreshold,
    });

    console.log(`Created enhanced task ${taskId} with ${destinationLanguages.length} languages`);

    // Send task.created webhook to trigger processing
    const taskCreatedEvent: TaskCreatedEvent = {
      event: "task.created",
      taskId,
      timestamp: Date.now(),
      data: {
        destinationLanguages,
        status: "pending",
        maxReviewIterations,
        confidenceThreshold,
      },
    };

    await this.sendWebhook(taskCreatedEvent);
    return taskId;
  }

  // Webhook handlers for each stage of processing
  async handleTaskCreated(payload: TaskCreatedEvent): Promise<void> {
    console.log(`Handling task.created for ${payload.taskId}`);
    
    const task = await this.dbService.getEnhancedTask(payload.taskId);
    if (!task) {
      throw new Error(`Task ${payload.taskId} not found`);
    }

    // Update task status to processing
    await this.dbService.updateEnhancedTask(payload.taskId, {
      status: "processing",
      progress: 10,
    });

    // Create language sub-task webhooks for each destination language
    for (const language of payload.data.destinationLanguages) {
      const subTaskEvent: LanguageSubTaskCreatedEvent = {
        event: "language_subtask.created",
        taskId: payload.taskId,
        subTaskId: `${payload.taskId}_${language}`,
        timestamp: Date.now(),
        data: {
          language,
          status: "pending",
          parentTaskId: payload.taskId,
          currentIteration: 0,
          maxIterations: payload.data.maxReviewIterations,
          iterations: [],
        },
      };

      await this.sendWebhook(subTaskEvent);
    }
  }

  async handleLanguageSubTaskCreated(payload: LanguageSubTaskCreatedEvent): Promise<void> {
    console.log(`Handling language_subtask.created for ${payload.data.language} in task ${payload.taskId}`);
    
    // Start translation for this language
    const translationStartedEvent: TranslationStartedEvent = {
      event: "subtask.translation.started",
      taskId: payload.taskId,
      subTaskId: payload.subTaskId,
      timestamp: Date.now(),
      data: {
        language: payload.data.language,
        status: "translating",
        currentIteration: 1,
      },
    };

    // Update sub-task status
    await this.dbService.updateLanguageSubTask(payload.taskId, payload.data.language, {
      status: "translating",
      currentIteration: 1,
      processingStartTime: new Date().toISOString(),
    });

    await this.sendWebhook(translationStartedEvent);
  }

  async handleTranslationStarted(payload: TranslationStartedEvent): Promise<void> {
    console.log(`Handling subtask.translation.started for ${payload.data.language} in task ${payload.taskId}`);
    
    const task = await this.dbService.getEnhancedTask(payload.taskId);
    if (!task) {
      throw new Error(`Task ${payload.taskId} not found`);
    }

    const startTime = Date.now();

    try {
      // Perform the actual translation
      const [translations] = await this.translationService.translateArticle(
        task.mediaArticle,
        task.editorialGuidelines,
        [payload.data.language], // Single language
        task.guide as GuideType,
        task.useFullMarkdown
      );

      const translation = translations[0]; // Should only be one
      const translationTime = Date.now() - startTime;

      // Update sub-task with translation result
      await this.dbService.updateLanguageSubTask(payload.taskId, payload.data.language, {
        status: "translation_complete",
        translatedText: translation.translatedText,
      });

      // Send translation completed webhook
      const translationCompletedEvent: TranslationCompletedEvent = {
        event: "subtask.translation.completed",
        taskId: payload.taskId,
        subTaskId: payload.subTaskId,
        timestamp: Date.now(),
        data: {
          language: payload.data.language,
          status: "translation_complete",
          translatedText: translation.translatedText,
          translationTime,
          currentIteration: payload.data.currentIteration,
        },
      };

      await this.sendWebhook(translationCompletedEvent);
    } catch (error) {
      console.error(`Translation failed for ${payload.data.language} in task ${payload.taskId}:`, error);
      
      await this.dbService.updateLanguageSubTask(payload.taskId, payload.data.language, {
        status: "failed",
      });

      await this.handleLanguageSubTaskFailed(payload.taskId, payload.data.language, error);
    }
  }

  async handleTranslationCompleted(payload: TranslationCompletedEvent): Promise<void> {
    console.log(`Handling subtask.translation.completed for ${payload.data.language} in task ${payload.taskId}`);
    
    // Start LLM verification
    const verificationStartedEvent: LLMVerificationStartedEvent = {
      event: "subtask.llm_verification.started",
      taskId: payload.taskId,
      subTaskId: payload.subTaskId,
      timestamp: Date.now(),
      data: {
        language: payload.data.language,
        status: "llm_verifying",
        currentIteration: payload.data.currentIteration,
        verificationType: "initial",
      },
    };

    await this.dbService.updateLanguageSubTask(payload.taskId, payload.data.language, {
      status: "llm_verifying",
    });

    await this.sendWebhook(verificationStartedEvent);
  }

  async handleLLMVerificationStarted(payload: LLMVerificationStartedEvent): Promise<void> {
    console.log(`Handling subtask.llm_verification.started for ${payload.data.language} in task ${payload.taskId}`);
    
    const task = await this.dbService.getEnhancedTask(payload.taskId);
    if (!task) {
      throw new Error(`Task ${payload.taskId} not found`);
    }

    const subTask = task.languageSubTasks[payload.data.language];
    if (!subTask || !subTask.translatedText) {
      throw new Error(`No translation found for ${payload.data.language} in task ${payload.taskId}`);
    }

    try {
      // Perform LLM verification
      const reviewResult = await this.reviewService.reviewAgainstGuidelines(
        subTask.translatedText,
        task.editorialGuidelines,
        task.mediaArticle.text
      );

      const verificationScore = reviewResult.score / 20; // Convert to 5-point scale
      const needsHumanReview = verificationScore < task.confidenceThreshold;

      // Update sub-task status
      await this.dbService.updateLanguageSubTask(payload.taskId, payload.data.language, {
        status: "llm_verified",
      });

      // Send verification completed webhook
      const verificationCompletedEvent: LLMVerificationCompletedEvent = {
        event: "subtask.llm_verification.completed",
        taskId: payload.taskId,
        subTaskId: payload.subTaskId,
        timestamp: Date.now(),
        data: {
          language: payload.data.language,
          status: "llm_verified",
          verificationScore,
          issues: reviewResult.notes,
          currentIteration: payload.data.currentIteration,
          needsHumanReview,
        },
      };

      await this.sendWebhook(verificationCompletedEvent);
    } catch (error) {
      console.error(`LLM verification failed for ${payload.data.language} in task ${payload.taskId}:`, error);
      
      await this.dbService.updateLanguageSubTask(payload.taskId, payload.data.language, {
        status: "failed",
      });

      await this.handleLanguageSubTaskFailed(payload.taskId, payload.data.language, error);
    }
  }

  async handleLLMVerificationCompleted(payload: LLMVerificationCompletedEvent): Promise<void> {
    console.log(`Handling subtask.llm_verification.completed for ${payload.data.language} in task ${payload.taskId}`);
    
    const task = await this.dbService.getEnhancedTask(payload.taskId);
    if (!task) {
      throw new Error(`Task ${payload.taskId} not found`);
    }

    // Create the initial iteration record
    const iteration: ReviewIteration = {
      iterationNumber: payload.data.currentIteration,
      startedAt: new Date().toISOString(),
      llmVerification: {
        score: payload.data.verificationScore,
        feedback: payload.data.issues.join("; "),
        confidence: payload.data.verificationScore,
        completedAt: new Date().toISOString(),
      },
    };

    await this.dbService.addIterationToLanguageSubTask(
      payload.taskId,
      payload.data.language,
      iteration
    );

    if (payload.data.needsHumanReview) {
      // Mark as ready for human review
      await this.dbService.updateLanguageSubTask(payload.taskId, payload.data.language, {
        status: "review_ready",
      });

      console.log(`Language ${payload.data.language} marked as ready for human review`);
      
      // Trigger batch processing for ready language sub-tasks
      // This will be handled by a periodic process or immediate batching
      setTimeout(async () => {
        try {
          await this.batchManager.processReadyLanguageSubTasks();
        } catch (error) {
          console.error("Error processing ready language sub-tasks:", error);
        }
      }, 1000); // Small delay to allow other languages to become ready
    } else {
      // Score is sufficient, finalize this language
      await this.finalizeLanguageSubTask(
        payload.taskId,
        payload.data.language,
        payload.data.verificationScore,
        "threshold_met"
      );
    }
  }

  private async finalizeLanguageSubTask(
    taskId: string,
    language: string,
    finalScore: number,
    reason: "threshold_met" | "max_iterations_reached"
  ): Promise<void> {
    const task = await this.dbService.getEnhancedTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const subTask = task.languageSubTasks[language];
    const processingTime = subTask.processingStartTime 
      ? Date.now() - new Date(subTask.processingStartTime).getTime()
      : 0;

    // Update sub-task to finalized
    await this.dbService.updateLanguageSubTask(taskId, language, {
      status: "finalized",
      processingEndTime: new Date().toISOString(),
    });

    // Send finalization webhook
    const finalizedEvent: SubTaskFinalizedEvent = {
      event: "subtask.finalized",
      taskId,
      subTaskId: `${taskId}_${language}`,
      timestamp: Date.now(),
      data: {
        language,
        status: "finalized",
        finalScore,
        totalIterations: subTask.currentIteration,
        processingTime,
        completedAt: new Date().toISOString(),
        finalReason: reason,
      },
    };

    await this.sendWebhook(finalizedEvent);

    // Check if all languages are finalized
    await this.checkTaskCompletion(taskId);
  }

  private async checkTaskCompletion(taskId: string): Promise<void> {
    const task = await this.dbService.getEnhancedTask(taskId);
    if (!task) {
      return;
    }

    const allFinalized = Object.values(task.languageSubTasks)
      .every(subTask => subTask.status === "finalized" || subTask.status === "failed");

    if (allFinalized) {
      const completedLanguages = Object.keys(task.languageSubTasks)
        .filter(lang => task.languageSubTasks[lang].status === "finalized");

      const totalProcessingTime = Math.max(
        ...Object.values(task.languageSubTasks)
          .filter(subTask => subTask.processingStartTime && subTask.processingEndTime)
          .map(subTask => 
            new Date(subTask.processingEndTime!).getTime() - 
            new Date(subTask.processingStartTime!).getTime()
          )
      );

      const averageScore = completedLanguages.length > 0 
        ? completedLanguages.reduce((sum, lang) => {
            const iterations = task.languageSubTasks[lang].iterations;
            const lastIteration = iterations[iterations.length - 1];
            return sum + (lastIteration?.combinedScore || lastIteration?.llmVerification.score || 0);
          }, 0) / completedLanguages.length
        : 0;

      const iterationSummary = Object.fromEntries(
        completedLanguages.map(lang => {
          const subTask = task.languageSubTasks[lang];
          const lastIteration = subTask.iterations[subTask.iterations.length - 1];
          return [lang, {
            iterations: subTask.currentIteration,
            finalScore: lastIteration?.combinedScore || lastIteration?.llmVerification.score || 0,
            reason: lastIteration?.finalReason || "unknown",
          }];
        })
      );

      // Update main task status
      await this.dbService.updateEnhancedTask(taskId, {
        status: "completed",
        progress: 100,
      });

      // Send task completion webhook
      const completedEvent: TaskCompletedEvent = {
        event: "task.completed",
        taskId,
        timestamp: Date.now(),
        data: {
          status: "completed",
          completedLanguages,
          totalProcessingTime,
          averageScore,
          iterationSummary,
          completedAt: new Date().toISOString(),
        },
      };

      await this.sendWebhook(completedEvent);
      console.log(`Task ${taskId} completed with ${completedLanguages.length} languages`);
    }
  }

  private async handleLanguageSubTaskFailed(
    taskId: string,
    language: string,
    error: any
  ): Promise<void> {
    console.error(`Language sub-task ${language} failed for task ${taskId}:`, error);
    
    // Check if all languages have failed or completed
    await this.checkTaskCompletion(taskId);
  }

  private async sendWebhook(event: any): Promise<void> {
    try {
      await WebhookSender.sendBabelWebhook(
        this.webhookUrl,
        event,
        this.webhookSecret
      );
    } catch (error) {
      console.error(`Failed to send webhook for event ${event.event}:`, error);
      
      // Track webhook failure
      if (event.taskId) {
        await this.dbService.addWebhookAttempt(event.taskId, {
          eventType: event.event,
          url: this.webhookUrl,
          attempt: 1,
          status: "failed",
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  // Utility methods
  async getTask(taskId: string): Promise<EnhancedTranslationTask | null> {
    return this.dbService.getEnhancedTask(taskId);
  }

  async getAllTasks(): Promise<EnhancedTranslationTask[]> {
    return this.dbService.getAllEnhancedTasks();
  }

  async getTasksByStatus(status: TaskStatus): Promise<EnhancedTranslationTask[]> {
    return this.dbService.getTasksByStatus(status);
  }
}