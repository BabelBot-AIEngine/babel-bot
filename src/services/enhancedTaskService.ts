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
import { MediaArticle, EditorialGuidelines, GuideType } from "../types";

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
      : `${process.env.BASE_URL || "http://localhost:3000"}/api/webhooks`;
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
    console.log(`[ENHANCED-TASK] 🎬 Creating enhanced translation task`);
    console.log(
      `[ENHANCED-TASK] Languages: ${destinationLanguages.join(", ")}`
    );
    console.log(`[ENHANCED-TASK] Guide: ${guide || "none"}`);
    console.log(`[ENHANCED-TASK] Max iterations: ${maxReviewIterations}`);
    console.log(`[ENHANCED-TASK] Confidence threshold: ${confidenceThreshold}`);

    // Create the enhanced task
    console.log(`[ENHANCED-TASK] 💾 Storing task in database`);
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

    console.log(
      `[ENHANCED-TASK] ✅ Created enhanced task ${taskId} with ${destinationLanguages.length} languages`
    );
    console.log(
      `[ENHANCED-TASK] Webhook URL configured as: ${this.webhookUrl}`
    );

    // Brief delay to ensure database transaction is fully committed
    console.log(
      `[ENHANCED-TASK] ⏳ Waiting 100ms to ensure task is committed to database`
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

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

    console.log(`[ENHANCED-TASK] 📡 Sending initial task.created webhook`);
    await this.sendWebhook(taskCreatedEvent);
    console.log(
      `[ENHANCED-TASK] 🎉 Task creation complete, returning taskId: ${taskId}`
    );
    return taskId;
  }

  // Webhook handlers for each stage of processing
  async handleTaskCreated(payload: TaskCreatedEvent): Promise<void> {
    try {
      console.log(
        `[ENHANCED-TASK] 🚀 Handling task.created for ${payload.taskId}`
      );
      console.log(`[ENHANCED-TASK] Payload:`, JSON.stringify(payload, null, 2));

      console.log(`[ENHANCED-TASK] 🧪 About to start database lookup`);
      console.log(
        `[ENHANCED-TASK] 🔌 Database service available:`,
        !!this.dbService
      );
      console.log(
        `[ENHANCED-TASK] 🔍 Looking up task ${payload.taskId} in database`
      );

      // Retry logic for potential race condition with task creation
      let task = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (!task && attempts < maxAttempts) {
        attempts++;
        console.log(
          `[ENHANCED-TASK] 🔄 Database lookup attempt ${attempts}/${maxAttempts}`
        );

        task = await this.dbService.getEnhancedTask(payload.taskId, true); // Enable verbose logging for webhook debugging

        if (!task && attempts < maxAttempts) {
          console.log(
            `[ENHANCED-TASK] ⏳ Task not found, waiting 1 second before retry`
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!task) {
        console.error(
          `[ENHANCED-TASK] ❌ Task ${payload.taskId} not found in database after ${maxAttempts} attempts`
        );
        throw new Error(`Task ${payload.taskId} not found`);
      }
      console.log(
        `[ENHANCED-TASK] ✅ Found task ${payload.taskId}, current status: ${task.status} (found on attempt ${attempts})`
      );

      // Update task status to processing
      console.log(
        `[ENHANCED-TASK] 📝 Updating task ${payload.taskId} to status: processing`
      );
      await this.dbService.updateEnhancedTask(payload.taskId, {
        status: "processing",
        progress: 10,
      });
      console.log(
        `[ENHANCED-TASK] ✅ Updated task ${payload.taskId} status to processing`
      );

      console.log(
        `[ENHANCED-TASK] 🌍 Creating language sub-tasks for ${
          payload.data.destinationLanguages.length
        } languages: ${payload.data.destinationLanguages.join(", ")}`
      );

      // Create language sub-task webhooks for each destination language
      for (const language of payload.data.destinationLanguages) {
        console.log(
          `[ENHANCED-TASK] 📤 Creating language sub-task webhook for ${language}`
        );
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

        console.log(
          `[ENHANCED-TASK] 🌐 Sending language_subtask.created webhook for ${language}`
        );
        await this.sendWebhook(subTaskEvent);
        console.log(
          `[ENHANCED-TASK] ✅ Sent language_subtask.created webhook for ${language}`
        );
      }

      console.log(
        `[ENHANCED-TASK] 🎉 Completed task.created handling for ${payload.taskId}`
      );
    } catch (error) {
      console.error(
        `[ENHANCED-TASK] ❌ CRITICAL ERROR in handleTaskCreated for ${payload.taskId}:`,
        error
      );
      console.error(
        `[ENHANCED-TASK] Error stack:`,
        error instanceof Error ? error.stack : "No stack trace"
      );
      console.error(`[ENHANCED-TASK] Error details:`, error);
      throw error; // Re-throw to maintain error handling behavior
    }
  }

  async handleLanguageSubTaskCreated(
    payload: LanguageSubTaskCreatedEvent
  ): Promise<void> {
    console.log(
      `[ENHANCED-TASK] 🌍 Handling language_subtask.created for ${payload.data.language} in task ${payload.taskId}`
    );
    console.log(
      `[ENHANCED-TASK] SubTask payload:`,
      JSON.stringify(payload, null, 2)
    );

    // Start translation for this language
    console.log(
      `[ENHANCED-TASK] 🔄 Starting translation process for ${payload.data.language}`
    );
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
    console.log(
      `[ENHANCED-TASK] 📝 Updating sub-task ${payload.data.language} to translating status`
    );
    await this.dbService.updateLanguageSubTask(
      payload.taskId,
      payload.data.language,
      {
        status: "translating",
        currentIteration: 1,
        processingStartTime: new Date().toISOString(),
      }
    );
    console.log(
      `[ENHANCED-TASK] ✅ Updated sub-task ${payload.data.language} status to translating`
    );

    console.log(
      `[ENHANCED-TASK] 🌐 Sending subtask.translation.started webhook for ${payload.data.language}`
    );
    await this.sendWebhook(translationStartedEvent);
    console.log(
      `[ENHANCED-TASK] ✅ Sent subtask.translation.started webhook for ${payload.data.language}`
    );
  }

  async handleTranslationStarted(
    payload: TranslationStartedEvent
  ): Promise<void> {
    console.log(
      `Handling subtask.translation.started for ${payload.data.language} in task ${payload.taskId}`
    );

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
      await this.dbService.updateLanguageSubTask(
        payload.taskId,
        payload.data.language,
        {
          status: "translation_complete",
          translatedText: translation.translatedText,
        }
      );

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
      console.error(
        `Translation failed for ${payload.data.language} in task ${payload.taskId}:`,
        error
      );

      await this.dbService.updateLanguageSubTask(
        payload.taskId,
        payload.data.language,
        {
          status: "failed",
        }
      );

      await this.handleLanguageSubTaskFailed(
        payload.taskId,
        payload.data.language,
        error
      );
    }
  }

  async handleTranslationCompleted(
    payload: TranslationCompletedEvent
  ): Promise<void> {
    console.log(
      `Handling subtask.translation.completed for ${payload.data.language} in task ${payload.taskId}`
    );

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

    await this.dbService.updateLanguageSubTask(
      payload.taskId,
      payload.data.language,
      {
        status: "llm_verifying",
      }
    );

    await this.sendWebhook(verificationStartedEvent);
  }

  async handleLLMVerificationStarted(
    payload: LLMVerificationStartedEvent
  ): Promise<void> {
    console.log(
      `Handling subtask.llm_verification.started for ${payload.data.language} in task ${payload.taskId}`
    );

    const task = await this.dbService.getEnhancedTask(payload.taskId);
    if (!task) {
      throw new Error(`Task ${payload.taskId} not found`);
    }

    const subTask = task.languageSubTasks[payload.data.language];
    if (!subTask || !subTask.translatedText) {
      throw new Error(
        `No translation found for ${payload.data.language} in task ${payload.taskId}`
      );
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
      await this.dbService.updateLanguageSubTask(
        payload.taskId,
        payload.data.language,
        {
          status: "llm_verified",
        }
      );

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
      console.error(
        `LLM verification failed for ${payload.data.language} in task ${payload.taskId}:`,
        error
      );

      await this.dbService.updateLanguageSubTask(
        payload.taskId,
        payload.data.language,
        {
          status: "failed",
        }
      );

      await this.handleLanguageSubTaskFailed(
        payload.taskId,
        payload.data.language,
        error
      );
    }
  }

  async handleLLMVerificationCompleted(
    payload: LLMVerificationCompletedEvent
  ): Promise<void> {
    console.log(
      `Handling subtask.llm_verification.completed for ${payload.data.language} in task ${payload.taskId}`
    );

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
      await this.dbService.updateLanguageSubTask(
        payload.taskId,
        payload.data.language,
        {
          status: "review_ready",
        }
      );

      console.log(
        `Language ${payload.data.language} marked as ready for human review`
      );

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

    const allFinalized = Object.values(task.languageSubTasks).every(
      (subTask) => subTask.status === "finalized" || subTask.status === "failed"
    );

    if (allFinalized) {
      const completedLanguages = Object.keys(task.languageSubTasks).filter(
        (lang) => task.languageSubTasks[lang].status === "finalized"
      );

      const totalProcessingTime = Math.max(
        ...Object.values(task.languageSubTasks)
          .filter(
            (subTask) =>
              subTask.processingStartTime && subTask.processingEndTime
          )
          .map(
            (subTask) =>
              new Date(subTask.processingEndTime!).getTime() -
              new Date(subTask.processingStartTime!).getTime()
          )
      );

      const averageScore =
        completedLanguages.length > 0
          ? completedLanguages.reduce((sum, lang) => {
              const iterations = task.languageSubTasks[lang].iterations;
              const lastIteration = iterations[iterations.length - 1];
              return (
                sum +
                (lastIteration?.combinedScore ||
                  lastIteration?.llmVerification.score ||
                  0)
              );
            }, 0) / completedLanguages.length
          : 0;

      const iterationSummary = Object.fromEntries(
        completedLanguages.map((lang) => {
          const subTask = task.languageSubTasks[lang];
          const lastIteration =
            subTask.iterations[subTask.iterations.length - 1];
          return [
            lang,
            {
              iterations: subTask.currentIteration,
              finalScore:
                lastIteration?.combinedScore ||
                lastIteration?.llmVerification.score ||
                0,
              reason: lastIteration?.finalReason || "unknown",
            },
          ];
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
      console.log(
        `Task ${taskId} completed with ${completedLanguages.length} languages`
      );
    }
  }

  private async handleLanguageSubTaskFailed(
    taskId: string,
    language: string,
    error: any
  ): Promise<void> {
    console.error(
      `Language sub-task ${language} failed for task ${taskId}:`,
      error
    );

    // Check if all languages have failed or completed
    await this.checkTaskCompletion(taskId);
  }

  private async sendWebhook(event: any): Promise<void> {
    console.log(
      `[ENHANCED-WEBHOOK] 📡 Preparing webhook: ${event.event} for task ${event.taskId}`
    );
    console.log(
      `[ENHANCED-WEBHOOK] Event payload:`,
      JSON.stringify(event, null, 2)
    );

    try {
      const startTime = Date.now();
      const dynamicPath = this.mapEventToStatePath(event.event, event.taskId);
      const destinationUrl = dynamicPath
        ? this.buildAbsoluteUrl(dynamicPath)
        : this.webhookUrl;

      console.log(`[ENHANCED-WEBHOOK] ➡️ Sending webhook to ${destinationUrl}`);

      await WebhookSender.sendBabelWebhook(
        destinationUrl,
        event,
        this.webhookSecret
      );
      const duration = Date.now() - startTime;
      console.log(
        `[ENHANCED-WEBHOOK] ✅ Successfully sent webhook ${event.event} (${duration}ms)`
      );

      // Track webhook success
      if (event.taskId) {
        await this.dbService.addWebhookAttempt(event.taskId, {
          eventType: event.event,
          url: destinationUrl,
          attempt: 1,
          status: "success",
          createdAt: new Date().toISOString(),
          lastAttemptAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Check if this is a QStash quota issue
      if (
        errorMessage.includes("quota") ||
        errorMessage.includes("maxRetries exceeded")
      ) {
        console.warn(
          `[ENHANCED-WEBHOOK] ⚠️ QStash quota exhausted for ${event.event}:${event.taskId}. ` +
            "Webhook delivery skipped but processing continues."
        );

        // Track as failed but with specific quota exhaustion context
        if (event.taskId) {
          await this.dbService.addWebhookAttempt(event.taskId, {
            eventType: event.event,
            url: this.webhookUrl,
            attempt: 1,
            status: "failed",
            createdAt: new Date().toISOString(),
            lastAttemptAt: new Date().toISOString(),
          });
        }

        // Don't throw - allow processing to continue
        return;
      }

      console.error(
        `[ENHANCED-WEBHOOK] ❌ Failed to send webhook for event ${event.event}:`,
        error
      );
      console.error(`[ENHANCED-WEBHOOK] Webhook URL: ${this.webhookUrl}`);
      console.error(`[ENHANCED-WEBHOOK] Error details:`, error);

      // Track webhook failure
      if (event.taskId) {
        await this.dbService.addWebhookAttempt(event.taskId, {
          eventType: event.event,
          url: this.webhookUrl,
          attempt: 1,
          status: "failed",
          createdAt: new Date().toISOString(),
          lastAttemptAt: new Date().toISOString(),
        });
      }

      // For non-quota errors, still throw to maintain error visibility
      // but consider if we want to be more permissive here
      throw error;
    }
  }

  private buildAbsoluteUrl(path: string): string {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `${process.env.BASE_URL || "http://localhost:3000"}`;
    return `${base}${path}`;
  }

  private mapEventToStatePath(
    eventType: string,
    taskId: string
  ): string | null {
    const enc = encodeURIComponent;
    switch (eventType) {
      // translate state
      case "task.created":
      case "language_subtask.created":
      case "subtask.translation.started":
        return `/api/webhook/translate/${enc(taskId)}`;
      // verify state
      case "subtask.translation.completed":
      case "subtask.llm_verification.started":
        return `/api/webhook/verify/${enc(taskId)}`;
      case "subtask.llm_verification.completed":
        // Decision to finalize vs review is taken in forwarder, but we still route via verify state hop
        return `/api/webhook/verify/${enc(taskId)}`;
      // review state
      case "review_batch.created":
      case "prolific_study.created":
      case "prolific_study.published":
      case "prolific_results.received":
      case "subtask.iteration.continuing":
      case "task.human_review.started":
      case "task.human_review.completed":
        return `/api/webhook/review/${enc(taskId)}`;
      // re-verify (post-human) still treated as verify hop
      case "subtask.llm_reverification.started":
      case "subtask.llm_reverification.completed":
        return `/api/webhook/verify/${enc(taskId)}`;
      // finalize
      case "subtask.finalized":
      case "task.completed":
        return `/api/webhook/finalize/${enc(taskId)}`;
      default:
        return null;
    }
  }

  // Utility methods
  async getTask(taskId: string): Promise<EnhancedTranslationTask | null> {
    return this.dbService.getEnhancedTask(taskId);
  }

  async getAllTasks(): Promise<EnhancedTranslationTask[]> {
    return this.dbService.getAllEnhancedTasks();
  }

  async getTasksByStatus(
    status: TaskStatus
  ): Promise<EnhancedTranslationTask[]> {
    return this.dbService.getTasksByStatus(status);
  }
}
