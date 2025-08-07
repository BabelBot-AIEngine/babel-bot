import { BabelWebhookPayload, WebhookDeliveryOptions } from "../types/webhooks";
import { WebhookVerificationService } from "./webhookVerification";
import { QStashService } from "./qstashService";

export class WebhookSender {
  private static readonly DEFAULT_OPTIONS: Required<WebhookDeliveryOptions> = {
    maxRetries: 3,
    backoffDelays: [1000, 5000, 15000], // 1s, 5s, 15s
    timeout: 30000, // 30 seconds
    skipQStashFallback: false, // Allow QStash fallback by default
  };

  static async sendBabelWebhook(
    url: string,
    payload: Omit<BabelWebhookPayload, "timestamp">,
    secret: string,
    options: WebhookDeliveryOptions = {}
  ): Promise<void> {
    const deliveryMode = (
      process.env.BABEL_WEBHOOK_DELIVERY_MODE || "hybrid"
    ).toLowerCase();
    const finalOptions = { ...this.DEFAULT_OPTIONS, ...options };
    const timestampedPayload: BabelWebhookPayload = {
      ...payload,
      timestamp: Math.floor(Date.now() / 1000), // POSIX timestamp in seconds
    };

    console.log(`Attempting to send webhook to ${url}:`, {
      event: timestampedPayload.event,
      taskId: timestampedPayload.taskId,
    });

    // If delivery mode is forced to qstash, handoff immediately and return
    if (deliveryMode === "qstash") {
      console.log(
        `BABEL_WEBHOOK_DELIVERY_MODE=qstash → handing off webhook directly to QStash`
      );
      await this.handoffToQStash(url, timestampedPayload, secret);
      return;
    }

    // Otherwise try direct HTTP first (hybrid/http)
    for (let attempt = 0; attempt < finalOptions.maxRetries; attempt++) {
      try {
        const success = await this.attemptWebhookDelivery(
          url,
          timestampedPayload,
          secret,
          finalOptions.timeout
        );

        if (success) {
          console.log(
            `Webhook delivered successfully on attempt ${attempt + 1}`
          );
          return;
        }
      } catch (error) {
        console.log(`Webhook attempt ${attempt + 1} failed:`, {
          error: error instanceof Error ? error.message : "Unknown error",
          url,
          taskId: timestampedPayload.taskId,
        });

        if (attempt < finalOptions.maxRetries - 1) {
          const delay =
            finalOptions.backoffDelays[attempt] ||
            finalOptions.backoffDelays[finalOptions.backoffDelays.length - 1];
          console.log(`Waiting ${delay}ms before retry...`);
          await this.delay(delay);
        }
      }
    }

    // All retries failed - check if we should attempt handoff to QStash
    // If explicit http-only, skip qstash fallback entirely
    if (deliveryMode === "http" || finalOptions.skipQStashFallback) {
      console.warn(
        `⚠️ All webhook delivery attempts failed for ${timestampedPayload.event}:${timestampedPayload.taskId}. ` +
          "QStash fallback disabled. Webhook delivery unsuccessful but processing continues."
      );
      return;
    }

    console.log(
      `All webhook delivery attempts failed, attempting handoff to QStash for reliable delivery`
    );

    try {
      await this.handoffToQStash(url, timestampedPayload, secret);
      console.log(
        `✅ Successfully handed off webhook to QStash: ${timestampedPayload.event}`
      );
    } catch (error) {
      console.warn(
        `⚠️ QStash handoff failed for ${timestampedPayload.event}:${timestampedPayload.taskId}. ` +
          "Webhook delivery unsuccessful but processing will continue. " +
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      // Don't re-throw - allow processing to continue
      // The webhook is lost but the main task processing should continue
    }
  }

  private static async attemptWebhookDelivery(
    url: string,
    payload: BabelWebhookPayload,
    secret: string,
    timeout: number
  ): Promise<boolean> {
    const payloadString = JSON.stringify(payload);
    const timestamp = payload.timestamp.toString();
    const signature = WebhookVerificationService.generateBabelSignature(
      payloadString,
      timestamp,
      secret
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Prepare headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Babel-Request-Signature": signature,
      "X-Babel-Request-Timestamp": timestamp,
      "User-Agent": "BabelBot-Webhook/1.0",
    };

    // Add Vercel deployment protection bypass header if available
    const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypassSecret) {
      console.log("Bypassing Vercel protection with secret:", bypassSecret);
      headers["x-vercel-protection-bypass"] = bypassSecret;
    }

    console.log("Headers:", headers);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return true;
      } else if (response.status >= 400 && response.status < 500) {
        // Client errors - don't retry
        console.error(
          `Client error ${response.status}, not retrying:`,
          await response.text()
        );
        return true; // Consider it "delivered" to avoid retries
      } else {
        // Server errors - retry
        console.error(
          `Server error ${response.status}, will retry:`,
          await response.text()
        );
        return false;
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Request timed out");
      }

      throw error;
    }
  }

  private static async handoffToQStash(
    url: string,
    payload: BabelWebhookPayload,
    secret: string
  ): Promise<void> {
    try {
      await QStashService.scheduleReliableWebhook(url, payload, secret);
      console.log(
        "Successfully handed off webhook to QStash for reliable delivery"
      );
    } catch (error) {
      console.error("Failed to handoff webhook to QStash:", error);

      // Check if this is a quota exhaustion error
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      if (
        errorMessage.includes("quota") ||
        errorMessage.includes("maxRetries exceeded")
      ) {
        console.warn(
          `⚠️ QStash quota exhausted for webhook ${payload.event}:${payload.taskId}. ` +
            "This is expected during high traffic. Webhook delivery will be skipped but processing continues."
        );

        // Don't throw - allow processing to continue
        // In production, you might want to implement alternative delivery mechanisms
        return;
      }

      // For other errors, still throw to maintain error visibility
      throw new Error(`Critical webhook delivery failure: ${errorMessage}`);
    }
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Convenience methods for common webhook events
  static async sendTranslationCompleted(
    url: string,
    taskId: string,
    data: any,
    secret: string
  ): Promise<void> {
    await this.sendBabelWebhook(
      url,
      {
        event: "task.translation.completed",
        taskId,
        data,
      },
      secret
    );
  }

  static async sendVerificationCompleted(
    url: string,
    taskId: string,
    data: any,
    secret: string
  ): Promise<void> {
    await this.sendBabelWebhook(
      url,
      {
        event: "task.verification.completed",
        taskId,
        data,
      },
      secret
    );
  }

  static async sendHumanReviewStarted(
    url: string,
    taskId: string,
    data: any,
    secret: string
  ): Promise<void> {
    await this.sendBabelWebhook(
      url,
      {
        event: "task.human_review.started",
        taskId,
        data,
      },
      secret
    );
  }

  static async sendHumanReviewCompleted(
    url: string,
    taskId: string,
    data: any,
    secret: string
  ): Promise<void> {
    await this.sendBabelWebhook(
      url,
      {
        event: "task.human_review.completed",
        taskId,
        data,
      },
      secret
    );
  }

  static async sendStatusChanged(
    url: string,
    taskId: string,
    data: any,
    secret: string
  ): Promise<void> {
    await this.sendBabelWebhook(
      url,
      {
        event: "task.status.changed",
        taskId,
        data,
      },
      secret
    );
  }

  static async sendTaskFailed(
    url: string,
    taskId: string,
    data: any,
    secret: string
  ): Promise<void> {
    await this.sendBabelWebhook(
      url,
      {
        event: "task.failed",
        taskId,
        data,
      },
      secret
    );
  }
}
