import { createClient, RedisClientType } from "redis";
import { GuideType } from "../types";

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
  useFullMarkdown?: boolean;
}

export class DatabaseService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    this.initializeConnection();
  }

  private async initializeConnection(): Promise<void> {
    try {
      this.client.on('error', (err) => {
        console.error('Redis client error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Connected to Redis');
        this.isConnected = true;
      });

      await this.client.connect();
      console.log('Redis connection initialized successfully');
    } catch (error) {
      console.error('Error connecting to Redis:', error);
      throw error;
    }
  }

  async createTask(
    task: Omit<TranslationTask, "id" | "createdAt" | "updatedAt">
  ): Promise<string> {
    if (!this.isConnected) {
      await this.initializeConnection();
    }

    const id = `task_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const now = new Date().toISOString();
    const createdAtTimestamp = Date.now();

    const taskData = {
      id,
      status: task.status,
      mediaArticle: JSON.stringify(task.mediaArticle),
      editorialGuidelines: JSON.stringify(task.editorialGuidelines),
      destinationLanguages: JSON.stringify(task.destinationLanguages),
      result: task.result ? JSON.stringify(task.result) : '',
      error: task.error || '',
      createdAt: now,
      updatedAt: now,
      progress: (task.progress || 0).toString(),
      guide: task.guide || '',
    };

    const multi = this.client.multi();
    multi.hSet(`task:${id}`, taskData);
    multi.sAdd(`tasks:status:${task.status}`, id);
    multi.zAdd('tasks:created', { score: createdAtTimestamp, value: id });
    
    await multi.exec();
    return id;
  }

  async updateTask(
    id: string,
    updates: Partial<TranslationTask>
  ): Promise<void> {
    if (!this.isConnected) {
      await this.initializeConnection();
    }

    const taskExists = await this.client.exists(`task:${id}`);
    if (!taskExists) {
      throw new Error(`Task ${id} not found`);
    }

    const now = new Date().toISOString();
    const updateData: Record<string, string> = {
      updatedAt: now,
    };

    const currentTask = await this.client.hGetAll(`task:${id}`);
    const multi = this.client.multi();

    if (updates.status && updates.status !== currentTask.status) {
      updateData.status = updates.status;
      multi.sRem(`tasks:status:${currentTask.status}`, id);
      multi.sAdd(`tasks:status:${updates.status}`, id);
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

    multi.hSet(`task:${id}`, updateData);
    await multi.exec();
  }

  async getTask(id: string): Promise<TranslationTask | null> {
    if (!this.isConnected) {
      await this.initializeConnection();
    }

    const taskData = await this.client.hGetAll(`task:${id}`);
    
    if (!taskData || Object.keys(taskData).length === 0) {
      return null;
    }

    return this.mapRedisDataToTask(taskData);
  }

  async getAllTasks(): Promise<TranslationTask[]> {
    if (!this.isConnected) {
      await this.initializeConnection();
    }

    const taskIds = await this.client.zRange('tasks:created', 0, -1);
    const sortedTaskIds = taskIds.reverse();
    
    if (sortedTaskIds.length === 0) {
      return [];
    }

    const tasks: TranslationTask[] = [];
    for (const taskId of sortedTaskIds) {
      const taskData = await this.client.hGetAll(`task:${taskId}`);
      if (taskData && Object.keys(taskData).length > 0) {
        tasks.push(this.mapRedisDataToTask(taskData));
      }
    }

    return tasks;
  }

  async getTasksByStatus(
    status: TranslationTask["status"]
  ): Promise<TranslationTask[]> {
    if (!this.isConnected) {
      await this.initializeConnection();
    }

    const taskIds = await this.client.sMembers(`tasks:status:${status}`);
    
    if (taskIds.length === 0) {
      return [];
    }

    const tasks: TranslationTask[] = [];
    for (const taskId of taskIds) {
      const taskData = await this.client.hGetAll(`task:${taskId}`);
      if (taskData && Object.keys(taskData).length > 0) {
        tasks.push(this.mapRedisDataToTask(taskData));
      }
    }

    tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return tasks;
  }

  private mapRedisDataToTask(data: Record<string, string>): TranslationTask {
    return {
      id: data.id,
      status: data.status as TranslationTask['status'],
      mediaArticle: JSON.parse(data.mediaArticle),
      editorialGuidelines: JSON.parse(data.editorialGuidelines),
      destinationLanguages: JSON.parse(data.destinationLanguages),
      result: data.result ? JSON.parse(data.result) : undefined,
      error: data.error || undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      progress: parseInt(data.progress) || 0,
      guide: (data.guide && data.guide !== '') ? data.guide as GuideType : undefined,
    };
  }

  async close(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }
}
