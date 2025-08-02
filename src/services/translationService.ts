import { MediaArticle, EditorialGuidelines, TranslationResult } from "../types";
import * as deepl from "deepl-node";
import Anthropic from "@anthropic-ai/sdk";

export class TranslationService {
  private translator?: deepl.Translator;

  private anthropic?: Anthropic;

  setup() {
    const authKey = process.env.DEEPL_API_KEY;
    if (!authKey) {
      throw new Error("DEEPL_API_KEY environment variable is required");
    }
    this.translator = new deepl.Translator(authKey);
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async translateArticle(
    article: MediaArticle,
    guidelines: EditorialGuidelines,
    destinationLanguages: string[]
  ): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];
    this.setup();
    for (const language of destinationLanguages) {
      const translatedText = await this.performTranslation(
        article.text,
        language
      );
      const reviewResult = await this.reviewAgainstGuidelines(
        translatedText,
        guidelines
      );
      const complianceScore = reviewResult.score;

      results.push({
        language,
        translatedText,
        reviewNotes: reviewResult.notes,
        complianceScore,
      });
    }

    return results;
  }

  private async performTranslation(
    text: string,
    language: string
  ): Promise<string> {
    try {
      const result = await this.translator?.translateText(
        text,
        null,
        language as deepl.TargetLanguageCode
      );
      return result?.text || "";
    } catch (error) {
      console.error(`Translation error for language ${language}:`, error);
      return `Translation error for language ${language}: ${error}`;
    }
  }

  private async reviewAgainstGuidelines(
    translatedText: string,
    guidelines: EditorialGuidelines
  ): Promise<{ notes: string[]; score: number }> {
    try {
      const prompt = this.buildReviewPrompt(translatedText, guidelines);

      const response = await this.anthropic?.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

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
    guidelines: EditorialGuidelines
  ): string {
    let prompt = `Please review the following text against the editorial guidelines provided. Provide specific feedback on compliance and areas for improvement.

Text to review:
"${text}"

Editorial Guidelines:`;

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
