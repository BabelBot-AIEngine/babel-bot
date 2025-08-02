# Parallel Task Processing

This document describes the parallel task processing implementation that replaces the synchronous `processTaskAsync` method with a Redis-native event-driven architecture.

## Architecture Overview

### Key Components

1. **TaskQueue** (`src/services/taskQueue.ts`)
   - Redis Streams-based task queuing
   - Consumer groups for reliable message processing
   - Built-in retry logic with exponential backoff
   - Message acknowledgment and claiming

2. **WorkerPool** (`src/services/workerPool.ts`)
   - Manages multiple concurrent workers
   - Each worker can process multiple tasks simultaneously
   - Automatic failure recovery and retry scheduling
   - Real-time statistics tracking

3. **TaskProcessor** (`src/services/taskProcessor.ts`)
   - Main orchestrator that coordinates everything
   - Handles initialization, graceful shutdown
   - Provides comprehensive metrics and monitoring
   - Configurable worker and concurrency settings

4. **Enhanced TaskService** (`src/services/taskService.ts`)
   - Refactored to support event-driven processing
   - Step-based processing: translate → verify → review
   - Backward compatible with synchronous processing

## Configuration

### Environment Variables

```bash
# Enable parallel processing
USE_PARALLEL_PROCESSING=true

# Worker configuration
MAX_CONCURRENT_TASKS=3        # Tasks per worker
WORKER_COUNT=2                # Number of workers
PROCESSING_TIMEOUT=300000     # Task timeout in ms

# Redis configuration
REDIS_URL=redis://localhost:6379

# Monitoring
ENABLE_METRICS=true           # Enable statistics logging
```

### Default Configuration

```typescript
{
  maxConcurrentTasks: 3,      // Each worker processes up to 3 tasks
  workerCount: 2,             // 2 workers = up to 6 concurrent tasks
  processingTimeout: 300000,  // 5 minute timeout per task
  redisUrl: 'redis://localhost:6379',
  enableMetrics: true
}
```

## Usage

### Starting with Parallel Processing

```bash
# Development with parallel processing
npm run dev:parallel

# Production with parallel processing
npm run start:parallel

# Traditional synchronous processing (fallback)
npm run dev
npm run start
```

### API Endpoints

The API remains the same, but adds new monitoring endpoints:

```bash
# Get processor statistics
GET /api/stats

# Example response:
{
  "parallelProcessing": true,
  "isRunning": true,
  "workers": {
    "worker-0": {
      "processed": 15,
      "failed": 1,
      "currentTasks": 2,
      "isRunning": true
    }
  },
  "totals": {
    "processed": 15,
    "failed": 1,
    "currentTasks": 2
  },
  "queue": {
    "pending": 3,
    "translating": 2,
    "verifying": 1,
    "reviewing": 0
  }
}
```

## Task Lifecycle

### Event-Driven Flow

1. **Task Creation** → Queue `translate` event
2. **Translation Step** → Queue `verify` event
3. **Verification Step** → Queue `review` event (if needed)
4. **Review Step** → Task completion

### Redis Data Structures

- **Stream**: `task:stream` - Main task queue using Redis Streams
- **Consumer Group**: `task:processors` - Ensures reliable processing
- **Pub/Sub**: `task:events` - Real-time event notifications

### Processing States

```
pending → translating → llm_verification → human_review → done
                                        ↘ done (if verification passes)
```

## Error Handling & Retries

### Retry Logic

- **Default retries**: 3 attempts per task step
- **Exponential backoff**: 1s, 2s, 4s delays with jitter
- **Permanent failure**: After max retries exceeded
- **Error tracking**: Full error history maintained

### Failure Recovery

- **Worker failure**: Tasks automatically claimed by other workers
- **Redis failure**: Graceful fallback to synchronous processing
- **Task timeout**: Automatic retry or permanent failure

## Performance Benefits

### Concurrent Processing

| Configuration | Max Concurrent Tasks | Processing Time Improvement |
|---------------|---------------------|----------------------------|
| 1 worker, 1 task | 1 | Baseline |
| 2 workers, 3 tasks each | 6 | ~6x faster |
| 4 workers, 3 tasks each | 12 | ~12x faster |

### Resource Utilization

- **CPU**: Better utilization through parallelism
- **I/O**: Non-blocking Redis operations
- **Memory**: Efficient stream processing
- **Network**: Batched Redis operations

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Test parallel processing specifically
npm run test:parallel
```

### Load Testing Script

```bash
# Test with 5 concurrent tasks across 4 workers
ts-node src/scripts/testParallelProcessing.ts
```

### Test Coverage

- ✅ Task lifecycle through all states
- ✅ Concurrent task processing
- ✅ Error handling and retries
- ✅ Worker failure recovery
- ✅ Queue integrity under load
- ✅ Statistics and monitoring

## Monitoring & Observability

### Real-time Metrics

The system provides comprehensive metrics every 30 seconds:

```
=== Task Processor Metrics ===
Status: Running
Total Processed: 45
Total Failed: 2
Current Active Tasks: 6
Queue - Pending: 12, Processing: 8
==============================
```

### Performance Monitoring

- **Task throughput**: Tasks processed per minute
- **Worker utilization**: Active vs idle workers
- **Queue depth**: Pending tasks in each state
- **Error rates**: Failure percentage and retry counts

## Migration Guide

### From Synchronous to Parallel

1. **No code changes required** - API remains identical
2. **Set environment variable**: `USE_PARALLEL_PROCESSING=true`
3. **Ensure Redis is running**: Default `redis://localhost:6379`
4. **Monitor performance**: Use `/api/stats` endpoint

### Backward Compatibility

- Synchronous processing remains as fallback
- All existing API endpoints work unchanged
- Database schema unchanged
- Client applications require no modifications

## Troubleshooting

### Common Issues

**Redis Connection Failed**
```bash
# Check Redis status
redis-cli ping

# Start Redis if needed
redis-server
```

**High Memory Usage**
```bash
# Monitor Redis memory
redis-cli info memory

# Clear completed stream entries
redis-cli XTRIM task:stream MAXLEN 1000
```

**Slow Processing**
```bash
# Check worker stats
curl http://localhost:3000/api/stats

# Increase worker count
export WORKER_COUNT=4
```

### Debug Mode

Enable detailed logging:

```bash
DEBUG=true USE_PARALLEL_PROCESSING=true npm run dev:parallel
```

## Future Enhancements

### Planned Features

- [ ] Priority queues for urgent tasks
- [ ] Auto-scaling based on queue depth
- [ ] Distributed processing across multiple servers
- [ ] WebSocket real-time status updates
- [ ] Task scheduling and delayed execution
- [ ] A/B testing different processing strategies

### Performance Optimizations

- [ ] Connection pooling for Redis
- [ ] Batch processing for similar tasks
- [ ] Intelligent task routing
- [ ] Memory usage optimization
- [ ] Network compression for large tasks