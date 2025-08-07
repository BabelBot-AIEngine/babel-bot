# Enhanced Webhook-Driven Task Processing Architecture

## Overview

This document describes the new enhanced task processing architecture that replaces the monolithic `processTaskAsync()` function with a fully webhook-driven, serverless-friendly system. The new architecture enables:

- **Concurrent language processing** - Each language processes independently
- **Iterative review loops** - Up to 3 iterations per language with LLM + Human review
- **Granular state tracking** - Detailed Redis storage for stateless operations
- **Prolific study batching** - Efficient human review management
- **Zero blocking operations** - Each stage completes via webhook handoffs

## 🏗️ Architecture Components

### Core Services

1. **EnhancedTaskService** - Main orchestrator for webhook-driven processing
2. **EnhancedDatabaseService** - Granular Redis storage with language sub-task tracking
3. **ProlificBatchManager** - Batches languages for human review studies
4. **ReviewIterationManager** - Handles iterative LLM + Human feedback loops
5. **TaskMigrationService** - Migrates legacy tasks to new architecture

### Data Flow

```
Task Creation → Language Sub-Tasks → Translation → LLM Verification
                                                        ↓
Task Completion ← Finalization ← Review Iterations ← Human Review
                                        ↑                ↓
                                LLM Re-verification ← Prolific Study
```

## 📊 Enhanced Data Schema

### Main Task Structure

```typescript
interface EnhancedTranslationTask {
  id: string;
  status: TaskStatus; // pending | processing | review_pending | review_active | finalizing | completed | failed
  
  // Original fields
  mediaArticle: MediaArticle;
  editorialGuidelines: EditorialGuidelines;
  destinationLanguages: string[];
  
  // Enhanced fields
  maxReviewIterations: number; // Default: 3
  confidenceThreshold: number; // Default: 4.5/5.0
  
  // Granular tracking
  languageSubTasks: { [language: string]: LanguageSubTask };
  prolificStudyMappings: { [studyId: string]: ProlificStudyMapping };
  webhookDeliveryLog: WebhookAttempt[];
}
```

### Language Sub-Task Structure

```typescript
interface LanguageSubTask {
  language: string;
  status: LanguageSubTaskStatus; // 11 different states
  currentIteration: number;
  maxIterations: number;
  confidenceThreshold: number;
  iterations: ReviewIteration[]; // Complete history
  translatedText?: string;
  prolificBatchIds: string[];
  webhooksPending: string[];
}
```

### Review Iteration Structure

```typescript
interface ReviewIteration {
  iterationNumber: number;
  startedAt: string;
  completedAt?: string;
  
  llmVerification: {
    score: number;
    feedback: string;
    confidence: number;
    completedAt: string;
  };
  
  humanReview?: {
    prolificStudyId: string;
    score: number;
    feedback: string;
    reviewerIds: string[];
    completedAt: string;
  };
  
  llmReverification?: {
    score: number;
    feedback: string;
    confidence: number;
    completedAt: string;
  };
  
  combinedScore?: number;
  needsAnotherIteration?: boolean;
  finalReason?: "threshold_met" | "max_iterations_reached" | "failed";
}
```

## 🔄 Webhook Event Flow

### Stage 1: Task Initialization

```json
{
  "event": "task.created",
  "taskId": "task_123",
  "data": {
    "destinationLanguages": ["es", "fr", "de"],
    "maxReviewIterations": 3,
    "confidenceThreshold": 4.5
  }
}
```

### Stage 2-4: Concurrent Language Processing

For **each language** independently:

```json
// Language sub-task creation
{
  "event": "language_subtask.created",
  "taskId": "task_123",
  "subTaskId": "task_123_es",
  "data": { "language": "es", "currentIteration": 0 }
}

// Translation phase
{
  "event": "subtask.translation.started",
  "data": { "language": "es", "currentIteration": 1 }
}
{
  "event": "subtask.translation.completed", 
  "data": { "language": "es", "translatedText": "..." }
}

// LLM verification phase
{
  "event": "subtask.llm_verification.started",
  "data": { "language": "es", "verificationType": "initial" }
}
{
  "event": "subtask.llm_verification.completed",
  "data": { 
    "language": "es", 
    "verificationScore": 3.2,
    "needsHumanReview": true 
  }
}
```

