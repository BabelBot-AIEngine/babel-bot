import { DatabaseService, TranslationTask } from "../database/dbService";
import { TranslationService } from "./translationService";
import { ReviewService } from "./reviewService";
import {
  MediaArticle,
  EditorialGuidelines,
  TranslationResponse,
  GuideType,
} from "../types";

export class TaskService {
  private dbService: DatabaseService;
  private translationService: TranslationService;
  private reviewService: ReviewService;

  constructor() {
    this.dbService = new DatabaseService();
    this.translationService = new TranslationService();
    this.reviewService = new ReviewService();
  }

  async createTranslationTask(
    mediaArticle: MediaArticle,
    editorialGuidelines: EditorialGuidelines,
    destinationLanguages: string[],
    guide?: GuideType,
    useFullMarkdown?: boolean
  ): Promise<string> {
    const taskId = await this.dbService.createTask({
      status: "pending",
      mediaArticle,
      editorialGuidelines,
      destinationLanguages,
      progress: 0,
      guide,
      useFullMarkdown,
    });

    this.processTaskAsync(taskId);
    return taskId;
  }

  private async processTaskAsync(taskId: string): Promise<void> {
    try {
      const task = await this.dbService.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      await this.dbService.updateTask(taskId, {
        status: "translating",
        progress: 25,
      });

      await this.sleep(1000);

      const translations = await this.translationService.translateArticle(
        task.mediaArticle,
        task.editorialGuidelines,
        task.destinationLanguages,
        task.guide,
        task.useFullMarkdown
      );

      await this.dbService.updateTask(taskId, {
        status: "llm_verification",
        progress: 60,
      });

      await this.sleep(1500);

      const verifiedTranslations = await this.verifyTranslations(
        translations,
        task.editorialGuidelines
      );

      const result: TranslationResponse = {
        originalArticle: task.mediaArticle,
        translations: verifiedTranslations,
        processedAt: new Date().toISOString(),
      };

      const taskStatus = this.determineOverallTaskStatus(verifiedTranslations);
      const progress = taskStatus === "done" ? 100 : 80;

      await this.dbService.updateTask(taskId, {
        status: taskStatus,
        progress,
        result,
      });

      if (taskStatus === "human_review") {
        await this.sleep(2000);
        await this.processHumanReview(taskId, verifiedTranslations);
      }
    } catch (error) {
      console.error(`Error processing task ${taskId}:`, error);
      await this.dbService.updateTask(taskId, {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async verifyTranslations(
    translations: any[],
    guidelines: EditorialGuidelines
  ): Promise<any[]> {
    const verifiedTranslations = [];

    for (const translation of translations) {
      // Call reviewAgainstGuidelines for verification
      const reviewResult = await this.reviewService.reviewAgainstGuidelines(
        translation.translatedText,
        guidelines
      );

      const complianceScore = reviewResult.score;
      const status = complianceScore >= 70 ? "done" : "human_review";

      verifiedTranslations.push({
        ...translation,
        // Use the fresh review notes from verification
        reviewNotes: [
          ...reviewResult.notes,
          "LLM verification completed",
          status === "done" ? "Quality check passed" : "Needs human review",
        ],
        complianceScore,
        status,
      });
    }

    return verifiedTranslations;
  }

  private determineOverallTaskStatus(
    translations: any[]
  ): "done" | "human_review" {
    const hasHumanReview = translations.some(
      (t) => t.status === "human_review"
    );
    return hasHumanReview ? "human_review" : "done";
  }

  private async processHumanReview(
    taskId: string,
    translations: any[]
  ): Promise<void> {
    const updatedTranslations = translations.map((translation) => {
      if (translation.status === "human_review") {
        const approved = Math.random() > 0.3;
        return {
          ...translation,
          status: approved ? "done" : "failed",
          reviewNotes: [
            ...(translation.reviewNotes || []),
            approved ? "Human review approved" : "Human review rejected",
          ],
        };
      }
      return translation;
    });

    const task = await this.dbService.getTask(taskId);
    if (task?.result) {
      const finalStatus = this.determineOverallTaskStatus(updatedTranslations);

      await this.dbService.updateTask(taskId, {
        status: finalStatus,
        progress: 100,
        result: {
          ...task.result,
          translations: updatedTranslations,
        },
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getTask(taskId: string): Promise<TranslationTask | null> {
    return this.dbService.getTask(taskId);
  }

  async getAllTasks(): Promise<TranslationTask[]> {
    return this.dbService.getAllTasks();
  }

  async getTasksByStatus(
    status: TranslationTask["status"]
  ): Promise<TranslationTask[]> {
    return this.dbService.getTasksByStatus(status);
  }
}
