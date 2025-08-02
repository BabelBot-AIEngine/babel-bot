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

3. Add your Anthropic API key to `.env`:
   ```
   ANTHROPIC_API_KEY=your_actual_api_key_here
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

## Development

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run typecheck` - Run TypeScript type checking
