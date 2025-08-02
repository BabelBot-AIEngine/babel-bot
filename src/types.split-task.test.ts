import {
  TranslationTask,
  getLanguageStatesForTask,
  hasMultipleLanguageStates,
  getLanguagesForStatus,
  getTaskDisplayInfoForStatus,
  LanguageTaskStatus
} from './types';

describe('Split Task Functionality', () => {
  const mockTask: TranslationTask = {
    id: 'task_123_abc',
    status: 'human_review',
    mediaArticle: {
      text: 'Test article text',
      title: 'Test Article'
    },
    editorialGuidelines: {
      tone: 'professional'
    },
    destinationLanguages: ['fr', 'de', 'it'],
    result: {
      originalArticle: {
        text: 'Test article text',
        title: 'Test Article'
      },
      translations: [
        {
          language: 'fr',
          translatedText: 'Article de test',
          status: 'done',
          complianceScore: 85
        },
        {
          language: 'de',
          translatedText: 'Test Artikel',
          status: 'failed',
          complianceScore: 45
        },
        {
          language: 'it',
          translatedText: 'Articolo di prova',
          status: 'human_review',
          complianceScore: 65
        }
      ],
      processedAt: '2023-01-01T00:00:00Z'
    },
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z',
    progress: 80
  };

  describe('getLanguageStatesForTask', () => {
    it('should return language states from translations when available', () => {
      const states = getLanguageStatesForTask(mockTask);
      
      expect(states.get('fr')).toBe('done');
      expect(states.get('de')).toBe('failed');
      expect(states.get('it')).toBe('human_review');
      expect(states.size).toBe(3);
    });

    it('should fall back to task status for languages without translations', () => {
      const taskWithoutResult: TranslationTask = {
        ...mockTask,
        result: undefined
      };
      
      const states = getLanguageStatesForTask(taskWithoutResult);
      
      expect(states.get('fr')).toBe('human_review');
      expect(states.get('de')).toBe('human_review');
      expect(states.get('it')).toBe('human_review');
      expect(states.size).toBe(3);
    });
  });

  describe('hasMultipleLanguageStates', () => {
    it('should return true when languages have different states', () => {
      expect(hasMultipleLanguageStates(mockTask)).toBe(true);
    });

    it('should return false when all languages have the same state', () => {
      const taskWithSameStates: TranslationTask = {
        ...mockTask,
        result: {
          ...mockTask.result!,
          translations: [
            { language: 'fr', translatedText: 'Test', status: 'done' },
            { language: 'de', translatedText: 'Test', status: 'done' },
            { language: 'it', translatedText: 'Test', status: 'done' }
          ]
        }
      };
      
      expect(hasMultipleLanguageStates(taskWithSameStates)).toBe(false);
    });
  });

  describe('getLanguagesForStatus', () => {
    it('should return languages with the specified status', () => {
      const doneLanguages = getLanguagesForStatus(mockTask, 'done');
      const failedLanguages = getLanguagesForStatus(mockTask, 'failed');
      const reviewLanguages = getLanguagesForStatus(mockTask, 'human_review');
      
      expect(doneLanguages).toEqual(['fr']);
      expect(failedLanguages).toEqual(['de']);
      expect(reviewLanguages).toEqual(['it']);
    });

    it('should return empty array when no languages match the status', () => {
      const pendingLanguages = getLanguagesForStatus(mockTask, 'pending');
      expect(pendingLanguages).toEqual([]);
    });
  });

  describe('getTaskDisplayInfoForStatus', () => {
    it('should return display info for status with matching languages', () => {
      const displayInfo = getTaskDisplayInfoForStatus(mockTask, 'done');
      
      expect(displayInfo).not.toBeNull();
      expect(displayInfo!.task).toBe(mockTask);
      expect(displayInfo!.filteredLanguages).toEqual(['fr']);
      expect(displayInfo!.isPartialDisplay).toBe(true);
    });

    it('should return null for status with no matching languages', () => {
      const displayInfo = getTaskDisplayInfoForStatus(mockTask, 'pending');
      expect(displayInfo).toBeNull();
    });

    it('should return display info with isPartialDisplay false for non-split tasks', () => {
      const taskWithSameStates: TranslationTask = {
        ...mockTask,
        result: {
          ...mockTask.result!,
          translations: [
            { language: 'fr', translatedText: 'Test', status: 'done' },
            { language: 'de', translatedText: 'Test', status: 'done' },
            { language: 'it', translatedText: 'Test', status: 'done' }
          ]
        }
      };
      
      const displayInfo = getTaskDisplayInfoForStatus(taskWithSameStates, 'done');
      
      expect(displayInfo).not.toBeNull();
      expect(displayInfo!.isPartialDisplay).toBe(false);
      expect(displayInfo!.filteredLanguages).toEqual(['fr', 'de', 'it']);
    });
  });

  describe('Split Task UI Logic', () => {
    it('should generate multiple display infos for a split task across different statuses', () => {
      const doneInfo = getTaskDisplayInfoForStatus(mockTask, 'done');
      const failedInfo = getTaskDisplayInfoForStatus(mockTask, 'failed');
      const reviewInfo = getTaskDisplayInfoForStatus(mockTask, 'human_review');
      
      expect(doneInfo).not.toBeNull();
      expect(failedInfo).not.toBeNull();
      expect(reviewInfo).not.toBeNull();
      
      expect(doneInfo!.filteredLanguages).toEqual(['fr']);
      expect(failedInfo!.filteredLanguages).toEqual(['de']);
      expect(reviewInfo!.filteredLanguages).toEqual(['it']);
      
      expect(doneInfo!.isPartialDisplay).toBe(true);
      expect(failedInfo!.isPartialDisplay).toBe(true);
      expect(reviewInfo!.isPartialDisplay).toBe(true);
    });
  });
});