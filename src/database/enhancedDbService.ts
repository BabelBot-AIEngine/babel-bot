import { Redis } from "@upstash/redis";
import {
  EnhancedTranslationTask,
  TaskStatus,
  LanguageSubTask,
  LanguageSubTaskStatus,
  ReviewIteration,
  WebhookAttempt,
  ProlificStudyMapping,
} from "../types/enhanced-task";
import { GuideType } from "../types";

export class EnhancedDatabaseService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL!,
      token:
        process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    console.log("EnhancedDatabaseService initialized with Upstash Redis");
  }

  // Enhanced Task Operations
  async createEnhancedTask(
    task: Omit<EnhancedTranslationTask, "id" | "createdAt" | "updatedAt" | "languageSubTasks" | "prolificStudyMappings" | "webhookDeliveryLog">
  ): Promise<string> {
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    const createdAtTimestamp = Date.now();

    // Initialize language sub-tasks
    const languageSubTasks: { [language: string]: LanguageSubTask } = {};
    for (const language of task.destinationLanguages) {
      languageSubTasks[language] = {
        language,
        status: "pending",
        currentIteration: 0,
        maxIterations: task.maxReviewIterations,
        confidenceThreshold: task.confidenceThreshold,
        iterations: [],
        createdAt: now,
        updatedAt: now,
        prolificBatchIds: [],
        webhooksPending: [],
      };
    }

    const enhancedTask: EnhancedTranslationTask = {
      id,
      status: task.status,
      mediaArticle: task.mediaArticle,
      editorialGuidelines: task.editorialGuidelines,
      destinationLanguages: task.destinationLanguages,
      createdAt: now,
      updatedAt: now,
      progress: task.progress || 0,
      guide: task.guide,
      useFullMarkdown: task.useFullMarkdown,
      maxReviewIterations: task.maxReviewIterations,
      confidenceThreshold: task.confidenceThreshold,
      languageSubTasks,
      prolificStudyMappings: {},
      webhookDeliveryLog: [],
      result: task.result,
      humanReviewBatches: task.humanReviewBatches,
      error: task.error,
    };

    // Store in Redis with enhanced schema
    await this.redis.hset(`enhanced_task:${id}`, {
      id,
      status: enhancedTask.status,
      mediaArticle: JSON.stringify(enhancedTask.mediaArticle),
      editorialGuidelines: JSON.stringify(enhancedTask.editorialGuidelines),
      destinationLanguages: JSON.stringify(enhancedTask.destinationLanguages),
      createdAt: now,
      updatedAt: now,
      progress: enhancedTask.progress.toString(),
      guide: enhancedTask.guide || "",
      useFullMarkdown: enhancedTask.useFullMarkdown ? "true" : "false",
      maxReviewIterations: enhancedTask.maxReviewIterations.toString(),
      confidenceThreshold: enhancedTask.confidenceThreshold.toString(),
      languageSubTasks: JSON.stringify(enhancedTask.languageSubTasks),
      prolificStudyMappings: JSON.stringify(enhancedTask.prolificStudyMappings),
      webhookDeliveryLog: JSON.stringify(enhancedTask.webhookDeliveryLog),
      result: enhancedTask.result ? JSON.stringify(enhancedTask.result) : "",
      humanReviewBatches: enhancedTask.humanReviewBatches ? JSON.stringify(enhancedTask.humanReviewBatches) : "",
      error: enhancedTask.error || "",
    });

    // Index by status and creation time
    await this.redis.sadd(`enhanced_tasks:status:${enhancedTask.status}`, id);
    await this.redis.zadd("enhanced_tasks:created", {
      score: createdAtTimestamp,
      member: id,
    });

    // Index language sub-tasks individually for efficient lookups
    for (const language of task.destinationLanguages) {
      const subTaskId = `${id}_${language}`;
      await this.redis.sadd(`language_subtasks:status:pending`, subTaskId);
      await this.redis.hset(`language_subtask:${subTaskId}`, {
        taskId: id,
        language,
        status: "pending",
        currentIteration: "0",
        maxIterations: task.maxReviewIterations.toString(),
        confidenceThreshold: task.confidenceThreshold.toString(),
        createdAt: now,
        updatedAt: now,
      });
    }

    return id;
  }

  async getEnhancedTask(id: string): Promise<EnhancedTranslationTask | null> {
    const taskData = await this.redis.hgetall(`enhanced_task:${id}`) as Record<string, string>;

    if (!taskData || Object.keys(taskData).length === 0) {
      return null;
    }

    return this.mapRedisDataToEnhancedTask(taskData);
  }

  async updateEnhancedTask(
    id: string,
    updates: Partial<EnhancedTranslationTask>
  ): Promise<void> {
    const taskExists = await this.redis.exists(`enhanced_task:${id}`);
    if (!taskExists) {
      throw new Error(`Enhanced task ${id} not found`);
    }

    const now = new Date().toISOString();
    const updateData: Record<string, any> = {
      updatedAt: now,
    };

    const currentTask = await this.redis.hgetall(`enhanced_task:${id}`) as Record<string, string>;

    // Update status tracking
    if (updates.status && updates.status !== currentTask.status) {
      updateData.status = updates.status;
      await this.redis.srem(`enhanced_tasks:status:${currentTask.status}`, id);
      await this.redis.sadd(`enhanced_tasks:status:${updates.status}`, id);
    }

    // Update fields that need JSON serialization
    if (updates.languageSubTasks !== undefined) {
      updateData.languageSubTasks = JSON.stringify(updates.languageSubTasks);
    }
    if (updates.prolificStudyMappings !== undefined) {
      updateData.prolificStudyMappings = JSON.stringify(updates.prolificStudyMappings);
    }
    if (updates.webhookDeliveryLog !== undefined) {
      updateData.webhookDeliveryLog = JSON.stringify(updates.webhookDeliveryLog);
    }
    if (updates.result !== undefined) {
      updateData.result = JSON.stringify(updates.result);
    }
    if (updates.progress !== undefined) {
      updateData.progress = updates.progress.toString();
    }
    if (updates.error !== undefined) {
      updateData.error = updates.error;
    }

    await this.redis.hset(`enhanced_task:${id}`, updateData);
  }

  // Language Sub-Task Operations
  async updateLanguageSubTask(
    taskId: string,
    language: string,
    updates: Partial<LanguageSubTask>
  ): Promise<void> {
    const task = await this.getEnhancedTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (!task.languageSubTasks[language]) {
      throw new Error(`Language sub-task ${language} not found for task ${taskId}`);
    }

    const subTaskId = `${taskId}_${language}`;
    const currentSubTask = task.languageSubTasks[language];
    const now = new Date().toISOString();

    // Update the sub-task
    const updatedSubTask = {
      ...currentSubTask,
      ...updates,
      updatedAt: now,
    };

    // Update status indexes if status changed
    if (updates.status && updates.status !== currentSubTask.status) {
      await this.redis.srem(`language_subtasks:status:${currentSubTask.status}`, subTaskId);
      await this.redis.sadd(`language_subtasks:status:${updates.status}`, subTaskId);
      
      // Update individual sub-task record
      await this.redis.hset(`language_subtask:${subTaskId}`, {
        status: updates.status,
        updatedAt: now,
      });
    }

    // Update the main task with the modified sub-task
    task.languageSubTasks[language] = updatedSubTask;
    await this.updateEnhancedTask(taskId, {
      languageSubTasks: task.languageSubTasks,
    });
  }

  // Iteration Management
  async addIterationToLanguageSubTask(
    taskId: string,
    language: string,
    iteration: ReviewIteration
  ): Promise<void> {
    const task = await this.getEnhancedTask(taskId);
    if (!task || !task.languageSubTasks[language]) {
      throw new Error(`Language sub-task ${language} not found for task ${taskId}`);
    }

    const subTask = task.languageSubTasks[language];
    subTask.iterations.push(iteration);
    subTask.currentIteration = iteration.iterationNumber;
    subTask.updatedAt = new Date().toISOString();

    await this.updateEnhancedTask(taskId, {
      languageSubTasks: task.languageSubTasks,
    });
  }

  // Prolific Study Management
  async addProlificStudyMapping(
    taskId: string,
    studyId: string,
    mapping: ProlificStudyMapping
  ): Promise<void> {
    const task = await this.getEnhancedTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.prolificStudyMappings[studyId] = mapping;
    await this.updateEnhancedTask(taskId, {
      prolificStudyMappings: task.prolificStudyMappings,
    });

    // Index by study ID for quick lookups
    await this.redis.set(`study_to_task:${studyId}`, taskId);
  }

  async getTaskByStudyId(studyId: string): Promise<EnhancedTranslationTask | null> {
    const taskId = await this.redis.get(`study_to_task:${studyId}`);
    if (!taskId) {
      return null;
    }
    return this.getEnhancedTask(taskId as string);
  }

  // Webhook Delivery Tracking
  async addWebhookAttempt(taskId: string, attempt: WebhookAttempt): Promise<void> {
    const task = await this.getEnhancedTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.webhookDeliveryLog.push(attempt);
    await this.updateEnhancedTask(taskId, {
      webhookDeliveryLog: task.webhookDeliveryLog,
    });
  }

  // Query Operations
  async getTasksByStatus(status: TaskStatus): Promise<EnhancedTranslationTask[]> {
    const taskIds = await this.redis.smembers(`enhanced_tasks:status:${status}`) as string[];
    
    if (taskIds.length === 0) {
      return [];
    }

    const tasks: EnhancedTranslationTask[] = [];
    for (const taskId of taskIds) {
      const task = await this.getEnhancedTask(taskId);
      if (task) {
        tasks.push(task);
      }
    }

    return tasks.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getLanguageSubTasksByStatus(status: LanguageSubTaskStatus): Promise<Array<{taskId: string, language: string, subTask: LanguageSubTask}>> {
    const subTaskIds = await this.redis.smembers(`language_subtasks:status:${status}`) as string[];
    
    const results: Array<{taskId: string, language: string, subTask: LanguageSubTask}> = [];
    
    for (const subTaskId of subTaskIds) {
      const [taskId, language] = subTaskId.split('_');
      const task = await this.getEnhancedTask(taskId);
      
      if (task && task.languageSubTasks[language]) {
        results.push({
          taskId,
          language,
          subTask: task.languageSubTasks[language],
        });
      }
    }

    return results;
  }

  async getAllEnhancedTasks(): Promise<EnhancedTranslationTask[]> {
    const taskIds = await this.redis.zrange("enhanced_tasks:created", 0, -1) as string[];
    const sortedTaskIds = taskIds.reverse();

    if (sortedTaskIds.length === 0) {
      return [];
    }

    const tasks: EnhancedTranslationTask[] = [];
    for (const taskId of sortedTaskIds) {
      const task = await this.getEnhancedTask(taskId);
      if (task) {
        tasks.push(task);
      }
    }

    return tasks;
  }

  // Utility Methods
  private mapRedisDataToEnhancedTask(data: Record<string, any>): EnhancedTranslationTask {
    return {
      id: data.id,
      status: data.status as TaskStatus,
      mediaArticle: JSON.parse(data.mediaArticle || '{"text":"","title":"","metadata":{}}'),
      editorialGuidelines: JSON.parse(data.editorialGuidelines || '{}'),
      destinationLanguages: JSON.parse(data.destinationLanguages || '[]'),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      progress: parseInt(data.progress) || 0,
      guide: data.guide && data.guide !== "" ? (data.guide as GuideType) : undefined,
      useFullMarkdown: data.useFullMarkdown === "true",
      maxReviewIterations: parseInt(data.maxReviewIterations) || 3,
      confidenceThreshold: parseFloat(data.confidenceThreshold) || 4.5,
      languageSubTasks: JSON.parse(data.languageSubTasks || '{}'),
      prolificStudyMappings: JSON.parse(data.prolificStudyMappings || '{}'),
      webhookDeliveryLog: JSON.parse(data.webhookDeliveryLog || '[]'),
      result: data.result ? JSON.parse(data.result) : undefined,
      humanReviewBatches: data.humanReviewBatches ? JSON.parse(data.humanReviewBatches) : undefined,
      error: data.error || undefined,
    };
  }

  // Migration Support
  async migrateTaskToEnhanced(legacyTaskId: string): Promise<string> {
    // This would be used to migrate existing tasks to the new schema
    // Implementation would depend on the specific migration strategy
    throw new Error("Migration not yet implemented");
  }

  async deleteEnhancedTask(id: string): Promise<void> {
    const taskData = await this.redis.hgetall(`enhanced_task:${id}`) as Record<string, string>;
    if (!taskData || Object.keys(taskData).length === 0) {
      throw new Error(`Enhanced task ${id} not found`);
    }

    const task = this.mapRedisDataToEnhancedTask(taskData);

    // Clean up all indexes and related data
    await this.redis.del(`enhanced_task:${id}`);
    await this.redis.srem(`enhanced_tasks:status:${task.status}`, id);
    await this.redis.zrem("enhanced_tasks:created", id);

    // Clean up language sub-tasks
    for (const language of task.destinationLanguages) {
      const subTaskId = `${id}_${language}`;
      const subTask = task.languageSubTasks[language];
      if (subTask) {
        await this.redis.srem(`language_subtasks:status:${subTask.status}`, subTaskId);
        await this.redis.del(`language_subtask:${subTaskId}`);
      }
    }

    // Clean up study mappings
    for (const studyId of Object.keys(task.prolificStudyMappings)) {
      await this.redis.del(`study_to_task:${studyId}`);
    }
  }

  async close(): Promise<void> {
    console.log("EnhancedDatabaseService closed (Upstash Redis handles connections automatically)");
  }
}