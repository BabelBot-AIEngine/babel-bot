import { HumanReviewConfig } from "../types";

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

    const workspaceId = this.getWorkspaceIdFromEnv();
    this.workspaceId = workspaceId;
    return workspaceId;
  }

  static setWorkspaceId(workspaceId: string): void {
    this.workspaceId = workspaceId;
    if (this.config) {
      this.config.workspaceId = workspaceId;
    }
  }

  static getWorkspaceIdFromEnv(): string {
    const workspaceId = process.env.PROLIFIC_WORKSPACE_ID;
    if (!workspaceId) {
      throw new Error("PROLIFIC_WORKSPACE_ID environment variable is required. Please set it to your funded Prolific workspace ID.");
    }
    return workspaceId;
  }

  static async updateConfig(updates: Partial<HumanReviewConfig>): Promise<void> {
    const current = await this.getConfig();
    this.config = { ...current, ...updates };
  }

  static resetConfig(): void {
    this.config = null;
  }
}