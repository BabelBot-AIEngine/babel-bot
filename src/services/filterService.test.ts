import { FilterService } from "./filterService";
import {
  FilterRecommendationRequest,
  MediaArticle,
  ProlificFilter,
  FilterRecommendationResponse,
} from "../types";

// Mock fetch globally
global.fetch = jest.fn();

// Mock Anthropic
jest.mock("@anthropic-ai/sdk", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn(),
      },
    })),
  };
});

describe("FilterService", () => {
  let filterService: FilterService;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  const mockFilters: ProlificFilter[] = [
    {
      filter_id: "age",
      title: "Age",
      description: "Participant age range",
      question: "What is your age?",
      tags: ["core-1"],
      type: "range",
      data_type: "integer",
      min: 18,
      max: 100,
    },
    {
      filter_id: "spanish-test-score",
      title: "Spanish Test Score",
      description: "Spanish language proficiency score",
      question: "Spanish Test Score",
      tags: ["allow-distribution"],
      type: "range",
      data_type: "float",
      min: 0.0,
      max: 100.0,
    },
    {
      filter_id: "approval_rate",
      title: "Approval Rate",
      description: "Approval rate from previous studies",
      tags: [],
      type: "range",
      data_type: "integer",
      min: 0,
      max: 100,
    },
    {
      filter_id: "current-country-of-residence",
      title: "Current Country of Residence",
      description: "Where participant currently lives",
      question: "What country do you currently live in?",
      tags: ["rep_sample_country"],
      type: "select",
      data_type: "ChoiceID",
      choices: {
        "0": "United States",
        "1": "United Kingdom",
        "2": "Spain",
        "3": "France",
      },
    },
  ];

  const mockProlificResponse = {
    results: mockFilters,
    _links: {
      self: {
        href: "https://api.prolific.com/api/v1/filters/",
        title: "Current",
      },
      next: { href: null, title: "Next" },
      previous: { href: null, title: "Previous" },
      last: { href: "https://api.prolific.com/api/v1/filters/", title: "Last" },
    },
    meta: {
      count: mockFilters.length,
    },
  };

  const sampleArticle: MediaArticle = {
    title: "Spanish Cuisine: A Culinary Journey",
    text: "Spanish cuisine is renowned worldwide for its rich flavors and diverse regional specialties. From the famous paella of Valencia to the pintxos of the Basque Country, each region offers unique culinary traditions that reflect local ingredients and cultural influences. The Mediterranean climate provides abundant olive oil, fresh seafood, and vibrant vegetables that form the foundation of Spanish cooking.",
    metadata: {
      category: "food",
      region: "Europe",
      complexity: "intermediate",
    },
  };

  beforeEach(() => {
    filterService = new FilterService();
    mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    jest.clearAllMocks();
  });

  afterEach(() => {
    filterService.clearCache();
  });

  describe("fetchAvailableFilters", () => {
    it("should fetch filters from Prolific API successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockProlificResponse,
      } as Response);

      const filters = await filterService.fetchAvailableFilters();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.prolific.com/api/v1/filters/"
      );
      expect(filters).toEqual(mockFilters);
      expect(filters).toHaveLength(4);
    });

    it("should cache filters after first fetch", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockProlificResponse,
      } as Response);

      // First call
      await filterService.fetchAvailableFilters();
      // Second call
      await filterService.fetchAvailableFilters();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should handle API errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);

      await expect(filterService.fetchAvailableFilters()).rejects.toThrow(
        "Failed to fetch Prolific filters: Failed to fetch filters: 404 Not Found"
      );
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(filterService.fetchAvailableFilters()).rejects.toThrow(
        "Failed to fetch Prolific filters: Network error"
      );
    });
  });

  describe("getFilterRecommendations", () => {
    const mockRequest: FilterRecommendationRequest = {
      article: sampleArticle,
      targetLanguages: ["Spanish", "French"],
      evaluationContext: {
        taskType: "translation_quality",
        expertiseLevel: "intermediate",
        domainSpecific: false,
      },
    };

    it("should return demo recommendations in demo mode", async () => {
      const originalEnv = process.env.DEMO_MODE;
      process.env.DEMO_MODE = "true";

      const recommendations = await filterService.getFilterRecommendations(
        mockRequest
      );

      expect(recommendations.recommendations).toBeDefined();
      expect(recommendations.recommendations.length).toBeGreaterThan(0);
      expect(recommendations.reasoning).toContain("Demo recommendations");
      expect(recommendations.confidence).toBeGreaterThan(0);

      // Should include language-specific recommendations
      const spanishRec = recommendations.recommendations.find(
        (r: any) => r.filter_id === "spanish-test-score"
      );
      expect(spanishRec).toBeDefined();

      process.env.DEMO_MODE = originalEnv;
    });

    it("should throw error when Anthropic API is not configured", async () => {
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      const originalDemo = process.env.DEMO_MODE;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.DEMO_MODE;

      // Create new instance to pick up env changes
      const newFilterService = new FilterService();

      await expect(
        newFilterService.getFilterRecommendations(mockRequest)
      ).rejects.toThrow("Anthropic API not configured");

      process.env.ANTHROPIC_API_KEY = originalEnv;
      process.env.DEMO_MODE = originalDemo;
    });

    it("should handle LLM API errors gracefully", async () => {
      const originalEnv = process.env.DEMO_MODE;
      delete process.env.DEMO_MODE;
      process.env.ANTHROPIC_API_KEY = "test-key";

      // Mock successful filter fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockProlificResponse,
      } as Response);

      // Mock Anthropic to throw error
      const Anthropic = require("@anthropic-ai/sdk").default;
      const mockAnthropic = new Anthropic();
      mockAnthropic.messages.create.mockRejectedValueOnce(
        new Error("API Error")
      );

      const newFilterService = new FilterService();
      (newFilterService as any).anthropic = mockAnthropic;

      // The refactored service now returns fallback recommendations instead of throwing
      const result = await newFilterService.getFilterRecommendations(
        mockRequest
      );

      expect(result).toBeDefined();
      expect(result.recommendations).toHaveLength(2); // fallback recommendations
      expect(result.reasoning).toContain("Fallback recommendations");
      expect(result.confidence).toBe(60);

      process.env.DEMO_MODE = originalEnv;
    });
  });

  describe("parseHighQualityResponse", () => {
    it("should parse valid JSON response correctly", () => {
      const mockResponse = `
        Here are my recommendations:
        {
          "recommendations": [
            {
              "filter_id": "spanish-test-score",
              "reasoning": "Native Spanish proficiency needed",
              "confidence": 90,
              "recommended_values": {
                "min": 80,
                "max": 100
              }
            }
          ],
          "reasoning": "Language proficiency is crucial",
          "confidence": 85
        }
      `;

      const result = (filterService as any).parseHighQualityResponse(
        mockResponse,
        mockFilters
      );

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].filter_id).toBe("spanish-test-score");
      expect(result.recommendations[0].title).toBe("Spanish Test Score");
      expect(result.recommendations[0].confidence).toBe(90);
      expect(result.confidence).toBe(85);
    });

    it("should handle malformed JSON gracefully", () => {
      const mockResponse = "This is not valid JSON";

      const result = (filterService as any).parseHighQualityResponse(
        mockResponse,
        mockFilters
      );

      expect(result.recommendations).toBeDefined();
      expect(result.reasoning).toContain("Fallback recommendations");
      expect(result.confidence).toBe(60);
    });

    it("should filter out invalid filter IDs", () => {
      const mockResponse = `
        {
          "recommendations": [
            {
              "filter_id": "invalid-filter",
              "reasoning": "This filter doesn't exist",
              "confidence": 90
            },
            {
              "filter_id": "age",
              "reasoning": "Valid filter",
              "confidence": 85
            }
          ],
          "reasoning": "Mixed valid and invalid filters",
          "confidence": 80
        }
      `;

      const result = (filterService as any).parseHighQualityResponse(
        mockResponse,
        mockFilters
      );

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].filter_id).toBe("age");
    });
  });

  describe("buildStructuredPrompt", () => {
    it("should build comprehensive prompt with all context", () => {
      const prompt = (filterService as any).buildStructuredPrompt(
        {
          article: sampleArticle,
          targetLanguages: ["Spanish"],
          evaluationContext: {
            taskType: "cultural_adaptation",
            expertiseLevel: "expert",
            domainSpecific: true,
          },
        },
        mockFilters
      );

      expect(prompt).toContain("Spanish Cuisine: A Culinary Journey");
      expect(prompt).toContain("Target Languages: Spanish");
      expect(prompt).toContain("Task Type: cultural_adaptation");
      expect(prompt).toContain("Required Expertise Level: expert");
      expect(prompt).toContain("Domain Specific: Yes");
      expect(prompt).toContain("LANGUAGE PROFICIENCY FILTERS:");
      expect(prompt).toContain("spanish-test-score");
      expect(prompt).toContain("RESPOND WITH VALID JSON ONLY");
    });

    it("should handle minimal context gracefully", () => {
      const minimalRequest: FilterRecommendationRequest = {
        article: { text: "Short text" },
        targetLanguages: ["English"],
      };

      const prompt = (filterService as any).buildStructuredPrompt(
        minimalRequest,
        mockFilters
      );

      expect(prompt).toContain("No title provided");
      expect(prompt).toContain("general_evaluation");
      expect(prompt).toContain("intermediate");
      expect(prompt).toContain("Domain Specific: No");
    });
  });

  describe("formatFiltersForPrompt", () => {
    it("should format filters correctly for different types", () => {
      const formatted = (filterService as any).formatFiltersForPrompt(
        mockFilters
      );

      expect(formatted).toContain(
        "age: Age - Participant age range (Range: 18-100)"
      );
      expect(formatted).toContain("spanish-test-score: Spanish Test Score");
      expect(formatted).toContain(
        "current-country-of-residence: Current Country of Residence"
      );
      expect(formatted).toContain("(4 options available)");
    });
  });

  describe("getDemoFilterRecommendations", () => {
    it("should generate appropriate demo recommendations", () => {
      const request: FilterRecommendationRequest = {
        article: sampleArticle,
        targetLanguages: ["Spanish", "French", "German"],
      };

      const result = (filterService as any).getDemoFilterRecommendations(
        request
      );

      expect(result.recommendations).toContainEqual(
        expect.objectContaining({
          filter_id: "age",
          confidence: 85,
        })
      );

      expect(result.recommendations).toContainEqual(
        expect.objectContaining({
          filter_id: "approval_rate",
          confidence: 95,
        })
      );

      // Should include recommendations for each target language
      expect(
        result.recommendations.some(
          (r: any) => r.filter_id === "spanish-test-score"
        )
      ).toBe(true);
      expect(
        result.recommendations.some(
          (r: any) => r.filter_id === "french-test-score"
        )
      ).toBe(true);
      expect(
        result.recommendations.some(
          (r: any) => r.filter_id === "german-test-score"
        )
      ).toBe(true);
    });

    it("should not include recommendations for unsupported languages", () => {
      const request: FilterRecommendationRequest = {
        article: sampleArticle,
        targetLanguages: ["Klingon", "Elvish"],
      };

      const result = (filterService as any).getDemoFilterRecommendations(
        request
      );

      // Should only have the basic recommendations (age, approval_rate)
      expect(result.recommendations).toHaveLength(2);
      expect(
        result.recommendations.every((r: any) =>
          ["age", "approval_rate"].includes(r.filter_id)
        )
      ).toBe(true);
    });
  });

  describe("getFallbackRecommendations", () => {
    it("should provide sensible fallback recommendations", () => {
      const result = (filterService as any).getFallbackRecommendations(
        mockFilters
      );

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.reasoning).toContain("Fallback recommendations");
      expect(result.confidence).toBe(60);

      // Should include approval rate if available
      const approvalRateRec = result.recommendations.find(
        (r: any) => r.filter_id === "approval_rate"
      );
      expect(approvalRateRec).toBeDefined();
      expect(approvalRateRec?.recommended_values?.min).toBe(80);
    });
  });

  describe("clearCache", () => {
    it("should clear cached filters", async () => {
      // First, populate cache
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockProlificResponse,
      } as Response);

      await filterService.fetchAvailableFilters();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Clear cache
      filterService.clearCache();

      // Fetch again should make another API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockProlificResponse,
      } as Response);

      await filterService.fetchAvailableFilters();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe("FilterService Integration", () => {
  let filterService: FilterService;

  beforeEach(() => {
    filterService = new FilterService();
  });

  describe("End-to-end workflow", () => {
    it("should handle complete recommendation workflow in demo mode", async () => {
      const originalEnv = process.env.DEMO_MODE;
      process.env.DEMO_MODE = "true";

      const request: FilterRecommendationRequest = {
        article: {
          title: "Financial Technology Innovations",
          text: "The fintech industry has revolutionized banking and financial services through innovative digital solutions. Mobile banking apps, cryptocurrency platforms, and robo-advisors have transformed how consumers interact with financial institutions.",
          metadata: { sector: "finance", complexity: "high" },
        },
        targetLanguages: ["Spanish", "Mandarin"],
        evaluationContext: {
          taskType: "technical_accuracy",
          expertiseLevel: "expert",
          domainSpecific: true,
        },
      };

      const result = await filterService.getFilterRecommendations(request);

      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.reasoning).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);

      // Verify structure of recommendations
      result.recommendations.forEach((rec: any) => {
        expect(rec.filter_id).toBeDefined();
        expect(rec.title).toBeDefined();
        expect(rec.reasoning).toBeDefined();
        expect(rec.confidence).toBeGreaterThanOrEqual(1);
        expect(rec.confidence).toBeLessThanOrEqual(100);
      });

      process.env.DEMO_MODE = originalEnv;
    });
  });
});
