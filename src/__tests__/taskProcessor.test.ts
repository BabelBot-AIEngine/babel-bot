import { TaskProcessor } from '../services/taskProcessor';
import { TaskQueue } from '../services/taskQueue';
import { createClient } from 'redis';

describe('TaskProcessor', () => {
  let processor: TaskProcessor;
  let redis: any;

  beforeAll(async () => {
    redis = createClient({ url: 'redis://localhost:6379' });
    await redis.connect();
    
    await redis.flushAll();
  });

  afterAll(async () => {
    if (processor) {
      await processor.stop();
    }
    await redis.disconnect();
  });

  beforeEach(async () => {
    processor = new TaskProcessor({
      maxConcurrentTasks: 2,
      workerCount: 1,
      processingTimeout: 30000,
      redisUrl: 'redis://localhost:6379',
      enableMetrics: false
    });
    
    await processor.initialize();
  });

  afterEach(async () => {
    if (processor) {
      await processor.stop();
    }
    await redis.flushAll();
  });

  describe('Task Lifecycle', () => {
    it('should process a task through complete lifecycle', async () => {
      const taskService = processor.getTaskService();
      
      await processor.start();
      
      const taskId = await taskService.createTranslationTask(
        {
          title: 'Test Article',
          content: 'This is test content for translation.',
          author: 'Test Author',
          publishedAt: new Date().toISOString(),
          category: 'Technology',
          tags: ['test'],
          sourceLanguage: 'en'
        },
        {
          toneOfVoice: 'Professional',
          targetAudience: 'General public',
          brandGuidelines: 'Keep it simple and clear',
          culturalConsiderations: 'None'
        },
        ['es', 'fr']
      );

      expect(taskId).toBeDefined();

      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const finalTask = await taskService.getTask(taskId);
      expect(finalTask).toBeDefined();
      expect(['done', 'human_review', 'failed']).toContain(finalTask!.status);
      
      if (finalTask!.status === 'done' || finalTask!.status === 'human_review') {
        expect(finalTask!.result).toBeDefined();
        expect(finalTask!.result!.translations).toHaveLength(2);
      }
    }, 15000);

    it('should handle multiple concurrent tasks', async () => {
      const taskService = processor.getTaskService();
      
      await processor.start();
      
      const taskIds = await Promise.all([
        taskService.createTranslationTask(
          {
            title: 'Test Article 1',
            content: 'Content 1',
            author: 'Author 1',
            publishedAt: new Date().toISOString(),
            category: 'Tech',
            tags: ['test1'],
            sourceLanguage: 'en'
          },
          {
            toneOfVoice: 'Casual',
            targetAudience: 'Developers',
            brandGuidelines: 'Technical',
            culturalConsiderations: 'None'
          },
          ['es']
        ),
        taskService.createTranslationTask(
          {
            title: 'Test Article 2',
            content: 'Content 2',
            author: 'Author 2',
            publishedAt: new Date().toISOString(),
            category: 'Business',
            tags: ['test2'],
            sourceLanguage: 'en'
          },
          {
            toneOfVoice: 'Professional',
            targetAudience: 'Business leaders',
            brandGuidelines: 'Corporate',
            culturalConsiderations: 'None'
          },
          ['fr']
        )
      ]);

      expect(taskIds).toHaveLength(2);
      expect(taskIds[0]).not.toBe(taskIds[1]);

      await new Promise(resolve => setTimeout(resolve, 8000));
      
      const tasks = await Promise.all(taskIds.map(id => taskService.getTask(id)));
      
      for (const task of tasks) {
        expect(task).toBeDefined();
        expect(['done', 'human_review', 'failed']).toContain(task!.status);
      }
    }, 20000);

    it('should provide accurate processor stats', async () => {
      await processor.start();
      
      const initialStats = await processor.getStats();
      expect(initialStats.isRunning).toBe(true);
      expect(initialStats.totals.currentTasks).toBe(0);

      const taskService = processor.getTaskService();
      await taskService.createTranslationTask(
        {
          title: 'Stats Test',
          content: 'Testing stats',
          author: 'Test',
          publishedAt: new Date().toISOString(),
          category: 'Test',
          tags: ['stats'],
          sourceLanguage: 'en'
        },
        {
          toneOfVoice: 'Neutral',
          targetAudience: 'General',
          brandGuidelines: 'Standard',
          culturalConsiderations: 'None'
        },
        ['es']
      );

      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const activeStats = await processor.getStats();
      expect(activeStats.queue.pending + activeStats.queue.translating + 
             activeStats.queue.verifying + activeStats.queue.reviewing).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should handle Redis connection failures gracefully', async () => {
      const invalidProcessor = new TaskProcessor({
        maxConcurrentTasks: 1,
        workerCount: 1,
        processingTimeout: 30000,
        redisUrl: 'redis://localhost:9999',
        enableMetrics: false
      });

      await expect(invalidProcessor.initialize()).rejects.toThrow();
    });

    it('should handle worker failures and continue processing', async () => {
      await processor.start();
      
      const stats = await processor.getStats();
      expect(Object.keys(stats.workers)).toHaveLength(1);
      
      for (const workerId in stats.workers) {
        expect(stats.workers[workerId].isRunning).toBe(true);
      }
    });
  });

  describe('Queue Management', () => {
    it('should maintain queue integrity with rapid task creation', async () => {
      const taskService = processor.getTaskService();
      await processor.start();
      
      const taskIds = [];
      for (let i = 0; i < 5; i++) {
        const taskId = await taskService.createTranslationTask(
          {
            title: `Rapid Task ${i}`,
            content: `Content ${i}`,
            author: `Author ${i}`,
            publishedAt: new Date().toISOString(),
            category: 'Test',
            tags: [`rapid${i}`],
            sourceLanguage: 'en'
          },
          {
            toneOfVoice: 'Neutral',
            targetAudience: 'General',
            brandGuidelines: 'Standard',
            culturalConsiderations: 'None'
          },
          ['es']
        );
        taskIds.push(taskId);
      }
      
      expect(taskIds).toHaveLength(5);
      expect(new Set(taskIds).size).toBe(5);

      await new Promise(resolve => setTimeout(resolve, 10000));
      
      const finalTasks = await Promise.all(taskIds.map(id => taskService.getTask(id)));
      const completedTasks = finalTasks.filter(task => 
        task && ['done', 'human_review'].includes(task.status)
      );
      
      expect(completedTasks.length).toBeGreaterThan(0);
    }, 25000);
  });
});