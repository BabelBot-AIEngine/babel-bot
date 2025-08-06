import { BabelWebhookPayload } from "../types/webhooks";
import { EnhancedTaskService } from "./enhancedTaskService";
import { ProlificBatchManager } from "./prolificBatchManager";
import { ReviewIterationManager } from "./reviewIterationManager";
import {
  TaskCreatedEvent,
  LanguageSubTaskCreatedEvent,
  TranslationStartedEvent,
  TranslationCompletedEvent,
  LLMVerificationStartedEvent,
  LLMVerificationCompletedEvent,
  ReviewBatchCreatedEvent,
  ProlificStudyCreatedEvent,
  ProlificStudyPublishedEvent,
  ProlificResultsReceivedEvent,
  LLMReverificationStartedEvent,
  LLMReverificationCompletedEvent,
  IterationContinuingEvent,
  SubTaskFinalizedEvent,
  TaskCompletedEvent,
} from "../types/enhanced-task";

export class BabelWebhookHandler {
  private static enhancedTaskService = new EnhancedTaskService();
  private static batchManager = new ProlificBatchManager();
  private static iterationManager = new ReviewIterationManager();

  static async handleWebhook(payload: BabelWebhookPayload): Promise<void> {
    console.log(
      `[WEBHOOK-HANDLER] 📨 Received Babel webhook: ${payload.event}`
    );
    console.log("[WEBHOOK-HANDLER] Webhook details:", {
      event: payload.event,
      taskId: payload.taskId,
      timestamp: payload.timestamp,
      retryCount: payload._retryCount || 0,
    });
    console.log(
      "[WEBHOOK-HANDLER] Full payload:",
      JSON.stringify(payload, null, 2)
    );

    try {
      console.log(`[WEBHOOK-HANDLER] 🔄 Processing event: ${payload.event}`);
      switch (payload.event) {
        // New webhook-driven architecture events
        case "task.created":
          console.log(`[WEBHOOK-HANDLER] ➡️ Routing to handleTaskCreated`);
          await this.enhancedTaskService.handleTaskCreated(
            payload as TaskCreatedEvent
          );
          console.log(`[WEBHOOK-HANDLER] ✅ Completed handleTaskCreated`);
          break;
        case "language_subtask.created":
          console.log(
            `[WEBHOOK-HANDLER] ➡️ Routing to handleLanguageSubTaskCreated`
          );
          await this.enhancedTaskService.handleLanguageSubTaskCreated(
            payload as LanguageSubTaskCreatedEvent
          );
          console.log(
            `[WEBHOOK-HANDLER] ✅ Completed handleLanguageSubTaskCreated`
          );
          break;
        case "subtask.translation.started":
          console.log(
            `[WEBHOOK-HANDLER] ➡️ Routing to handleTranslationStarted`
          );
          await this.enhancedTaskService.handleTranslationStarted(
            payload as TranslationStartedEvent
          );
          console.log(
            `[WEBHOOK-HANDLER] ✅ Completed handleTranslationStarted`
          );
          break;
        case "subtask.translation.completed":
          await this.enhancedTaskService.handleTranslationCompleted(
            payload as TranslationCompletedEvent
          );
          break;
        case "subtask.llm_verification.started":
          await this.enhancedTaskService.handleLLMVerificationStarted(
            payload as LLMVerificationStartedEvent
          );
          break;
        case "subtask.llm_verification.completed":
          await this.enhancedTaskService.handleLLMVerificationCompleted(
            payload as LLMVerificationCompletedEvent
          );
          break;
        case "review_batch.created":
          await this.handleReviewBatchCreated(
            payload as ReviewBatchCreatedEvent
          );
          break;
        case "prolific_study.created":
          await this.handleProlificStudyCreated(
            payload as ProlificStudyCreatedEvent
          );
          break;
        case "prolific_study.published":
          await this.handleProlificStudyPublished(
            payload as ProlificStudyPublishedEvent
          );
          break;
        case "prolific_results.received":
          await this.handleProlificResultsReceived(
            payload as ProlificResultsReceivedEvent
          );
          break;
        case "subtask.llm_reverification.started":
          await this.handleLLMReverificationStarted(
            payload as LLMReverificationStartedEvent
          );
          break;
        case "subtask.llm_reverification.completed":
          await this.handleLLMReverificationCompleted(
            payload as LLMReverificationCompletedEvent
          );
          break;
        case "subtask.iteration.continuing":
          await this.handleIterationContinuing(
            payload as IterationContinuingEvent
          );
          break;
        case "subtask.finalized":
          await this.handleSubTaskFinalized(payload as SubTaskFinalizedEvent);
          break;
        case "task.completed":
          await this.handleTaskCompleted(payload as TaskCompletedEvent);
          break;

        // Legacy events (maintained for backward compatibility)
        case "task.translation.completed":
          await this.handleTranslationCompleted(payload);
          break;
        case "task.verification.completed":
          await this.handleVerificationCompleted(payload);
          break;
        case "task.human_review.started":
          await this.handleHumanReviewStarted(payload);
          break;
        case "task.human_review.completed":
          await this.handleHumanReviewCompleted(payload);
          break;
        case "task.status.changed":
          await this.handleStatusChanged(payload);
          break;
        case "task.failed":
          await this.handleTaskFailed(payload);
          break;
        default:
          console.warn(
            `[WEBHOOK-HANDLER] ⚠️ Unhandled Babel webhook event: ${payload.event}`
          );
          console.warn(
            `[WEBHOOK-HANDLER] Unknown event payload:`,
            JSON.stringify(payload, null, 2)
          );
      }
      console.log(
        `[WEBHOOK-HANDLER] 🎉 Successfully processed webhook: ${payload.event}`
      );
    } catch (error) {
      console.error(
        `[WEBHOOK-HANDLER] ❌ Error handling webhook event ${payload.event}:`,
        error
      );
      console.error(
        `[WEBHOOK-HANDLER] Failed payload:`,
        JSON.stringify(payload, null, 2)
      );
      console.error(
        `[WEBHOOK-HANDLER] Error stack:`,
        error instanceof Error ? error.stack : "No stack trace"
      );
      throw error;
    }
  }

