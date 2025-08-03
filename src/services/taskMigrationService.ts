import { DatabaseService, TranslationTask } from "../database/dbService";
import { EnhancedDatabaseService } from "../database/enhancedDbService";
import { EnhancedTranslationTask, LanguageSubTask, ReviewIteration } from "../types/enhanced-task";

export class TaskMigrationService {
  private legacyDbService: DatabaseService;
  private enhancedDbService: EnhancedDatabaseService;

  constructor() {
    this.legacyDbService = new DatabaseService();
    this.enhancedDbService = new EnhancedDatabaseService();
  }

  /**
   * Migrate a single legacy task to the enhanced architecture
   */
  async migrateLegacyTask(legacyTaskId: string): Promise<string> {
    console.log(`Migrating legacy task ${legacyTaskId} to enhanced architecture...`);

    const legacyTask = await this.legacyDbService.getTask(legacyTaskId);
    if (!legacyTask) {
      throw new Error(`Legacy task ${legacyTaskId} not found`);
    }

    // Create enhanced task structure
    const enhancedTaskId = await this.enhancedDbService.createEnhancedTask({
      status: this.mapLegacyStatus(legacyTask.status),
      mediaArticle: legacyTask.mediaArticle,
      editorialGuidelines: legacyTask.editorialGuidelines,
      destinationLanguages: legacyTask.destinationLanguages,
      progress: legacyTask.progress || 0,
      guide: legacyTask.guide,
      useFullMarkdown: legacyTask.useFullMarkdown,
      maxReviewIterations: 3, // Default value
      confidenceThreshold: 4.5, // Default value
      result: legacyTask.result,
      humanReviewBatches: legacyTask.humanReviewBatches,
      error: legacyTask.error,
    });

    // Migrate language-specific data
    await this.migrateLegacyTranslationResults(enhancedTaskId, legacyTask);

    console.log(`Legacy task ${legacyTaskId} migrated to enhanced task ${enhancedTaskId}`);
    return enhancedTaskId;
  }

