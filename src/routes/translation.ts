import { Router, Request, Response } from "express";
import { TaskService } from "../services/taskService";
import { EnhancedTaskService } from "../services/enhancedTaskService";
import { TranslationService } from "../services/translationService";
import { FilterService } from "../services/filterService";
import {
  TranslationRequest,
  TaskStatusResponse,
  TaskListResponse,
  FilterRecommendationRequest,
  TranslationTask,
  TranslationResponse,
  TranslationResult,
  LanguageTaskStatus,
  GuideType,
} from "../types";
import {
  EnhancedTranslationTask,
  TaskStatus as EnhancedTaskStatus,
} from "../types/enhanced-task";

const router = Router();
const taskService = new TaskService();
const enhancedTaskService = new EnhancedTaskService();
const translationService = new TranslationService();
const filterService = new FilterService();

// Feature flag for enhanced processing (default: true for new installations)
const USE_ENHANCED_PROCESSING = process.env.USE_ENHANCED_PROCESSING !== "false";

// Helper function for status filtering (enhanced to legacy mapping)
const mapEnhancedStatusToLegacy = (
  enhancedStatus: EnhancedTaskStatus
): TranslationTask["status"] => {
  switch (enhancedStatus) {
    case "pending":
      return "pending";
    case "processing":
      return "translating";
    case "review_pending":
    case "review_active":
      return "human_review";
    case "finalizing":
      return "translating"; // Still processing
    case "completed":
      return "done";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
};

router.post("/translate", async (req: Request, res: Response) => {
  try {
    const {
      mediaArticle,
      editorialGuidelines,
      destinationLanguages,
      guide,
      useFullMarkdown,
      useEnhancedProcessing,
    }: TranslationRequest & { useEnhancedProcessing?: boolean } = req.body;

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

    let taskId: string;
    let processingType: string;
    let pollUrl: string;

    // Use parameter from request, fallback to environment variable, default to enhanced
    const shouldUseEnhanced =
      useEnhancedProcessing !== undefined
        ? useEnhancedProcessing
        : USE_ENHANCED_PROCESSING;

    if (shouldUseEnhanced) {
      // Use enhanced webhook-driven processing
      taskId = await enhancedTaskService.createTranslationTask(
        mediaArticle,
        editorialGuidelines || {},
        destinationLanguages,
        guide,
        useFullMarkdown,
        3, // maxReviewIterations - default
        4.5 // confidenceThreshold - default
      );
      processingType = "enhanced";
      pollUrl = `/api/tasks/${taskId}`;
    } else {
      // Use legacy processing
      taskId = await taskService.createTranslationTask(
        mediaArticle,
        editorialGuidelines || {},
        destinationLanguages,
        guide,
        useFullMarkdown
      );
      processingType = "legacy";
      pollUrl = `/api/tasks/${taskId}`;
    }

    res.json({
      taskId,
      message: `Translation task created successfully (${processingType} processing)`,
      pollUrl,
      processingType,
      enhancedFeatures: shouldUseEnhanced
        ? {
            concurrentLanguages: true,
            iterativeReview: true,
            maxIterations: 3,
            confidenceThreshold: 4.5,
          }
        : undefined,
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

    // Try enhanced task first, then fallback to legacy
    const enhancedTask = await enhancedTaskService.getTask(taskId);
    if (enhancedTask) {
      const taskWithType = { ...enhancedTask, type: "enhanced" as const };
      res.json({ task: taskWithType });
      return;
    }

    const legacyTask = await taskService.getTask(taskId);
    if (legacyTask) {
      const taskWithType = { ...legacyTask, type: "legacy" as const };
      res.json({ task: taskWithType });
      return;
    }

    res.status(404).json({
      error: "Task not found",
    });
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

    // Get both enhanced and legacy tasks
    let legacyTasks: TranslationTask[] = [];
    let enhancedTasks: EnhancedTranslationTask[] = [];

    if (status && typeof status === "string") {
      legacyTasks = await taskService.getTasksByStatus(status as any);
      // For enhanced tasks, we'll need to filter after adding type info since status mapping is complex
      enhancedTasks = await enhancedTaskService.getAllTasks();
    } else {
      legacyTasks = await taskService.getAllTasks();
      enhancedTasks = await enhancedTaskService.getAllTasks();
    }

    // Add type property to each task
    const legacyTasksWithType = legacyTasks.map((task) => ({
      ...task,
      type: "legacy" as const,
    }));
    const enhancedTasksWithType = enhancedTasks.map((task) => ({
      ...task,
      type: "enhanced" as const,
    }));

    // Combine and sort by creation date (newest first)
    const allTasks = [...legacyTasksWithType, ...enhancedTasksWithType].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Filter by status if requested (after combining since enhanced/legacy have different status systems)
    let filteredTasks = allTasks;
    if (status && typeof status === "string") {
      filteredTasks = allTasks.filter((task) => {
        if (task.type === "legacy") {
          return task.status === status;
        } else {
          // For enhanced tasks, map their status to legacy equivalent for filtering
          return mapEnhancedStatusToLegacy(task.status) === status;
        }
      });
    }

    // Cast to any to handle mixed task types
    const response = { tasks: filteredTasks };
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
