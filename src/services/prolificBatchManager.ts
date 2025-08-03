import { EnhancedDatabaseService } from "../database/enhancedDbService";
import { ProlificService } from "./prolificService";
import { HumanReviewConfigService } from "./humanReviewConfig";
import { CsvGeneratorService } from "./csvGenerator";
import { StudyEstimationService } from "./studyEstimationService";
import { WebhookSender } from "./webhookSender";
import { TranslationResult, LanguageTaskStatus, GuideType } from "../types";
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
    const batches = await this.groupSubTasksIntoBatches(readySubTasks);

    for (const batch of batches) {
      await this.createReviewBatch(batch);
    }
  }

  private async groupSubTasksIntoBatches(
    subTasks: Array<{taskId: string, language: string, subTask: any}>
  ): Promise<Array<{taskIds: string[], languages: string[], iterationNumbers: {[key: string]: number}}>> {
    // Group by: Single Language + Editorial Context + Iteration Level
    // This ensures each Prolific study is focused and consistent for reviewers
    const batchGroups = new Map<string, Array<{taskId: string, language: string, subTask: any}>>();
    
    for (const subTaskInfo of subTasks) {
      const task = await this.dbService.getEnhancedTask(subTaskInfo.taskId);
      if (!task) continue;
      
      // Create a unique key ensuring single-language, same-context batching
      const contextHash = this.createEditorialContextHash(task.editorialGuidelines, task.guide);
      const batchKey = `${subTaskInfo.language}_${contextHash}_iter${subTaskInfo.subTask.currentIteration}`;
      
      if (!batchGroups.has(batchKey)) {
        batchGroups.set(batchKey, []);
      }
      batchGroups.get(batchKey)!.push(subTaskInfo);
    }

    const batches: Array<{taskIds: string[], languages: string[], iterationNumbers: {[key: string]: number}}> = [];
    
    for (const [batchKey, groupedSubTasks] of batchGroups) {
      // Each batch is now: single language + same editorial context + same iteration
      const language = groupedSubTasks[0].language;
      const iterationLevel = groupedSubTasks[0].subTask.currentIteration;
      
      const taskIds = groupedSubTasks.map(st => st.taskId);
      const iterationNumbers: {[key: string]: number} = {};
      
      for (const subTask of groupedSubTasks) {
        iterationNumbers[`${subTask.taskId}_${subTask.language}`] = iterationLevel;
      }

      batches.push({
        taskIds,
        languages: [language], // Always single language now
        iterationNumbers,
      });
    }

    return batches;
  }

  private createEditorialContextHash(guidelines: any, guide?: string): string {
    // Create a consistent hash for similar editorial contexts
    const contextString = JSON.stringify({
      tone: guidelines.tone || 'neutral',
      audience: guidelines.audience || 'general',
      style: guidelines.style || 'standard',
      guide: guide || 'general'
    });
    
    // Simple hash function for grouping similar contexts
    let hash = 0;
    for (let i = 0; i < contextString.length; i++) {
      const char = contextString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `context_${Math.abs(hash)}`;
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

    // Generate CSV data for the single language in this batch
    const csvRows: string[] = [];
    const batchLanguage = batch.languages[0]; // Always single language now
    
    // Process all tasks for this language
    for (const taskId of batch.taskIds) {
      const batchTask = await this.dbService.getEnhancedTask(taskId);
      if (!batchTask) continue;
      
      const subTask = batchTask.languageSubTasks[batchLanguage];
      if (subTask && subTask.translatedText) {
        // Create a translation result object for CSV generation
        const translationResult: TranslationResult = {
          language: batchLanguage,
          translatedText: subTask.translatedText,
          reviewNotes: subTask.iterations.length > 0 
            ? [subTask.iterations[subTask.iterations.length - 1].llmVerification.feedback]
            : [],
          complianceScore: subTask.iterations.length > 0
            ? subTask.iterations[subTask.iterations.length - 1].llmVerification.score * 20 // Convert back to 100-point scale
            : 0,
          status: "human_review" as LanguageTaskStatus,
        };

        const csvData = CsvGeneratorService.generateHumanReviewCsv(
          batchTask.id,
          batchTask.mediaArticle,
          batchTask.editorialGuidelines,
          translationResult
        );

        csvRows.push(csvData);
      }
    }

    // Create batch name and dataset name
    const batchName = `Review_Batch_${batch.batchId}`;
    const datasetName = `Dataset_${batch.batchId}`;

    // Create data collection
    const dataCollection = await this.prolificService.createDataCollection(
      csvRows.join('\n'),
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

    // Calculate study parameters for single language, multiple tasks
    const studyLanguage = batch.languages[0];
    const numTasks = batch.taskIds.length;
    
    // Get average complexity across all tasks in this batch
    let totalWords = 0;
    let validTasks = 0;
    
    for (const taskId of batch.taskIds) {
      const batchTask = await this.dbService.getEnhancedTask(taskId);
      if (batchTask && batchTask.languageSubTasks[studyLanguage]?.translatedText) {
        totalWords += batchTask.languageSubTasks[studyLanguage].translatedText.split(' ').length;
        validTasks++;
      }
    }
    
    const avgWordsPerTask = validTasks > 0 ? totalWords / validTasks : 100;
    
    // Use the first task as representative for estimation
    const firstTask = await this.dbService.getEnhancedTask(batch.taskIds[0]);
    const studyEstimate = StudyEstimationService.estimateStudyParameters(
      firstTask!.mediaArticle,
      firstTask!.editorialGuidelines,
      { language: studyLanguage, translatedText: `${avgWordsPerTask} words average` },
      firstTask!.guide as GuideType
    );

    // Adjust estimates for multiple tasks (more efficient than separate studies)
    const adjustedEstimate = {
      ...studyEstimate,
      estimatedCompletionTimeMinutes: Math.ceil(studyEstimate.estimatedCompletionTimeMinutes * numTasks * 0.85), // 85% efficiency for batching same language
      rewardPence: Math.ceil(studyEstimate.rewardPence * numTasks * 0.95), // 95% rate for batch work
      maxAllowedTimeMinutes: Math.ceil(studyEstimate.maxAllowedTimeMinutes * numTasks * 1.2), // Extra time buffer
    };

    console.log(`Single-language batch study estimation:`, {
      language: studyLanguage.toUpperCase(),
      numTasks: numTasks,
      avgWordsPerTask: Math.round(avgWordsPerTask),
      estimatedTime: adjustedEstimate.estimatedCompletionTimeMinutes,
      reward: adjustedEstimate.rewardPence,
      maxTime: adjustedEstimate.maxAllowedTimeMinutes,
    });

    // Get study filters for the single language in this batch
    const studyFilters = await this.prolificService.getStudyFilters(batch.languages);

    // Create study for single language, multiple tasks
    const studyData: CreateStudyRequest = {
      internal_name: `batch-review-${batch.batchId}`,
      name: `${studyLanguage.toUpperCase()} Translation Review: ${numTasks} Tasks (Iteration ${batch.iterationNumbers[Object.keys(batch.iterationNumbers)[0]]})`,
      description: `Review ${numTasks} ${studyLanguage.toUpperCase()} translations with consistent editorial context`,
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