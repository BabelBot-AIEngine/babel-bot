import express from "express";
import cors from "cors";
import helmet from "helmet";
import "@dotenvx/dotenvx/config";
import path from "path";
import translationRoutes from "./routes/translation";
import { requireAuth } from "./middleware/auth";

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

// Public API info endpoint (no auth required)
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
    note: "All endpoints require authentication with @prolific.com email domain",
  });
});

// Apply authentication middleware to all API routes
app.use("/api", requireAuth, translationRoutes);

app.use(express.static(path.join(__dirname, "../dist/client")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/client/index.html"));
});

// For local development only (not when imported as a module)
if (require.main === module && process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(
      `📚 API documentation available at http://localhost:${PORT}/api`
    );
    console.log(`🎨 UI available at http://localhost:${PORT}`);
  });
}

// Export for Vercel
export default app;