  /**
   * Migrate all legacy tasks to enhanced architecture
   */
  async migrateAllLegacyTasks(): Promise<{
    migrated: string[];
    failed: Array<{taskId: string, error: string}>;
    summary: {
      total: number;
      successful: number;
      failed: number;
    };
  }> {
    console.log('Starting migration of all legacy tasks...');

    const legacyTasks = await this.legacyDbService.getAllTasks();
    const migrated: string[] = [];
    const failed: Array<{taskId: string, error: string}> = [];

    for (const legacyTask of legacyTasks) {
      try {
        const enhancedTaskId = await this.migrateLegacyTask(legacyTask.id);
        migrated.push(enhancedTaskId);
      } catch (error) {
        console.error(`Failed to migrate legacy task ${legacyTask.id}:`, error);
        failed.push({
          taskId: legacyTask.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const summary = {
      total: legacyTasks.length,
      successful: migrated.length,
      failed: failed.length,
    };

    console.log('Migration complete:', summary);
    return { migrated, failed, summary };
  }

  /**
   * Create a dry-run migration report without actually migrating
   */
  async createMigrationReport(): Promise<{
    tasksToMigrate: Array<{
      id: string;
      status: string;
      languages: string[];
      hasResults: boolean;
      hasHumanReview: boolean;
      estimatedComplexity: 'simple' | 'moderate' | 'complex';
    }>;
    migrationStrategy: {
      batchSize: number;
      estimatedDuration: string;
      considerations: string[];
    };
  }> {
    const legacyTasks = await this.legacyDbService.getAllTasks();
    
    const tasksToMigrate = legacyTasks.map(task => {
      const hasResults = !!task.result;
      const hasHumanReview = !!(task.humanReviewBatches && task.humanReviewBatches.length > 0);
      
      let estimatedComplexity: 'simple' | 'moderate' | 'complex' = 'simple';
      if (hasHumanReview) {
        estimatedComplexity = 'complex';
      } else if (hasResults && task.destinationLanguages.length > 2) {
        estimatedComplexity = 'moderate';
      }

      return {
        id: task.id,
        status: task.status,
        languages: task.destinationLanguages,
        hasResults,
        hasHumanReview,
        estimatedComplexity,
      };
    });

    const complexTasks = tasksToMigrate.filter(t => t.estimatedComplexity === 'complex').length;
    const moderateTasks = tasksToMigrate.filter(t => t.estimatedComplexity === 'moderate').length;
    const simpleTasks = tasksToMigrate.filter(t => t.estimatedComplexity === 'simple').length;

    return {
      tasksToMigrate,
      migrationStrategy: {
        batchSize: 10,
        estimatedDuration: `${Math.ceil(legacyTasks.length / 10) * 5} minutes`,
        considerations: [
          `${legacyTasks.length} total tasks to migrate`,
          `${complexTasks} complex tasks with human review data`,
          `${moderateTasks} moderate tasks with multiple languages`,
          `${simpleTasks} simple tasks`,
          'Migration preserves all existing data',
          'Enhanced tasks will use default iteration settings',
          'Legacy tasks remain available during migration',
          'Webhook-driven processing starts immediately for new tasks',
        ],
      },
    };
  }

  private mapLegacyStatus(legacyStatus: TranslationTask['status']): EnhancedTranslationTask['status'] {
    switch (legacyStatus) {
      case 'pending':
        return 'pending';
      case 'translating':
        return 'processing';
      case 'llm_verification':
        return 'processing';
      case 'human_review':
        return 'review_active';
      case 'done':
        return 'completed';
      case 'failed':
        return 'failed';
      default:
        return 'pending';
    }
  }

  private async migrateLegacyTranslationResults(
    enhancedTaskId: string,
    legacyTask: TranslationTask
  ): Promise<void> {
    if (!legacyTask.result?.translations) {
      return;
    }

    const enhancedTask = await this.enhancedDbService.getEnhancedTask(enhancedTaskId);
    if (!enhancedTask) {
      throw new Error(`Enhanced task ${enhancedTaskId} not found`);
    }

    // Update language sub-tasks with legacy translation results
    for (const translation of legacyTask.result.translations) {
      const language = translation.language;
      const subTask = enhancedTask.languageSubTasks[language];
      
      if (subTask) {
        // Create an iteration record from legacy data
        const iteration: ReviewIteration = {
          iterationNumber: 1,
          startedAt: legacyTask.createdAt,
          completedAt: legacyTask.updatedAt,
          llmVerification: {
            score: (translation.complianceScore || 0) / 20, // Convert from 100-point to 5-point scale
            feedback: (translation.reviewNotes || []).join('; '),
            confidence: (translation.complianceScore || 0) / 20,
            completedAt: legacyTask.updatedAt,
          },
        };

        // Add human review data if available
        if (translation.status === 'done' && legacyTask.humanReviewBatches) {
          const humanReviewBatch = legacyTask.humanReviewBatches.find(
            batch => batch.language === language
          );
          
          if (humanReviewBatch) {
            iteration.humanReview = {
              prolificStudyId: humanReviewBatch.studyId || '',
              score: 4, // Assume good score if marked as done
              feedback: 'Migrated from legacy human review',
              reviewerIds: [],
              completedAt: legacyTask.updatedAt,
            };
            iteration.combinedScore = (iteration.llmVerification.score + 4) / 2;
          }
        }

        const status = this.mapLegacyTranslationStatus(translation.status);
        
        await this.enhancedDbService.updateLanguageSubTask(enhancedTaskId, language, {
          status,
          translatedText: translation.translatedText,
          currentIteration: 1,
          processingStartTime: legacyTask.createdAt,
          processingEndTime: legacyTask.status === 'done' ? legacyTask.updatedAt : undefined,
        });

        await this.enhancedDbService.addIterationToLanguageSubTask(
          enhancedTaskId,
          language,
          iteration
        );
      }
    }
  }

  private mapLegacyTranslationStatus(legacyStatus: string): LanguageSubTask['status'] {
    switch (legacyStatus) {
      case 'done':
        return 'finalized';
      case 'human_review':
        return 'review_active';
      case 'failed':
        return 'failed';
      default:
        return 'finalized';
    }
  }

  /**
   * Cleanup legacy tasks after successful migration
   */
  async cleanupLegacyTasks(enhancedTaskIds: string[]): Promise<void> {
    console.log(`Cleaning up ${enhancedTaskIds.length} legacy tasks...`);
    
    // In a production environment, you might want to:
    // 1. Archive legacy tasks instead of deleting
    // 2. Add a migration timestamp
    // 3. Keep a mapping between legacy and enhanced task IDs
    
    // For now, we'll just log the action without actually deleting
    console.log('Legacy task cleanup would remove:');
    for (const taskId of enhancedTaskIds) {
      console.log(`  - Legacy task corresponding to enhanced task ${taskId}`);
    }
    
    console.log('Note: Actual cleanup not implemented for safety');
  }
}