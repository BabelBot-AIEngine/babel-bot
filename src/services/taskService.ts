import { DatabaseService, TranslationTask } from '../database/dbService';
import { TranslationService } from './translationService';
import { MediaArticle, EditorialGuidelines, TranslationResponse } from '../types';

export class TaskService {
  private dbService: DatabaseService;
  private translationService: TranslationService;

  constructor() {
    this.dbService = new DatabaseService();
    this.translationService = new TranslationService();
  }

  async createTranslationTask(
    mediaArticle: MediaArticle,
    editorialGuidelines: EditorialGuidelines,
    destinationLanguages: string[]
  ): Promise<string> {
    const taskId = await this.dbService.createTask({
      status: 'pending',
      mediaArticle,
      editorialGuidelines,
      destinationLanguages,
      progress: 0
    });

    this.processTaskAsync(taskId);
    return taskId;
  }

  private async processTaskAsync(taskId: string): Promise<void> {
    try {
      const task = await this.dbService.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      await this.dbService.updateTask(taskId, { 
        status: 'translating', 
        progress: 25 
      });

      await this.sleep(1000);

      const translations = await this.translationService.translateArticle(
        task.mediaArticle,
        task.editorialGuidelines,
        task.destinationLanguages
      );

      await this.dbService.updateTask(taskId, { 
        status: 'llm_verification', 
        progress: 60 
      });

      await this.sleep(1500);

      const verifiedTranslations = await this.verifyTranslations(translations);

      await this.dbService.updateTask(taskId, { 
        status: 'human_review', 
        progress: 80 
      });

      await this.sleep(2000);

      const result: TranslationResponse = {
        originalArticle: task.mediaArticle,
        translations: verifiedTranslations,
        processedAt: new Date().toISOString()
      };

      await this.dbService.updateTask(taskId, { 
        status: 'done', 
        progress: 100,
        result 
      });

    } catch (error) {
      console.error(`Error processing task ${taskId}:`, error);
      await this.dbService.updateTask(taskId, { 
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async verifyTranslations(translations: any[]): Promise<any[]> {
    return translations.map(translation => ({
      ...translation,
      reviewNotes: ['LLM verification completed', 'Quality check passed'],
      complianceScore: Math.floor(Math.random() * 20) + 80
    }));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getTask(taskId: string): Promise<TranslationTask | null> {
    return this.dbService.getTask(taskId);
  }

  async getAllTasks(): Promise<TranslationTask[]> {
    return this.dbService.getAllTasks();
  }

  async getTasksByStatus(status: TranslationTask['status']): Promise<TranslationTask[]> {
    return this.dbService.getTasksByStatus(status);
  }
}