  // New webhook-driven architecture handlers
  private static async handleReviewBatchCreated(
    payload: ReviewBatchCreatedEvent
  ): Promise<void> {
    console.log(
      `Review batch created for task ${payload.taskId}:`,
      payload.data
    );
    await this.batchManager.handleReviewBatchCreated(
      payload.data.batchId,
      payload.taskId
    );
  }

  private static async handleProlificStudyCreated(
    payload: ProlificStudyCreatedEvent
  ): Promise<void> {
    console.log(
      `Prolific study created for task ${payload.taskId}:`,
      payload.data
    );
    await this.batchManager.handleProlificStudyCreated(
      payload.data.prolificStudyId,
      payload.taskId
    );
  }

  private static async handleProlificStudyPublished(
    payload: ProlificStudyPublishedEvent
  ): Promise<void> {
    console.log(
      `Prolific study published for task ${payload.taskId}:`,
      payload.data
    );
    // TODO: Monitor study progress
  }

  private static async handleProlificResultsReceived(
    payload: ProlificResultsReceivedEvent
  ): Promise<void> {
    console.log(
      `Prolific results received for task ${payload.taskId}:`,
      payload.data
    );
    // TODO: Process human review results and trigger LLM re-verification
  }

  private static async handleLLMReverificationStarted(
    payload: LLMReverificationStartedEvent
  ): Promise<void> {
    console.log(
      `LLM re-verification started for task ${payload.taskId}:`,
      payload.data
    );
    await this.iterationManager.handleLLMReverification(
      payload.taskId,
      payload.data.language,
      payload.data.humanReviewScore
    );
  }

