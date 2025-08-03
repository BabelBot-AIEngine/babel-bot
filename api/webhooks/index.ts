import { VercelRequest, VercelResponse } from '@vercel/node';
import { WebhookVerificationService } from '../../src/services/webhookVerification';
import { ProlificWebhookHandler } from '../../src/services/prolificWebhookHandler';
import { BabelWebhookHandler } from '../../src/services/babelWebhookHandler';
import { WebhookRequest, WebhookSource } from '../../src/types/webhooks';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method Not Allowed',
      message: 'Only POST requests are accepted'
    });
  }

  try {
    // Parse request headers and body
    const headers = req.headers as Record<string, string>;
    const body = req.body;
    
    // Detect webhook source
    const source = WebhookVerificationService.detectWebhookSource(headers);
    
    if (source === 'unknown') {
      console.log('Unknown webhook source:', { headers: Object.keys(headers) });
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'Unable to identify webhook source'
      });
    }

    console.log('Webhook received:', {
      source,
      userAgent: headers['user-agent'],
      contentType: headers['content-type'],
      timestamp: new Date().toISOString()
    });

    // Process webhook based on source
    if (source === 'prolific') {
      await handleProlificWebhook(req, res, headers, body);
    } else if (source === 'babel') {
      await handleBabelWebhook(req, res, headers, body);
    }

  } catch (error) {
    console.error('Webhook processing error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to process webhook'
    });
  }
}

async function handleProlificWebhook(
  req: VercelRequest,
  res: VercelResponse,
  headers: Record<string, string>,
  body: any
): Promise<void> {
  const signature = headers['x-prolific-request-signature'];
  const timestamp = headers['x-prolific-request-timestamp'];
  const secret = process.env.PROLIFIC_WEBHOOK_SECRET;

  if (!secret) {
    console.error('PROLIFIC_WEBHOOK_SECRET environment variable not configured');
    return res.status(500).json({ 
      error: 'Configuration Error',
      message: 'Webhook secret not configured'
    });
  }

  if (!signature || !timestamp) {
    console.error('Missing required Prolific webhook headers:', {
      hasSignature: !!signature,
      hasTimestamp: !!timestamp
    });
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Missing required headers'
    });
  }

  // Verify webhook signature
  const rawBody = JSON.stringify(body);
  const verification = WebhookVerificationService.verifyProlificWebhook(
    rawBody,
    signature,
    timestamp,
    secret
  );

  if (!verification.isValid) {
    console.error('Prolific webhook verification failed:', verification.error);
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid signature'
    });
  }

  // Validate payload structure
  if (!ProlificWebhookHandler.validatePayload(body)) {
    console.error('Invalid Prolific webhook payload structure:', body);
    return res.status(400).json({ 
      error: 'Bad Request',
      message: 'Invalid payload structure'
    });
  }

  try {
    // Process the webhook
    await ProlificWebhookHandler.handleWebhook(body);
    
    console.log('Prolific webhook processed successfully:', {
      event: body.event_type,
      studyId: body.study?.id,
      status: body.study?.status
    });

    return res.status(200).json({ 
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    console.error('Prolific webhook handler error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      studyId: body.study?.id
    });
    
    return res.status(500).json({ 
      error: 'Processing Error',
      message: 'Failed to process webhook payload'
    });
  }
}

async function handleBabelWebhook(
  req: VercelRequest,
  res: VercelResponse,
  headers: Record<string, string>,
  body: any
): Promise<void> {
  const signature = headers['x-babel-request-signature'];
  const timestamp = headers['x-babel-request-timestamp'];
  const secret = process.env.BABEL_WEBHOOK_SECRET;

  if (!secret) {
    console.error('BABEL_WEBHOOK_SECRET environment variable not configured');
    return res.status(500).json({ 
      error: 'Configuration Error',
      message: 'Webhook secret not configured'
    });
  }

  if (!signature || !timestamp) {
    console.error('Missing required Babel webhook headers:', {
      hasSignature: !!signature,
      hasTimestamp: !!timestamp
    });
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Missing required headers'
    });
  }

  // Verify webhook signature
  const rawBody = JSON.stringify(body);
  const verification = WebhookVerificationService.verifyBabelWebhook(
    rawBody,
    signature,
    timestamp,
    secret
  );

  if (!verification.isValid) {
    console.error('Babel webhook verification failed:', verification.error);
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: verification.error || 'Invalid signature'
    });
  }

  // Validate payload structure
  if (!BabelWebhookHandler.validatePayload(body)) {
    console.error('Invalid Babel webhook payload structure:', body);
    return res.status(400).json({ 
      error: 'Bad Request',
      message: 'Invalid payload structure'
    });
  }

  try {
    // Process the webhook
    await BabelWebhookHandler.handleWebhook(body);
    
    console.log('Babel webhook processed successfully:', {
      event: body.event,
      taskId: body.taskId,
      retryCount: body._retryCount || 0
    });

    return res.status(200).json({ 
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    console.error('Babel webhook handler error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      taskId: body.taskId,
      event: body.event
    });
    
    return res.status(500).json({ 
      error: 'Processing Error',
      message: 'Failed to process webhook payload'
    });
  }
}