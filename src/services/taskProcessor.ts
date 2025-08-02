import { createClient, RedisClientType } from 'redis';
import { TaskQueue } from './taskQueue';
import { WorkerPool, WorkerConfig } from './workerPool';
import { TaskService } from './taskService';
import { DatabaseService } from '../database/dbService';

export interface ProcessorConfig extends WorkerConfig {
  redisUrl?: string;
  enableMetrics?: boolean;
}

export class TaskProcessor {
  private redis: RedisClientType;
  private taskQueue: TaskQueue;
  private workerPool: WorkerPool;
  private taskService: TaskService;
  private dbService: DatabaseService;
  private isRunning = false;
  private config: ProcessorConfig;

  constructor(config: ProcessorConfig = {
    maxConcurrentTasks: 3,
    workerCount: 2,
    processingTimeout: 300000,
    redisUrl: 'redis://localhost:6379',
    enableMetrics: true
  }) {
    this.config = config;
    this.redis = createClient({ url: config.redisUrl });
    this.dbService = new DatabaseService();
    this.taskQueue = new TaskQueue(this.redis);
    this.taskService = new TaskService(this.taskQueue);
    this.workerPool = new WorkerPool(
      this.taskQueue,
      this.taskService,
      this.dbService,
      config
    );

    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    console.log('Initializing task processor...');
    
    await this.redis.connect();
    // Note: DatabaseService doesn't have a connect method - it connects automatically
    await this.taskQueue.initialize();
    
    console.log('Task processor initialized successfully');
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Task processor is already running');
      return;
    }

    console.log('Starting task processor...');
    this.isRunning = true;

    await this.workerPool.start();
    
    if (this.config.enableMetrics) {
      this.startMetricsReporting();
    }

    console.log('Task processor started successfully');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('Task processor is not running');
      return;
    }

    console.log('Stopping task processor...');
    this.isRunning = false;

    await this.workerPool.stop();
    await this.redis.disconnect();
    
    console.log('Task processor stopped successfully');
  }

  async getStats(): Promise<ProcessorStats> {
    const workerStats = this.workerPool.getWorkerStats();
    const totalProcessed = Object.values(workerStats).reduce((sum, stats) => sum + stats.processed, 0);
    const totalFailed = Object.values(workerStats).reduce((sum, stats) => sum + stats.failed, 0);
    const totalCurrentTasks = Object.values(workerStats).reduce((sum, stats) => sum + stats.currentTasks, 0);

    const pendingTasks = await this.dbService.getTasksByStatus('pending');
    const processingTasks = await this.dbService.getTasksByStatus('translating');
    const verifyingTasks = await this.dbService.getTasksByStatus('llm_verification');
    const reviewingTasks = await this.dbService.getTasksByStatus('human_review');

    return {
      isRunning: this.isRunning,
      workers: workerStats,
      totals: {
        processed: totalProcessed,
        failed: totalFailed,
        currentTasks: totalCurrentTasks
      },
      queue: {
        pending: pendingTasks.length,
        translating: processingTasks.length,
        verifying: verifyingTasks.length,
        reviewing: reviewingTasks.length
      }
    };
  }

  getTaskService(): TaskService {
    return this.taskService;
  }

  private setupEventHandlers(): void {
    process.on('SIGINT', async () => {
      console.log('Received SIGINT, gracefully shutting down...');
      await this.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, gracefully shutting down...');
      await this.stop();
      process.exit(0);
    });

    this.redis.on('error', (error) => {
      console.error('Redis error:', error);
    });

    this.redis.on('connect', () => {
      console.log('Connected to Redis');
    });

    this.redis.on('disconnect', () => {
      console.log('Disconnected from Redis');
    });
  }

  private startMetricsReporting(): void {
    setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        const stats = await this.getStats();
        console.log('=== Task Processor Metrics ===');
        console.log(`Status: ${stats.isRunning ? 'Running' : 'Stopped'}`);
        console.log(`Total Processed: ${stats.totals.processed}`);
        console.log(`Total Failed: ${stats.totals.failed}`);
        console.log(`Current Active Tasks: ${stats.totals.currentTasks}`);
        console.log(`Queue - Pending: ${stats.queue.pending}, Processing: ${stats.queue.translating + stats.queue.verifying + stats.queue.reviewing}`);
        console.log('==============================');
      } catch (error) {
        console.error('Error reporting metrics:', error);
      }
    }, 30000); // Report every 30 seconds
  }
}

export interface ProcessorStats {
  isRunning: boolean;
  workers: { [workerId: string]: any };
  totals: {
    processed: number;
    failed: number;
    currentTasks: number;
  };
  queue: {
    pending: number;
    translating: number;
    verifying: number;
    reviewing: number;
  };
}