  private static async handleLLMReverificationCompleted(
    payload: LLMReverificationCompletedEvent
  ): Promise<void> {
    console.log(
      `LLM re-verification completed for task ${payload.taskId}:`,
      payload.data
    );
    await this.iterationManager.handleIterationDecision(
      payload.taskId,
      payload.data.language,
      payload.data.needsAnotherIteration,
      payload.data.combinedScore
    );
  }

  private static async handleIterationContinuing(
    payload: IterationContinuingEvent
  ): Promise<void> {
    console.log(
      `Iteration continuing for task ${payload.taskId}:`,
      payload.data
    );
    // Language sub-task has been marked as review_ready again
    // The batch manager will pick it up in the next processing cycle
  }

  private static async handleSubTaskFinalized(
    payload: SubTaskFinalizedEvent
  ): Promise<void> {
    console.log(
      `Sub-task finalized for task ${payload.taskId}:`,
      payload.data.language
    );
    // TODO: Update final results and check overall task completion
  }

  private static async handleTaskCompleted(
    payload: TaskCompletedEvent
  ): Promise<void> {
    console.log(`Task completed: ${payload.taskId}:`, payload.data);
    // TODO: Finalize task and notify systems
  }

  // Legacy handlers (maintained for backward compatibility)
  private static async handleTranslationCompleted(
    payload: BabelWebhookPayload
  ): Promise<void> {
    console.log(
      `[LEGACY] Translation completed for task ${payload.taskId} - triggering verification`
    );

    // TODO: Implement logic to:
    // 1. Update task status to 'llm_verification'
    // 2. Trigger LLM verification process
    // 3. Send next webhook when verification is complete
  }

  private static async handleVerificationCompleted(
    payload: BabelWebhookPayload
  ): Promise<void> {
    console.log(
      `[LEGACY] Verification completed for task ${payload.taskId} - checking if human review needed`
    );

    // TODO: Implement logic to:
    // 1. Check verification results and confidence scores
    // 2. Decide if human review is needed
    // 3. Either mark as 'done' or trigger human review
    // 4. Send appropriate status update webhook
  }

  private static async handleHumanReviewStarted(
    payload: BabelWebhookPayload
  ): Promise<void> {
    console.log(`[LEGACY] Human review started for task ${payload.taskId}`);

    // TODO: Implement logic to:
    // 1. Update task status to 'human_review'
    // 2. Create Prolific study if needed
    // 3. Monitor study progress
  }

  private static async handleHumanReviewCompleted(
    payload: BabelWebhookPayload
  ): Promise<void> {
    console.log(`[LEGACY] Human review completed for task ${payload.taskId}`);

    // TODO: Implement logic to:
    // 1. Process human review results
    // 2. Update translation with review feedback
    // 3. Mark task as 'done'
    // 4. Send completion webhook
  }

  private static async handleStatusChanged(
    payload: BabelWebhookPayload
  ): Promise<void> {
    console.log(
      `[LEGACY] Status changed for task ${payload.taskId}:`,
      payload.data
    );

    // TODO: Implement logic to:
    // 1. Update internal task status
    // 2. Notify relevant systems
    // 3. Trigger next workflow step if needed
  }

  private static async handleTaskFailed(
    payload: BabelWebhookPayload
  ): Promise<void> {
    console.log(`[LEGACY] Task ${payload.taskId} failed:`, payload.data);

    // TODO: Implement logic to:
    // 1. Update task status to 'failed'
    // 2. Log error details
    // 3. Notify relevant systems or users
    // 4. Trigger retry logic if appropriate
  }

  static validatePayload(payload: any): payload is BabelWebhookPayload {
    if (!payload || typeof payload !== "object") {
      return false;
    }

    if (!payload.event || typeof payload.event !== "string") {
      return false;
    }

    if (!payload.taskId || typeof payload.taskId !== "string") {
      return false;
    }

    if (!payload.timestamp || typeof payload.timestamp !== "number") {
      return false;
    }

    if (payload.data === undefined) {
      return false;
    }

    return true;
  }
}
