import { TranslationTask, getLanguageStatesForTask, hasMultipleLanguageStates } from './types';

describe('Task splitting functionality', () => {
  const mockTask: TranslationTask = {
    id: 'task_test',
    status: 'done',
    mediaArticle: { text: 'Test article' },
    editorialGuidelines: {},
    destinationLanguages: ['french', 'german'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  describe('getLanguageStatesForTask', () => {
    it('should return task status for all languages when no translation results exist', () => {
      const states = getLanguageStatesForTask(mockTask);
      
      expect(states.get('french')).toBe('done');
      expect(states.get('german')).toBe('done');
      expect(states.size).toBe(2);
    });

    it('should return individual language states when translation results exist with split states', () => {
      const taskWithSplitStates: TranslationTask = {
        ...mockTask,
        status: 'human_review',
        result: {
          originalArticle: mockTask.mediaArticle,
          translations: [
            {
              language: 'french',
              translatedText: 'Article en français',
              complianceScore: 85,
              status: 'done'
            },
            {
              language: 'german',
              translatedText: 'Artikel auf Deutsch',
              complianceScore: 65,
              status: 'human_review'
            }
          ],
          processedAt: '2024-01-01T00:00:00Z'
        }
      };

      const states = getLanguageStatesForTask(taskWithSplitStates);
      
      expect(states.get('french')).toBe('done');
      expect(states.get('german')).toBe('human_review');
      expect(states.size).toBe(2);
    });
  });

  describe('hasMultipleLanguageStates', () => {
    it('should return false when all languages have the same state', () => {
      const result = hasMultipleLanguageStates(mockTask);
      expect(result).toBe(false);
    });

    it('should return true when languages have different states', () => {
      const taskWithSplitStates: TranslationTask = {
        ...mockTask,
        status: 'human_review',
        result: {
          originalArticle: mockTask.mediaArticle,
          translations: [
            {
              language: 'french',
              translatedText: 'Article en français',
              complianceScore: 85,
              status: 'done'
            },
            {
              language: 'german',
              translatedText: 'Artikel auf Deutsch',
              complianceScore: 65,
              status: 'human_review'
            }
          ],
          processedAt: '2024-01-01T00:00:00Z'
        }
      };

      const result = hasMultipleLanguageStates(taskWithSplitStates);
      expect(result).toBe(true);
    });

    it('should handle missing languages in translation results', () => {
      const taskWithMissingLanguage: TranslationTask = {
        ...mockTask,
        destinationLanguages: ['french', 'german', 'spanish'],
        result: {
          originalArticle: mockTask.mediaArticle,
          translations: [
            {
              language: 'french',
              translatedText: 'Article en français',
              complianceScore: 85,
              status: 'done'
            }
          ],
          processedAt: '2024-01-01T00:00:00Z'
        }
      };

      const states = getLanguageStatesForTask(taskWithMissingLanguage);
      
      expect(states.get('french')).toBe('done');
      expect(states.get('german')).toBe('done'); // falls back to task status
      expect(states.get('spanish')).toBe('done'); // falls back to task status
      expect(states.size).toBe(3);
    });
  });
});