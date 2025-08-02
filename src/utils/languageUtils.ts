export interface LanguageOption {
  code: string;
  name: string;
  dialects?: { code: string; name: string; region: string }[];
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: 'es',
    name: 'Spanish',
    dialects: [
      { code: 'es', name: 'Spanish', region: 'General' },
      { code: 'es-MX', name: 'Spanish (Mexico)', region: 'Mexico' },
      { code: 'es-AR', name: 'Spanish (Argentina)', region: 'Argentina' },
    ]
  },
  {
    code: 'fr',
    name: 'French',
    dialects: [
      { code: 'fr', name: 'French', region: 'General' },
      { code: 'fr-CA', name: 'French (Canada)', region: 'Canada' },
    ]
  },
  {
    code: 'de',
    name: 'German',
    dialects: [
      { code: 'de', name: 'German', region: 'General' },
      { code: 'de-AT', name: 'German (Austria)', region: 'Austria' },
      { code: 'de-CH', name: 'German (Switzerland)', region: 'Switzerland' },
    ]
  },
  {
    code: 'it',
    name: 'Italian',
    dialects: [
      { code: 'it', name: 'Italian', region: 'General' },
    ]
  },
  {
    code: 'pt',
    name: 'Portuguese',
    dialects: [
      { code: 'pt', name: 'Portuguese', region: 'General' },
      { code: 'pt-BR', name: 'Portuguese (Brazil)', region: 'Brazil' },
    ]
  },
  {
    code: 'nl',
    name: 'Dutch',
    dialects: [
      { code: 'nl', name: 'Dutch', region: 'General' },
    ]
  },
  {
    code: 'pl',
    name: 'Polish',
    dialects: [
      { code: 'pl', name: 'Polish', region: 'General' },
    ]
  },
  {
    code: 'ru',
    name: 'Russian',
    dialects: [
      { code: 'ru', name: 'Russian', region: 'General' },
    ]
  },
  {
    code: 'ja',
    name: 'Japanese',
    dialects: [
      { code: 'ja', name: 'Japanese', region: 'General' },
    ]
  },
  {
    code: 'zh',
    name: 'Chinese',
    dialects: [
      { code: 'zh', name: 'Chinese (Simplified)', region: 'Simplified' },
      { code: 'zh-TW', name: 'Chinese (Traditional)', region: 'Traditional' },
    ]
  },
  {
    code: 'ko',
    name: 'Korean',
    dialects: [
      { code: 'ko', name: 'Korean', region: 'General' },
    ]
  },
  {
    code: 'ar',
    name: 'Arabic',
    dialects: [
      { code: 'ar', name: 'Arabic', region: 'General' },
    ]
  },
];

export const getLanguageDisplayName = (code: string): string => {
  for (const language of SUPPORTED_LANGUAGES) {
    if (language.code === code) {
      return language.name;
    }
    if (language.dialects) {
      const dialect = language.dialects.find(d => d.code === code);
      if (dialect) {
        return dialect.name;
      }
    }
  }
  return code;
};

export const getLanguageCode = (displayName: string): string => {
  for (const language of SUPPORTED_LANGUAGES) {
    if (language.name === displayName) {
      return language.code;
    }
    if (language.dialects) {
      const dialect = language.dialects.find(d => d.name === displayName);
      if (dialect) {
        return dialect.code;
      }
    }
  }
  return displayName;
};

export const getAllLanguageOptions = (): Array<{ code: string; name: string }> => {
  const options: Array<{ code: string; name: string }> = [];
  
  for (const language of SUPPORTED_LANGUAGES) {
    if (language.dialects && language.dialects.length > 1) {
      // If there are multiple dialects, add each dialect
      language.dialects.forEach(dialect => {
        options.push({ code: dialect.code, name: dialect.name });
      });
    } else {
      // If there's only one dialect or no dialects, add the main language
      options.push({ code: language.code, name: language.name });
    }
  }
  
  return options.sort((a, b) => a.name.localeCompare(b.name));
};