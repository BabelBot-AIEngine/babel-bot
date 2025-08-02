# Prolific Filter Service

The `FilterService` provides intelligent recommendations for Prolific participant filters based on article content and evaluation requirements. It uses Anthropic's Claude to analyze articles and suggest the most appropriate filters for high-quality translation evaluation tasks.

## Features

- 🤖 **AI-Powered Recommendations**: Uses Claude to analyze article content and suggest relevant filters
- 🌍 **Language-Aware**: Considers target languages when recommending language proficiency filters
- 📊 **Context-Sensitive**: Takes into account task type, expertise level, and domain specificity
- 🔄 **Caching**: Caches Prolific filter data to reduce API calls
- 🧪 **Demo Mode**: Provides sample recommendations for testing without API keys
- ✅ **Comprehensive Testing**: Full test coverage with mocked dependencies

## Quick Start

```typescript
import { FilterService } from "./services/filterService";
import { FilterRecommendationRequest } from "./types";

const filterService = new FilterService();

const request: FilterRecommendationRequest = {
  article: {
    title: "Spanish Cuisine: A Culinary Journey",
    text: "Spanish cuisine is renowned worldwide...",
    metadata: { category: "food", region: "Europe" },
  },
  targetLanguages: ["Spanish", "French"],
  evaluationContext: {
    taskType: "cultural_adaptation",
    expertiseLevel: "intermediate",
    domainSpecific: false,
  },
};

const recommendations = await filterService.getFilterRecommendations(request);
console.log(recommendations);
```

## Environment Variables

- `ANTHROPIC_API_KEY`: Required for AI-powered recommendations
- `DEMO_MODE`: Set to `'true'` to use demo mode (no API keys required)

## API Reference

### FilterService

#### Constructor

```typescript
new FilterService();
```

Creates a new FilterService instance and initializes the Anthropic client if API key is available.

#### Methods

##### `fetchAvailableFilters(): Promise<ProlificFilter[]>`

Fetches all available filters from the Prolific API. Results are cached after the first call.

**Returns**: Array of available Prolific filters

**Throws**: Error if the Prolific API is unavailable

##### `getFilterRecommendations(request: FilterRecommendationRequest): Promise<FilterRecommendationResponse>`

Gets intelligent filter recommendations based on article content and evaluation context.

**Parameters**:

- `request`: FilterRecommendationRequest object containing:
  - `article`: MediaArticle with title, text, and optional metadata
  - `targetLanguages`: Array of target language names
  - `evaluationContext`: Optional context including task type, expertise level, and domain specificity

**Returns**: FilterRecommendationResponse with recommendations, reasoning, and confidence score

**Behavior**:

- In demo mode: Returns predefined recommendations
- Without Anthropic API key: Throws configuration error
- With valid setup: Uses Claude to analyze and recommend filters

##### `clearCache(): void`

Clears the cached filter data, forcing a fresh fetch on the next API call.

## Types

### FilterRecommendationRequest

```typescript
interface FilterRecommendationRequest {
  article: MediaArticle;
  targetLanguages: string[];
  evaluationContext?: {
    taskType?:
      | "translation_quality"
      | "cultural_adaptation"
      | "technical_accuracy"
      | "general_evaluation";
    expertiseLevel?: "beginner" | "intermediate" | "expert";
    domainSpecific?: boolean;
  };
}
```

### FilterRecommendationResponse

```typescript
interface FilterRecommendationResponse {
  recommendations: FilterRecommendation[];
  reasoning: string;
  confidence: number; // 1-100
}
```

### FilterRecommendation

```typescript
interface FilterRecommendation {
  filter_id: string;
  title: string;
  reasoning: string;
  confidence: number; // 1-100
  recommended_values?: {
    choices?: string[];
    min?: number | string;
    max?: number | string;
  };
}
```

## How It Works

1. **Filter Fetching**: The service fetches all available filters from Prolific's API and caches them
2. **Content Analysis**: Claude analyzes the article content, target languages, and evaluation context
3. **Filter Categorization**: Filters are grouped by type (language proficiency, demographics, experience, quality)
4. **AI Recommendation**: Claude suggests 3-7 most relevant filters with reasoning and confidence scores
5. **Response Processing**: The service validates recommendations and provides fallback options if needed

## Filter Categories

The service organizes Prolific filters into categories for better analysis:

- **Language Proficiency**: Test scores for specific languages, language-related tags
- **Demographics**: Age, country of residence, nationality
- **Experience & Education**: Work experience, education level, professional background
- **Quality Assurance**: Approval rate, number of submissions, join date

## Demo Mode

When `DEMO_MODE=true`, the service provides realistic sample recommendations without requiring API keys:

```typescript
// Demo recommendations include:
// - Age range (25-65)
// - High approval rate (85-100%)
// - Language-specific test scores for supported languages
```

Supported languages in demo mode: Spanish, French, German, Italian, Portuguese, Dutch, Mandarin, Japanese, Korean, Arabic, Cantonese, Urdu.

## Error Handling

The service provides comprehensive error handling:

- **API Errors**: Graceful handling of Prolific API failures
- **Configuration Errors**: Clear messages for missing API keys
- **Parsing Errors**: Fallback recommendations when AI response parsing fails
- **Network Errors**: Proper error propagation with context

## Testing

Run the comprehensive test suite:

```bash
npm test -- --testPathPattern=filterService.test.ts
```

The test suite covers:

- ✅ API integration (mocked)
- ✅ Error handling scenarios
- ✅ Demo mode functionality
- ✅ Response parsing and validation
- ✅ Caching behavior
- ✅ Edge cases and fallbacks

## Example Usage

See `src/examples/filterServiceExample.ts` for detailed usage examples including:

- Technical article evaluation
- Cultural content adaptation
- Multiple language scenarios
- Available filter exploration

## Integration with Translation Workflow

The FilterService integrates seamlessly with the existing translation workflow:

1. After translation completion, use the original article and target languages
2. Set appropriate evaluation context based on content complexity
3. Get filter recommendations for Prolific study setup
4. Use recommended filters to recruit qualified evaluators

This ensures high-quality human evaluation of translation results by targeting participants with relevant language skills, cultural knowledge, and expertise.
