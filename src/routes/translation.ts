import { Router, Request, Response } from "express";
import { TaskService } from "../services/taskService";
import { TranslationService } from "../services/translationService";
import {
  TranslationRequest,
  TaskStatusResponse,
  TaskListResponse,
} from "../types";

const router = Router();
const taskService = new TaskService();
const translationService = new TranslationService();

router.post("/translate", async (req: Request, res: Response) => {
  try {
    const {
      mediaArticle,
      editorialGuidelines,
      destinationLanguages,
      guide,
      useFullMarkdown,
    }: TranslationRequest = req.body;

    if (!mediaArticle || !mediaArticle.text) {
      return res.status(400).json({
        error: "Media article with text is required",
      });
    }

    if (!destinationLanguages || destinationLanguages.length === 0) {
      return res.status(400).json({
        error: "At least one destination language is required",
      });
    }

    if (guide && !["financialtimes", "monzo", "prolific"].includes(guide)) {
      return res.status(400).json({
        error:
          "Invalid guide parameter. Must be one of: financialtimes, monzo, prolific",
      });
    }

    const taskId = await taskService.createTranslationTask(
      mediaArticle,
      editorialGuidelines || {},
      destinationLanguages,
      guide,
      useFullMarkdown
    );

    res.json({
      taskId,
      message: "Translation task created successfully",
      pollUrl: `/api/tasks/${taskId}`,
    });
  } catch (error) {
    console.error("Translation error:", error);
    res.status(500).json({
      error: "Internal server error during translation",
    });
  }
});

router.get("/languages", async (req: Request, res: Response) => {
  try {
    const languages = await translationService.getAvailableLanguages();
    res.json({
      languages,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching languages:", error);
    res.status(500).json({
      error: "Failed to fetch available languages",
    });
  }
});

router.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    service: "translation-api",
    timestamp: new Date().toISOString(),
  });
});

router.get("/tasks/:taskId", async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const task = await taskService.getTask(taskId);

    if (!task) {
      return res.status(404).json({
        error: "Task not found",
      });
    }

    const response: TaskStatusResponse = { task };
    res.json(response);
  } catch (error) {
    console.error("Error fetching task:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

router.get("/tasks", async (req: Request, res: Response) => {
  try {
    const { status } = req.query;

    let tasks;
    if (status && typeof status === "string") {
      tasks = await taskService.getTasksByStatus(status as any);
    } else {
      tasks = await taskService.getAllTasks();
    }

    const response: TaskListResponse = { tasks };
    res.json(response);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

router.delete("/tasks", async (req: Request, res: Response) => {
  try {
    const deletedCount = await taskService.deleteAllTasks();
    res.json({
      message: `Successfully deleted ${deletedCount} tasks`,
      deletedCount,
    });
  } catch (error) {
    console.error("Error deleting tasks:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

export default router;
