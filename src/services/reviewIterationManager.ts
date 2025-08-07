import { EnhancedDatabaseService } from "../database/enhancedDbService";
import { ReviewService } from "./reviewService";
import { WebhookSender } from "./webhookSender";
import {
  ReviewIteration,
  LLMReverificationStartedEvent,
  LLMReverificationCompletedEvent,
  IterationContinuingEvent,
} from "../types/enhanced-task";

export class ReviewIterationManager {
  private dbService: EnhancedDatabaseService;
  private reviewService: ReviewService;
  private webhookUrl: string;
  private webhookSecret: string;

  constructor() {
    this.dbService = new EnhancedDatabaseService();
    this.reviewService = new ReviewService();
    this.webhookUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/webhooks` 
      : `${process.env.BASE_URL || 'http://localhost:3000'}/api/webhooks`;
    this.webhookSecret = process.env.BABEL_WEBHOOK_SECRET!;
  }

  /**
   * Process human review results and trigger LLM re-verification
   */
  async processHumanReviewResults(
    taskId: string,
    language: string,
    humanReviewScore: number,
    humanReviewFeedback: string,
    prolificStudyId: string
  ): Promise<void> {
    console.log(`Processing human review results for ${language} in task ${taskId}`);

    const task = await this.dbService.getEnhancedTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const subTask = task.languageSubTasks[language];
    if (!subTask) {
      throw new Error(`Language sub-task ${language} not found for task ${taskId}`);
    }

    // Update the current iteration with human review results
    const currentIteration = subTask.iterations[subTask.iterations.length - 1];
    if (!currentIteration) {
      throw new Error(`No current iteration found for ${language} in task ${taskId}`);
    }

    currentIteration.humanReview = {
      prolificStudyId,
      score: humanReviewScore,
      feedback: humanReviewFeedback,
      reviewerIds: [], // Would be populated from Prolific data
      completedAt: new Date().toISOString(),
    };

    // Update sub-task status
    await this.dbService.updateLanguageSubTask(taskId, language, {
      status: "review_complete",
      iterations: subTask.iterations,
    });

    // Trigger LLM re-verification
    const reverificationStartedEvent: LLMReverificationStartedEvent = {
      event: "subtask.llm_reverification.started",
      taskId,
      subTaskId: `${taskId}_${language}`,
      timestamp: Date.now(),
      data: {
        language,
        status: "llm_reverifying",
        currentIteration: subTask.currentIteration,
        humanReviewScore,
        verificationType: "post_human",
      },
    };

    await this.sendWebhook(reverificationStartedEvent);
  }

  /**
   * Handle LLM re-verification after human review
   */
  async handleLLMReverification(
    taskId: string,
    language: string,
    humanReviewScore: number
  ): Promise<void> {
    console.log(`Handling LLM re-verification for ${language} in task ${taskId}`);

    const task = await this.dbService.getEnhancedTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const subTask = task.languageSubTasks[language];
    if (!subTask || !subTask.translatedText) {
      throw new Error(`Language sub-task or translation not found for ${language} in task ${taskId}`);
    }

    const currentIteration = subTask.iterations[subTask.iterations.length - 1];
    if (!currentIteration || !currentIteration.humanReview) {
      throw new Error(`Current iteration or human review not found for ${language} in task ${taskId}`);
    }

    try {
      // Update sub-task status
      await this.dbService.updateLanguageSubTask(taskId, language, {
        status: "llm_reverifying",
      });

      // Perform LLM re-verification considering human feedback
      const contextWithHumanFeedback = `
        Original translation: ${subTask.translatedText}
        Human reviewer feedback: ${currentIteration.humanReview.feedback}
        Human reviewer score: ${currentIteration.humanReview.score}/5
        Previous LLM concerns: ${currentIteration.llmVerification.feedback}
      `;

      const reviewResult = await this.reviewService.reviewAgainstGuidelines(
        subTask.translatedText,
        task.editorialGuidelines,
        contextWithHumanFeedback
      );

      const postHumanLlmScore = reviewResult.score / 20; // Convert to 5-point scale
      const combinedScore = (humanReviewScore + postHumanLlmScore) / 2;

      // Update the current iteration with LLM re-verification results
      currentIteration.llmReverification = {
        score: postHumanLlmScore,
        feedback: reviewResult.notes.join("; "),
        confidence: postHumanLlmScore,
        completedAt: new Date().toISOString(),
      };

      currentIteration.combinedScore = combinedScore;
      currentIteration.completedAt = new Date().toISOString();

      // Determine if another iteration is needed
      const needsAnotherIteration = combinedScore < task.confidenceThreshold && 
                                    subTask.currentIteration < subTask.maxIterations;
      
      currentIteration.needsAnotherIteration = needsAnotherIteration;

      if (!needsAnotherIteration) {
        currentIteration.finalReason = combinedScore >= task.confidenceThreshold 
          ? "threshold_met" 
          : "max_iterations_reached";
      }

      // Update sub-task status
      await this.dbService.updateLanguageSubTask(taskId, language, {
        status: "iteration_complete",
        iterations: subTask.iterations,
      });

      // Send LLM re-verification completed webhook
      const reverificationCompletedEvent: LLMReverificationCompletedEvent = {
        event: "subtask.llm_reverification.completed",
        taskId,
        subTaskId: `${taskId}_${language}`,
        timestamp: Date.now(),
        data: {
          language,
          status: "iteration_complete",
          postHumanScore: postHumanLlmScore,
          currentIteration: subTask.currentIteration,
          combinedScore,
          needsAnotherIteration,
          maxIterationsReached: subTask.currentIteration >= subTask.maxIterations,
        },
      };

      await this.sendWebhook(reverificationCompletedEvent);
    } catch (error) {
      console.error(`LLM re-verification failed for ${language} in task ${taskId}:`, error);
      
      await this.dbService.updateLanguageSubTask(taskId, language, {
        status: "failed",
      });

      throw error;
    }
  }

  /**
   * Handle iteration decision - continue or finalize
   */
  async handleIterationDecision(
    taskId: string,
    language: string,
    needsAnotherIteration: boolean,
    combinedScore: number
  ): Promise<void> {
    console.log(`Handling iteration decision for ${language} in task ${taskId}: ${needsAnotherIteration ? 'continue' : 'finalize'}`);

    const task = await this.dbService.getEnhancedTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const subTask = task.languageSubTasks[language];
    if (!subTask) {
      throw new Error(`Language sub-task ${language} not found for task ${taskId}`);
    }

    if (needsAnotherIteration) {
      // Continue to next iteration
      const nextIteration = subTask.currentIteration + 1;
      
      // Create new iteration
      const newIteration: ReviewIteration = {
        iterationNumber: nextIteration,
        startedAt: new Date().toISOString(),
        llmVerification: {
          score: 0, // Will be updated when verification starts
          feedback: "",
          confidence: 0,
          completedAt: "",
        },
      };

      // Update sub-task for next iteration
      await this.dbService.updateLanguageSubTask(taskId, language, {
        status: "review_ready", // Back to review queue
        currentIteration: nextIteration,
      });

      // Add the new iteration
      await this.dbService.addIterationToLanguageSubTask(taskId, language, newIteration);

      // Send iteration continuing webhook
      const iterationContinuingEvent: IterationContinuingEvent = {
        event: "subtask.iteration.continuing",
        taskId,
        subTaskId: `${taskId}_${language}`,
        timestamp: Date.now(),
        data: {
          language,
          status: "review_ready",
          currentIteration: nextIteration,
          iterationHistory: subTask.iterations,
          needsAnotherIteration: true,
        },
      };

      await this.sendWebhook(iterationContinuingEvent);

      console.log(`Language ${language} continuing to iteration ${nextIteration}`);
    } else {
      // Finalize this language sub-task
      const finalReason = combinedScore >= task.confidenceThreshold 
        ? "threshold_met" 
        : "max_iterations_reached";

      await this.finalizeLanguageSubTask(taskId, language, combinedScore, finalReason);
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

    console.log(`Language ${language} finalized with score ${finalScore} (${reason})`);

    // The webhook will be sent by the calling service
  }

  /**
   * Get iteration summary for a language sub-task
   */
  async getIterationSummary(taskId: string, language: string): Promise<{
    totalIterations: number;
    currentIteration: number;
    scores: Array<{
      iteration: number;
      llmScore: number;
      humanScore?: number;
      combinedScore?: number;
      status: string;
    }>;
    finalScore?: number;
    finalReason?: string;
  }> {
    const task = await this.dbService.getEnhancedTask(taskId);
    if (!task || !task.languageSubTasks[language]) {
      throw new Error(`Language sub-task ${language} not found for task ${taskId}`);
    }

    const subTask = task.languageSubTasks[language];
    const scores = subTask.iterations.map(iteration => ({
      iteration: iteration.iterationNumber,
      llmScore: iteration.llmVerification.score,
      humanScore: iteration.humanReview?.score,
      combinedScore: iteration.combinedScore,
      status: iteration.completedAt ? 'completed' : 'in_progress',
    }));

    const lastIteration = subTask.iterations[subTask.iterations.length - 1];

    return {
      totalIterations: subTask.maxIterations,
      currentIteration: subTask.currentIteration,
      scores,
      finalScore: lastIteration?.combinedScore || lastIteration?.llmVerification.score,
      finalReason: lastIteration?.finalReason,
    };
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
    }
  }
}