### Stage 5-7: Human Review Batching

```json
// Batch creation (multiple languages)
{
  "event": "review_batch.created",
  "data": {
    "batchId": "batch_456",
    "readyLanguages": ["es", "fr"],
    "iterationNumbers": { "es": 1, "fr": 1 }
  }
}

// Prolific study management
{
  "event": "prolific_study.created",
  "data": {
    "prolificStudyId": "study_789",
    "languages": ["es", "fr"]
  }
}
{
  "event": "prolific_study.published",
  "data": {
    "prolificStudyId": "study_789",
    "publicUrl": "https://prolific.com/study/789"
  }
}
```

### Stage 8-9: Iteration Logic

```json
// Human review results
{
  "event": "prolific_results.received",
  "data": {
    "reviewResults": {
      "es": { "score": 4.2, "feedback": "Better but needs adjustment" },
      "fr": { "score": 4.8, "feedback": "Excellent translation" }
    }
  }
}

// LLM re-verification
{
  "event": "subtask.llm_reverification.completed",
  "data": {
    "language": "es",
    "combinedScore": 4.15,
    "needsAnotherIteration": true // Score still below 4.5 threshold
  }
}

// Continue or finalize decision
{
  "event": "subtask.iteration.continuing", // or "subtask.finalized"
  "data": {
    "language": "es",
    "currentIteration": 2
  }
}
```

### Stage 10: Task Completion

```json
{
  "event": "task.completed",
  "data": {
    "completedLanguages": ["es", "fr", "de"],
    "iterationSummary": {
      "es": { "iterations": 3, "finalScore": 4.3, "reason": "max_iterations_reached" },
      "fr": { "iterations": 1, "finalScore": 4.8, "reason": "threshold_met" },
      "de": { "iterations": 2, "finalScore": 4.6, "reason": "threshold_met" }
    }
  }
}
```

## 🚀 Usage Guide

### Creating Enhanced Tasks

```typescript
// POST /api/tasks/enhanced
{
  "mediaArticle": {
    "text": "Article content...",
    "title": "Article Title"
  },
  "editorialGuidelines": {
    "tone": "professional",
    "audience": "technical"
  },
  "destinationLanguages": ["es", "fr", "de"],
  "maxReviewIterations": 3,
  "confidenceThreshold": 4.5
}
```

### Monitoring Task Progress

```bash
# View detailed task status
GET /api/tasks/enhanced/{taskId}

# List all enhanced tasks
GET /api/tasks/enhanced

# Filter by status  
GET /api/tasks/enhanced?status=processing
```

### Testing the Architecture

```bash
# Create a test task that demonstrates the full workflow
POST /api/test-enhanced

# Check migration readiness
GET /api/migrate-tasks

# Migrate legacy tasks
POST /api/migrate-tasks
```

## 📈 Benefits Over Legacy Architecture

### Concurrency & Performance

- **Before**: Sequential processing blocked on slowest language
- **After**: Each language processes independently at optimal speed

### Scalability & Serverless

- **Before**: Long-running `processTaskAsync()` prone to timeouts
- **After**: Each webhook handler completes quickly, perfect for serverless

### Quality & Iteration

- **Before**: Single pass LLM verification
- **After**: Up to 3 iterations with LLM + Human feedback loops

### State Management

- **Before**: In-memory state lost between function invocations
- **After**: Granular Redis storage preserves all context

### Monitoring & Debugging

- **Before**: Limited visibility into processing stages  
- **After**: Complete audit trail of every webhook and state transition

## 🔧 Configuration

### Environment Variables

```bash
# Required for webhook-driven architecture
BABEL_WEBHOOK_SECRET=your_internal_webhook_secret
VERCEL_URL=https://your-app.vercel.app

# Existing Prolific integration
PROLIFIC_WEBHOOK_SECRET=your_prolific_webhook_secret
PROLIFIC_API_TOKEN=your_prolific_token

# Redis (Upstash)
KV_REST_API_URL=your_upstash_redis_url
KV_REST_API_TOKEN=your_upstash_redis_token
```

