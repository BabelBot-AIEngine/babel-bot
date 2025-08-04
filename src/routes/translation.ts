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
import { EnhancedTranslationTask, TaskStatus as EnhancedTaskStatus } from "../types/enhanced-task";

const router = Router();
const taskService = new TaskService();
const enhancedTaskService = new EnhancedTaskService();
const translationService = new TranslationService();
const filterService = new FilterService();

// Feature flag for enhanced processing (default: true for new installations)
const USE_ENHANCED_PROCESSING = process.env.USE_ENHANCED_PROCESSING !== 'false';

// Helper functions for enhanced-to-legacy task transformation
const mapEnhancedStatusToLegacy = (enhancedStatus: EnhancedTaskStatus): TranslationTask['status'] => {
  switch (enhancedStatus) {
    case 'pending':
      return 'pending';
    case 'processing':
      return 'translating';
    case 'review_pending':
    case 'review_active':
      return 'human_review';
    case 'finalizing':
      return 'translating'; // Still processing
    case 'completed':
      return 'done';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
};

const createEnhancedResult = (enhancedTask: EnhancedTranslationTask): TranslationResponse | undefined => {
  if (!enhancedTask.languageSubTasks || Object.keys(enhancedTask.languageSubTasks).length === 0) {
    return undefined;
  }

  const translations: TranslationResult[] = [];
  
  Object.entries(enhancedTask.languageSubTasks).forEach(([language, subTask]) => {
    if (subTask.translatedText) {
      // Get the latest iteration's scores
      const latestIteration = subTask.iterations[subTask.iterations.length - 1];
      const complianceScore = latestIteration?.combinedScore || 
                              latestIteration?.llmVerification?.score || 
                              undefined;
      
      // Map enhanced status to legacy status
      let legacyStatus: LanguageTaskStatus;
      switch (subTask.status) {
        case 'pending':
        case 'translating':
          legacyStatus = 'translating';
          break;
        case 'translation_complete':
        case 'llm_verifying':
        case 'llm_verified':
          legacyStatus = 'llm_verification';
          break;
        case 'review_ready':
        case 'review_queued':
        case 'review_active':
        case 'review_complete':
        case 'llm_reverifying':
          legacyStatus = 'human_review';
          break;
        case 'iteration_complete':
        case 'finalized':
          legacyStatus = 'done';
          break;
        case 'failed':
          legacyStatus = 'failed';
          break;
        default:
          legacyStatus = 'pending';
      }
      
      // Find associated Prolific study info
      const prolificStudyId = Object.keys(enhancedTask.prolificStudyMappings)
        .find(studyId => enhancedTask.prolificStudyMappings[studyId].languages.includes(language));
      const batchId = prolificStudyId ? enhancedTask.prolificStudyMappings[prolificStudyId].batchId : undefined;
      
      translations.push({
        language,
        translatedText: subTask.translatedText,
        reviewNotes: latestIteration?.humanReview?.feedback ? [latestIteration.humanReview.feedback] : undefined,
        complianceScore,
        status: legacyStatus,
        batchId,
        studyId: prolificStudyId,
      });
    }
  });
  
  if (translations.length === 0) {
    return undefined;
  }
  
  return {
    originalArticle: enhancedTask.mediaArticle,
    translations,
    processedAt: enhancedTask.updatedAt,
  };
};

const calculateEnhancedProgress = (enhancedTask: EnhancedTranslationTask): number => {
  if (!enhancedTask.languageSubTasks || Object.keys(enhancedTask.languageSubTasks).length === 0) {
    return 0;
  }
  
  const totalLanguages = Object.keys(enhancedTask.languageSubTasks).length;
  let totalProgress = 0;
  
  Object.values(enhancedTask.languageSubTasks).forEach(subTask => {
    // Calculate progress based on status
    switch (subTask.status) {
      case 'pending':
        totalProgress += 0;
        break;
      case 'translating':
        totalProgress += 0.2;
        break;
      case 'translation_complete':
        totalProgress += 0.4;
        break;
      case 'llm_verifying':
      case 'llm_verified':
        totalProgress += 0.5;
        break;
      case 'review_ready':
      case 'review_queued':
        totalProgress += 0.6;
        break;
      case 'review_active':
        totalProgress += 0.7;
        break;
      case 'review_complete':
      case 'llm_reverifying':
        totalProgress += 0.8;
        break;
      case 'iteration_complete':
        totalProgress += 0.9;
        break;
      case 'finalized':
        totalProgress += 1.0;
        break;
      case 'failed':
        totalProgress += 0; // Don't count failed tasks
        break;
      default:
        totalProgress += 0;
    }
  });
  
  return Math.round((totalProgress / totalLanguages) * 100);
};

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

    let taskId: string;
    let processingType: string;
    let pollUrl: string;
    
    if (USE_ENHANCED_PROCESSING) {
      // Use enhanced webhook-driven processing
      taskId = await enhancedTaskService.createTranslationTask(
        mediaArticle,
        editorialGuidelines || {},
        destinationLanguages,
        guide,
        useFullMarkdown,
        3,   // maxReviewIterations - default
        4.5  // confidenceThreshold - default
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
      enhancedFeatures: USE_ENHANCED_PROCESSING ? {
        concurrentLanguages: true,
        iterativeReview: true,
        maxIterations: 3,
        confidenceThreshold: 4.5
      } : undefined
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
    let enhancedTask = await enhancedTaskService.getTask(taskId);
    let legacyTask: TranslationTask | null = null;
    let isEnhanced = true;
    
    if (!enhancedTask) {
      legacyTask = await taskService.getTask(taskId);
      isEnhanced = false;
    }

    if (!enhancedTask && !legacyTask) {
      return res.status(404).json({
        error: "Task not found",
      });
    }

    // Transform enhanced task to legacy format for UI compatibility
    if (isEnhanced && enhancedTask) {
      const legacyCompatibleTask: TranslationTask = {
        id: enhancedTask.id,
        status: mapEnhancedStatusToLegacy(enhancedTask.status),
        mediaArticle: enhancedTask.mediaArticle,
        editorialGuidelines: enhancedTask.editorialGuidelines,
        destinationLanguages: enhancedTask.destinationLanguages,
        result: enhancedTask.result || createEnhancedResult(enhancedTask),
        error: enhancedTask.error,
        createdAt: enhancedTask.createdAt,
        updatedAt: enhancedTask.updatedAt,
        progress: calculateEnhancedProgress(enhancedTask),
        guide: enhancedTask.guide as GuideType | undefined,
        humanReviewBatches: enhancedTask.humanReviewBatches || [],
        useFullMarkdown: enhancedTask.useFullMarkdown,
      };
      
      const response: TaskStatusResponse = { task: legacyCompatibleTask };
      res.json(response);
    } else if (legacyTask) {
      const response: TaskStatusResponse = { task: legacyTask };
      res.json(response);
    }
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
      // Get enhanced tasks and filter by equivalent status
      const allEnhancedTasks = await enhancedTaskService.getAllTasks();
      enhancedTasks = allEnhancedTasks.filter(task => 
        mapEnhancedStatusToLegacy(task.status) === status
      );
    } else {
      legacyTasks = await taskService.getAllTasks();
      enhancedTasks = await enhancedTaskService.getAllTasks();
    }

    // Convert enhanced tasks to legacy format
    const convertedEnhancedTasks: TranslationTask[] = enhancedTasks.map(enhancedTask => ({
      id: enhancedTask.id,
      status: mapEnhancedStatusToLegacy(enhancedTask.status),
      mediaArticle: enhancedTask.mediaArticle,
      editorialGuidelines: enhancedTask.editorialGuidelines,
      destinationLanguages: enhancedTask.destinationLanguages,
      result: enhancedTask.result || createEnhancedResult(enhancedTask),
      error: enhancedTask.error,
      createdAt: enhancedTask.createdAt,
      updatedAt: enhancedTask.updatedAt,
      progress: calculateEnhancedProgress(enhancedTask),
      guide: enhancedTask.guide as GuideType | undefined,
      humanReviewBatches: enhancedTask.humanReviewBatches || [],
      useFullMarkdown: enhancedTask.useFullMarkdown,
    }));

    // Combine and sort by creation date (newest first)
    const allTasks = [...legacyTasks, ...convertedEnhancedTasks]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const response: TaskListResponse = { tasks: allTasks };
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
