import crypto from 'crypto';
import { WebhookVerificationResult, WebhookSource } from '../types/webhooks';

export class WebhookVerificationService {
  static detectWebhookSource(headers: Record<string, string>): WebhookSource {
    const normalizedHeaders = Object.keys(headers).reduce((acc, key) => {
      acc[key.toLowerCase()] = headers[key];
      return acc;
    }, {} as Record<string, string>);

    if (normalizedHeaders['x-prolific-request-signature'] && normalizedHeaders['x-prolific-request-timestamp']) {
      return 'prolific';
    } else if (normalizedHeaders['x-babel-request-signature'] && normalizedHeaders['x-babel-request-timestamp']) {
      return 'babel';
    } else {
      return 'unknown';
    }
  }

  static verifyProlificWebhook(
    payload: string,
    signature: string,
    timestamp: string,
    secret: string
  ): WebhookVerificationResult {
    try {
      if (!payload || !signature || !timestamp || !secret) {
        return {
          isValid: false,
          error: 'Missing required parameters for Prolific webhook verification'
        };
      }

      // Validate timestamp (should be POSIX timestamp in seconds, not milliseconds)
      const timestampNum = parseInt(timestamp, 10);
      if (isNaN(timestampNum)) {
        return {
          isValid: false,
          error: 'Invalid timestamp format'
        };
      }

      // Check timestamp age (5 minutes maximum)
      const currentTimestamp = Math.floor(Date.now() / 1000); // Convert to seconds
      const timeDiff = Math.abs(currentTimestamp - timestampNum);
      const maxAge = 5 * 60; // 5 minutes in seconds

      if (timeDiff > maxAge) {
        return {
          isValid: false,
          error: 'Timestamp too old - request rejected'
        };
      }

      // Recreate Prolific's Python signature algorithm in Node.js:
      // calculated_signature = base64.b64encode(
      //     hmac.new(
      //         encoded_secret, str.encode(timestamp + body), hashlib.sha256
      //     ).digest()
      // )
      const signedPayload = timestamp + payload;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload, 'utf8')
        .digest('base64');

      // Check if signatures have the same length before timing-safe comparison
      if (expectedSignature.length !== signature.length) {
        return {
          isValid: false,
          error: 'Invalid signature'
        };
      }

      // Use timing-safe comparison
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signature)
      );

      return {
        isValid,
        error: isValid ? undefined : 'Invalid signature'
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  static verifyBabelWebhook(
    payload: string,
    signature: string,
    timestamp: string,
    secret: string
  ): WebhookVerificationResult {
    try {
      if (!payload || !signature || !timestamp || !secret) {
        return {
          isValid: false,
          error: 'Missing required parameters for Babel webhook verification'
        };
      }

      // Validate timestamp (should be POSIX timestamp in seconds, same as Prolific)
      const timestampNum = parseInt(timestamp, 10);
      if (isNaN(timestampNum)) {
        return {
          isValid: false,
          error: 'Invalid timestamp format'
        };
      }

      // Check timestamp age (5 minutes maximum)
      const currentTimestamp = Math.floor(Date.now() / 1000); // Convert to seconds
      const timeDiff = Math.abs(currentTimestamp - timestampNum);
      const maxAge = 5 * 60; // 5 minutes in seconds

      if (timeDiff > maxAge) {
        return {
          isValid: false,
          error: 'Timestamp too old - request rejected'
        };
      }

      // Use same algorithm as Prolific: timestamp + body, base64 encoded
      const signedPayload = timestamp + payload;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload, 'utf8')
        .digest('base64');

      // Check if signatures have the same length before timing-safe comparison
      if (expectedSignature.length !== signature.length) {
        return {
          isValid: false,
          error: 'Invalid signature'
        };
      }

      // Use timing-safe comparison
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signature)
      );

      return {
        isValid,
        error: isValid ? undefined : 'Invalid signature'
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  static generateBabelSignature(payload: string, timestamp: string, secret: string): string {
    // Use same algorithm as Prolific: timestamp + body, base64 encoded
    const signedPayload = timestamp + payload;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload, 'utf8')
      .digest('base64');
    return signature;
  }

  static generateProlificSignature(payload: string, timestamp: string, secret: string): string {
    // Exact same as Babel since we're using the same algorithm
    return this.generateBabelSignature(payload, timestamp, secret);
  }
}