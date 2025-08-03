import { BabelWebhookPayload, WebhookDeliveryOptions } from '../types/webhooks';
import { WebhookVerificationService } from './webhookVerification';
import { QStashService } from './qstashService';

export class WebhookSender {
  private static readonly DEFAULT_OPTIONS: Required<WebhookDeliveryOptions> = {
    maxRetries: 3,
    backoffDelays: [1000, 5000, 15000], // 1s, 5s, 15s
    timeout: 30000 // 30 seconds
  };

  static async sendBabelWebhook(
    url: string,
    payload: Omit<BabelWebhookPayload, 'timestamp'>,
    secret: string,
    options: WebhookDeliveryOptions = {}
  ): Promise<void> {
    const finalOptions = { ...this.DEFAULT_OPTIONS, ...options };
    const timestampedPayload: BabelWebhookPayload = {
      ...payload,
      timestamp: Math.floor(Date.now() / 1000) // POSIX timestamp in seconds
    };

    console.log(`Attempting to send webhook to ${url}:`, {
      event: timestampedPayload.event,
      taskId: timestampedPayload.taskId
    });

    for (let attempt = 0; attempt < finalOptions.maxRetries; attempt++) {
      try {
        const success = await this.attemptWebhookDelivery(
          url,
          timestampedPayload,
          secret,
          finalOptions.timeout
        );

        if (success) {
          console.log(`Webhook delivered successfully on attempt ${attempt + 1}`);
          return;
        }
      } catch (error) {
        console.log(`Webhook attempt ${attempt + 1} failed:`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          url,
          taskId: timestampedPayload.taskId
        });

        if (attempt < finalOptions.maxRetries - 1) {
          const delay = finalOptions.backoffDelays[attempt] || finalOptions.backoffDelays[finalOptions.backoffDelays.length - 1];
          console.log(`Waiting ${delay}ms before retry...`);
          await this.delay(delay);
        }
      }
    }

    // All retries failed - handoff to QStash
    console.log(`All webhook delivery attempts failed, handing off to QStash for reliable delivery`);
    await this.handoffToQStash(url, timestampedPayload, secret);
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

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Babel-Request-Signature': signature,
          'X-Babel-Request-Timestamp': timestamp,
          'User-Agent': 'BabelBot-Webhook/1.0'
        },
        body: payloadString,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return true;
      } else if (response.status >= 400 && response.status < 500) {
        // Client errors - don't retry
        console.error(`Client error ${response.status}, not retrying:`, await response.text());
        return true; // Consider it "delivered" to avoid retries
      } else {
        // Server errors - retry
        console.error(`Server error ${response.status}, will retry:`, await response.text());
        return false;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out');
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
      console.log('Successfully handed off webhook to QStash for reliable delivery');
    } catch (error) {
      console.error('Failed to handoff webhook to QStash:', error);
      
      // This is a critical failure - webhook might be lost
      // TODO: Consider implementing a dead letter queue or alert system
      throw new Error(`Critical webhook delivery failure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Convenience methods for common webhook events
  static async sendTranslationCompleted(
    url: string,
    taskId: string,
    data: any,
    secret: string
  ): Promise<void> {
    await this.sendBabelWebhook(url, {
      event: 'task.translation.completed',
      taskId,
      data
    }, secret);
  }

  static async sendVerificationCompleted(
    url: string,
    taskId: string,
    data: any,
    secret: string
  ): Promise<void> {
    await this.sendBabelWebhook(url, {
      event: 'task.verification.completed',
      taskId,
      data
    }, secret);
  }

  static async sendHumanReviewStarted(
    url: string,
    taskId: string,
    data: any,
    secret: string
  ): Promise<void> {
    await this.sendBabelWebhook(url, {
      event: 'task.human_review.started',
      taskId,
      data
    }, secret);
  }

  static async sendHumanReviewCompleted(
    url: string,
    taskId: string,
    data: any,
    secret: string
  ): Promise<void> {
    await this.sendBabelWebhook(url, {
      event: 'task.human_review.completed',
      taskId,
      data
    }, secret);
  }

  static async sendStatusChanged(
    url: string,
    taskId: string,
    data: any,
    secret: string
  ): Promise<void> {
    await this.sendBabelWebhook(url, {
      event: 'task.status.changed',
      taskId,
      data
    }, secret);
  }

  static async sendTaskFailed(
    url: string,
    taskId: string,
    data: any,
    secret: string
  ): Promise<void> {
    await this.sendBabelWebhook(url, {
      event: 'task.failed',
      taskId,
      data
    }, secret);
  }
}