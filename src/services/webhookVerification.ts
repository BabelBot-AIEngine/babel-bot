import crypto from 'crypto';
import { WebhookVerificationResult, WebhookSource } from '../types/webhooks';

export class WebhookVerificationService {
  static detectWebhookSource(headers: Record<string, string>): WebhookSource {
    const normalizedHeaders = Object.keys(headers).reduce((acc, key) => {
      acc[key.toLowerCase()] = headers[key];
      return acc;
    }, {} as Record<string, string>);

    if (normalizedHeaders['x-prolific-signature']) {
      return 'prolific';
    } else if (normalizedHeaders['x-babel-request-signature']) {
      return 'babel';
    } else {
      return 'unknown';
    }
  }

  static verifyProlificWebhook(
    payload: string,
    signature: string,
    secret: string
  ): WebhookVerificationResult {
    try {
      if (!payload || !signature || !secret) {
        return {
          isValid: false,
          error: 'Missing required parameters for Prolific webhook verification'
        };
      }

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex');

      const providedSignature = signature.startsWith('sha256=') 
        ? signature.slice(7) 
        : signature;

      // Ensure both signatures have the same length for timingSafeEqual
      if (expectedSignature.length !== providedSignature.length) {
        return {
          isValid: false,
          error: 'Invalid signature'
        };
      }

      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
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

      const timestampMs = parseInt(timestamp, 10);
      const currentTime = Date.now();
      const timeDiff = Math.abs(currentTime - timestampMs);
      const maxAge = 5 * 60 * 1000; // 5 minutes

      if (timeDiff > maxAge) {
        return {
          isValid: false,
          error: 'Timestamp too old - request rejected'
        };
      }

      const signedPayload = `${timestamp}.${payload}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload, 'utf8')
        .digest('hex');

      const providedSignature = signature.includes('=') 
        ? signature.split('=')[1] 
        : signature;

      // Ensure both signatures have the same length for timingSafeEqual
      if (expectedSignature.length !== providedSignature.length) {
        return {
          isValid: false,
          error: 'Invalid signature'
        };
      }

      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
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
    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload, 'utf8')
      .digest('hex');
    return `sha256=${signature}`;
  }
}