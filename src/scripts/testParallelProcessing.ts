import { TaskProcessor } from '../services/taskProcessor';

async function testParallelProcessing() {
  console.log('🚀 Starting parallel processing test...');
  
  const processor = new TaskProcessor({
    maxConcurrentTasks: 3,
    workerCount: 4,
    processingTimeout: 300000,
    redisUrl: 'redis://localhost:6379',
    enableMetrics: true
  });

  try {
    await processor.initialize();
    await processor.start();
    
    const taskService = processor.getTaskService();
    console.log('✅ Task processor initialized and started');

    const testTasks = [
      {
        title: 'Breaking News: AI Revolution',
        content: 'Artificial Intelligence is transforming industries at an unprecedented pace...',
        languages: ['es', 'fr', 'de']
      },
      {
        title: 'Climate Change Solutions',
        content: 'Scientists around the world are developing innovative solutions to combat climate change...',
        languages: ['pt', 'it', 'nl']
      },
      {
        title: 'Technology Trends 2025',
        content: 'The year 2025 promises exciting developments in quantum computing, blockchain, and IoT...',
        languages: ['ja', 'ko', 'zh']
      },
      {
        title: 'Global Economic Outlook',
        content: 'Economic analysts predict significant changes in global markets due to emerging technologies...',
        languages: ['ru', 'ar', 'hi']
      },
      {
        title: 'Healthcare Innovation',
        content: 'Medical breakthroughs in gene therapy and personalized medicine are changing patient care...',
        languages: ['sv', 'da', 'no']
      }
    ];

    console.log(`📝 Creating ${testTasks.length} translation tasks...`);
    const startTime = Date.now();
    
    const taskIds = await Promise.all(
      testTasks.map(task => 
        taskService.createTranslationTask(
          {
            text: task.content,
            title: task.title,
            metadata: {
              author: 'Test Author',
              publishedAt: new Date().toISOString(),
              category: 'Test',
              tags: ['parallel-test'],
              sourceLanguage: 'en'
            }
          },
          {
            tone: 'Professional',
            targetAudience: 'General public',
            style: 'Clear and engaging',
            requirements: ['Be culturally sensitive']
          },
          task.languages
        )
      )
    );

    console.log(`✅ Created ${taskIds.length} tasks in ${Date.now() - startTime}ms`);
    console.log('📊 Task IDs:', taskIds);

    let completedTasks = 0;
    let lastStats = await processor.getStats();
    
    console.log('\n🔄 Monitoring task processing...');
    console.log('Initial stats:', JSON.stringify(lastStats, null, 2));

    const monitoringInterval = setInterval(async () => {
      try {
        const stats = await processor.getStats();
        const tasks = await Promise.all(taskIds.map(id => taskService.getTask(id)));
        const completed = tasks.filter(task => 
          task && ['done', 'human_review', 'failed'].includes(task.status)
        ).length;

        if (completed !== completedTasks) {
          completedTasks = completed;
          console.log(`\n📈 Progress Update (${new Date().toLocaleTimeString()}):`);
          console.log(`   Completed: ${completed}/${taskIds.length}`);
          console.log(`   Active workers: ${Object.keys(stats.workers).length}`);
          console.log(`   Queue status: Pending=${stats.queue.pending}, Processing=${stats.queue.translating + stats.queue.verifying + stats.queue.reviewing}`);
          console.log(`   Total processed: ${stats.totals.processed}, Failed: ${stats.totals.failed}`);
        }

        if (completed === taskIds.length) {
          clearInterval(monitoringInterval);
          
          const processingTime = Date.now() - startTime;
          console.log(`\n🎉 All tasks completed in ${processingTime}ms (${(processingTime/1000).toFixed(2)}s)`);
          
          console.log('\n📋 Final Results:');
          for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            if (task) {
              console.log(`   Task ${i + 1}: ${task.status.toUpperCase()} (${task.progress}%)`);
              if (task.result) {
                console.log(`     Languages: ${task.result.translations.map((t: any) => `${t.language}:${t.status}`).join(', ')}`);
              }
            }
          }

          const finalStats = await processor.getStats();
          console.log('\n📊 Final Statistics:');
          console.log(`   Total tasks processed: ${finalStats.totals.processed}`);
          console.log(`   Total failures: ${finalStats.totals.failed}`);
          console.log(`   Average processing time: ${(processingTime/taskIds.length).toFixed(2)}ms per task`);
          
          await processor.stop();
          console.log('\n✅ Test completed successfully!');
          process.exit(0);
        }
      } catch (error) {
        console.error('❌ Error during monitoring:', error);
      }
    }, 2000);

    setTimeout(async () => {
      console.log('\n⏰ Test timeout reached');
      clearInterval(monitoringInterval);
      await processor.stop();
      process.exit(1);
    }, 120000);

  } catch (error) {
    console.error('❌ Test failed:', error);
    await processor.stop();
    process.exit(1);
  }
}

testParallelProcessing().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});