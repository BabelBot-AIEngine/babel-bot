import request from "supertest";
import express from "express";

// Mock the services before importing the router
const mockFetchAvailableFilters = jest.fn();
const mockGetFilterRecommendations = jest.fn();

jest.mock("../services/filterService", () => ({
  FilterService: jest.fn().mockImplementation(() => ({
    fetchAvailableFilters: mockFetchAvailableFilters,
    getFilterRecommendations: mockGetFilterRecommendations,
  })),
}));

jest.mock("../services/taskService", () => ({
  TaskService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("../services/translationService", () => ({
  TranslationService: jest.fn().mockImplementation(() => ({})),
}));

// Import router after mocking
import router from "./translation";

const app = express();
app.use(express.json());
app.use("/api", router);

describe("Filter API Endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/filters", () => {
    it("should return available filters", async () => {
      const mockFilters = [
        {
          filter_id: "age",
          title: "Age",
          description: "Participant age range",
          tags: ["core-1"],
          type: "range",
          data_type: "integer",
          min: 18,
          max: 100,
        },
      ];

      mockFetchAvailableFilters.mockResolvedValue(mockFilters);

      const response = await request(app).get("/api/filters");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        filters: mockFilters,
        count: 1,
        timestamp: expect.any(String),
      });
    });

    it("should handle filter service errors", async () => {
      mockFetchAvailableFilters.mockRejectedValue(new Error("API Error"));

      const response = await request(app).get("/api/filters");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: "Failed to fetch available filters",
        details: "API Error",
      });
    });
  });

  describe("POST /api/filters/recommendations", () => {
    const validRequest = {
      article: {
        title: "Test Article",
        text: "This is a test article about technology and innovation.",
      },
      targetLanguages: ["Spanish", "French"],
      evaluationContext: {
        taskType: "translation_quality" as const,
        expertiseLevel: "intermediate" as const,
        domainSpecific: false,
      },
    };

    it("should return filter recommendations", async () => {
      const mockRecommendations = {
        recommendations: [
          {
            filter_id: "spanish-test-score",
            title: "Spanish Test Score",
            reasoning: "Spanish proficiency needed",
            confidence: 90,
            recommended_values: { min: 80, max: 100 },
          },
        ],
        reasoning: "Language proficiency is important",
        confidence: 85,
      };

      mockGetFilterRecommendations.mockResolvedValue(mockRecommendations);

      const response = await request(app)
        .post("/api/filters/recommendations")
        .send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ...mockRecommendations,
        timestamp: expect.any(String),
        requestInfo: {
          articleTitle: "Test Article",
          articleLength: validRequest.article.text.length,
          targetLanguages: validRequest.targetLanguages,
          evaluationContext: validRequest.evaluationContext,
        },
      });
    });

    it("should validate required fields", async () => {
      const response = await request(app)
        .post("/api/filters/recommendations")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Article with text is required");
    });

    it("should validate target languages", async () => {
      const response = await request(app)
        .post("/api/filters/recommendations")
        .send({
          article: { text: "Test text" },
          targetLanguages: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        "At least one target language is required"
      );
    });

    it("should validate evaluation context", async () => {
      const response = await request(app)
        .post("/api/filters/recommendations")
        .send({
          article: { text: "Test text" },
          targetLanguages: ["Spanish"],
          evaluationContext: {
            taskType: "invalid_type",
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid taskType");
    });

    it("should handle service errors", async () => {
      mockGetFilterRecommendations.mockRejectedValue(
        new Error("Service error")
      );

      const response = await request(app)
        .post("/api/filters/recommendations")
        .send(validRequest);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: "Failed to get filter recommendations",
        details: "Service error",
      });
    });
  });

  describe("POST /api/filters/test", () => {
    it("should return test recommendations with sample data", async () => {
      const mockRecommendations = {
        recommendations: [
          {
            filter_id: "age",
            title: "Age",
            reasoning: "Test reasoning",
            confidence: 85,
            recommended_values: { min: 25, max: 65 },
          },
        ],
        reasoning: "Test strategy",
        confidence: 80,
      };

      mockGetFilterRecommendations.mockResolvedValue(mockRecommendations);

      const response = await request(app).post("/api/filters/test").send({});

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ...mockRecommendations,
        timestamp: expect.any(String),
        testMode: true,
        sampleData: true,
        requestInfo: {
          articleTitle: "Financial Technology Innovations",
          articleLength: expect.any(Number),
          targetLanguages: ["Spanish", "French", "German"],
          evaluationContext: {
            taskType: "technical_accuracy",
            expertiseLevel: "intermediate",
            domainSpecific: true,
          },
        },
      });
    });

    it("should accept custom test data", async () => {
      const customRequest = {
        article: {
          title: "Custom Article",
          text: "Custom test content",
        },
        targetLanguages: ["Italian"],
      };

      const mockRecommendations = {
        recommendations: [],
        reasoning: "Custom test",
        confidence: 75,
      };

      mockGetFilterRecommendations.mockResolvedValue(mockRecommendations);

      const response = await request(app)
        .post("/api/filters/test")
        .send(customRequest);

      expect(response.status).toBe(200);
      expect(response.body.sampleData).toBe(false);
      expect(response.body.requestInfo.articleTitle).toBe("Custom Article");
    });

    it("should handle service errors", async () => {
      mockGetFilterRecommendations.mockRejectedValue(new Error("Test error"));

      const response = await request(app).post("/api/filters/test").send({});

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: "Filter test failed",
        details: "Test error",
      });
    });
  });
});
