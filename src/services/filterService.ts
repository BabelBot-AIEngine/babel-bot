import {
  ProlificFilter,
  ProlificFiltersResponse,
  FilterRecommendation,
  FilterRecommendationRequest,
  FilterRecommendationResponse,
} from "../types";
import Anthropic from "@anthropic-ai/sdk";

export class FilterService {
  private anthropic?: Anthropic;
  private cachedFilters?: ProlificFilter[];
  private readonly PROLIFIC_API_BASE = "https://api.prolific.com/api/v1";

  constructor() {
    this.setup();
  }

  private setup() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
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
   * Gets intelligent filter recommendations for evaluation tasks using Anthropic LLM
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

      // Build the prompt for the LLM
      const prompt = this.buildFilterRecommendationPrompt(
        request,
        availableFilters
      );

      // Get recommendations from Anthropic
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });

      const responseText =
        response?.content[0].type === "text" ? response?.content[0].text : "";
      return this.parseFilterRecommendations(responseText, availableFilters);
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
   * Builds the prompt for the LLM to analyze article and recommend filters
   */
  private buildFilterRecommendationPrompt(
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

    let prompt = `You are an expert in designing participant recruitment strategies for content evaluation tasks on the Prolific platform. 

Your task is to analyze an article and recommend the most appropriate Prolific participant filters to ensure high-quality evaluation of translations.

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
2. Consider what type of participants would be best suited to evaluate translations of this content
3. Recommend 3-7 filters that would ensure high-quality evaluation
4. For each recommendation, provide:
   - The filter_id
   - Clear reasoning for why this filter is important for this specific article
   - Confidence level (1-100)
   - Specific recommended values (for range filters) or choices (for select filters)

Focus on:
- Language proficiency requirements for target languages
- Cultural knowledge needs based on content
- Educational/professional background relevant to the subject matter
- Quality assurance measures to ensure reliable evaluators

FORMAT YOUR RESPONSE AS JSON:
{
  "recommendations": [
    {
      "filter_id": "example-filter",
      "title": "Filter Title",
      "reasoning": "Detailed explanation of why this filter is needed",
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
}`;

    return prompt;
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
   * Parses the LLM response to extract filter recommendations
   */
  private parseFilterRecommendations(
    responseText: string,
    availableFilters: ProlificFilter[]
  ): FilterRecommendationResponse {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and enhance recommendations with filter details
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
          parsed.reasoning ||
          "Filter recommendations based on article analysis",
        confidence: Math.min(Math.max(parsed.confidence || 75, 1), 100),
      };
    } catch (error) {
      console.error("Error parsing filter recommendations:", error);
      // Return fallback recommendations
      return this.getFallbackRecommendations(availableFilters);
    }
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
}
