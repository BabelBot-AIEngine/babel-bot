import { DatabaseService, TranslationTask } from "../database/dbService";
import { TranslationService } from "./translationService";
import { ProlificService } from "./prolificService";
import { HumanReviewConfigService } from "./humanReviewConfig";
import { CsvGeneratorService } from "./csvGenerator";
import { ReviewService } from "./reviewService";
import { StudyEstimationService } from "./studyEstimationService";
import {
  MediaArticle,
  EditorialGuidelines,
  TranslationResponse,
  GuideType,
  TranslationResult,
  HumanReviewBatch,
} from "../types";
import {
  CreateStudyRequest,
  CreateBatchInstructionsRequest,
} from "../types/prolific";

export class TaskService {
  private dbService: DatabaseService;
  private translationService: TranslationService;
  private prolificService: ProlificService;
  private reviewService: ReviewService;

  constructor() {
    this.dbService = new DatabaseService();
    this.translationService = new TranslationService();
    this.prolificService = new ProlificService();
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

      const [translations, contextText] =
        await this.translationService.translateArticle(
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
        task.editorialGuidelines,
        contextText
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
    guidelines: EditorialGuidelines,
    contextText: string
  ): Promise<any[]> {
    const verifiedTranslations = [];

    for (const translation of translations) {
      // Call reviewAgainstGuidelines for verification
      const reviewResult = await this.reviewService.reviewAgainstGuidelines(
        translation.translatedText,
        guidelines,
        contextText
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
    translations: TranslationResult[]
  ): Promise<void> {
    const isDemoMode = process.env.DEMO_MODE === "true";

    if (isDemoMode) {
      await this.processDemoHumanReview(taskId, translations);
      return;
    }

    try {
      const task = await this.dbService.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      const config = await HumanReviewConfigService.getConfig();

      // Use the predefined workspace ID from environment variable
      const workspaceId = config.workspaceId;
      console.log(`Using workspace ID: ${workspaceId}`);

      // Create a project for this specific task
      const projectTitle = `Translation Task ${taskId}`;
      const project = await this.prolificService.ensureProjectExists(
        workspaceId,
        projectTitle
      );
      const humanReviewBatches: HumanReviewBatch[] = [];
      const updatedTranslations: TranslationResult[] = [];

      for (const translation of translations) {
        if (translation.status === "human_review") {
          console.log(
            `Creating Prolific batch for translation: ${translation.language}`
          );

          const csvData = CsvGeneratorService.generateHumanReviewCsv(
            taskId,
            task.mediaArticle,
            task.editorialGuidelines,
            translation
          );

          const batchName = CsvGeneratorService.generateBatchName(
            taskId,
            translation.language
          );
          const datasetName = CsvGeneratorService.generateDatasetName(
            taskId,
            translation.language
          );

          const batch = await this.prolificService.createDataCollection(
            csvData,
            config.workspaceId,
            batchName,
            datasetName,
            {
              task_name: config.taskDetails.taskName,
              task_introduction: config.taskDetails.taskIntroduction,
              task_steps: config.taskDetails.taskSteps,
            }
          );

          const instructionsData: CreateBatchInstructionsRequest = {
            instructions: [
              {
                type: "free_text",
                description:
                  "Please review the translation and provide feedback on its quality and compliance with the editorial guidelines.",
              },
              {
                type: "multiple_choice",
                description: "Rate the overall translation quality:",
                options: [
                  { label: "Excellent", value: "excellent" },
                  { label: "Good", value: "good" },
                  { label: "Fair", value: "fair" },
                  { label: "Poor", value: "poor" },
                ],
                answer_limit: 1,
              },
            ],
          };

          await this.prolificService.createBatchInstructions(
            batch.id,
            instructionsData
          );

          // Setup batch and wait for it to be ready before creating study
          await this.prolificService.setupAndWaitForBatch(batch.id, batch.dataset_id);

          console.log(`Creating study in workspace: ${config.workspaceId}`);

          // Calculate dynamic study parameters
          const studyEstimate = StudyEstimationService.estimateStudyParameters(
            task.mediaArticle,
            task.editorialGuidelines,
            translation,
            task.guide
          );

          console.log(`Study estimation for ${translation.language}:`, {
            estimatedTime: studyEstimate.estimatedCompletionTimeMinutes,
            reward: studyEstimate.rewardPence,
            maxTime: studyEstimate.maxAllowedTimeMinutes,
            reasoning: studyEstimate.reasoning,
          });

          // Get comprehensive study filters (participant groups + language fluency)
          const studyFilters = await this.prolificService.getStudyFilters([translation.language]);
          if (studyFilters.length > 0) {
            console.log(
              `Using study filters: ${studyFilters.map(f => {
                if (f.selected_values) {
                  return `${f.filter_id}=[${f.selected_values.join(', ')}]`;
                } else if (f.selected_range) {
                  return `${f.filter_id}=[${f.selected_range.lower}-${f.selected_range.upper}]`;
                } else {
                  return `${f.filter_id}=[unknown format]`;
                }
              }).join('; ')}`
            );
          }

          const studyData: CreateStudyRequest = {
            internal_name: `human-review-${taskId}-${translation.language}`,
            name: `Translation Review: ${translation.language}`,
            description:
              "Review translation quality and compliance with editorial guidelines",
            data_collection_method: "DC_TOOL",
            data_collection_id: batch.id,
            total_available_places: 1,
            reward: studyEstimate.rewardPence,
            device_compatibility: ["desktop", "mobile", "tablet"],
            estimated_completion_time:
              studyEstimate.estimatedCompletionTimeMinutes,
            maximum_allowed_time: studyEstimate.maxAllowedTimeMinutes,
            study_type: "SINGLE",
            publish_at: null,
            completion_codes: [
              {
                code: "REVIEW_COMPLETE",
                code_type: "COMPLETED",
                actions: [{ action: "MANUALLY_REVIEW" }],
              },
            ],
            project: project.id,
            ...(studyFilters.length > 0 && {
              filters: studyFilters,
            }),
          };

          console.log(
            "Study data being sent:",
            JSON.stringify(studyData, null, 2)
          );

          const study = await this.prolificService.createStudy(studyData);

          humanReviewBatches.push({
            language: translation.language,
            batchId: batch.id,
            studyId: study.id,
            datasetId: batch.dataset_id,
            projectId: project.id,
            createdAt: new Date().toISOString(),
          });

          updatedTranslations.push({
            ...translation,
            batchId: batch.id,
            studyId: study.id,
            reviewNotes: [
              ...(translation.reviewNotes || []),
              "Submitted for human review via Prolific",
            ],
          });

          console.log(
            `Created batch ${batch.id} and study ${study.id} for ${translation.language}`
          );
        } else {
          updatedTranslations.push(translation);
        }
      }

      await this.dbService.updateTask(taskId, {
        humanReviewBatches,
        result: {
          ...task.result,
          translations: updatedTranslations,
        },
      });

      console.log(
        `Human review setup complete for task ${taskId}. Created ${humanReviewBatches.length} batches.`
      );
    } catch (error) {
      console.error(`Error setting up human review for task ${taskId}:`, error);

      await this.dbService.updateTask(taskId, {
        status: "failed",
        error: `Human review setup failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }

  private async processDemoHumanReview(
    taskId: string,
    translations: TranslationResult[]
  ): Promise<void> {
    const updatedTranslations = translations.map((translation) => {
      if (translation.status === "human_review") {
        const approved = Math.random() > 0.3;
        return {
          ...translation,
          status: approved ? "done" : "failed",
          reviewNotes: [
            ...(translation.reviewNotes || []),
            approved
              ? "Human review approved (demo)"
              : "Human review rejected (demo)",
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

  async getTasksByBatchId(batchId: string): Promise<TranslationTask[]> {
    return this.dbService.getTasksByBatchId(batchId);
  }

  async getTasksByStudyId(studyId: string): Promise<TranslationTask[]> {
    return this.dbService.getTasksByStudyId(studyId);
  }

  async updateHumanReviewStatus(
    taskId: string,
    language: string,
    newStatus: "done" | "failed",
    reviewNotes?: string[]
  ): Promise<void> {
    const task = await this.dbService.getTask(taskId);
    if (!task?.result?.translations) {
      throw new Error(`Task ${taskId} or translations not found`);
    }

    const updatedTranslations = task.result.translations.map(
      (translation: TranslationResult) => {
        if (translation.language === language) {
          return {
            ...translation,
            status: newStatus,
            reviewNotes: reviewNotes || [
              ...(translation.reviewNotes || []),
              `Human review ${newStatus}`,
            ],
          };
        }
        return translation;
      }
    );

    const finalStatus = this.determineOverallTaskStatus(updatedTranslations);
    const progress = finalStatus === "done" ? 100 : task.progress;

    await this.dbService.updateTask(taskId, {
      status: finalStatus,
      progress,
      result: {
        ...task.result,
        translations: updatedTranslations,
      },
    });
  }

  async deleteAllTasks(): Promise<number> {
    const allTasks = await this.dbService.getAllTasks();
    let deletedCount = 0;

    for (const task of allTasks) {
      try {
        await this.dbService.deleteTask(task.id);
        deletedCount++;
      } catch (error) {
        console.error(`Error deleting task ${task.id}:`, error);
      }
    }

    return deletedCount;
  }
}
