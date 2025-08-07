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
    task: Omit<
      EnhancedTranslationTask,
      | "id"
      | "createdAt"
      | "updatedAt"
      | "languageSubTasks"
      | "prolificStudyMappings"
      | "webhookDeliveryLog"
    >
  ): Promise<string> {
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    const createdAtTimestamp = Date.now();

    console.log(`[ENHANCED-DB] 🎬 Creating enhanced task with ID: ${id}`);
    console.log(
      `[ENHANCED-DB] Languages: ${task.destinationLanguages.join(", ")}`
    );
    console.log(`[ENHANCED-DB] Initial status: ${task.status}`);

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
    console.log(`[ENHANCED-DB] 💾 Storing task ${id} in Redis`);
    await this.redis.hset(`enhanced_task:${id}`, {
      id,
      status: enhancedTask.status,
      mediaArticle: this.safeJSONStringify(
        enhancedTask.mediaArticle,
        "mediaArticle"
      ),
      editorialGuidelines: this.safeJSONStringify(
        enhancedTask.editorialGuidelines,
        "editorialGuidelines"
      ),
      destinationLanguages: this.safeJSONStringify(
        enhancedTask.destinationLanguages,
        "destinationLanguages"
      ),
      createdAt: now,
      updatedAt: now,
      progress: (enhancedTask.progress || 0).toString(),
      guide: enhancedTask.guide || "",
      useFullMarkdown: enhancedTask.useFullMarkdown ? "true" : "false",
      maxReviewIterations: enhancedTask.maxReviewIterations.toString(),
      confidenceThreshold: enhancedTask.confidenceThreshold.toString(),
      languageSubTasks: this.safeJSONStringify(
        enhancedTask.languageSubTasks,
        "languageSubTasks"
      ),
      prolificStudyMappings: this.safeJSONStringify(
        enhancedTask.prolificStudyMappings,
        "prolificStudyMappings"
      ),
      webhookDeliveryLog: this.safeJSONStringify(
        enhancedTask.webhookDeliveryLog,
        "webhookDeliveryLog"
      ),
      result: enhancedTask.result
        ? this.safeJSONStringify(enhancedTask.result, "result")
        : "",
      humanReviewBatches: enhancedTask.humanReviewBatches
        ? this.safeJSONStringify(
            enhancedTask.humanReviewBatches,
            "humanReviewBatches"
          )
        : "",
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

    console.log(`[ENHANCED-DB] ✅ Successfully created enhanced task ${id}`);
    return id;
  }

  async getEnhancedTask(
    id: string,
    verbose: boolean = false
  ): Promise<EnhancedTranslationTask | null> {
    if (verbose) {
      console.log(`[ENHANCED-DB] 🔍 Looking up task ${id} in Redis`);
      console.log(
        `[ENHANCED-DB] 🔗 Redis client status:`,
        this.redis ? "Connected" : "Not connected"
      );
    }

    let taskData: Record<string, any>;
    try {
      if (verbose) {
        console.log(
          `[ENHANCED-DB] 📡 Starting Redis hgetall for enhanced_task:${id}`
        );
      }

      // Add timeout protection
      const redisPromise = this.redis.hgetall(`enhanced_task:${id}`);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Redis timeout after 10 seconds")),
          10000
        )
      );

      taskData = (await Promise.race([redisPromise, timeoutPromise])) as Record<
        string,
        any
      >;
      if (verbose) {
        console.log(`[ENHANCED-DB] ✅ Redis hgetall completed successfully`);
      }
    } catch (error) {
      console.error(`[ENHANCED-DB] ❌ Redis hgetall failed for ${id}:`, error);
      console.error(`[ENHANCED-DB] Redis error details:`, error);
      throw error;
    }

    if (verbose) {
      console.log(
        `[ENHANCED-DB] 📋 Raw Redis response for ${id}:`,
        Object.keys(taskData).length > 0 ? "Found data" : "No data found"
      );
      if (Object.keys(taskData).length === 0) {
        console.log(`[ENHANCED-DB] ⚠️ No task data found for ${id}`);
      }
    }

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

    const currentTask = (await this.redis.hgetall(
      `enhanced_task:${id}`
    )) as Record<string, any>;

    // Update status tracking
    if (updates.status && updates.status !== currentTask.status) {
      updateData.status = updates.status;
      await this.redis.srem(`enhanced_tasks:status:${currentTask.status}`, id);
      await this.redis.sadd(`enhanced_tasks:status:${updates.status}`, id);
    }

    // Update fields that need JSON serialization
    if (updates.languageSubTasks !== undefined) {
      updateData.languageSubTasks = this.safeJSONStringify(
        updates.languageSubTasks,
        "languageSubTasks"
      );
    }
    if (updates.prolificStudyMappings !== undefined) {
      updateData.prolificStudyMappings = this.safeJSONStringify(
        updates.prolificStudyMappings,
        "prolificStudyMappings"
      );
    }
    if (updates.webhookDeliveryLog !== undefined) {
      updateData.webhookDeliveryLog = this.safeJSONStringify(
        updates.webhookDeliveryLog,
        "webhookDeliveryLog"
      );
    }
    if (updates.result !== undefined) {
      updateData.result = this.safeJSONStringify(updates.result, "result");
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
      throw new Error(
        `Language sub-task ${language} not found for task ${taskId}`
      );
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
      await this.redis.srem(
        `language_subtasks:status:${currentSubTask.status}`,
        subTaskId
      );
      await this.redis.sadd(
        `language_subtasks:status:${updates.status}`,
        subTaskId
      );

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
      throw new Error(
        `Language sub-task ${language} not found for task ${taskId}`
      );
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

  async getTaskByStudyId(
    studyId: string
  ): Promise<EnhancedTranslationTask | null> {
    const taskId = await this.redis.get(`study_to_task:${studyId}`);
    if (!taskId) {
      return null;
    }
    return this.getEnhancedTask(taskId as string);
  }

  // Webhook Delivery Tracking
  async addWebhookAttempt(
    taskId: string,
    attempt: WebhookAttempt
  ): Promise<void> {
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
  async getTasksByStatus(
    status: TaskStatus
  ): Promise<EnhancedTranslationTask[]> {
    const taskIds = (await this.redis.smembers(
      `enhanced_tasks:status:${status}`
    )) as string[];

    if (taskIds.length === 0) {
      return [];
    }

    const tasks = await Promise.all(
      taskIds.map((taskId) => this.getEnhancedTask(taskId))
    );

    return tasks
      .filter((t): t is EnhancedTranslationTask => Boolean(t))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }

  async getLanguageSubTasksByStatus(
    status: LanguageSubTaskStatus
  ): Promise<
    Array<{ taskId: string; language: string; subTask: LanguageSubTask }>
  > {
    const subTaskIds = (await this.redis.smembers(
      `language_subtasks:status:${status}`
    )) as string[];

    const results: Array<{
      taskId: string;
      language: string;
      subTask: LanguageSubTask;
    }> = [];

    for (const subTaskId of subTaskIds) {
      const [taskId, language] = subTaskId.split("_");
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
    const taskIds = (await this.redis.zrange(
      "enhanced_tasks:created",
      0,
      -1
    )) as string[];
    const sortedTaskIds = taskIds.reverse();

    if (sortedTaskIds.length === 0) {
      return [];
    }

    const tasks = await Promise.all(
      sortedTaskIds.map((taskId) => this.getEnhancedTask(taskId))
    );
    return tasks.filter((t): t is EnhancedTranslationTask => Boolean(t));
  }

  async getAllEnhancedTasksSummary(
    limit?: number
  ): Promise<
    Array<
      Pick<
        EnhancedTranslationTask,
        | "id"
        | "status"
        | "createdAt"
        | "updatedAt"
        | "progress"
        | "destinationLanguages"
      >
    >
  > {
    const allIds = (await this.redis.zrange(
      "enhanced_tasks:created",
      0,
      -1
    )) as string[];
    const sortedIds = allIds.reverse();
    const ids =
      typeof limit === "number" && limit > 0
        ? sortedIds.slice(0, limit)
        : sortedIds;

    if (ids.length === 0) return [];

    const fields = [
      "id",
      "status",
      "createdAt",
      "updatedAt",
      "progress",
      "destinationLanguages",
    ] as const;

    const summaries = await Promise.all(
      ids.map(async (id) => {
        const values = (await this.redis.hmget(
          `enhanced_task:${id}`,
          ...fields
        )) as Record<string, string>;

        return {
          id: values.id,
          status: values.status as TaskStatus,
          createdAt: values.createdAt,
          updatedAt: values.updatedAt,
          progress: parseInt(values.progress) || 0,
          destinationLanguages: this.safeJSONParse(
            values.destinationLanguages,
            [],
            "destinationLanguages"
          ),
        };
      })
    );

    return summaries;
  }

  // Utility Methods
  private safeJSONStringify(value: any, fieldName: string): string {
    try {
      return JSON.stringify(value);
    } catch (error) {
      console.error(`Failed to stringify JSON for field ${fieldName}:`, {
        value: value,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Return empty object or array based on the value type
      if (Array.isArray(value)) {
        return "[]";
      } else if (typeof value === "object" && value !== null) {
        return "{}";
      }
      return '""';
    }
  }

  private safeJSONParse(value: any, fallback: any, fieldName: string): any {
    if (!value || value === "") {
      return fallback;
    }

    // If the value is already an object (not a string), return it directly
    // This handles cases where Redis client auto-deserializes some fields
    if (typeof value === "object" && value !== null) {
      return value;
    }

    // If it's not a string at this point, convert to string first
    if (typeof value !== "string") {
      value = String(value);
    }

    // Check if the value is the problematic "[object Object]" string
    if (value === "[object Object]") {
      console.warn(
        `Found "[object Object]" in field ${fieldName}, using fallback value`
      );
      return fallback;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      console.error(`Failed to parse JSON for field ${fieldName}:`, {
        value: value,
        valueType: typeof value,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return fallback;
    }
  }

  private mapRedisDataToEnhancedTask(
    data: Record<string, any>
  ): EnhancedTranslationTask {
    return {
      id: data.id,
      status: data.status as TaskStatus,
      mediaArticle: this.safeJSONParse(
        data.mediaArticle,
        { text: "", title: "", metadata: {} },
        "mediaArticle"
      ),
      editorialGuidelines: this.safeJSONParse(
        data.editorialGuidelines,
        {},
        "editorialGuidelines"
      ),
      destinationLanguages: this.safeJSONParse(
        data.destinationLanguages,
        [],
        "destinationLanguages"
      ),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      progress: parseInt(data.progress) || 0,
      guide:
        data.guide && data.guide !== "" ? (data.guide as GuideType) : undefined,
      useFullMarkdown: data.useFullMarkdown === "true",
      maxReviewIterations: parseInt(data.maxReviewIterations) || 3,
      confidenceThreshold: parseFloat(data.confidenceThreshold) || 4.5,
      languageSubTasks: this.safeJSONParse(
        data.languageSubTasks,
        {},
        "languageSubTasks"
      ),
      prolificStudyMappings: this.safeJSONParse(
        data.prolificStudyMappings,
        {},
        "prolificStudyMappings"
      ),
      webhookDeliveryLog: this.safeJSONParse(
        data.webhookDeliveryLog,
        [],
        "webhookDeliveryLog"
      ),
      result: data.result
        ? this.safeJSONParse(data.result, undefined, "result")
        : undefined,
      humanReviewBatches: data.humanReviewBatches
        ? this.safeJSONParse(
            data.humanReviewBatches,
            undefined,
            "humanReviewBatches"
          )
        : undefined,
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
    const taskData = (await this.redis.hgetall(
      `enhanced_task:${id}`
    )) as Record<string, any>;
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
        await this.redis.srem(
          `language_subtasks:status:${subTask.status}`,
          subTaskId
        );
        await this.redis.del(`language_subtask:${subTaskId}`);
      }
    }

    // Clean up study mappings
    for (const studyId of Object.keys(task.prolificStudyMappings)) {
      await this.redis.del(`study_to_task:${studyId}`);
    }
  }

  async close(): Promise<void> {
    console.log(
      "EnhancedDatabaseService closed (Upstash Redis handles connections automatically)"
    );
  }
}
