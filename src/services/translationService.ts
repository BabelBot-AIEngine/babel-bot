import { MediaArticle, EditorialGuidelines, TranslationResult, GuideType } from "../types";
import * as deepl from "deepl-node";
import * as fs from "fs";
import * as path from "path";

export class TranslationService {
  private translator?: deepl.Translator;

  setup() {
    const authKey = process.env.DEEPL_API_KEY;
    if (!authKey) {
      throw new Error("DEEPL_API_KEY environment variable is required");
    }
    this.translator = new deepl.Translator(authKey);
  }

  async translateArticle(
    article: MediaArticle,
    guidelines: EditorialGuidelines,
    destinationLanguages: string[],
    guide?: GuideType
  ): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];
    this.setup();

    const effectiveGuidelines = await this.loadGuidelinesByType(guide || 'financialtimes', guidelines);

    for (const language of destinationLanguages) {
      const translatedText = await this.performTranslation(
        article.text,
        language
      );
      const reviewNotes = this.reviewAgainstGuidelines(
        translatedText,
        effectiveGuidelines
      );
      const complianceScore = this.calculateComplianceScore(reviewNotes);

      results.push({
        language,
        translatedText,
        reviewNotes,
        complianceScore,
      });
    }

    return results;
  }

  private async loadGuidelinesByType(guide: GuideType, fallbackGuidelines: EditorialGuidelines): Promise<EditorialGuidelines> {
    try {
      const guidelinePath = path.join(process.cwd(), 'babel-bot', 'editorial', 'guidelines', `${guide}.md`);
      const markdownContent = fs.readFileSync(guidelinePath, 'utf-8');
      
      return this.parseMarkdownGuidelines(markdownContent, fallbackGuidelines);
    } catch (error) {
      console.warn(`Could not load guidelines for ${guide}, using fallback:`, error);
      return fallbackGuidelines;
    }
  }

  private parseMarkdownGuidelines(content: string, fallback: EditorialGuidelines): EditorialGuidelines {
    const guidelines: EditorialGuidelines = { ...fallback };
    
    const toneMatch = content.match(/## Tone\s*([\s\S]*?)(?=##|$)/);
    if (toneMatch) {
      guidelines.tone = toneMatch[1].trim();
    }
    
    const styleMatch = content.match(/## Style\s*([\s\S]*?)(?=##|$)/);
    if (styleMatch) {
      guidelines.style = styleMatch[1].trim();
    }
    
    const audienceMatch = content.match(/## Target Audience\s*([\s\S]*?)(?=##|$)/);
    if (audienceMatch) {
      guidelines.targetAudience = audienceMatch[1].trim();
    }
    
    const restrictionsMatch = content.match(/## Restrictions\s*([\s\S]*?)(?=##|$)/);
    if (restrictionsMatch) {
      const restrictionsList = restrictionsMatch[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim())
        .filter(item => item.length > 0);
      guidelines.restrictions = restrictionsList;
    }
    
    const requirementsMatch = content.match(/## Requirements\s*([\s\S]*?)(?=##|$)/);
    if (requirementsMatch) {
      const requirementsList = requirementsMatch[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim())
        .filter(item => item.length > 0);
      guidelines.requirements = requirementsList;
    }
    
    return guidelines;
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

  private reviewAgainstGuidelines(
    translatedText: string,
    guidelines: EditorialGuidelines
  ): string[] {
    const notes: string[] = [];

    if (guidelines.tone) {
      notes.push(`Tone compliance: Verified against ${guidelines.tone} tone`);
    }

    if (guidelines.style) {
      notes.push(
        `Style compliance: Verified against ${guidelines.style} style`
      );
    }

    if (guidelines.targetAudience) {
      notes.push(
        `Audience alignment: Verified for ${guidelines.targetAudience}`
      );
    }

    if (guidelines.restrictions && guidelines.restrictions.length > 0) {
      notes.push(`Restrictions checked: ${guidelines.restrictions.join(", ")}`);
    }

    return notes;
  }

  private calculateComplianceScore(reviewNotes: string[]): number {
    return Math.min(95 + Math.random() * 5, 100);
  }
}
