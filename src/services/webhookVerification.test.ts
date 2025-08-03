import crypto from 'crypto';
import { WebhookVerificationService } from './webhookVerification';

describe('WebhookVerificationService', () => {
  const testSecret = 'test-secret-key';
  const testPayload = JSON.stringify({ test: 'data', study: { id: '123', status: 'COMPLETED' } });

  describe('detectWebhookSource', () => {
    it('should detect Prolific webhooks', () => {
      const headers = { 
        'X-Prolific-Request-Signature': 'test-signature',
        'X-Prolific-Request-Timestamp': '1640995200'
      };
      const source = WebhookVerificationService.detectWebhookSource(headers);
      expect(source).toBe('prolific');
    });

    it('should detect Babel webhooks', () => {
      const headers = { 
        'X-Babel-Request-Signature': 'test-signature',
        'X-Babel-Request-Timestamp': '1640995200'
      };
      const source = WebhookVerificationService.detectWebhookSource(headers);
      expect(source).toBe('babel');
    });

    it('should handle case-insensitive headers', () => {
      const headers = { 
        'x-prolific-request-signature': 'test-signature',
        'x-prolific-request-timestamp': '1640995200'
      };
      const source = WebhookVerificationService.detectWebhookSource(headers);
      expect(source).toBe('prolific');
    });

    it('should return unknown for incomplete headers', () => {
      const headers = { 'X-Prolific-Request-Signature': 'test-signature' }; // Missing timestamp
      const source = WebhookVerificationService.detectWebhookSource(headers);
      expect(source).toBe('unknown');
    });

    it('should return unknown for unrecognized headers', () => {
      const headers = { 'Authorization': 'Bearer test' };
      const source = WebhookVerificationService.detectWebhookSource(headers);
      expect(source).toBe('unknown');
    });
  });

  describe('verifyProlificWebhook', () => {
    it('should verify valid Prolific webhook signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString(); // Current POSIX timestamp in seconds
      
      // Recreate Prolific's signature algorithm: timestamp + body, base64 encoded
      const signedPayload = timestamp + testPayload;
      const expectedSignature = crypto
        .createHmac('sha256', testSecret)
        .update(signedPayload, 'utf8')
        .digest('base64');

      const result = WebhookVerificationService.verifyProlificWebhook(
        testPayload,
        expectedSignature,
        timestamp,
        testSecret
      );

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      
      const result = WebhookVerificationService.verifyProlificWebhook(
        testPayload,
        'invalid-signature',
        timestamp,
        testSecret
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should reject old timestamps', () => {
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 10 * 60).toString(); // 10 minutes ago
      const signedPayload = oldTimestamp + testPayload;
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(signedPayload, 'utf8')
        .digest('base64');

      const result = WebhookVerificationService.verifyProlificWebhook(
        testPayload,
        signature,
        oldTimestamp,
        testSecret
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Timestamp too old');
    });

    it('should reject invalid timestamp format', () => {
      const result = WebhookVerificationService.verifyProlificWebhook(
        testPayload,
        'signature',
        'invalid-timestamp',
        testSecret
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid timestamp format');
    });

    it('should reject missing parameters', () => {
      const result = WebhookVerificationService.verifyProlificWebhook(
        '',
        'signature',
        '1640995200',
        testSecret
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Missing required parameters');
    });
  });

  describe('verifyBabelWebhook', () => {
    it('should verify valid Babel webhook signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      
      // Use same algorithm as Prolific: timestamp + body, base64 encoded
      const signedPayload = timestamp + testPayload;
      const expectedSignature = crypto
        .createHmac('sha256', testSecret)
        .update(signedPayload, 'utf8')
        .digest('base64');

      const result = WebhookVerificationService.verifyBabelWebhook(
        testPayload,
        expectedSignature,
        timestamp,
        testSecret
      );

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject old timestamps', () => {
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 10 * 60).toString(); // 10 minutes ago
      const signedPayload = oldTimestamp + testPayload;
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(signedPayload, 'utf8')
        .digest('base64');

      const result = WebhookVerificationService.verifyBabelWebhook(
        testPayload,
        signature,
        oldTimestamp,
        testSecret
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Timestamp too old');
    });

    it('should reject invalid signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      
      const result = WebhookVerificationService.verifyBabelWebhook(
        testPayload,
        'invalid-signature',
        timestamp,
        testSecret
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should reject invalid timestamp format', () => {
      const result = WebhookVerificationService.verifyBabelWebhook(
        testPayload,
        'signature',
        'invalid-timestamp',
        testSecret
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid timestamp format');
    });

    it('should reject missing parameters', () => {
      const result = WebhookVerificationService.verifyBabelWebhook(
        testPayload,
        '',
        '1640995200',
        testSecret
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Missing required parameters');
    });
  });

  describe('generateBabelSignature', () => {
    it('should generate valid signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = WebhookVerificationService.generateBabelSignature(
        testPayload,
        timestamp,
        testSecret
      );

      // Should be a base64 encoded string
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);

      // Verify the generated signature works
      const result = WebhookVerificationService.verifyBabelWebhook(
        testPayload,
        signature,
        timestamp,
        testSecret
      );

      expect(result.isValid).toBe(true);
    });

    it('should generate different signatures for different payloads', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
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

    it('should generate different signatures for different timestamps', () => {
      const timestamp1 = Math.floor(Date.now() / 1000).toString();
      const timestamp2 = (Math.floor(Date.now() / 1000) + 1).toString();

      const signature1 = WebhookVerificationService.generateBabelSignature(
        testPayload,
        timestamp1,
        testSecret
      );
      const signature2 = WebhookVerificationService.generateBabelSignature(
        testPayload,
        timestamp2,
        testSecret
      );

      expect(signature1).not.toBe(signature2);
    });
  });

  describe('generateProlificSignature', () => {
    it('should generate same signature as generateBabelSignature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      
      const babelSignature = WebhookVerificationService.generateBabelSignature(
        testPayload,
        timestamp,
        testSecret
      );
      
      const prolificSignature = WebhookVerificationService.generateProlificSignature(
        testPayload,
        timestamp,
        testSecret
      );

      expect(prolificSignature).toBe(babelSignature);
    });
  });

  describe('Cross-verification compatibility', () => {
    it('should allow Babel signatures to be verified by Prolific verification', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      
      const babelSignature = WebhookVerificationService.generateBabelSignature(
        testPayload,
        timestamp,
        testSecret
      );

      const result = WebhookVerificationService.verifyProlificWebhook(
        testPayload,
        babelSignature,
        timestamp,
        testSecret
      );

      expect(result.isValid).toBe(true);
    });

    it('should allow Prolific signatures to be verified by Babel verification', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      
      const prolificSignature = WebhookVerificationService.generateProlificSignature(
        testPayload,
        timestamp,
        testSecret
      );

      const result = WebhookVerificationService.verifyBabelWebhook(
        testPayload,
        prolificSignature,
        timestamp,
        testSecret
      );

      expect(result.isValid).toBe(true);
    });
  });
});