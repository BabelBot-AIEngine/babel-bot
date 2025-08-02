// Completely dynamic language utilities - no hardcoded languages
// All languages are fetched from DeepL API

let cachedLanguages: Array<{ code: string; name: string }> = [];

export const fetchAvailableLanguages = async (): Promise<Array<{ code: string; name: string }>> => {
  const response = await fetch('/api/languages');
  if (!response.ok) {
    throw new Error(`Failed to fetch languages: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json() as { languages?: Array<{ code: string; name: string }> };
  if (!data.languages || !Array.isArray(data.languages)) {
    throw new Error('Invalid response format: expected languages array');
  }
  
  cachedLanguages = data.languages;
  return data.languages;
};

export const getLanguageDisplayName = (code: string): string => {
  const language = cachedLanguages.find(lang => lang.code === code);
  return language ? language.name : code;
};

// Legacy function name for backward compatibility
export const getAllLanguageOptions = fetchAvailableLanguages;