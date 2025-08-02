import { EditorialGuidelines } from "../types";
import Anthropic from "@anthropic-ai/sdk";

export class ReviewService {
  private anthropic?: Anthropic;

  constructor() {
    this.setup();
  }

  private setup() {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const isDemoMode = process.env.DEMO_MODE === "true";

    if (!anthropicKey && !isDemoMode) {
      console.warn(
        "ANTHROPIC_API_KEY environment variable not set, review functionality may be limited"
      );
    }

    if (anthropicKey) {
      this.anthropic = new Anthropic({
        apiKey: anthropicKey,
      });
    }
  }

  async reviewAgainstGuidelines(
    translatedText: string,
    guidelines: EditorialGuidelines,
    fullContextText?: string
  ): Promise<{ notes: string[]; score: number }> {
    const isDemoMode = process.env.DEMO_MODE === "true";

    if (isDemoMode) {
      // Simulate review with demo data
      return {
        notes: [
          "Translation maintains appropriate tone",
          "Style is consistent with guidelines",
          "Target audience considerations are met",
          "No significant issues detected",
        ],
        score: Math.floor(Math.random() * 20) + 80, // Random score between 80-100
      };
    }

    try {
      const prompt = this.buildReviewPrompt(translatedText, guidelines, fullContextText);
      console.log("Prompt:", prompt);
      console.log("Anthropic:", this.anthropic);

      const response = await this.anthropic?.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      console.log("Response:", response);

      const reviewText =
        response?.content[0].type === "text" ? response?.content[0].text : "";
      return this.parseReviewResponse(reviewText);
    } catch (error) {
      console.error("LLM review error:", error);
      return {
        notes: [
          `Review failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        ],
        score: 0, // Default score for failed reviews
      };
    }
  }

  private buildReviewPrompt(
    text: string,
    guidelines: EditorialGuidelines,
    fullContextText?: string
  ): string {
    let prompt = `Please review the following translated text against the editorial guidelines provided. Provide specific feedback on compliance and areas for improvement.

Text to review:
"${text}"

Editorial Guidelines:`;

    if (fullContextText) {
      prompt += `\n\n${fullContextText}`;
    } else {
      if (guidelines.tone) {
        prompt += `\n- Tone: ${guidelines.tone}`;
      }
      if (guidelines.style) {
        prompt += `\n- Style: ${guidelines.style}`;
      }
      if (guidelines.targetAudience) {
        prompt += `\n- Target Audience: ${guidelines.targetAudience}`;
      }
      if (guidelines.restrictions && guidelines.restrictions.length > 0) {
        prompt += `\n- Restrictions: ${guidelines.restrictions.join(", ")}`;
      }
      if (guidelines.requirements && guidelines.requirements.length > 0) {
        prompt += `\n- Requirements: ${guidelines.requirements.join(", ")}`;
      }
    }

    prompt += `\n\nPlease provide your review as a numbered list of specific observations, each on a new line starting with a number and period (e.g., "1. The tone is...").

Additionally, at the end of your review, please provide an editorialComplianceScore as a number between 1 and 100, where 1 indicates very poor compliance with the guidelines and 100 indicates perfect compliance. Format this as: "editorialComplianceScore: [number]"`;

    return prompt;
  }

  private parseReviewResponse(reviewText: string): {
    notes: string[];
    score: number;
  } {
    const lines = reviewText.split("\n").filter((line) => line.trim());
    const notes: string[] = [];
    let score = 50; // Default score if not found

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for editorialComplianceScore
      const scoreMatch = trimmed.match(
        /editorialComplianceScore:\s*(\d+(?:\.\d+)?)/i
      );
      if (scoreMatch) {
        score = Math.min(Math.max(parseFloat(scoreMatch[1]), 1), 100); // Ensure score is between 1-100
        continue; // Skip adding this line to notes
      }

      if (trimmed.match(/^\d+\./)) {
        notes.push(trimmed.replace(/^\d+\.\s*/, ""));
      } else if (trimmed && !trimmed.match(/^(please|here|the following)/i)) {
        notes.push(trimmed);
      }
    }

    return {
      notes: notes.length > 0 ? notes : ["Review completed successfully"],
      score,
    };
  }
}
