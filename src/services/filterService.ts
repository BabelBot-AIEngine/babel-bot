import {
  ProlificFilter,
  ProlificFiltersResponse,
  FilterRecommendation,
  FilterRecommendationRequest,
  FilterRecommendationResponse,
} from "../types";
import Anthropic from "@anthropic-ai/sdk";
import { LLMClassifierFromTemplate } from "autoevals";

/**
 * Enhanced FilterService using LLM Classifier pattern for reliable response parsing
 */
export class FilterService {
  private anthropic?: Anthropic;
  private cachedFilters?: ProlificFilter[];
  private readonly PROLIFIC_API_BASE = "https://api.prolific.com/api/v1";
  private filterRecommendationClassifier: any;

  constructor() {
    this.setup();
    this.initializeClassifier();
  }

  private setup() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
  }

  /**
   * Initialize the LLM Classifier for filter recommendation parsing
   */
  private initializeClassifier() {
    this.filterRecommendationClassifier = LLMClassifierFromTemplate({
      name: "Filter Recommendation Classifier",
      promptTemplate: `
You are evaluating and parsing filter recommendations for participant recruitment on Prolific. 

[BEGIN DATA]
************
[Article Context]: {{{input}}}
************
[LLM Response]: {{{output}}}
************
[Available Filters]: {{{expected}}}
************
[END DATA]

Your task is to parse the LLM response and extract valid filter recommendations. The response should contain:
1. A list of filter recommendations with filter_id, reasoning, confidence, and recommended_values
2. Overall reasoning for the recommendation strategy
3. Overall confidence score

Based on the quality and completeness of the response, classify it as:

(A) Complete and well-structured JSON with all required fields and valid filter_ids
(B) Valid JSON with minor formatting issues or missing non-critical fields
(C) Partial JSON or some valid recommendations but missing key information
(D) Poorly formatted or invalid JSON that requires significant parsing effort
(E) No valid JSON found or completely unusable response

Select the most appropriate classification based on the parseability and completeness of the filter recommendations.
      `,
      choiceScores: {
        A: 1.0,
        B: 0.8,
        C: 0.6,
        D: 0.3,
        E: 0.0,
      },
      temperature: 0,
      useCoT: true,
      model: "claude-3-5-sonnet-20241022",
    });
  }

  /**
   * Fetches all available filters from Prolific API
   */
  async fetchAvailableFilters(): Promise<ProlificFilter[]> {
    if (this.cachedFilters) {
      return this.cachedFilters;
    }

    try {
      const response = await fetch(`${this.PROLIFIC_API_BASE}/filters/`);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch filters: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as ProlificFiltersResponse;
      this.cachedFilters = data.results;
      return this.cachedFilters;
    } catch (error) {
      console.error("Error fetching Prolific filters:", error);
      throw new Error(
        `Failed to fetch Prolific filters: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Gets intelligent filter recommendations using structured LLM classification
   */
  async getFilterRecommendations(
    request: FilterRecommendationRequest
  ): Promise<FilterRecommendationResponse> {
    const isDemoMode = process.env.DEMO_MODE === "true";

    if (isDemoMode) {
      return this.getDemoFilterRecommendations(request);
    }

    if (!this.anthropic) {
      throw new Error(
        "Anthropic API not configured. Please set ANTHROPIC_API_KEY environment variable."
      );
    }

    try {
      // Fetch available filters
      const availableFilters = await this.fetchAvailableFilters();

      // Get structured recommendations using the classifier
      const recommendations = await this.getStructuredRecommendations(
        request,
        availableFilters
      );

      return recommendations;
    } catch (error) {
      console.error("Filter recommendation error:", error);
      throw new Error(
        `Failed to get filter recommendations: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Uses LLM Classifier to get structured filter recommendations
   */
  private async getStructuredRecommendations(
    request: FilterRecommendationRequest,
    availableFilters: ProlificFilter[]
  ): Promise<FilterRecommendationResponse> {
    // Build context for the classifier
    const articleContext = this.buildArticleContext(request);
    const filtersContext = this.buildFiltersContext(availableFilters);

    // Create the structured prompt for recommendations
    const prompt = this.buildStructuredPrompt(request, availableFilters);

    try {
      // Get response from Anthropic
      const response = await this.anthropic!.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });

      const responseText =
        response?.content[0].type === "text" ? response?.content[0].text : "";

      // Use classifier to evaluate and parse the response
      const classificationResult = await this.filterRecommendationClassifier({
        input: articleContext,
        output: responseText,
        expected: filtersContext,
      });

      // Parse the response based on classification score
      if (classificationResult.score >= 0.8) {
        return this.parseHighQualityResponse(responseText, availableFilters);
      } else if (classificationResult.score >= 0.6) {
        return this.parsePartialResponse(responseText, availableFilters);
      } else {
        console.warn(
          `Low quality LLM response (score: ${classificationResult.score}), using fallback`
        );
        return this.getFallbackRecommendations(availableFilters);
      }
    } catch (error) {
      console.error("Error in structured recommendations:", error);
      return this.getFallbackRecommendations(availableFilters);
    }
  }

  /**
   * Builds article context for classifier input
   */
  private buildArticleContext(request: FilterRecommendationRequest): string {
    const { article, targetLanguages, evaluationContext } = request;
    return JSON.stringify({
      title: article.title || "No title",
      contentLength: article.text.length,
      targetLanguages,
      evaluationContext,
    });
  }

  /**
   * Builds filters context for classifier expected input
   */
  private buildFiltersContext(availableFilters: ProlificFilter[]): string {
    return JSON.stringify(
      availableFilters.map((f) => ({
        filter_id: f.filter_id,
        title: f.title,
        type: f.type,
      }))
    );
  }

  /**
   * Builds structured prompt for filter recommendations
   */
  private buildStructuredPrompt(
    request: FilterRecommendationRequest,
    availableFilters: ProlificFilter[]
  ): string {
    const { article, targetLanguages, evaluationContext } = request;

    // Group filters by category for better organization
    const languageFilters = availableFilters.filter(
      (f) =>
        f.filter_id.includes("test-score") ||
        f.filter_id.includes("language") ||
        f.tags.some((tag) => tag.includes("language"))
    );

    const demographicFilters = availableFilters.filter((f) =>
      [
        "age",
        "country-of-birth",
        "nationality",
        "current-country-of-residence",
      ].includes(f.filter_id)
    );

    const experienceFilters = availableFilters.filter(
      (f) =>
        f.filter_id.includes("experience") ||
        f.filter_id.includes("education") ||
        f.filter_id.includes("employment") ||
        f.title.toLowerCase().includes("experience") ||
        f.title.toLowerCase().includes("education")
    );

    const qualityFilters = availableFilters.filter((f) =>
      ["approval_rate", "approval_numbers", "joined_between"].includes(
        f.filter_id
      )
    );

    return `You are an expert in designing participant recruitment strategies for content evaluation tasks on the Prolific platform.

CRITICAL: You MUST respond with valid JSON in exactly this format:
{
  "recommendations": [
    {
      "filter_id": "exact-filter-id-from-available-list",
      "title": "Filter Title",
      "reasoning": "Detailed explanation",
      "confidence": 85,
      "recommended_values": {
        "choices": ["choice1", "choice2"] // for select filters
        // OR
        "min": 75, "max": 100 // for range filters
      }
    }
  ],
  "reasoning": "Overall strategy explanation",
  "confidence": 90
}

ARTICLE TO ANALYZE:
Title: ${article.title || "No title provided"}
Content: ${article.text.substring(0, 1500)}${
      article.text.length > 1500 ? "..." : ""
    }
Target Languages: ${targetLanguages.join(", ")}

EVALUATION CONTEXT:
- Task Type: ${evaluationContext?.taskType || "general_evaluation"}
- Required Expertise Level: ${
      evaluationContext?.expertiseLevel || "intermediate"
    }
- Domain Specific: ${evaluationContext?.domainSpecific ? "Yes" : "No"}

AVAILABLE FILTER CATEGORIES:

LANGUAGE PROFICIENCY FILTERS:
${this.formatFiltersForPrompt(languageFilters)}

DEMOGRAPHIC FILTERS:
${this.formatFiltersForPrompt(demographicFilters)}

EXPERIENCE & EDUCATION FILTERS:
${this.formatFiltersForPrompt(experienceFilters)}

QUALITY ASSURANCE FILTERS:
${this.formatFiltersForPrompt(qualityFilters)}

INSTRUCTIONS:
1. Analyze the article's subject matter, complexity, cultural context, and target languages
2. Recommend 3-7 filters that would ensure high-quality evaluation
3. Use ONLY filter_ids from the available filters list above
4. Provide confidence scores between 1-100
5. Include specific recommended values for each filter

RESPOND WITH VALID JSON ONLY - NO OTHER TEXT:`;
  }

  /**
   * Formats filters for inclusion in the prompt
   */
  private formatFiltersForPrompt(filters: ProlificFilter[]): string {
    return filters
      .map((filter) => {
        let description = `- ${filter.filter_id}: ${filter.title}`;
        if (filter.description) {
          description += ` - ${filter.description}`;
        }
        if (
          filter.type === "range" &&
          filter.min !== undefined &&
          filter.max !== undefined
        ) {
          description += ` (Range: ${filter.min}-${filter.max})`;
        } else if (filter.type === "select" && filter.choices) {
          const choiceCount = Object.keys(filter.choices).length;
          description += ` (${choiceCount} options available)`;
        }
        return description;
      })
      .join("\n");
  }

  /**
   * Parses high-quality LLM responses (score >= 0.8)
   */
  private parseHighQualityResponse(
    responseText: string,
    availableFilters: ProlificFilter[]
  ): FilterRecommendationResponse {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return this.validateAndEnhanceRecommendations(parsed, availableFilters);
    } catch (error) {
      console.error("Error parsing high-quality response:", error);
      return this.getFallbackRecommendations(availableFilters);
    }
  }

  /**
   * Parses partial LLM responses (score 0.6-0.8)
   */
  private parsePartialResponse(
    responseText: string,
    availableFilters: ProlificFilter[]
  ): FilterRecommendationResponse {
    try {
      // Try multiple parsing strategies for partial responses
      let parsed: any;

      // Strategy 1: Direct JSON parsing
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        // Continue to next strategy
      }

      // Strategy 2: Extract recommendations array if main JSON fails
      if (!parsed) {
        const recommendationsMatch = responseText.match(
          /"recommendations"\s*:\s*\[[\s\S]*?\]/
        );
        if (recommendationsMatch) {
          const recText = recommendationsMatch[0];
          parsed = { recommendations: JSON.parse(recText.split(":")[1]) };
        }
      }

      if (parsed) {
        return this.validateAndEnhanceRecommendations(parsed, availableFilters);
      } else {
        throw new Error("Could not parse partial response");
      }
    } catch (error) {
      console.error("Error parsing partial response:", error);
      return this.getFallbackRecommendations(availableFilters);
    }
  }

  /**
   * Validates and enhances parsed recommendations
   */
  private validateAndEnhanceRecommendations(
    parsed: any,
    availableFilters: ProlificFilter[]
  ): FilterRecommendationResponse {
    const validRecommendations: FilterRecommendation[] = [];

    for (const rec of parsed.recommendations || []) {
      const filter = availableFilters.find(
        (f) => f.filter_id === rec.filter_id
      );
      if (filter) {
        validRecommendations.push({
          filter_id: rec.filter_id,
          title: filter.title,
          reasoning: rec.reasoning || "No reasoning provided",
          confidence: Math.min(Math.max(rec.confidence || 50, 1), 100),
          recommended_values: rec.recommended_values,
        });
      }
    }

    return {
      recommendations: validRecommendations,
      reasoning:
        parsed.reasoning || "Filter recommendations based on article analysis",
      confidence: Math.min(Math.max(parsed.confidence || 75, 1), 100),
    };
  }

  /**
   * Provides demo recommendations for testing
   */
  private getDemoFilterRecommendations(
    request: FilterRecommendationRequest
  ): FilterRecommendationResponse {
    const demoRecommendations: FilterRecommendation[] = [
      {
        filter_id: "age",
        title: "Age",
        reasoning:
          "Ensuring evaluators are mature enough to provide thoughtful feedback on translation quality",
        confidence: 85,
        recommended_values: { min: 25, max: 65 },
      },
      {
        filter_id: "approval_rate",
        title: "Approval Rate",
        reasoning:
          "High approval rate indicates reliable and quality work from previous studies",
        confidence: 95,
        recommended_values: { min: 85, max: 100 },
      },
    ];

    // Add language-specific recommendations based on target languages
    request.targetLanguages.forEach((lang) => {
      const langCode = lang.toLowerCase();
      if (
        [
          "spanish",
          "french",
          "german",
          "italian",
          "portuguese",
          "dutch",
          "mandarin",
          "japanese",
          "korean",
          "arabic",
          "cantonese",
          "urdu",
        ].includes(langCode)
      ) {
        demoRecommendations.push({
          filter_id: `${langCode}-test-score`,
          title: `${lang} Test Score`,
          reasoning: `Native or near-native proficiency in ${lang} is essential for accurate translation evaluation`,
          confidence: 90,
          recommended_values: { min: 80, max: 100 },
        });
      }
    });

    return {
      recommendations: demoRecommendations,
      reasoning: `Demo recommendations for ${
        request.article.title || "article"
      } targeting ${request.targetLanguages.join(", ")}`,
      confidence: 80,
    };
  }

  /**
   * Provides fallback recommendations when LLM parsing fails
   */
  private getFallbackRecommendations(
    availableFilters: ProlificFilter[]
  ): FilterRecommendationResponse {
    const fallbackRecommendations: FilterRecommendation[] = [];

    // Always recommend approval rate for quality
    const approvalRateFilter = availableFilters.find(
      (f) => f.filter_id === "approval_rate"
    );
    if (approvalRateFilter) {
      fallbackRecommendations.push({
        filter_id: "approval_rate",
        title: approvalRateFilter.title,
        reasoning: "High approval rate ensures reliable participants",
        confidence: 90,
        recommended_values: { min: 80, max: 100 },
      });
    }

    // Recommend age filter
    const ageFilter = availableFilters.find((f) => f.filter_id === "age");
    if (ageFilter) {
      fallbackRecommendations.push({
        filter_id: "age",
        title: ageFilter.title,
        reasoning: "Adult participants for mature evaluation capabilities",
        confidence: 75,
        recommended_values: { min: 18, max: 70 },
      });
    }

    return {
      recommendations: fallbackRecommendations,
      reasoning: "Fallback recommendations due to parsing error",
      confidence: 60,
    };
  }

  /**
   * Clears the cached filters (useful for testing or forcing refresh)
   */
  clearCache(): void {
    this.cachedFilters = undefined;
  }

  /**
   * Gets the classifier for testing purposes
   */
  getClassifier() {
    return this.filterRecommendationClassifier;
  }
}
