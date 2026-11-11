import React, { createContext, useContext, useMemo } from 'react';
import { AppLanguage } from '../types';
import { TRANSLATIONS } from './translations';

interface I18nContextValue {
  language: AppLanguage;
  t: (key: string, fallback?: string) => string;
  isIndonesian: boolean;
  isEnglish: boolean;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'id-ID',
  t: (key: string, fallback?: string) => fallback || key,
  isIndonesian: true,
  isEnglish: false,
});

export interface I18nProviderProps {
  language: AppLanguage;
  children: React.ReactNode;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ language, children }) => {
  const value = useMemo<I18nContextValue>(() => {
    const activeLang: AppLanguage = language === 'en-US' ? 'en-US' : 'id-ID';

    const t = (key: string, fallback?: string): string => {
      const currentDict = TRANSLATIONS[activeLang];
      if (currentDict && key in currentDict && currentDict[key]) {
        return currentDict[key];
      }
      // Safe fallback to Indonesian default
      const defaultDict = TRANSLATIONS['id-ID'];
      if (defaultDict && key in defaultDict && defaultDict[key]) {
        return defaultDict[key];
      }
      // Fallback to provided default text or key itself
      return fallback !== undefined ? fallback : key;
    };

    return {
      language: activeLang,
      t,
      isIndonesian: activeLang === 'id-ID',
      isEnglish: activeLang === 'en-US',
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useTranslation(): I18nContextValue {
  return useContext(I18nContext);
}
