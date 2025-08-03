import { EnhancedDatabaseService } from "../database/enhancedDbService";
import { ProlificService } from "./prolificService";
import { HumanReviewConfigService } from "./humanReviewConfig";
import { CsvGeneratorService } from "./csvGenerator";
import { StudyEstimationService } from "./studyEstimationService";
import { WebhookSender } from "./webhookSender";
import {
  LanguageSubTaskStatus,
  ReviewBatchCreatedEvent,
  ProlificStudyCreatedEvent,
  ProlificStudyPublishedEvent,
} from "../types/enhanced-task";
import { CreateStudyRequest, CreateBatchInstructionsRequest } from "../types/prolific";

export interface ReviewBatch {
  batchId: string;
  taskIds: string[];
  languages: string[];
  iterationNumbers: { [taskId_language: string]: number };
  status: "created" | "study_created" | "published" | "completed";
  prolificStudyId?: string;
  createdAt: string;
  estimatedCompletionTime?: string;
}

export class ProlificBatchManager {
  private dbService: EnhancedDatabaseService;
  private prolificService: ProlificService;
  private webhookUrl: string;
  private webhookSecret: string;

  constructor() {
    this.dbService = new EnhancedDatabaseService();
    this.prolificService = new ProlificService();
    this.webhookUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/webhooks` 
      : `${process.env.BASE_URL || 'http://localhost:3000'}/api/webhooks`;
    this.webhookSecret = process.env.BABEL_WEBHOOK_SECRET!;
  }

  /**
   * Check for language sub-tasks that are ready for human review and batch them
   */
  async processReadyLanguageSubTasks(): Promise<void> {
    console.log("Checking for language sub-tasks ready for human review...");

    const readySubTasks = await this.dbService.getLanguageSubTasksByStatus("review_ready");
    
    if (readySubTasks.length === 0) {
      console.log("No language sub-tasks ready for review batching");
      return;
    }

    console.log(`Found ${readySubTasks.length} language sub-tasks ready for review`);

    // Group by similar characteristics for batching
    const batches = this.groupSubTasksIntoBatches(readySubTasks);

    for (const batch of batches) {
      await this.createReviewBatch(batch);
    }
  }

  private groupSubTasksIntoBatches(
    subTasks: Array<{taskId: string, language: string, subTask: any}>
  ): Array<{taskIds: string[], languages: string[], iterationNumbers: {[key: string]: number}}> {
    // For now, we'll create one batch per unique task to maintain isolation
    // In the future, we could batch across tasks with similar characteristics
    const taskGroups = new Map<string, Array<{taskId: string, language: string, subTask: any}>>();
    
    for (const subTask of subTasks) {
      if (!taskGroups.has(subTask.taskId)) {
        taskGroups.set(subTask.taskId, []);
      }
      taskGroups.get(subTask.taskId)!.push(subTask);
    }

    const batches: Array<{taskIds: string[], languages: string[], iterationNumbers: {[key: string]: number}}> = [];
    
    for (const [taskId, taskSubTasks] of taskGroups) {
      const languages = taskSubTasks.map(st => st.language);
      const iterationNumbers: {[key: string]: number} = {};
      
      for (const subTask of taskSubTasks) {
        iterationNumbers[`${subTask.taskId}_${subTask.language}`] = subTask.subTask.currentIteration;
      }

      batches.push({
        taskIds: [taskId],
        languages,
        iterationNumbers,
      });
    }

    return batches;
  }

  private async createReviewBatch(
    batchInfo: {taskIds: string[], languages: string[], iterationNumbers: {[key: string]: number}}
  ): Promise<ReviewBatch> {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const batch: ReviewBatch = {
      batchId,
      taskIds: batchInfo.taskIds,
      languages: batchInfo.languages,
      iterationNumbers: batchInfo.iterationNumbers,
      status: "created",
      createdAt: now,
    };

    console.log(`Creating review batch ${batchId} for ${batchInfo.languages.length} languages`);

    // Update language sub-tasks to review_queued
    for (const taskId of batchInfo.taskIds) {
      for (const language of batchInfo.languages) {
        await this.dbService.updateLanguageSubTask(taskId, language, {
          status: "review_queued",
          prolificBatchIds: [batchId], // Add to existing batch IDs
        });
      }
    }

    // Store batch information (in a real implementation, this would go to Redis)
    // For now, we'll store it as metadata on the first task
    const firstTaskId = batchInfo.taskIds[0];
    const task = await this.dbService.getEnhancedTask(firstTaskId);
    if (task) {
      const batchMetadata = { ...task.result?.batchMetadata || {}, [batchId]: batch };
      await this.dbService.updateEnhancedTask(firstTaskId, {
        result: { ...task.result, batchMetadata },
      });
    }

    // Send review batch created webhook
    const batchCreatedEvent: ReviewBatchCreatedEvent = {
      event: "review_batch.created",
      taskId: firstTaskId, // Primary task for webhook
      timestamp: Date.now(),
      data: {
        batchId,
        readyLanguages: batchInfo.languages,
        status: "created",
        iterationNumbers: batchInfo.iterationNumbers,
      },
    };

    await this.sendWebhook(batchCreatedEvent);
    return batch;
  }

  async handleReviewBatchCreated(batchId: string, taskId: string): Promise<void> {
    console.log(`Handling review batch created: ${batchId} for task ${taskId}`);

    try {
      const task = await this.dbService.getEnhancedTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      const batch = task.result?.batchMetadata?.[batchId] as ReviewBatch;
      if (!batch) {
        throw new Error(`Batch ${batchId} not found in task metadata`);
      }

      // Create Prolific study for this batch
      const studyId = await this.createProlificStudyForBatch(task, batch);
      
      // Update batch status
      batch.status = "study_created";
      batch.prolificStudyId = studyId;

      // Update task metadata
      const batchMetadata = { ...task.result?.batchMetadata, [batchId]: batch };
      await this.dbService.updateEnhancedTask(taskId, {
        result: { ...task.result, batchMetadata },
      });

      // Add Prolific study mapping
      await this.dbService.addProlificStudyMapping(taskId, studyId, {
        batchId,
        languages: batch.languages,
        iterationNumbers: batch.iterationNumbers,
        createdAt: new Date().toISOString(),
      });

      // Send study created webhook
      const studyCreatedEvent: ProlificStudyCreatedEvent = {
        event: "prolific_study.created",
        taskId,
        timestamp: Date.now(),
        data: {
          batchId,
          prolificStudyId: studyId,
          languages: batch.languages,
          status: "study_created",
          iterationInfo: Object.fromEntries(
            batch.languages.map(lang => [
              lang,
              {
                iteration: batch.iterationNumbers[`${taskId}_${lang}`] || 1,
                previousScore: this.getPreviousScore(task, lang),
              },
            ])
          ),
        },
      };

      await this.sendWebhook(studyCreatedEvent);
    } catch (error) {
      console.error(`Error handling review batch created ${batchId}:`, error);
      throw error;
    }
  }

  private async createProlificStudyForBatch(task: any, batch: ReviewBatch): Promise<string> {
    const config = await HumanReviewConfigService.getConfig();
    const workspaceId = config.workspaceId;

    console.log(`Creating Prolific study for batch ${batch.batchId} in workspace ${workspaceId}`);

    // Create project for this batch
    const projectTitle = `Translation Review Batch ${batch.batchId}`;
    const project = await this.prolificService.ensureProjectExists(workspaceId, projectTitle);

    // Generate CSV data for all languages in the batch
    const csvRows: any[] = [];
    for (const language of batch.languages) {
      const subTask = task.languageSubTasks[language];
      if (subTask && subTask.translatedText) {
        // Create a translation result object for CSV generation
        const translationResult = {
          language,
          translatedText: subTask.translatedText,
          reviewNotes: subTask.iterations.length > 0 
            ? subTask.iterations[subTask.iterations.length - 1].llmVerification.feedback
            : [],
          complianceScore: subTask.iterations.length > 0
            ? subTask.iterations[subTask.iterations.length - 1].llmVerification.score * 20 // Convert back to 100-point scale
            : 0,
          status: "human_review",
        };

        const csvData = CsvGeneratorService.generateHumanReviewCsv(
          task.id,
          task.mediaArticle,
          task.editorialGuidelines,
          translationResult
        );

        csvRows.push(...csvData);
      }
    }

    // Create batch name and dataset name
    const batchName = `Review_Batch_${batch.batchId}`;
    const datasetName = `Dataset_${batch.batchId}`;

    // Create data collection
    const dataCollection = await this.prolificService.createDataCollection(
      csvRows,
      workspaceId,
      batchName,
      datasetName,
      {
        task_name: config.taskDetails.taskName,
        task_introduction: `${config.taskDetails.taskIntroduction} (Batch: ${batch.batchId})`,
        task_steps: config.taskDetails.taskSteps,
      }
    );

    // Create batch instructions
    const instructionsData: CreateBatchInstructionsRequest = {
      instructions: [
        {
          type: "free_text",
          description: "Please review each translation and provide detailed feedback on its quality and compliance with the editorial guidelines.",
        },
        {
          type: "multiple_choice",
          description: "Rate the overall translation quality (1=Poor, 5=Excellent):",
          options: [
            { label: "1 - Poor", value: "1" },
            { label: "2 - Fair", value: "2" },
            { label: "3 - Good", value: "3" },
            { label: "4 - Very Good", value: "4" },
            { label: "5 - Excellent", value: "5" },
          ],
          answer_limit: 1,
        },
      ],
    };

    await this.prolificService.createBatchInstructions(dataCollection.id, instructionsData);

    // Setup batch and wait for it to be ready
    await this.prolificService.setupAndWaitForBatch(dataCollection.id, dataCollection.dataset_id);

    // Calculate study parameters based on batch size and complexity
    const avgWordsPerLanguage = batch.languages.reduce((sum, lang) => {
      const subTask = task.languageSubTasks[lang];
      return sum + (subTask?.translatedText?.split(' ').length || 0);
    }, 0) / batch.languages.length;

    const studyEstimate = StudyEstimationService.estimateStudyParameters(
      task.mediaArticle,
      task.editorialGuidelines,
      { language: "multi", translatedText: `${avgWordsPerLanguage} avg words per ${batch.languages.length} languages` },
      task.guide
    );

    // Adjust estimates for multiple languages
    const adjustedEstimate = {
      ...studyEstimate,
      estimatedCompletionTimeMinutes: Math.ceil(studyEstimate.estimatedCompletionTimeMinutes * batch.languages.length * 0.8), // 80% efficiency for batching
      rewardPence: Math.ceil(studyEstimate.rewardPence * batch.languages.length * 0.9), // 90% rate for batch work
      maxAllowedTimeMinutes: Math.ceil(studyEstimate.maxAllowedTimeMinutes * batch.languages.length),
    };

    console.log(`Batch study estimation:`, {
      languages: batch.languages.length,
      estimatedTime: adjustedEstimate.estimatedCompletionTimeMinutes,
      reward: adjustedEstimate.rewardPence,
      maxTime: adjustedEstimate.maxAllowedTimeMinutes,
    });

    // Get study filters for all languages in the batch
    const studyFilters = await this.prolificService.getStudyFilters(batch.languages);

    // Create study
    const studyData: CreateStudyRequest = {
      internal_name: `batch-review-${batch.batchId}`,
      name: `Translation Review Batch: ${batch.languages.join(', ')}`,
      description: `Review translation quality for ${batch.languages.length} languages in batch ${batch.batchId}`,
      data_collection_method: "DC_TOOL",
      data_collection_id: dataCollection.id,
      total_available_places: 1, // Single reviewer for consistency
      reward: adjustedEstimate.rewardPence,
      device_compatibility: ["desktop", "mobile", "tablet"],
      estimated_completion_time: adjustedEstimate.estimatedCompletionTimeMinutes,
      maximum_allowed_time: adjustedEstimate.maxAllowedTimeMinutes,
      study_type: "SINGLE",
      publish_at: null,
      completion_codes: [
        {
          code: "BATCH_REVIEW_COMPLETE",
          code_type: "COMPLETED",
          actions: [{ action: "MANUALLY_REVIEW" }],
        },
      ],
      project: project.id,
      ...(studyFilters.length > 0 && {
        filters: studyFilters,
      }),
    };

    const study = await this.prolificService.createStudy(studyData);
    console.log(`Created Prolific study ${study.id} for batch ${batch.batchId}`);

    return study.id;
  }

  async handleProlificStudyCreated(studyId: string, taskId: string): Promise<void> {
    console.log(`Handling Prolific study created: ${studyId} for task ${taskId}`);

    try {
      // Publish the study
      console.log(`Publishing study ${studyId}...`);
      await this.prolificService.publishStudy(studyId);
      console.log(`Study ${studyId} published successfully`);

      // Update study status in task metadata
      const task = await this.dbService.getEnhancedTask(taskId);
      if (task && task.prolificStudyMappings[studyId]) {
        task.prolificStudyMappings[studyId].studyStatus = "published";
        await this.dbService.updateEnhancedTask(taskId, {
          prolificStudyMappings: task.prolificStudyMappings,
        });
      }

      // Send study published webhook
      const studyPublishedEvent: ProlificStudyPublishedEvent = {
        event: "prolific_study.published",
        taskId,
        timestamp: Date.now(),
        data: {
          prolificStudyId: studyId,
          publicUrl: `https://app.prolific.co/studies/${studyId}`,
          estimatedCompletionTime: "2-24 hours",
        },
      };

      await this.sendWebhook(studyPublishedEvent);
    } catch (error) {
      console.error(`Error handling Prolific study created ${studyId}:`, error);
      throw error;
    }
  }

  private getPreviousScore(task: any, language: string): number {
    const subTask = task.languageSubTasks[language];
    if (!subTask || subTask.iterations.length === 0) {
      return 0;
    }
    
    const lastIteration = subTask.iterations[subTask.iterations.length - 1];
    return lastIteration.combinedScore || lastIteration.llmVerification.score || 0;
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