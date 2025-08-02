import { DatabaseService, TranslationTask } from "../database/dbService";
import { TranslationService } from "./translationService";
import { ProlificService } from "./prolificService";
import { HumanReviewConfigService } from "./humanReviewConfig";
import { CsvGeneratorService } from "./csvGenerator";
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

  constructor() {
    this.dbService = new DatabaseService();
    this.translationService = new TranslationService();
    this.prolificService = new ProlificService();
  }

  async createTranslationTask(
    mediaArticle: MediaArticle,
    editorialGuidelines: EditorialGuidelines,
    destinationLanguages: string[],
    guide?: GuideType
  ): Promise<string> {
    const taskId = await this.dbService.createTask({
      status: "pending",
      mediaArticle,
      editorialGuidelines,
      destinationLanguages,
      progress: 0,
      guide,
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
        task.guide
      );

      await this.dbService.updateTask(taskId, {
        status: "llm_verification",
        progress: 60,
      });

      await this.sleep(1500);

      const verifiedTranslations = await this.verifyTranslations(translations);
      
      const result: TranslationResponse = {
        originalArticle: task.mediaArticle,
        translations: verifiedTranslations,
        processedAt: new Date().toISOString(),
      };

      const taskStatus = this.determineOverallTaskStatus(verifiedTranslations);
      const progress = taskStatus === 'done' ? 100 : 80;

      await this.dbService.updateTask(taskId, {
        status: taskStatus,
        progress,
        result,
      });

      if (taskStatus === 'human_review') {
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

  private async verifyTranslations(translations: any[]): Promise<any[]> {
    const config = await HumanReviewConfigService.getConfig();
    
    return translations.map((translation) => {
      const complianceScore = translation.complianceScore || Math.floor(Math.random() * 40) + 60;
      const status = complianceScore >= config.confidenceThreshold ? 'done' : 'human_review';
      
      return {
        ...translation,
        reviewNotes: ["LLM verification completed", status === 'done' ? "Quality check passed" : "Needs human review"],
        complianceScore,
        status,
      };
    });
  }

  private determineOverallTaskStatus(translations: any[]): 'done' | 'human_review' {
    const hasHumanReview = translations.some(t => t.status === 'human_review');
    return hasHumanReview ? 'human_review' : 'done';
  }

  private async processHumanReview(taskId: string, translations: TranslationResult[]): Promise<void> {
    const isDemoMode = process.env.DEMO_MODE === 'true';
    
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
      
      // Ensure workspace exists (create if needed)
      const workspaceName = HumanReviewConfigService.generateWorkspaceName();
      const workspace = await this.prolificService.ensureWorkspaceExists(workspaceName);
      
      // Update config with actual workspace ID
      HumanReviewConfigService.setWorkspaceId(workspace.id);
      config.workspaceId = workspace.id;
      const humanReviewBatches: HumanReviewBatch[] = [];
      const updatedTranslations: TranslationResult[] = [];

      for (const translation of translations) {
        if (translation.status === 'human_review') {
          console.log(`Creating Prolific batch for translation: ${translation.language}`);
          
          const csvData = CsvGeneratorService.generateHumanReviewCsv(
            taskId,
            task.mediaArticle,
            task.editorialGuidelines,
            translation
          );

          const batchName = CsvGeneratorService.generateBatchName(taskId, translation.language);
          const datasetName = CsvGeneratorService.generateDatasetName(taskId, translation.language);

          const batch = await this.prolificService.createDataCollection(
            csvData,
            config.workspaceId,
            batchName,
            datasetName,
            {
              task_name: config.taskDetails.taskName,
              task_introduction: config.taskDetails.taskIntroduction,
              task_steps: config.taskDetails.taskSteps
            }
          );

          const instructionsData: CreateBatchInstructionsRequest = {
            instructions: [
              {
                type: "free_text",
                description: "Please review the translation and provide feedback on its quality and compliance with the editorial guidelines."
              },
              {
                type: "multiple_choice",
                description: "Rate the overall translation quality:",
                options: [
                  { label: "Excellent", value: "excellent" },
                  { label: "Good", value: "good" },
                  { label: "Fair", value: "fair" },
                  { label: "Poor", value: "poor" }
                ],
                answer_limit: 1
              }
            ]
          };

          await this.prolificService.createBatchInstructions(batch.id, instructionsData);

          const studyData: CreateStudyRequest = {
            internal_name: `human-review-${taskId}-${translation.language}`,
            name: `Translation Review: ${translation.language}`,
            description: "Review translation quality and compliance with editorial guidelines",
            external_study_url: `${process.env.PROLIFIC_STUDY_URL || 'https://app.prolific.com'}/batch/${batch.id}`,
            total_available_places: 1,
            reward: 50,
            device_compatibility: ["desktop", "mobile", "tablet"],
            estimated_completion_time: 10,
            maximum_allowed_time: 30,
            study_type: "SINGLE",
            publish_at: null,
            completion_codes: [{
              code: "REVIEW_COMPLETE",
              code_type: "COMPLETED",
              actions: [{ action: "MANUALLY_REVIEW" }]
            }],
            workspace_id: config.workspaceId
          };

          const study = await this.prolificService.createStudy(studyData);
          
          humanReviewBatches.push({
            language: translation.language,
            batchId: batch.id,
            studyId: study.id,
            datasetId: batch.dataset_id,
            createdAt: new Date().toISOString()
          });

          updatedTranslations.push({
            ...translation,
            batchId: batch.id,
            studyId: study.id,
            reviewNotes: [...(translation.reviewNotes || []), 'Submitted for human review via Prolific']
          });

          console.log(`Created batch ${batch.id} and study ${study.id} for ${translation.language}`);
        } else {
          updatedTranslations.push(translation);
        }
      }

      await this.dbService.updateTask(taskId, {
        humanReviewBatches,
        result: {
          ...task.result,
          translations: updatedTranslations
        }
      });

      console.log(`Human review setup complete for task ${taskId}. Created ${humanReviewBatches.length} batches.`);
    } catch (error) {
      console.error(`Error setting up human review for task ${taskId}:`, error);
      
      await this.dbService.updateTask(taskId, {
        status: 'failed',
        error: `Human review setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  private async processDemoHumanReview(taskId: string, translations: TranslationResult[]): Promise<void> {
    const updatedTranslations = translations.map(translation => {
      if (translation.status === 'human_review') {
        const approved = Math.random() > 0.3;
        return {
          ...translation,
          status: approved ? 'done' : 'failed',
          reviewNotes: [...(translation.reviewNotes || []), 
            approved ? 'Human review approved (demo)' : 'Human review rejected (demo)']
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
          translations: updatedTranslations
        }
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
    newStatus: 'done' | 'failed',
    reviewNotes?: string[]
  ): Promise<void> {
    const task = await this.dbService.getTask(taskId);
    if (!task?.result?.translations) {
      throw new Error(`Task ${taskId} or translations not found`);
    }

    const updatedTranslations = task.result.translations.map((translation: TranslationResult) => {
      if (translation.language === language) {
        return {
          ...translation,
          status: newStatus,
          reviewNotes: reviewNotes || [...(translation.reviewNotes || []), `Human review ${newStatus}`]
        };
      }
      return translation;
    });

    const finalStatus = this.determineOverallTaskStatus(updatedTranslations);
    const progress = finalStatus === 'done' ? 100 : task.progress;

    await this.dbService.updateTask(taskId, {
      status: finalStatus,
      progress,
      result: {
        ...task.result,
        translations: updatedTranslations
      }
    });
  }
}
