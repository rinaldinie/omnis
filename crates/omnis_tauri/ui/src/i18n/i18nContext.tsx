import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { LocaleCode, LocaleInfo, SUPPORTED_LOCALES, TranslationSchema } from './types';
import { it } from './locales/it';
import { en } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { de } from './locales/de';
import { ja } from './locales/ja';

const STORAGE_KEY = 'omnis_language';

const translations: Record<LocaleCode, TranslationSchema> = {
  it,
  en,
  es,
  fr,
  de,
  ja,
};

interface I18nContextType {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: (keyPath: string, params?: Record<string, string | number>) => string;
  currentLocaleInfo: LocaleInfo;
  availableLocales: LocaleInfo[];
}

const I18nContext = createContext<I18nContextType | null>(null);

function detectInitialLocale(): LocaleCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as LocaleCode;
    if (saved && translations[saved]) {
      return saved;
    }
    const navLang = navigator.language?.toLowerCase() || '';
    if (navLang.startsWith('it')) return 'it';
    if (navLang.startsWith('es')) return 'es';
    if (navLang.startsWith('fr')) return 'fr';
    if (navLang.startsWith('de')) return 'de';
    if (navLang.startsWith('ja')) return 'ja';
    if (navLang.startsWith('en')) return 'en';
  } catch (err) {
    console.warn('Failed to detect or load saved language:', err);
  }
  return 'it';
}

function resolveNestedKey(obj: any, path: string): string | undefined {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(detectInitialLocale);

  const setLocale = (newLocale: LocaleCode) => {
    if (translations[newLocale]) {
      setLocaleState(newLocale);
      try {
        localStorage.setItem(STORAGE_KEY, newLocale);
      } catch (err) {
        console.warn('Failed to save language in localStorage:', err);
      }
    }
  };

  const currentLocaleInfo = useMemo(() => {
    return SUPPORTED_LOCALES.find((l) => l.code === locale) || SUPPORTED_LOCALES[0];
  }, [locale]);

  const t = (keyPath: string, params?: Record<string, string | number>): string => {
    // 1. Try current locale
    let text = resolveNestedKey(translations[locale], keyPath);
    // 2. Fallback to Italian or English if missing
    if (!text && locale !== 'it') {
      text = resolveNestedKey(translations.it, keyPath);
    }
    if (!text && locale !== 'en') {
      text = resolveNestedKey(translations.en, keyPath);
    }
    if (!text) {
      return keyPath;
    }
    // Interpolate params (e.g. {count} -> 12)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return text;
  };

  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale,
        t,
        currentLocaleInfo,
        availableLocales: SUPPORTED_LOCALES,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
}
