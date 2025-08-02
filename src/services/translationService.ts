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
import { LLMClassifierFromTemplate } from "autoevals";

/**
 * Enhanced TranslationService using LLM Classifier pattern for translation quality assessment
 */
export class TranslationService {
  private translator?: deepl.Translator;
  private reviewService: ReviewService;
  private translationQualityClassifier: any;

  constructor() {
    this.reviewService = new ReviewService();
    this.initializeClassifier();
  }

  /**
   * Initialize the LLM Classifier for translation quality assessment
   */
  private initializeClassifier() {
    this.translationQualityClassifier = LLMClassifierFromTemplate({
      name: "Translation Quality Classifier",
      promptTemplate: `
You are evaluating the quality of a translation and how well it incorporates provided editorial context and guidelines.

[BEGIN DATA]
************
[Original Text]: {{{input}}}
************
[Translation]: {{{output}}}
************
[Editorial Context & Guidelines]: {{{expected}}}
************
[END DATA]

Your task is to evaluate how well the translation incorporates the editorial guidelines and context provided. Consider:

1. **Editorial Guidelines Adherence**: Does the translation follow the specified tone, style, and target audience requirements?
2. **Context Utilization**: Are editorial overrides and specific requirements properly reflected?
3. **Translation Quality**: Is the translation accurate, natural, and appropriate for the target language?
4. **Consistency**: Does the translation maintain consistency with the editorial voice and brand guidelines?
5. **Cultural Appropriateness**: Is the translation culturally appropriate for the target audience?

Based on the quality and adherence to guidelines, classify the translation as:

(A) Excellent translation that fully incorporates all editorial guidelines and context with high accuracy
(B) Good translation with minor issues but generally follows guidelines and context well
(C) Acceptable translation but missing some context elements or guideline adherence
(D) Poor translation with significant issues in guideline adherence or context utilization
(E) Unacceptable translation that largely ignores provided context and editorial guidelines

Select the most appropriate classification based on the translation's quality and adherence to the provided editorial context.
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

  async getAvailableLanguages(): Promise<
    Array<{ code: string; name: string }>
  > {
    this.setup();
    const isDemoMode = process.env.DEMO_MODE === "true";

    if (isDemoMode) {
      // In demo mode, simulate actual DeepL supported languages with proper codes
      return [
        { code: "BG", name: "Bulgarian" },
        { code: "CS", name: "Czech" },
        { code: "DA", name: "Danish" },
        { code: "DE", name: "German" },
        { code: "EL", name: "Greek" },
        { code: "EN-GB", name: "English (British)" },
        { code: "EN-US", name: "English (American)" },
        { code: "ES", name: "Spanish" },
        { code: "ET", name: "Estonian" },
        { code: "FI", name: "Finnish" },
        { code: "FR", name: "French" },
        { code: "HU", name: "Hungarian" },
        { code: "ID", name: "Indonesian" },
        { code: "IT", name: "Italian" },
        { code: "JA", name: "Japanese" },
        { code: "KO", name: "Korean" },
        { code: "LT", name: "Lithuanian" },
        { code: "LV", name: "Latvian" },
        { code: "NB", name: "Norwegian (Bokmål)" },
        { code: "NL", name: "Dutch" },
        { code: "PL", name: "Polish" },
        { code: "PT-BR", name: "Portuguese (Brazilian)" },
        { code: "PT-PT", name: "Portuguese (European)" },
        { code: "RO", name: "Romanian" },
        { code: "RU", name: "Russian" },
        { code: "SK", name: "Slovak" },
        { code: "SL", name: "Slovenian" },
        { code: "SV", name: "Swedish" },
        { code: "TR", name: "Turkish" },
        { code: "UK", name: "Ukrainian" },
        { code: "ZH", name: "Chinese (Simplified)" },
      ];
    }

    if (!this.translator) {
      throw new Error("DeepL translator not initialized");
    }

    const languages = await this.translator.getTargetLanguages();
    return languages.map((lang) => ({
      code: lang.code,
      name: lang.name,
    }));
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

    const { effectiveGuidelines, contextText } =
      await this.loadGuidelinesByType(
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

      // Use LLM Classifier to assess translation quality and context adherence
      const qualityAssessment = await this.assessTranslationQuality(
        article.text,
        translatedText,
        contextText,
        language
      );

      // Get traditional review as well for comprehensive evaluation
      const reviewResult = await this.reviewService.reviewAgainstGuidelines(
        translatedText,
        effectiveGuidelines,
        contextText
      );

      // Combine scores for overall compliance assessment
      const combinedScore = Math.round(
        (qualityAssessment.score * 100 + reviewResult.score) / 2
      );

      results.push({
        language,
        translatedText,
        reviewNotes: this.combineReviewNotes(
          reviewResult.notes,
          qualityAssessment.notes
        ),
        complianceScore: combinedScore,
      });
    }

    return results;
  }

  private async loadGuidelinesByType(
    guide: GuideType,
    fallbackGuidelines: EditorialGuidelines,
    useFullMarkdown?: boolean
  ): Promise<{
    effectiveGuidelines: EditorialGuidelines;
    contextText: string;
  }> {
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
        effectiveGuidelines = this.parseMarkdownGuidelines(
          fileContent,
          fallbackGuidelines
        );
      } else {
        effectiveGuidelines = { ...fallbackGuidelines };
      }

      let contextText = fileContent;

      const hasOverrides = Object.keys(fallbackGuidelines).some(
        (key) =>
          fallbackGuidelines[key as keyof EditorialGuidelines] !== undefined
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
          contextText += `Restrictions Override: ${fallbackGuidelines.restrictions.join(
            ", "
          )}\n`;
        }
        if (fallbackGuidelines.requirements?.length) {
          contextText += `Requirements Override: ${fallbackGuidelines.requirements.join(
            ", "
          )}\n`;
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
        contextText += `Restrictions: ${fallbackGuidelines.restrictions.join(
          ", "
        )}\n`;
      }
      if (fallbackGuidelines.requirements?.length) {
        contextText += `Requirements: ${fallbackGuidelines.requirements.join(
          ", "
        )}\n`;
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

  /**
   * Assess translation quality using LLM Classifier
   */
  private async assessTranslationQuality(
    originalText: string,
    translatedText: string,
    contextText: string,
    language: string
  ): Promise<{ score: number; notes: string }> {
    const isDemoMode = process.env.DEMO_MODE === "true";

    if (isDemoMode) {
      // Provide demo assessment
      return {
        score: 0.85,
        notes: `Demo quality assessment for ${language} translation. Context adherence: Good. Editorial guidelines: Followed.`,
      };
    }

    try {
      // Use the classifier to evaluate translation quality
      const classificationResult = await this.translationQualityClassifier({
        input: originalText,
        output: translatedText,
        expected: contextText,
      });

      const qualityNotes = this.generateQualityNotes(
        classificationResult.score,
        language,
        classificationResult.reasoning || ""
      );

      return {
        score: classificationResult.score,
        notes: qualityNotes,
      };
    } catch (error) {
      console.error("Error in translation quality assessment:", error);
      // Fallback to neutral assessment
      return {
        score: 0.7,
        notes: `Quality assessment unavailable for ${language} translation. Manual review recommended.`,
      };
    }
  }

  /**
   * Generate quality assessment notes based on classifier score
   */
  private generateQualityNotes(
    score: number,
    language: string,
    reasoning: string
  ): string {
    let qualityLevel: string;
    let recommendations: string;

    if (score >= 0.9) {
      qualityLevel = "Excellent";
      recommendations =
        "Translation meets all editorial standards and context requirements.";
    } else if (score >= 0.8) {
      qualityLevel = "Good";
      recommendations =
        "Translation is well-executed with minor areas for improvement.";
    } else if (score >= 0.6) {
      qualityLevel = "Acceptable";
      recommendations =
        "Translation is adequate but may benefit from editorial review for context adherence.";
    } else if (score >= 0.3) {
      qualityLevel = "Poor";
      recommendations =
        "Translation has significant issues with guideline adherence. Revision recommended.";
    } else {
      qualityLevel = "Unacceptable";
      recommendations =
        "Translation does not meet editorial standards. Complete revision required.";
    }

    let notes = `Quality Assessment (${language}): ${qualityLevel} (${Math.round(
      score * 100
    )}%). ${recommendations}`;

    if (reasoning) {
      notes += ` Detailed analysis: ${reasoning}`;
    }

    return notes;
  }

  /**
   * Combine review notes from traditional review and quality assessment
   */
  private combineReviewNotes(
    reviewNotes: string[],
    qualityNotes: string
  ): string[] {
    const combinedNotes = [qualityNotes];
    combinedNotes.push("Traditional Review:");
    combinedNotes.push(...reviewNotes);
    return combinedNotes;
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
        context: context || undefined,
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

  /**
   * Gets the translation quality classifier for testing purposes
   */
  getQualityClassifier() {
    return this.translationQualityClassifier;
  }
}
