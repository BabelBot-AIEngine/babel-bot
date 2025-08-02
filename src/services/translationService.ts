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
    guide?: GuideType,
    useFullMarkdown?: boolean
  ): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];
    this.setup();

    const { effectiveGuidelines, contextText } = await this.loadGuidelinesByType(
      guide || "financialtimes",
      guidelines,
      useFullMarkdown
    );

    for (const language of destinationLanguages) {
      const translatedText = await this.performTranslation(
        article.text,
        language,
        contextText
      );
      const reviewResult = await this.reviewService.reviewAgainstGuidelines(
        translatedText,
        effectiveGuidelines,
        contextText
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
    fallbackGuidelines: EditorialGuidelines,
    useFullMarkdown?: boolean
  ): Promise<{ effectiveGuidelines: EditorialGuidelines; contextText: string }> {
    try {
      const fileExtension = useFullMarkdown ? "md" : "txt";
      const guidelinePath = path.join(
        process.cwd(),
        "editorial",
        "guidelines",
        `${guide}.${fileExtension}`
      );
      
      let fileContent: string;
      try {
        fileContent = fs.readFileSync(guidelinePath, "utf-8");
      } catch (error) {
        const fallbackExtension = useFullMarkdown ? "txt" : "md";
        const fallbackPath = path.join(
          process.cwd(),
          "editorial",
          "guidelines",
          `${guide}.${fallbackExtension}`
        );
        fileContent = fs.readFileSync(fallbackPath, "utf-8");
      }

      let effectiveGuidelines: EditorialGuidelines;
      if (useFullMarkdown) {
        effectiveGuidelines = this.parseMarkdownGuidelines(fileContent, fallbackGuidelines);
      } else {
        effectiveGuidelines = { ...fallbackGuidelines };
      }

      let contextText = fileContent;
      
      const hasOverrides = Object.keys(fallbackGuidelines).some(
        key => fallbackGuidelines[key as keyof EditorialGuidelines] !== undefined
      );
      
      if (hasOverrides) {
        contextText += "\n\n--- EDITORIAL OVERRIDES ---\n\n";
        if (fallbackGuidelines.tone) {
          contextText += `Tone Override: ${fallbackGuidelines.tone}\n`;
        }
        if (fallbackGuidelines.style) {
          contextText += `Style Override: ${fallbackGuidelines.style}\n`;
        }
        if (fallbackGuidelines.targetAudience) {
          contextText += `Target Audience Override: ${fallbackGuidelines.targetAudience}\n`;
        }
        if (fallbackGuidelines.restrictions?.length) {
          contextText += `Restrictions Override: ${fallbackGuidelines.restrictions.join(", ")}\n`;
        }
        if (fallbackGuidelines.requirements?.length) {
          contextText += `Requirements Override: ${fallbackGuidelines.requirements.join(", ")}\n`;
        }
      }

      return { effectiveGuidelines, contextText };
    } catch (error) {
      console.warn(
        `Could not load guidelines for ${guide}, using fallback:`,
        error
      );
      
      let contextText = "Using fallback editorial guidelines.\n\n";
      if (fallbackGuidelines.tone) {
        contextText += `Tone: ${fallbackGuidelines.tone}\n`;
      }
      if (fallbackGuidelines.style) {
        contextText += `Style: ${fallbackGuidelines.style}\n`;
      }
      if (fallbackGuidelines.targetAudience) {
        contextText += `Target Audience: ${fallbackGuidelines.targetAudience}\n`;
      }
      if (fallbackGuidelines.restrictions?.length) {
        contextText += `Restrictions: ${fallbackGuidelines.restrictions.join(", ")}\n`;
      }
      if (fallbackGuidelines.requirements?.length) {
        contextText += `Requirements: ${fallbackGuidelines.requirements.join(", ")}\n`;
      }
      
      return { effectiveGuidelines: fallbackGuidelines, contextText };
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
    language: string,
    context?: string
  ): Promise<string> {
    const isDemoMode = process.env.DEMO_MODE === "true";

    if (isDemoMode) {
      // Simulate translation with demo text
      return `[${language} Translation] ${text}`;
    }

    try {
      const translateOptions: any = {
        context: context || undefined
      };
      
      const result = await this.translator?.translateText(
        text,
        null,
        language as deepl.TargetLanguageCode,
        translateOptions
      );
      return result?.text || "";
    } catch (error) {
      console.error(`Translation error for language ${language}:`, error);
      return `Translation error for language ${language}: ${error}`;
    }
  }
}
