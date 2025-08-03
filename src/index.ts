import express from "express";
import cors from "cors";
import helmet from "helmet";
import "@dotenvx/dotenvx/config";
import path from "path";
import translationRoutes from "./routes/translation";
import { TaskService } from "./services/taskService";

const app = express();
const PORT = process.env.PORT || 3000;

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

app.use("/api", translationRoutes);

app.use(express.static(path.join(__dirname, "../dist/client")));

app.get("/api", (req, res) => {
  res.json({
    message: "Babel Bot Translation API",
    version: "1.0.0",
    endpoints: {
      translate: "POST /api/translate",
      health: "GET /api/health",
      tasks: "GET /api/tasks",
      task: "GET /api/tasks/:taskId",
      languages: "GET /api/languages",
      filters: "GET /api/filters",
      filterRecommendations: "POST /api/filters/recommendations",
      filterTest: "POST /api/filters/test",
    },
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/client/index.html"));
});

// Initialize services for graceful shutdown
const taskService = new TaskService();

// Graceful shutdown - stop all study polling
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  taskService.stopAllStudyPolling();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  taskService.stopAllStudyPolling();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 API documentation available at http://localhost:${PORT}/api`);
  console.log(`🎨 UI available at http://localhost:${PORT}`);
});
