import crypto from 'crypto';
import { WebhookVerificationService } from './webhookVerification';

describe('WebhookVerificationService', () => {
  const testSecret = 'test-secret-key';
  const testPayload = JSON.stringify({ test: 'data', timestamp: Date.now() });

  describe('detectWebhookSource', () => {
    it('should detect Prolific webhooks', () => {
      const headers = { 'X-Prolific-Signature': 'sha256=test' };
      const source = WebhookVerificationService.detectWebhookSource(headers);
      expect(source).toBe('prolific');
    });

    it('should detect Babel webhooks', () => {
      const headers = { 
        'X-Babel-Request-Signature': 'sha256=test',
        'X-Babel-Request-Timestamp': '1234567890'
      };
      const source = WebhookVerificationService.detectWebhookSource(headers);
      expect(source).toBe('babel');
    });

    it('should handle case-insensitive headers', () => {
      const headers = { 'x-prolific-signature': 'sha256=test' };
      const source = WebhookVerificationService.detectWebhookSource(headers);
      expect(source).toBe('prolific');
    });

    it('should return unknown for unrecognized headers', () => {
      const headers = { 'Authorization': 'Bearer test' };
      const source = WebhookVerificationService.detectWebhookSource(headers);
      expect(source).toBe('unknown');
    });
  });

  describe('verifyProlificWebhook', () => {
    it('should verify valid Prolific webhook signature', () => {
      const expectedSignature = crypto
        .createHmac('sha256', testSecret)
        .update(testPayload, 'utf8')
        .digest('hex');

      const result = WebhookVerificationService.verifyProlificWebhook(
        testPayload,
        `sha256=${expectedSignature}`,
        testSecret
      );

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should verify valid signature without sha256 prefix', () => {
      const expectedSignature = crypto
        .createHmac('sha256', testSecret)
        .update(testPayload, 'utf8')
        .digest('hex');

      const result = WebhookVerificationService.verifyProlificWebhook(
        testPayload,
        expectedSignature,
        testSecret
      );

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid signature', () => {
      const result = WebhookVerificationService.verifyProlificWebhook(
        testPayload,
        'invalid-signature',
        testSecret
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should reject missing parameters', () => {
      const result = WebhookVerificationService.verifyProlificWebhook(
        '',
        'signature',
        testSecret
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Missing required parameters');
    });
  });

  describe('verifyBabelWebhook', () => {
    const currentTime = Date.now();
    const timestamp = currentTime.toString();

    it('should verify valid Babel webhook signature', () => {
      const signedPayload = `${timestamp}.${testPayload}`;
      const expectedSignature = crypto
        .createHmac('sha256', testSecret)
        .update(signedPayload, 'utf8')
        .digest('hex');

      const result = WebhookVerificationService.verifyBabelWebhook(
        testPayload,
        `sha256=${expectedSignature}`,
        timestamp,
        testSecret
      );

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject old timestamps', () => {
      const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago
      const signedPayload = `${oldTimestamp}.${testPayload}`;
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(signedPayload, 'utf8')
        .digest('hex');

      const result = WebhookVerificationService.verifyBabelWebhook(
        testPayload,
        `sha256=${signature}`,
        oldTimestamp,
        testSecret
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Timestamp too old');
    });

    it('should reject invalid signature', () => {
      const result = WebhookVerificationService.verifyBabelWebhook(
        testPayload,
        'invalid-signature',
        timestamp,
        testSecret
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should reject missing parameters', () => {
      const result = WebhookVerificationService.verifyBabelWebhook(
        testPayload,
        '',
        timestamp,
        testSecret
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Missing required parameters');
    });
  });

  describe('generateBabelSignature', () => {
    it('should generate valid signature', () => {
      const timestamp = Date.now().toString();
      const signature = WebhookVerificationService.generateBabelSignature(
        testPayload,
        timestamp,
        testSecret
      );

      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);

      // Verify the generated signature
      const result = WebhookVerificationService.verifyBabelWebhook(
        testPayload,
        signature,
        timestamp,
        testSecret
      );

      expect(result.isValid).toBe(true);
    });

    it('should generate different signatures for different payloads', () => {
      const timestamp = Date.now().toString();
      const payload1 = JSON.stringify({ data: 'test1' });
      const payload2 = JSON.stringify({ data: 'test2' });

      const signature1 = WebhookVerificationService.generateBabelSignature(
        payload1,
        timestamp,
        testSecret
      );
      const signature2 = WebhookVerificationService.generateBabelSignature(
        payload2,
        timestamp,
        testSecret
      );

      expect(signature1).not.toBe(signature2);
    });
  });
});