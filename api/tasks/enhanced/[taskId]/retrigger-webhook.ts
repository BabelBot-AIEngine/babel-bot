import { VercelRequest, VercelResponse } from "@vercel/node";
import { EnhancedTaskService } from "../../../../src/services/enhancedTaskService";
import { WebhookSender } from "../../../../src/services/webhookSender";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { taskId } = req.query;

  if (!taskId || typeof taskId !== "string") {
    return res.status(400).json({
      error: "Bad Request",
      message: "taskId is required and must be a string",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed",
      message: "Only POST method is allowed",
    });
  }

  try {
    const enhancedTaskService = new EnhancedTaskService();
    const task = await enhancedTaskService.getTask(taskId);

    if (!task) {
      return res.status(404).json({
        error: "Not Found",
        message: `Enhanced task ${taskId} not found`,
      });
    }

    // Check if task is completed
    if (task.status === "completed") {
      return res.status(400).json({
        error: "Bad Request",
        message: "Cannot retrigger webhook for completed task",
      });
    }

    // Check if there are any webhook delivery logs
    if (!task.webhookDeliveryLog || task.webhookDeliveryLog.length === 0) {
      return res.status(400).json({
        error: "Bad Request",
        message: "No previous webhook attempts found to retrigger",
      });
    }

    // Get the last webhook attempt
    const lastWebhook =
      task.webhookDeliveryLog[task.webhookDeliveryLog.length - 1];

    // Check 10-minute cooldown
    const lastAttemptTime = new Date(
      lastWebhook.lastAttemptAt || lastWebhook.createdAt
    ).getTime();
    const timeSinceLastAttempt = Date.now() - lastAttemptTime;
    const cooldownPeriod = 10 * 60 * 1000; // 10 minutes in milliseconds

    if (timeSinceLastAttempt < cooldownPeriod) {
      const remainingCooldown = Math.ceil(
        (cooldownPeriod - timeSinceLastAttempt) / 60000
      );
      return res.status(429).json({
        error: "Too Many Requests",
        message: `Webhook retrigger is on cooldown. Please wait ${remainingCooldown} more minutes.`,
        remainingCooldownMinutes: remainingCooldown,
      });
    }

    // Determine the webhook URL - check if we have a custom webhook URL or use default
    const webhookUrl =
      process.env.WEBHOOK_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}/api/webhooks`
        : `${process.env.BASE_URL || "http://localhost:3000"}/api/webhooks`);

    // Determine the most appropriate event to retrigger based on task state
    let eventType = "task.status.changed";
    let eventData: any = {
      status: task.status,
      destinationLanguages: task.destinationLanguages,
      progress: calculateTaskProgress(task),
    };

    // If there are active language sub-tasks, retrigger based on their state
    const activeSubTasks = Object.entries(task.languageSubTasks).filter(
      ([_, subTask]) => !["finalized", "failed"].includes(subTask.status)
    );

    if (activeSubTasks.length > 0) {
      const [language, subTask] = activeSubTasks[0];

      if (
        subTask.status === "review_ready" ||
        subTask.status === "review_queued"
      ) {
        eventType = "review_batch.created";
        eventData = {
          batchId: `retrigger_${Date.now()}`,
          readyLanguages: [language],
          status: "ready",
          iterationNumbers: { [language]: subTask.currentIteration },
        };
      } else if (
        subTask.status === "llm_verifying" ||
        subTask.status === "llm_reverifying"
      ) {
        eventType = "subtask.llm_verification.started";
        eventData = {
          language,
          status: subTask.status,
          currentIteration: subTask.currentIteration,
          verificationType:
            subTask.status === "llm_reverifying" ? "post_human" : "initial",
        };
      } else if (subTask.status === "translating") {
        eventType = "subtask.translation.started";
        eventData = {
          language,
          status: subTask.status,
          currentIteration: subTask.currentIteration,
        };
      }
    }

    // Send the webhook using the webhook secret from environment
    const webhookSecret = process.env.BABEL_WEBHOOK_SECRET || "default-secret";

    await WebhookSender.sendBabelWebhook(
      webhookUrl,
      {
        event: eventType,
        taskId: task.id,
        data: eventData,
      },
      webhookSecret
    );

    res.status(200).json({
      success: true,
      message: "Webhook retriggered successfully",
      webhook: {
        eventType,
        url: webhookUrl,
        taskId: task.id,
        retriggeredAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(`Error retriggering webhook for task ${taskId}:`, error);

    res.status(500).json({
      error: "Internal Server Error",
      message: `Failed to retrigger webhook for task ${taskId}`,
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// Helper function to calculate task progress
function calculateTaskProgress(task: any): number {
  const totalLanguages = task.destinationLanguages.length;
  const completedLanguages = Object.values(task.languageSubTasks).filter(
    (subTask: any) => subTask.status === "finalized"
  ).length;

  return Math.round((completedLanguages / totalLanguages) * 100);
}
