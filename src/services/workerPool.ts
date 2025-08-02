import { createClient, RedisClientType } from 'redis';
import { TaskQueue, TaskEvent } from './taskQueue';
import { TaskService } from './taskService';
import { DatabaseService } from '../database/dbService';

export interface WorkerConfig {
  maxConcurrentTasks: number;
  workerCount: number;
  processingTimeout: number;
}

export class WorkerPool {
  private taskQueue: TaskQueue;
  private taskService: TaskService;
  private dbService: DatabaseService;
  private workers: Worker[] = [];
  private isRunning = false;
  private config: WorkerConfig;

  constructor(
    taskQueue: TaskQueue,
    taskService: TaskService,
    dbService: DatabaseService,
    config: WorkerConfig
  ) {
    this.taskQueue = taskQueue;
    this.taskService = taskService;
    this.dbService = dbService;
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log(`Starting worker pool with ${this.config.workerCount} workers`);

    for (let i = 0; i < this.config.workerCount; i++) {
      const worker = new Worker(
        `worker-${i}`,
        this.taskQueue,
        this.taskService,
        this.dbService,
        this.config.maxConcurrentTasks
      );
      this.workers.push(worker);
      worker.start();
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    console.log('Stopping worker pool...');

    await Promise.all(this.workers.map(worker => worker.stop()));
    this.workers = [];
  }

  getWorkerStats(): { [workerId: string]: WorkerStats } {
    const stats: { [workerId: string]: WorkerStats } = {};
    for (const worker of this.workers) {
      stats[worker.id] = worker.getStats();
    }
    return stats;
  }
}

interface WorkerStats {
  processed: number;
  failed: number;
  currentTasks: number;
  isRunning: boolean;
}

class Worker {
  public id: string;
  private taskQueue: TaskQueue;
  private taskService: TaskService;
  private dbService: DatabaseService;
  private maxConcurrentTasks: number;
  private currentTasks = new Set<string>();
  private isRunning = false;
  private stats: WorkerStats;

  constructor(
    id: string,
    taskQueue: TaskQueue,
    taskService: TaskService,
    dbService: DatabaseService,
    maxConcurrentTasks: number
  ) {
    this.id = id;
    this.taskQueue = taskQueue;
    this.taskService = taskService;
    this.dbService = dbService;
    this.maxConcurrentTasks = maxConcurrentTasks;
    this.stats = { processed: 0, failed: 0, currentTasks: 0, isRunning: false };
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.stats.isRunning = true;
    console.log(`Worker ${this.id} started`);

    this.processLoop();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.stats.isRunning = false;
    
    while (this.currentTasks.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`Worker ${this.id} stopped`);
  }

  private async processLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        if (this.currentTasks.size >= this.maxConcurrentTasks) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }

        const events = await this.taskQueue.processMessages(this.id, 1);
        
        for (const event of events) {
          if (this.currentTasks.size >= this.maxConcurrentTasks) break;
          
          this.processTaskEvent(event).catch(error => {
            console.error(`Worker ${this.id} failed to process task ${event.taskId}:`, error);
            this.stats.failed++;
          });
        }

        await this.claimPendingTasks();
        
      } catch (error) {
        console.error(`Worker ${this.id} process loop error:`, error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  private async processTaskEvent(event: TaskEvent): Promise<void> {
    this.currentTasks.add(event.taskId);
    this.stats.currentTasks = this.currentTasks.size;

    try {
      console.log(`Worker ${this.id} processing task ${event.taskId} (${event.type})`);

      switch (event.type) {
        case 'translate':
          await this.taskService.processTranslationStep(event.taskId);
          break;
        case 'verify':
          await this.taskService.processVerificationStep(event.taskId);
          break;
        case 'review':
          await this.taskService.processReviewStep(event.taskId);
          break;
      }

      this.stats.processed++;
      console.log(`Worker ${this.id} completed task ${event.taskId}`);

    } catch (error) {
      console.error(`Worker ${this.id} failed task ${event.taskId}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const retryId = await this.taskQueue.retryTask(event, errorMessage);
      
      if (!retryId) {
        console.error(`Worker ${this.id} task ${event.taskId} failed permanently after ${event.retryCount || 0} retries`);
        this.stats.failed++;
        
        await this.dbService.updateTask(event.taskId, {
          status: 'failed',
          error: errorMessage
        });
      } else {
        console.log(`Worker ${this.id} scheduled retry for task ${event.taskId} (attempt ${(event.retryCount || 0) + 1})`);
      }
    } finally {
      this.currentTasks.delete(event.taskId);
      this.stats.currentTasks = this.currentTasks.size;
    }
  }

  private async claimPendingTasks(): Promise<void> {
    try {
      const pending = await this.taskQueue.claimPendingMessages(this.id);
      for (const message of pending) {
        const { taskId, type, timestamp, data } = message.message;
        const event: TaskEvent = {
          taskId,
          type: type as TaskEvent['type'],
          timestamp: parseInt(timestamp),
          data: data ? JSON.parse(data) : undefined
        };
        
        await this.processTaskEvent(event);
      }
    } catch (error) {
      console.error(`Worker ${this.id} failed to claim pending tasks:`, error);
    }
  }

  getStats(): WorkerStats {
    return { ...this.stats };
  }
}