import { createClient, RedisClientType } from 'redis';

export interface TaskEvent {
  taskId: string;
  type: 'translate' | 'verify' | 'review';
  timestamp: number;
  retryCount?: number;
  maxRetries?: number;
  data?: any;
}

export class TaskQueue {
  private client: RedisClientType;
  private readonly streamName = 'task:stream';
  private readonly consumerGroup = 'task:processors';
  
  constructor(client: RedisClientType) {
    this.client = client;
  }

  async initialize(): Promise<void> {
    try {
      await this.client.xGroupCreate(this.streamName, this.consumerGroup, '0-0', {
        MKSTREAM: true
      });
    } catch (error: any) {
      if (!error.message.includes('BUSYGROUP')) {
        throw error;
      }
    }
  }

  async addTask(event: TaskEvent): Promise<string> {
    const streamId = await this.client.xAdd(this.streamName, '*', {
      taskId: event.taskId,
      type: event.type,
      timestamp: event.timestamp.toString(),
      retryCount: (event.retryCount || 0).toString(),
      maxRetries: (event.maxRetries || 3).toString(),
      data: event.data ? JSON.stringify(event.data) : ''
    });
    
    await this.client.publish(`task:events`, JSON.stringify({
      action: 'task_queued',
      taskId: event.taskId,
      type: event.type,
      retryCount: event.retryCount || 0,
      streamId
    }));
    
    return streamId;
  }

  async processMessages(consumerName: string, batchSize: number = 1): Promise<TaskEvent[]> {
    const messages = await this.client.xReadGroup(
      this.consumerGroup,
      consumerName,
      [{ key: this.streamName, id: '>' }],
      { COUNT: batchSize, BLOCK: 1000 }
    );

    if (!messages || messages.length === 0) {
      return [];
    }

    const events: TaskEvent[] = [];
    for (const stream of messages) {
      for (const message of stream.messages) {
        const { taskId, type, timestamp, retryCount, maxRetries, data } = message.message;
        events.push({
          taskId,
          type: type as TaskEvent['type'],
          timestamp: parseInt(timestamp),
          retryCount: parseInt(retryCount || '0'),
          maxRetries: parseInt(maxRetries || '3'),
          data: data ? JSON.parse(data) : undefined
        });
      }
    }

    return events;
  }

  async acknowledgeMessage(consumerName: string, messageId: string): Promise<void> {
    await this.client.xAck(this.streamName, this.consumerGroup, messageId);
  }

  async getPendingMessages(consumerName: string): Promise<any> {
    const result = await this.client.xPending(this.streamName, this.consumerGroup);
    return result;
  }

  async claimPendingMessages(consumerName: string, minIdleTime: number = 60000): Promise<any[]> {
    const pending = await this.getPendingMessages(consumerName);
    if (!pending || (Array.isArray(pending) && pending.length === 0)) return [];

    if (!Array.isArray(pending)) return [];
    
    const messageIds = pending.map((p: any) => p.messageId);
    if (messageIds.length === 0) return [];
    
    return await this.client.xClaim(
      this.streamName,
      this.consumerGroup,
      consumerName,
      minIdleTime,
      messageIds
    );
  }

  async retryTask(event: TaskEvent, error?: string): Promise<string | null> {
    const currentRetryCount = event.retryCount || 0;
    const maxRetries = event.maxRetries || 3;

    if (currentRetryCount >= maxRetries) {
      await this.client.publish(`task:events`, JSON.stringify({
        action: 'task_failed_permanently',
        taskId: event.taskId,
        type: event.type,
        retryCount: currentRetryCount,
        error
      }));
      return null;
    }

    const retryEvent: TaskEvent = {
      ...event,
      retryCount: currentRetryCount + 1,
      timestamp: Date.now() + this.getRetryDelay(currentRetryCount + 1),
      data: { ...event.data, previousError: error }
    };

    await this.client.publish(`task:events`, JSON.stringify({
      action: 'task_retry_scheduled',
      taskId: event.taskId,
      type: event.type,
      retryCount: retryEvent.retryCount,
      error
    }));

    return await this.addTask(retryEvent);
  }

  private getRetryDelay(retryCount: number): number {
    const baseDelay = 1000;
    const maxDelay = 60000;
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, retryCount - 1), maxDelay);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return exponentialDelay + jitter;
  }

  async getQueueStats(): Promise<QueueStats> {
    const info = await this.client.xInfoStream(this.streamName);
    const groups = await this.client.xInfoGroups(this.streamName);
    
    let totalPending = 0;
    const consumerInfo: { [consumer: string]: number } = {};
    
    for (const group of groups) {
      if (group.name === this.consumerGroup) {
        const consumers = await this.client.xInfoConsumers(this.streamName, this.consumerGroup);
        for (const consumer of consumers) {
          consumerInfo[consumer.name] = consumer.pending;
          totalPending += consumer.pending;
        }
        break;
      }
    }

    return {
      streamLength: info.length,
      totalPending,
      consumers: consumerInfo
    };
  }
}

export interface QueueStats {
  streamLength: number;
  totalPending: number;
  consumers: { [consumer: string]: number };
}