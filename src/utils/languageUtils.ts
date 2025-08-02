// Simple utility for language display mapping
// Languages will be fetched dynamically from DeepL API

let cachedLanguages: Array<{ code: string; name: string }> = [];

export const fetchAvailableLanguages = async (): Promise<Array<{ code: string; name: string }>> => {
  try {
    const response = await fetch('/api/languages');
    const data = await response.json() as { languages?: Array<{ code: string; name: string }> };
    if (data.languages) {
      cachedLanguages = data.languages;
      return data.languages;
    }
    throw new Error('Invalid response format');
  } catch (error) {
    console.error('Failed to fetch languages:', error);
    // Fallback to basic languages if API fails
    return [
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'it', name: 'Italian' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'nl', name: 'Dutch' },
      { code: 'pl', name: 'Polish' },
      { code: 'ru', name: 'Russian' },
      { code: 'ja', name: 'Japanese' },
      { code: 'zh', name: 'Chinese (Simplified)' },
      { code: 'ko', name: 'Korean' },
      { code: 'ar', name: 'Arabic' },
    ];
  }
};

export const getLanguageDisplayName = (code: string): string => {
  const language = cachedLanguages.find(lang => lang.code === code);
  return language ? language.name : code;
};

// Legacy function name for backward compatibility
export const getAllLanguageOptions = fetchAvailableLanguages;