import { VercelRequest, VercelResponse } from "@vercel/node";
import { EnhancedTaskService } from "../src/services/enhancedTaskService";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed",
      message: "Only POST method is allowed",
    });
  }

  try {
    console.log("Creating test enhanced task...");

    const enhancedTaskService = new EnhancedTaskService();

    // Create a test task with the new enhanced architecture
    const taskId = await enhancedTaskService.createTranslationTask(
      {
        text: "This is a test article for the new webhook-driven task processing architecture. It demonstrates concurrent language processing with iterative review loops.",
        title: "Enhanced Architecture Test",
        metadata: {
          source: "test",
          category: "technical",
        },
      },
      {
        tone: "professional",
        targetAudience: "technical",
        style: "formal",
        requirements: [
          "Maintain technical accuracy",
          "Use appropriate terminology",
          "Ensure cultural sensitivity",
        ],
      },
      ["es", "fr", "de"], // Test with 3 languages
      "financialtimes",
      false, // useFullMarkdown
      3, // maxReviewIterations
      4.2 // confidenceThreshold - set lower to trigger human review
    );

    console.log(`Test enhanced task created: ${taskId}`);

    // Wait a moment for the initial webhooks to process
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get the task to show current status
    const task = await enhancedTaskService.getTask(taskId);

    res.status(201).json({
      success: true,
      message: "Enhanced test task created successfully",
      taskId,
      webhookArchitecture: "enabled",
      processing: {
        concurrent: true,
        languages: ["es", "fr", "de"],
        maxIterations: 3,
        confidenceThreshold: 4.2,
      },
      currentStatus: {
        mainTask: task?.status,
        languageSubTasks: task
          ? Object.entries(task.languageSubTasks).map(([lang, subTask]) => ({
              language: lang,
              status: subTask.status,
              currentIteration: subTask.currentIteration,
            }))
          : [],
      },
      webhookFlow: [
        "1. task.created → spawns language_subtask.created for each language",
        "2. language_subtask.created → triggers subtask.translation.started",
        "3. subtask.translation.started → performs translation → subtask.translation.completed",
        "4. subtask.translation.completed → triggers subtask.llm_verification.started",
        "5. subtask.llm_verification.started → performs verification → subtask.llm_verification.completed",
        "6. If score < threshold: marks as review_ready → batches → creates Prolific study",
        "7. If score ≥ threshold: triggers subtask.finalized",
        "8. When all languages finalized: triggers task.completed",
      ],
      monitoringEndpoints: [
        `GET /api/tasks/enhanced/${taskId} - View detailed task status`,
        "GET /api/tasks/enhanced - List all enhanced tasks",
        "GET /api/tasks/enhanced?status=processing - Filter by status",
      ],
    });
  } catch (error) {
    console.error("Error creating test enhanced task:", error);

    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to create enhanced test task",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
