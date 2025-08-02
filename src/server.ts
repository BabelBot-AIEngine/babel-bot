import express from "express";
import cors from "cors";
import helmet from "helmet";
import "@dotenvx/dotenvx/config";
import path from "path";
import translationRoutes from "./routes/translation";
import { TaskProcessor } from "./services/taskProcessor";

const app = express();
const PORT = process.env.PORT || 3000;
const USE_PARALLEL_PROCESSING = process.env.USE_PARALLEL_PROCESSING === 'true';

let taskProcessor: TaskProcessor | null = null;

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

async function initializeTaskProcessor() {
  if (!USE_PARALLEL_PROCESSING) {
    console.log('📝 Using traditional synchronous task processing');
    return;
  }

  console.log('🔄 Initializing parallel task processor...');
  
  taskProcessor = new TaskProcessor({
    maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS || '3'),
    workerCount: parseInt(process.env.WORKER_COUNT || '2'),
    processingTimeout: parseInt(process.env.PROCESSING_TIMEOUT || '300000'),
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    enableMetrics: process.env.ENABLE_METRICS !== 'false'
  });

  try {
    await taskProcessor.initialize();
    await taskProcessor.start();
    console.log('✅ Parallel task processor started successfully');
    
    app.locals.taskProcessor = taskProcessor;
  } catch (error) {
    console.error('❌ Failed to initialize task processor:', error);
    console.log('📝 Falling back to synchronous processing');
    taskProcessor = null;
  }
}

app.use("/api", translationRoutes);

app.use(express.static(path.join(__dirname, "../dist/client")));

app.get("/api", (req, res) => {
  res.json({
    message: "Babel Bot Translation API",
    version: "1.0.0",
    parallelProcessing: !!taskProcessor,
    endpoints: {
      translate: "POST /api/translate",
      health: "GET /api/health",
      tasks: "GET /api/tasks",
      task: "GET /api/tasks/:taskId",
      stats: "GET /api/stats",
    },
  });
});

app.get("/api/stats", async (req, res) => {
  if (!taskProcessor) {
    return res.json({
      parallelProcessing: false,
      message: "Parallel processing not enabled"
    });
  }

  try {
    const stats = await taskProcessor.getStats();
    res.json({
      parallelProcessing: true,
      ...stats
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to retrieve stats",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/client/index.html"));
});

async function startServer() {
  await initializeTaskProcessor();
  
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📚 API documentation available at http://localhost:${PORT}/api`);
    console.log(`🎨 UI available at http://localhost:${PORT}`);
    console.log(`📊 Stats endpoint: http://localhost:${PORT}/api/stats`);
    if (taskProcessor) {
      console.log('⚡ Parallel processing enabled with Redis Streams');
    }
  });

  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    
    if (taskProcessor) {
      console.log('🔄 Stopping task processor...');
      await taskProcessor.stop();
    }
    
    server.close(() => {
      console.log('✅ Server shut down successfully');
      process.exit(0);
    });
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    
    if (taskProcessor) {
      console.log('🔄 Stopping task processor...');
      await taskProcessor.stop();
    }
    
    server.close(() => {
      console.log('✅ Server shut down successfully');
      process.exit(0);
    });
  });
}

startServer().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});