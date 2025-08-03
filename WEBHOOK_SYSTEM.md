# Webhook System Documentation

## Overview

This document describes the dual webhook system implemented for handling both Prolific API webhooks and internal babel-bot webhooks. The system is designed for zero event loss through retry logic and QStash failover mechanisms.

## Architecture

### Components

1. **Main Webhook Endpoint**: `/api/webhooks/index.ts`
   - Single serverless function handling both webhook types
   - Automatic source detection based on headers
   - HMAC-SHA256 signature verification
   - Proper HTTP status code responses

2. **Webhook Verification Service**: `src/services/webhookVerification.ts`
   - Detects webhook source (Prolific vs Babel)
   - HMAC-SHA256 signature verification for both sources
   - Timestamp validation for Babel webhooks (5-minute window)
   - Secure string comparison to prevent timing attacks

3. **Webhook Handlers**:
   - **Prolific Handler**: `src/services/prolificWebhookHandler.ts`
   - **Babel Handler**: `src/services/babelWebhookHandler.ts`

4. **Webhook Sender**: `src/services/webhookSender.ts`
   - Reliable webhook delivery with retry logic
   - Exponential backoff (1s, 5s, 15s)
   - QStash failover for failed deliveries
   - Convenience methods for common events

5. **QStash Integration**: `src/services/qstashService.ts`
   - Reliable delivery fallback mechanism
   - Dead letter queue management
   - Health monitoring capabilities

## Webhook Types

### Prolific Webhooks

**Endpoint**: `POST /api/webhooks`
**Headers**:
- `X-Prolific-Signature`: HMAC-SHA256 signature
- `Content-Type`: application/json

**Supported Events**:
- `study.status.change`: Study status transitions

**Status Handling**:
- `AWAITING_REVIEW`: Trigger next processing step
- `COMPLETED`: Retrieve final study data
- `ACTIVE`: Update internal status
- `DRAFT`: Handle draft status
- `SCHEDULED`: Prepare for activation

### Babel Internal Webhooks

**Endpoint**: `POST /api/webhooks`
**Headers**:
- `X-Babel-Request-Signature`: HMAC-SHA256 signature
- `X-Babel-Request-Timestamp`: Unix timestamp in milliseconds
- `Content-Type`: application/json

**Supported Events**:
- `task.translation.completed`
- `task.verification.completed`
- `task.human_review.started`
- `task.human_review.completed`
- `task.status.changed`
- `task.failed`

## Configuration

### Environment Variables

```bash
# Required
PROLIFIC_WEBHOOK_SECRET=your_prolific_webhook_secret
BABEL_WEBHOOK_SECRET=your_internal_webhook_secret
QSTASH_TOKEN=your_qstash_token

# Optional
QSTASH_CURRENT_SIGNING_KEY=your_qstash_signing_key
QSTASH_NEXT_SIGNING_KEY=your_qstash_next_signing_key
VERCEL_URL=https://your-app.vercel.app
```

### Vercel Configuration

The webhook endpoint is configured as a separate Vercel serverless function with:
- 30-second timeout
- Direct routing to `/api/webhooks`

## Usage Examples

### Sending Internal Webhooks

```typescript
import { WebhookSender } from './services/webhookSender';

// Send translation completed webhook
await WebhookSender.sendTranslationCompleted(
  'https://your-app.vercel.app/api/webhooks',
  'task-123',
  { translationData: '...' },
  process.env.BABEL_WEBHOOK_SECRET!
);

// Send with custom retry options
await WebhookSender.sendBabelWebhook(
  'https://your-app.vercel.app/api/webhooks',
  {
    event: 'task.custom.event',
    taskId: 'task-456',
    data: { custom: 'data' }
  },
  process.env.BABEL_WEBHOOK_SECRET!,
  {
    maxRetries: 5,
    backoffDelays: [2000, 10000, 30000] // 2s, 10s, 30s
  }
);
```

### Manual Webhook Verification

```typescript
import { WebhookVerificationService } from './services/webhookVerification';

// Verify Prolific webhook
const result = WebhookVerificationService.verifyProlificWebhook(
  payloadString,
  signature,
  secret
);

// Verify Babel webhook
const result = WebhookVerificationService.verifyBabelWebhook(
  payloadString,
  signature,
  timestamp,
  secret
);
```

## Error Handling

### HTTP Response Codes

- `200`: Webhook processed successfully
- `400`: Bad request (invalid payload, unknown source)
- `401`: Unauthorized (invalid signature, old timestamp)
- `405`: Method not allowed (non-POST requests)
- `500`: Internal server error (processing failure, configuration error)

### Retry Logic

1. **Direct Delivery**: 3 attempts with exponential backoff
2. **QStash Failover**: 5 attempts with QStash-managed retries
3. **Dead Letter Queue**: Failed messages available for manual retry

### Failure Scenarios

| Scenario | Action |
|----------|---------|
| Network timeout | Retry with backoff |
| 5xx server error | Retry with backoff |
| 4xx client error | Log and abandon (no retry) |
| All retries failed | Handoff to QStash |
| QStash failure | Critical error (alert required) |

## Security

### Signature Verification

- **Prolific**: `HMAC-SHA256(payload, secret)`
- **Babel**: `HMAC-SHA256(timestamp.payload, secret)`
- Timing-safe comparison to prevent timing attacks
- Signature format: `sha256=<hex_digest>`

### Timestamp Validation

- Babel webhooks include timestamp validation
- 5-minute maximum age for requests
- Prevents replay attacks

## Monitoring

### Logging

All webhook attempts are logged with:
- Source type (prolific/babel)
- Event type
- Task/Study ID
- Processing result
- Error details (if applicable)

### Health Checks

```typescript
import { QStashService } from './services/qstashService';

// Check QStash connectivity
const isHealthy = await QStashService.healthCheck();
```

### Dead Letter Queue

```typescript
// Get failed messages
const failedMessages = await QStashService.getDeadLetterQueue();

// Retry failed message
await QStashService.retryDeadLetterMessage(messageId);
```

## Testing

### Unit Tests

Run webhook verification tests:
```bash
npm test -- webhookVerification.test.ts
```

### Manual Testing

Test webhook endpoint with curl:

```bash
# Test Prolific webhook
curl -X POST https://your-app.vercel.app/api/webhooks \
  -H "Content-Type: application/json" \
  -H "X-Prolific-Signature: sha256=<signature>" \
  -d '{"event_type":"study.status.change","study":{"id":"123","status":"COMPLETED"},"timestamp":"2025-01-01T00:00:00Z"}'

# Test Babel webhook
curl -X POST https://your-app.vercel.app/api/webhooks \
  -H "Content-Type: application/json" \
  -H "X-Babel-Request-Signature: sha256=<signature>" \
  -H "X-Babel-Request-Timestamp: 1609459200000" \
  -d '{"event":"task.translation.completed","taskId":"task-123","timestamp":1609459200000,"data":{}}'
```

## Deployment

1. **Environment Variables**: Configure all required secrets in Vercel
2. **Build**: Ensure TypeScript compilation succeeds
3. **Deploy**: Push to trigger Vercel deployment
4. **Register**: Manually register webhook URL with Prolific
5. **Test**: Verify webhook delivery with test events

## Future Enhancements

- Rate limiting implementation
- Webhook analytics dashboard
- Batch webhook processing
- Webhook replay functionality
- Advanced filtering options