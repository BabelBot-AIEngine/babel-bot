import { Router, Request, Response } from "express";
import { TaskService } from "../services/taskService";
import { TranslationService } from "../services/translationService";
import { FilterService } from "../services/filterService";
import { TaskProcessor } from "../services/taskProcessor";
import {
  TranslationRequest,
  TaskStatusResponse,
  TaskListResponse,
  FilterRecommendationRequest,
} from "../types";

const router = Router();
const translationService = new TranslationService();
const filterService = new FilterService();

function getTaskService(req: Request): TaskService {
  const taskProcessor: TaskProcessor | undefined = req.app.locals.taskProcessor;
  if (taskProcessor) {
    return taskProcessor.getTaskService();
  }
  
  if (!req.app.locals.taskService) {
    req.app.locals.taskService = new TaskService();
  }
  return req.app.locals.taskService;
}

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

    const taskService = getTaskService(req);
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
    const taskService = getTaskService(req);
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
    const taskService = getTaskService(req);

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

// Filter endpoints
router.get("/filters", async (req: Request, res: Response) => {
  try {
    const filters = await filterService.fetchAvailableFilters();
    res.json({
      filters,
      count: filters.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching filters:", error);
    res.status(500).json({
      error: "Failed to fetch available filters",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post("/filters/recommendations", async (req: Request, res: Response) => {
  try {
    const {
      article,
      targetLanguages,
      evaluationContext,
    }: FilterRecommendationRequest = req.body;

    // Validate required fields
    if (!article || !article.text) {
      return res.status(400).json({
        error: "Article with text is required",
      });
    }

    if (!targetLanguages || targetLanguages.length === 0) {
      return res.status(400).json({
        error: "At least one target language is required",
      });
    }

    // Validate target languages are strings
    if (!targetLanguages.every((lang) => typeof lang === "string")) {
      return res.status(400).json({
        error: "All target languages must be strings",
      });
    }

    // Validate evaluation context if provided
    if (evaluationContext) {
      const validTaskTypes = [
        "translation_quality",
        "cultural_adaptation",
        "technical_accuracy",
        "general_evaluation",
      ];
      const validExpertiseLevels = ["beginner", "intermediate", "expert"];

      if (
        evaluationContext.taskType &&
        !validTaskTypes.includes(evaluationContext.taskType)
      ) {
        return res.status(400).json({
          error: `Invalid taskType. Must be one of: ${validTaskTypes.join(
            ", "
          )}`,
        });
      }

      if (
        evaluationContext.expertiseLevel &&
        !validExpertiseLevels.includes(evaluationContext.expertiseLevel)
      ) {
        return res.status(400).json({
          error: `Invalid expertiseLevel. Must be one of: ${validExpertiseLevels.join(
            ", "
          )}`,
        });
      }
    }

    const recommendations = await filterService.getFilterRecommendations({
      article,
      targetLanguages,
      evaluationContext,
    });

    res.json({
      ...recommendations,
      timestamp: new Date().toISOString(),
      requestInfo: {
        articleTitle: article.title || "Untitled",
        articleLength: article.text.length,
        targetLanguages,
        evaluationContext: evaluationContext || null,
      },
    });
  } catch (error) {
    console.error("Error getting filter recommendations:", error);
    res.status(500).json({
      error: "Failed to get filter recommendations",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Test endpoint with sample data
router.post("/filters/test", async (req: Request, res: Response) => {
  try {
    const sampleRequest: FilterRecommendationRequest = {
      article: {
        title: "Financial Technology Innovations",
        text: "The fintech industry has revolutionized banking and financial services through innovative digital solutions. Mobile banking apps, cryptocurrency platforms, and robo-advisors have transformed how consumers interact with financial institutions. These technologies have made financial services more accessible, efficient, and user-friendly than ever before.",
        metadata: {
          category: "finance",
          complexity: "intermediate",
          region: "global",
        },
      },
      targetLanguages: ["Spanish", "French", "German"],
      evaluationContext: {
        taskType: "technical_accuracy",
        expertiseLevel: "intermediate",
        domainSpecific: true,
      },
    };

    // Allow override with request body if provided
    const requestData =
      Object.keys(req.body).length > 0 ? req.body : sampleRequest;

    const recommendations = await filterService.getFilterRecommendations(
      requestData
    );

    res.json({
      ...recommendations,
      timestamp: new Date().toISOString(),
      testMode: true,
      sampleData: Object.keys(req.body).length === 0,
      requestInfo: {
        articleTitle: requestData.article.title || "Untitled",
        articleLength: requestData.article.text.length,
        targetLanguages: requestData.targetLanguages,
        evaluationContext: requestData.evaluationContext || null,
      },
    });
  } catch (error) {
    console.error("Error in filter test endpoint:", error);
    res.status(500).json({
      error: "Filter test failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
