# babel-bot

A TypeScript API for translating media articles with editorial guidelines review using Anthropic's Claude LLM.

## Features

- Translation service with LLM-powered editorial review
- Uses Anthropic's Claude API for intelligent text analysis
- Comprehensive editorial guidelines compliance checking
- RESTful API with Express.js

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment variables:

   ```bash
   cp .env.example .env
   ```

3. Configure your environment variables in `.env`:

   ```
   ANTHROPIC_API_KEY=your_actual_api_key_here

   # Redis Configuration (choose one approach)

   # Option A: Use Upstash Cloud Redis (Production)
   KV_REST_API_URL=https://your-upstash-redis.upstash.io
   KV_REST_API_TOKEN=your_upstash_token

   # Option B: Use Local Redis via Docker (Development)
   # These will be set automatically when using docker-compose
   # KV_REST_API_URL=http://localhost:8080
   # KV_REST_API_TOKEN=local_dev_token
   ```

4. Build the project:

   ```bash
   npm run build
   ```

5. Start the server:
   ```bash
   npm start
   ```

## API Endpoints

### POST /api/translate

Reviews and translates media articles against editorial guidelines using Claude LLM.

**Request Body:**

```json
{
  "mediaArticle": {
    "text": "Your article text here",
    "title": "Article Title"
  },
  "editorialGuidelines": {
    "tone": "professional",
    "style": "journalistic",
    "targetAudience": "general public",
    "restrictions": ["no technical jargon"],
    "requirements": ["maintain engaging tone"]
  },
  "destinationLanguages": ["es", "fr", "de"]
}
```

**Response:**

```json
{
  "originalArticle": { ... },
  "translations": [
    {
      "language": "es",
      "translatedText": "...",
      "reviewNotes": ["LLM-generated review comments"],
      "complianceScore": 95.2
    }
  ],
  "processedAt": "2025-01-01T00:00:00.000Z"
}
```

### GET /api/health

Health check endpoint.

## Redis Configuration

This application uses Redis for task storage and can work with both local and cloud Redis instances.

### Local Development with Docker

For local development, use the included Docker Compose setup that provides a local Redis instance with [Serverless Redis HTTP (SRH)](https://upstash.com/docs/redis/sdks/ts/developing) proxy:

```bash
# Start local Redis and proxy
docker-compose up redis redis-proxy

# Or start everything including the app
docker-compose up
```

This setup includes:

- **Redis**: Local Redis server (port 6379)
- **SRH Proxy**: HTTP proxy that makes local Redis compatible with Upstash SDK (port 8080)
- **App**: Your application with environment variables pre-configured

The proxy allows you to use the same `@upstash/redis` SDK for both local and production environments.

### Production with Upstash Cloud

For production, set these environment variables to your Upstash Redis credentials:

```bash
KV_REST_API_URL=https://your-upstash-redis.upstash.io
KV_REST_API_TOKEN=your_upstash_token
```

### Environment Variable Options

The application supports multiple environment variable names for flexibility:

- `KV_REST_API_URL` or `UPSTASH_REDIS_REST_URL`
- `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_TOKEN`

## Development

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run typecheck` - Run TypeScript type checking

### Running Tests

When running tests, you can use the local Redis setup:

```bash
# Start Redis services
docker-compose up redis redis-proxy -d

# Run tests with local Redis
npm test
```