### Task Parameters

```typescript
interface TaskSettings {
  maxReviewIterations: number; // 1-5, default: 3
  confidenceThreshold: number; // 1.0-5.0, default: 4.5
  destinationLanguages: string[]; // Any supported language codes
}
```

## 🔄 Migration Strategy

### Phase 1: Deploy Enhanced Architecture (Backward Compatible)

- ✅ New webhook handlers support both legacy and enhanced events
- ✅ Legacy `processTaskAsync()` continues to work
- ✅ New enhanced tasks use webhook-driven processing

### Phase 2: Migrate Existing Tasks

```bash
# Generate migration report
GET /api/migrate-tasks

# Execute migration
POST /api/migrate-tasks
```

### Phase 3: Deprecate Legacy Architecture

- Remove `processTaskAsync()` after all tasks migrated
- Simplify webhook handlers to only handle enhanced events
- Clean up legacy database schemas

## 🧪 Testing & Validation

### Unit Tests

```bash
# Test enhanced database operations
npm test -- enhancedDbService.test.ts

# Test webhook event handling  
npm test -- babelWebhookHandler.test.ts

# Test iteration logic
npm test -- reviewIterationManager.test.ts
```

### Integration Tests

```bash
# Test full webhook flow
npm test -- enhanced-workflow.test.ts

# Test Prolific batching
npm test -- prolific-batching.test.ts
```

### Manual Testing

```bash
# Create test task and monitor webhook flow
curl -X POST /api/test-enhanced

# Check task progress
curl /api/tasks/enhanced/{taskId}

# Verify webhook delivery
curl /api/webhooks -X POST -H "X-Babel-Request-Signature: ..." -d '{...}'
```

## 📊 Monitoring & Observability

### Key Metrics

- **Task completion time** by language and iteration count
- **Webhook delivery success rate** and retry attempts  
- **Human review batch efficiency** and study completion times
- **Iteration convergence rate** and threshold effectiveness

### Logging

All webhook events include structured logging:

```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "event": "subtask.translation.completed",
  "taskId": "task_123",
  "language": "es", 
  "iteration": 1,
  "processingTime": 45000,
  "status": "success"
}
```

### Error Handling

- **Webhook failures** → Automatic retry with exponential backoff → QStash failover
- **Processing errors** → Language sub-task marked as failed → Other languages continue
- **Study failures** → Retry with different parameters or manual intervention

## 🏁 Conclusion

The enhanced webhook-driven architecture provides:

1. **🚀 Better Performance** - Concurrent processing eliminates bottlenecks
2. **🔄 Improved Quality** - Iterative loops ensure translation excellence  
3. **📈 Enhanced Scalability** - Serverless-friendly with no blocking operations
4. **🔍 Complete Visibility** - Granular state tracking and audit trails
5. **🛡️ Fault Tolerance** - Robust error handling and retry mechanisms

This architecture positions the system for future enhancements like:
- Dynamic batching strategies
- ML-powered quality prediction
- Advanced workflow customization
- Multi-tenant isolation
- Real-time collaboration features

---

## 📚 API Reference

### Enhanced Task Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/tasks/enhanced` | Create new enhanced task |
| `GET` | `/api/tasks/enhanced` | List all enhanced tasks |
| `GET` | `/api/tasks/enhanced/{id}` | Get specific enhanced task |
| `POST` | `/api/test-enhanced` | Create test task with full workflow |

### Migration Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/migrate-tasks` | Generate migration report |
| `POST` | `/api/migrate-tasks` | Execute task migration |

### Webhook Events

| Event | Trigger | Purpose |
|-------|---------|---------|
| `task.created` | Task creation | Initialize language sub-tasks |
| `subtask.translation.started` | Begin translation | Process single language |
| `subtask.llm_verification.completed` | LLM review done | Decide human review need |
| `review_batch.created` | Languages ready | Create Prolific study |
| `prolific_results.received` | Human review done | Trigger LLM re-verification |
| `subtask.iteration.continuing` | Need another loop | Start next review iteration |
| `task.completed` | All languages done | Finalize task processing |

For detailed webhook payload schemas, see `src/types/enhanced-task.ts`.