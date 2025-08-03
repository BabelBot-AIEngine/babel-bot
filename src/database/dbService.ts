import { Redis } from "@upstash/redis";
import { GuideType, HumanReviewBatch } from "../types";

export interface TranslationTask {
  id: string;
  status:
    | "pending"
    | "translating"
    | "llm_verification"
    | "human_review"
    | "done"
    | "failed";
  mediaArticle: {
    text: string;
    title?: string;
    metadata?: Record<string, any>;
  };
  editorialGuidelines: Record<string, any>;
  destinationLanguages: string[];
  result?: any;
  error?: string;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  guide?: GuideType;
  humanReviewBatches?: HumanReviewBatch[];
  useFullMarkdown?: boolean;
}

export class DatabaseService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL!,
      token:
        process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    console.log("DatabaseService initialized with Upstash Redis");
  }

  async createTask(
    task: Omit<TranslationTask, "id" | "createdAt" | "updatedAt">
  ): Promise<string> {
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    const createdAtTimestamp = Date.now();

    const taskData = {
      id,
      status: task.status,
      mediaArticle: JSON.stringify(task.mediaArticle),
      editorialGuidelines: JSON.stringify(task.editorialGuidelines),
      destinationLanguages: JSON.stringify(task.destinationLanguages),
      result: task.result ? JSON.stringify(task.result) : "",
      error: task.error || "",
      createdAt: now,
      updatedAt: now,
      progress: (task.progress || 0).toString(),
      guide: task.guide || "",
      humanReviewBatches: task.humanReviewBatches
        ? JSON.stringify(task.humanReviewBatches)
        : "",
    };

    // Upstash Redis operations
    await this.redis.hset(`task:${id}`, taskData);
    await this.redis.sadd(`tasks:status:${task.status}`, id);
    await this.redis.zadd("tasks:created", {
      score: createdAtTimestamp,
      member: id,
    });

    return id;
  }

  async updateTask(
    id: string,
    updates: Partial<TranslationTask>
  ): Promise<void> {
    const taskExists = await this.redis.exists(`task:${id}`);
    if (!taskExists) {
      throw new Error(`Task ${id} not found`);
    }

    const now = new Date().toISOString();
    const updateData: Record<string, string> = {
      updatedAt: now,
    };

    const currentTask = (await this.redis.hgetall(`task:${id}`)) as Record<
      string,
      string
    >;

    if (updates.status && updates.status !== currentTask.status) {
      updateData.status = updates.status;
      await this.redis.srem(`tasks:status:${currentTask.status}`, id);
      await this.redis.sadd(`tasks:status:${updates.status}`, id);
    }
    if (updates.result !== undefined) {
      updateData.result = JSON.stringify(updates.result);
    }
    if (updates.error !== undefined) {
      updateData.error = updates.error;
    }
    if (updates.progress !== undefined) {
      updateData.progress = updates.progress.toString();
    }
    if (updates.humanReviewBatches !== undefined) {
      updateData.humanReviewBatches = JSON.stringify(
        updates.humanReviewBatches
      );
    }

    await this.redis.hset(`task:${id}`, updateData);
  }

  async getTask(id: string): Promise<TranslationTask | null> {
    const taskData = (await this.redis.hgetall(`task:${id}`)) as Record<
      string,
      string
    >;

    if (!taskData || Object.keys(taskData).length === 0) {
      return null;
    }

    return this.mapRedisDataToTask(taskData);
  }

  async getAllTasks(): Promise<TranslationTask[]> {
    const taskIds = (await this.redis.zrange(
      "tasks:created",
      0,
      -1
    )) as string[];
    const sortedTaskIds = taskIds.reverse();

    if (sortedTaskIds.length === 0) {
      return [];
    }

    const tasks: TranslationTask[] = [];
    for (const taskId of sortedTaskIds) {
      const taskData = (await this.redis.hgetall(`task:${taskId}`)) as Record<
        string,
        string
      >;
      if (taskData && Object.keys(taskData).length > 0) {
        tasks.push(this.mapRedisDataToTask(taskData));
      }
    }

    return tasks;
  }

  async getTasksByStatus(
    status: TranslationTask["status"]
  ): Promise<TranslationTask[]> {
    const taskIds = (await this.redis.smembers(
      `tasks:status:${status}`
    )) as string[];

    if (taskIds.length === 0) {
      return [];
    }

    const tasks: TranslationTask[] = [];
    for (const taskId of taskIds) {
      const taskData = (await this.redis.hgetall(`task:${taskId}`)) as Record<
        string,
        string
      >;
      if (taskData && Object.keys(taskData).length > 0) {
        tasks.push(this.mapRedisDataToTask(taskData));
      }
    }

    tasks.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return tasks;
  }

  private mapRedisDataToTask(data: Record<string, string>): TranslationTask {
    const safeJsonParse = (
      field: string,
      value: string,
      defaultValue: any = null
    ) => {
      try {
        if (!value || value === "") return defaultValue;
        if (value === "[object Object]") {
          console.error(
            `Invalid JSON detected in field '${field}': "${value}"`
          );
          return defaultValue;
        }
        return JSON.parse(value);
      } catch (error) {
        console.error(
          `Failed to parse JSON for field '${field}': "${value}"`,
          error
        );
        return defaultValue;
      }
    };

    return {
      id: data.id,
      status: data.status as TranslationTask["status"],
      mediaArticle: safeJsonParse("mediaArticle", data.mediaArticle, {
        text: "",
        title: "",
        metadata: {},
      }),
      editorialGuidelines: safeJsonParse(
        "editorialGuidelines",
        data.editorialGuidelines,
        {}
      ),
      destinationLanguages: safeJsonParse(
        "destinationLanguages",
        data.destinationLanguages,
        []
      ),
      result: data.result
        ? safeJsonParse("result", data.result, undefined)
        : undefined,
      error: data.error || undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      progress: parseInt(data.progress) || 0,
      guide:
        data.guide && data.guide !== "" ? (data.guide as GuideType) : undefined,
      humanReviewBatches:
        data.humanReviewBatches && data.humanReviewBatches !== ""
          ? safeJsonParse(
              "humanReviewBatches",
              data.humanReviewBatches,
              undefined
            )
          : undefined,
    };
  }

  async getTasksByBatchId(batchId: string): Promise<TranslationTask[]> {
    const allTasks = await this.getAllTasks();
    return allTasks.filter((task) =>
      task.humanReviewBatches?.some((batch) => batch.batchId === batchId)
    );
  }

  async getTasksByStudyId(studyId: string): Promise<TranslationTask[]> {
    const allTasks = await this.getAllTasks();
    return allTasks.filter((task) =>
      task.humanReviewBatches?.some((batch) => batch.studyId === studyId)
    );
  }

  async deleteTask(id: string): Promise<void> {
    const taskData = (await this.redis.hgetall(`task:${id}`)) as Record<
      string,
      string
    >;
    if (!taskData || Object.keys(taskData).length === 0) {
      throw new Error(`Task ${id} not found`);
    }

    // Upstash Redis operations (no transactions, but operations are atomic)
    await this.redis.del(`task:${id}`);
    await this.redis.srem(`tasks:status:${taskData.status}`, id);
    await this.redis.zrem("tasks:created", id);
  }

  async close(): Promise<void> {
    // Upstash Redis doesn't require explicit connection closing
    console.log(
      "DatabaseService closed (Upstash Redis handles connections automatically)"
    );
  }
}
