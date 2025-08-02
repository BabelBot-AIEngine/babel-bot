import {
  MediaArticle,
  EditorialGuidelines,
  TranslationResult,
  GuideType,
} from "../types";
import * as deepl from "deepl-node";
import * as fs from "fs";
import * as path from "path";
import { ReviewService } from "./reviewService";

export class TranslationService {
  private translator?: deepl.Translator;
  private reviewService: ReviewService;

  constructor() {
    this.reviewService = new ReviewService();
  }

  setup() {
    const authKey = process.env.DEEPL_API_KEY;
    const isDemoMode = process.env.DEMO_MODE === "true";

    if (!authKey && !isDemoMode) {
      throw new Error("DEEPL_API_KEY environment variable is required");
    }

    if (authKey) {
      this.translator = new deepl.Translator(authKey);
    }
  }

  async translateArticle(
    article: MediaArticle,
    guidelines: EditorialGuidelines,
    destinationLanguages: string[],
    guide?: GuideType
  ): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];
    this.setup();

    const effectiveGuidelines = await this.loadGuidelinesByType(
      guide || "financialtimes",
      guidelines
    );

    for (const language of destinationLanguages) {
      const translatedText = await this.performTranslation(
        article.text,
        language
      );
      const reviewResult = await this.reviewService.reviewAgainstGuidelines(
        translatedText,
        effectiveGuidelines
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

  private async loadGuidelinesByType(
    guide: GuideType,
    fallbackGuidelines: EditorialGuidelines
  ): Promise<EditorialGuidelines> {
    try {
      const guidelinePath = path.join(
        process.cwd(),
        "editorial",
        "guidelines",
        `${guide}.md`
      );
      const markdownContent = fs.readFileSync(guidelinePath, "utf-8");

      return this.parseMarkdownGuidelines(markdownContent, fallbackGuidelines);
    } catch (error) {
      console.warn(
        `Could not load guidelines for ${guide}, using fallback:`,
        error
      );
      return fallbackGuidelines;
    }
  }

  private parseMarkdownGuidelines(
    content: string,
    fallback: EditorialGuidelines
  ): EditorialGuidelines {
    const guidelines: EditorialGuidelines = { ...fallback };

    const toneMatch = content.match(/## Tone\s*([\s\S]*?)(?=##|$)/);
    if (toneMatch) {
      guidelines.tone = toneMatch[1].trim();
    }

    const styleMatch = content.match(/## Style\s*([\s\S]*?)(?=##|$)/);
    if (styleMatch) {
      guidelines.style = styleMatch[1].trim();
    }

    const audienceMatch = content.match(
      /## Target Audience\s*([\s\S]*?)(?=##|$)/
    );
    if (audienceMatch) {
      guidelines.targetAudience = audienceMatch[1].trim();
    }

    const restrictionsMatch = content.match(
      /## Restrictions\s*([\s\S]*?)(?=##|$)/
    );
    if (restrictionsMatch) {
      const restrictionsList = restrictionsMatch[1]
        .split("\n")
        .filter((line) => line.trim().startsWith("-"))
        .map((line) => line.replace(/^-\s*/, "").trim())
        .filter((item) => item.length > 0);
      guidelines.restrictions = restrictionsList;
    }

    const requirementsMatch = content.match(
      /## Requirements\s*([\s\S]*?)(?=##|$)/
    );
    if (requirementsMatch) {
      const requirementsList = requirementsMatch[1]
        .split("\n")
        .filter((line) => line.trim().startsWith("-"))
        .map((line) => line.replace(/^-\s*/, "").trim())
        .filter((item) => item.length > 0);
      guidelines.requirements = requirementsList;
    }

    return guidelines;
  }

  private async performTranslation(
    text: string,
    language: string
  ): Promise<string> {
    const isDemoMode = process.env.DEMO_MODE === "true";

    if (isDemoMode) {
      // Simulate translation with demo text
      return `[${language} Translation] ${text}`;
    }

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
}
