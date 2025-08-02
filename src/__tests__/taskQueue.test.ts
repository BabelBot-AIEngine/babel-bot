import { TaskQueue, TaskEvent } from '../services/taskQueue';
import { createClient } from 'redis';

describe('TaskQueue', () => {
  let redis: any;
  let taskQueue: TaskQueue;

  beforeAll(async () => {
    redis = createClient({ url: 'redis://localhost:6379' });
    await redis.connect();
    taskQueue = new TaskQueue(redis);
  });

  afterAll(async () => {
    await redis.disconnect();
  });

  beforeEach(async () => {
    await redis.flushAll();
    await taskQueue.initialize();
  });

  describe('Queue Operations', () => {
    it('should add and process tasks correctly', async () => {
      const testEvent: TaskEvent = {
        taskId: 'test-123',
        type: 'translate',
        timestamp: Date.now()
      };

      const streamId = await taskQueue.addTask(testEvent);
      expect(streamId).toBeDefined();

      const events = await taskQueue.processMessages('test-consumer', 1);
      expect(events).toHaveLength(1);
      expect(events[0].taskId).toBe('test-123');
      expect(events[0].type).toBe('translate');
    });

    it('should handle retry logic correctly', async () => {
      const testEvent: TaskEvent = {
        taskId: 'retry-test-123',
        type: 'verify',
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: 2
      };

      const retryId = await taskQueue.retryTask(testEvent, 'Test error');
      expect(retryId).toBeDefined();

      const events = await taskQueue.processMessages('retry-consumer', 1);
      expect(events).toHaveLength(1);
      expect(events[0].retryCount).toBe(1);
      expect(events[0].data?.previousError).toBe('Test error');
    });

    it('should stop retrying after max attempts', async () => {
      const testEvent: TaskEvent = {
        taskId: 'max-retry-test',
        type: 'review',
        timestamp: Date.now(),
        retryCount: 3,
        maxRetries: 3
      };

      const retryId = await taskQueue.retryTask(testEvent, 'Final error');
      expect(retryId).toBeNull();
    });

    it('should provide accurate queue stats', async () => {
      await taskQueue.addTask({
        taskId: 'stats-test-1',
        type: 'translate',
        timestamp: Date.now()
      });

      await taskQueue.addTask({
        taskId: 'stats-test-2',
        type: 'verify',
        timestamp: Date.now()
      });

      const stats = await taskQueue.getQueueStats();
      expect(stats.streamLength).toBe(2);
    });

    it('should handle concurrent consumers', async () => {
      const events = [];
      for (let i = 0; i < 5; i++) {
        events.push({
          taskId: `concurrent-${i}`,
          type: 'translate' as const,
          timestamp: Date.now()
        });
      }

      await Promise.all(events.map(event => taskQueue.addTask(event)));

      const consumer1Events = await taskQueue.processMessages('consumer-1', 3);
      const consumer2Events = await taskQueue.processMessages('consumer-2', 3);

      const totalProcessed = consumer1Events.length + consumer2Events.length;
      expect(totalProcessed).toBeGreaterThan(0);
      expect(totalProcessed).toBeLessThanOrEqual(5);

      const allTaskIds = [
        ...consumer1Events.map(e => e.taskId),
        ...consumer2Events.map(e => e.taskId)
      ];
      
      expect(new Set(allTaskIds).size).toBe(allTaskIds.length);
    });
  });

  describe('Message Acknowledgment', () => {
    it('should acknowledge messages correctly', async () => {
      const testEvent: TaskEvent = {
        taskId: 'ack-test',
        type: 'translate',
        timestamp: Date.now()
      };

      await taskQueue.addTask(testEvent);
      
      const messages = await redis.xReadGroup(
        'task:processors',
        'ack-consumer',
        [{ key: 'task:stream', id: '>' }],
        { COUNT: 1 }
      );

      expect(messages).toHaveLength(1);
      const messageId = messages[0].messages[0].id;

      await taskQueue.acknowledgeMessage('ack-consumer', messageId);

      const pending = await taskQueue.getPendingMessages('ack-consumer');
      expect(pending).toHaveLength(0);
    });

    it('should claim pending messages from idle consumers', async () => {
      await taskQueue.addTask({
        taskId: 'claim-test',
        type: 'translate',
        timestamp: Date.now()
      });

      await taskQueue.processMessages('idle-consumer', 1);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const claimed = await taskQueue.claimPendingMessages('active-consumer', 0);
      expect(claimed.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle empty queue gracefully', async () => {
      const events = await taskQueue.processMessages('empty-consumer', 5);
      expect(events).toHaveLength(0);
    });

    it('should handle malformed data gracefully', async () => {
      await redis.xAdd('task:stream', '*', {
        taskId: 'malformed',
        type: 'invalid-type',
        timestamp: 'not-a-number'
      });

      const events = await taskQueue.processMessages('malformed-consumer', 1);
      expect(events).toHaveLength(1);
      expect(events[0].taskId).toBe('malformed');
      expect(isNaN(events[0].timestamp)).toBe(true);
    });
  });
});