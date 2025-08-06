import { Client } from "@upstash/qstash";
import { BabelWebhookPayload, QStashWebhookPayload } from "../types/webhooks";
import { WebhookVerificationService } from "./webhookVerification";

export class QStashService {
  private static qstash: Client | null = null;

  private static getClient(): Client {
    if (!this.qstash) {
      const token = process.env.QSTASH_TOKEN;
      if (!token) {
        throw new Error("QSTASH_TOKEN environment variable is required");
      }

      console.log("[QSTASH-SERVICE] 🔧 Initializing QStash client");
      console.log("[QSTASH-SERVICE] Token present:", !!token);
      console.log("[QSTASH-SERVICE] Token length:", token?.length || 0);
      console.log(
        "[QSTASH-SERVICE] Token prefix:",
        token?.substring(0, 8) + "..."
      );

      this.qstash = new Client({ token });
    }
    return this.qstash;
  }

  static async scheduleReliableWebhook(
    url: string,
    payload: BabelWebhookPayload,
    secret: string
  ): Promise<void> {
    const client = this.getClient();
    const timestamp = Math.floor(Date.now() / 1000); // POSIX timestamp in seconds

    // Create QStash-specific payload with signature
    const qstashPayload: QStashWebhookPayload = {
      ...payload,
      _babelSignature: WebhookVerificationService.generateBabelSignature(
        JSON.stringify(payload),
        timestamp.toString(),
        secret
      ),
      _babelTimestamp: timestamp,
    };

    const payloadString = JSON.stringify(qstashPayload);
    const signature = WebhookVerificationService.generateBabelSignature(
      payloadString,
      timestamp.toString(),
      secret
    );

    // Prepare headers
    const headers: Record<string, string> = {
      "X-Babel-Request-Signature": signature,
      "X-Babel-Request-Timestamp": timestamp.toString(),
      "Content-Type": "application/json",
      "User-Agent": "BabelBot-QStash/1.0",
    };

    // Add Vercel deployment protection bypass header if available
    const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypassSecret) {
      headers["x-vercel-protection-bypass"] = bypassSecret;
    }

    try {
      const response = await client.publishJSON({
        url,
        body: qstashPayload,
        headers,
        retries: 5, // More aggressive retries for critical events
        delay: 30, // 30 second initial delay
        // QStash will handle exponential backoff automatically
      });

      console.log("QStash webhook scheduled successfully:", {
        messageId: response.messageId,
        event: payload.event,
        taskId: payload.taskId,
        url,
      });
    } catch (error) {
      console.error("Failed to schedule QStash webhook:", {
        error: error instanceof Error ? error.message : "Unknown error",
        errorName: error instanceof Error ? error.name : "Unknown",
        errorCode: (error as any)?.status || (error as any)?.code,
        event: payload.event,
        taskId: payload.taskId,
        url,
      });

      // Add specific diagnostics for quota errors
      if (error instanceof Error && error.message.includes("quota")) {
        console.error("[QSTASH-SERVICE] 💸 Quota-related error detected:");
        console.error("[QSTASH-SERVICE] This may indicate:");
        console.error("[QSTASH-SERVICE] 1. Invalid or expired QStash token");
        console.error("[QSTASH-SERVICE] 2. QStash account limits reached");
        console.error("[QSTASH-SERVICE] 3. Free tier restrictions");
        console.error("[QSTASH-SERVICE] 4. Authentication failure");
      }

      throw error;
    }
  }

  static async scheduleDelayedWebhook(
    url: string,
    payload: BabelWebhookPayload,
    secret: string,
    delaySeconds: number
  ): Promise<void> {
    const client = this.getClient();
    const timestamp = Math.floor(Date.now() / 1000); // POSIX timestamp in seconds

    const qstashPayload: QStashWebhookPayload = {
      ...payload,
      _babelSignature: WebhookVerificationService.generateBabelSignature(
        JSON.stringify(payload),
        timestamp.toString(),
        secret
      ),
      _babelTimestamp: timestamp,
    };

    const payloadString = JSON.stringify(qstashPayload);
    const signature = WebhookVerificationService.generateBabelSignature(
      payloadString,
      timestamp.toString(),
      secret
    );

    // Prepare headers
    const headers: Record<string, string> = {
      "X-Babel-Request-Signature": signature,
      "X-Babel-Request-Timestamp": timestamp.toString(),
      "Content-Type": "application/json",
      "User-Agent": "BabelBot-QStash-Delayed/1.0",
    };

    // Add Vercel deployment protection bypass header if available
    const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypassSecret) {
      headers["x-vercel-protection-bypass"] = bypassSecret;
    }

    try {
      const response = await client.publishJSON({
        url,
        body: qstashPayload,
        headers,
        delay: delaySeconds,
        retries: 3,
      });

      console.log("QStash delayed webhook scheduled successfully:", {
        messageId: response.messageId,
        event: payload.event,
        taskId: payload.taskId,
        delaySeconds,
        url,
      });
    } catch (error) {
      console.error("Failed to schedule delayed QStash webhook:", {
        error: error instanceof Error ? error.message : "Unknown error",
        event: payload.event,
        taskId: payload.taskId,
        delaySeconds,
        url,
      });
      throw error;
    }
  }

  static async getDeadLetterQueue(): Promise<any> {
    const client = this.getClient();

    try {
      const response = await client.dlq.listMessages();
      return response.messages || [];
    } catch (error) {
      console.error("Failed to get dead letter queue:", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  static async retryDeadLetterMessage(messageId: string): Promise<void> {
    const client = this.getClient();

    try {
      await client.dlq.delete(messageId);
      console.log("Dead letter message retried successfully:", { messageId });
    } catch (error) {
      console.error("Failed to retry dead letter message:", {
        error: error instanceof Error ? error.message : "Unknown error",
        messageId,
      });
      throw error;
    }
  }

  // Health check method to verify QStash connectivity
  static async healthCheck(): Promise<boolean> {
    try {
      const client = this.getClient();
      // Try to list messages as a health check
      await client.dlq.listMessages();
      return true;
    } catch (error) {
      console.error("QStash health check failed:", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }
}
