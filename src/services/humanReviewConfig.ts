import { HumanReviewConfig } from "../types";
import { createHash } from "crypto";

export class HumanReviewConfigService {
  private static config: HumanReviewConfig | null = null;
  private static workspaceId: string | null = null;

  static async getConfig(): Promise<HumanReviewConfig> {
    if (!this.config) {
      this.config = await this.loadConfig();
    }
    return this.config;
  }

  private static async loadConfig(): Promise<HumanReviewConfig> {
    const confidenceThreshold = parseInt(
      process.env.HUMAN_REVIEW_CONFIDENCE_THRESHOLD || "70"
    );
    
    // Generate workspace ID deterministically or get from cache
    const workspaceId = await this.getOrCreateWorkspaceId();

    return {
      confidenceThreshold,
      workspaceId,
      taskDetails: {
        taskName: "Translation Quality Review",
        taskIntroduction: "Please review the translation quality and compliance with editorial guidelines.",
        taskSteps: "1. Read the original text and editorial guidelines\n2. Review the provided translation\n3. Rate the translation quality and compliance\n4. Provide feedback on any issues"
      }
    };
  }

  private static async getOrCreateWorkspaceId(): Promise<string> {
    if (this.workspaceId) {
      return this.workspaceId;
    }

    // Return the generated workspace name - workspace creation will be handled in TaskService
    const workspaceName = this.generateWorkspaceName();
    this.workspaceId = workspaceName;
    return workspaceName;
  }

  static setWorkspaceId(workspaceId: string): void {
    this.workspaceId = workspaceId;
    if (this.config) {
      this.config.workspaceId = workspaceId;
    }
  }

  static generateWorkspaceName(): string {
    const apiKey = process.env.PROLIFIC_API_KEY;
    if (!apiKey) {
      throw new Error("PROLIFIC_API_KEY environment variable is required");
    }

    // Create a deterministic but human-friendly workspace name
    // Hash the API key for security while maintaining determinism
    const hash = createHash('sha256').update(apiKey).digest('hex');
    const shortHash = hash.substring(0, 8); // Take first 8 characters of hash
    return `babel-bot-translations-${shortHash}`;
  }

  static async updateConfig(updates: Partial<HumanReviewConfig>): Promise<void> {
    const current = await this.getConfig();
    this.config = { ...current, ...updates };
  }

  static resetConfig(): void {
    this.config = null;
  }
}