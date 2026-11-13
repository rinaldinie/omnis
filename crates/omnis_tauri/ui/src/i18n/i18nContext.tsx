import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { LocaleCode, LocaleInfo, SUPPORTED_LOCALES, TranslationSchema } from './types';
import { it } from './locales/it';
import { en } from './locales/en';
import type { TranslateFn, TranslationParams } from '../types';

const STORAGE_KEY = 'omnis_language';

const LOCALE_LOADERS: Partial<Record<LocaleCode, () => Promise<TranslationSchema>>> = {
  es: () => import('./locales/es').then((m) => m.es),
  fr: () => import('./locales/fr').then((m) => m.fr),
  de: () => import('./locales/de').then((m) => m.de),
  ja: () => import('./locales/ja').then((m) => m.ja),
};

const localeCache: Partial<Record<LocaleCode, TranslationSchema>> = {
  it,
  en,
};

const pendingLocaleLoads: Partial<Record<LocaleCode, Promise<TranslationSchema | null>>> = {};

function isSupportedLocale(code: string | null | undefined): code is LocaleCode {
  return Boolean(code && SUPPORTED_LOCALES.some((l) => l.code === code));
}

/** Dynamically load and cache a locale bundle on demand (`it` and `en` are eagerly available). */
export async function loadLocale(code: LocaleCode): Promise<TranslationSchema | null> {
  const cached = localeCache[code];
  if (cached) return cached;

  const existing = pendingLocaleLoads[code];
  if (existing) return existing;

  const loader = LOCALE_LOADERS[code];
  if (!loader) return null;

  const promise = loader()
    .then((schema) => {
      localeCache[code] = schema;
      return schema;
    })
    .catch((err) => {
      console.warn(`Failed to load locale "${code}":`, err);
      return null;
    })
    .finally(() => {
      delete pendingLocaleLoads[code];
    });

  pendingLocaleLoads[code] = promise;
  return promise;
}

interface I18nContextType {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: TranslateFn;
  currentLocaleInfo: LocaleInfo;
  availableLocales: LocaleInfo[];
}

const I18nContext = createContext<I18nContextType | null>(null);

function detectInitialLocale(): LocaleCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isSupportedLocale(saved)) {
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

function resolveNestedKey(obj: unknown, path: string): string | undefined {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolateParams(text: string, params?: TranslationParams): string {
  if (!params) return text;
  let result = text;
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) {
      result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return result;
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: LocaleCode;
}) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => initialLocale || detectInitialLocale());
  const [loadedLocales, setLoadedLocales] = useState<Partial<Record<LocaleCode, TranslationSchema>>>(
    () => ({ ...localeCache })
  );
  const switchSeqRef = useRef(0);

  useEffect(() => {
    if (loadedLocales[locale]) return;
    let active = true;
    void loadLocale(locale).then((schema) => {
      if (active && schema) {
        setLoadedLocales((prev) => (prev[locale] ? prev : { ...prev, [locale]: schema }));
      }
    });
    return () => {
      active = false;
    };
  }, [locale, loadedLocales]);

  const setLocale = useCallback((newLocale: LocaleCode) => {
    if (!isSupportedLocale(newLocale)) return;

    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
    } catch (err) {
      console.warn('Failed to save language in localStorage:', err);
    }

    const seq = ++switchSeqRef.current;
    const cached = localeCache[newLocale];
    if (cached) {
      setLoadedLocales((prev) => (prev[newLocale] ? prev : { ...prev, [newLocale]: cached }));
      setLocaleState(newLocale);
      return;
    }

    void loadLocale(newLocale).then((schema) => {
      if (switchSeqRef.current !== seq) return;
      if (schema) {
        setLoadedLocales((prev) => ({ ...prev, [newLocale]: schema }));
      }
      setLocaleState(newLocale);
    });
  }, []);

  const currentLocaleInfo = useMemo(() => {
    return SUPPORTED_LOCALES.find((l) => l.code === locale) || SUPPORTED_LOCALES[0];
  }, [locale]);

  const t: TranslateFn = useCallback(
    (keyPath, params) => {
      const currentDict = loadedLocales[locale] ?? localeCache[locale];
      // 1. Try current locale
      let text = currentDict ? resolveNestedKey(currentDict, keyPath) : undefined;
      // 2. Fallback to English if missing
      if (!text && locale !== 'en') {
        text = resolveNestedKey(en, keyPath);
      }
      // 3. Fallback to Italian if still missing (legacy)
      if (!text && locale !== 'it') {
        text = resolveNestedKey(it, keyPath);
      }
      if (!text) {
        if (params && typeof params.defaultValue === 'string') {
          text = params.defaultValue;
        } else {
          return keyPath;
        }
      }
      return interpolateParams(text, params);
    },
    [locale, loadedLocales]
  );

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
    const fallbackT: TranslateFn = (path, options) => {
      let text = resolveNestedKey(en, path) ?? resolveNestedKey(it, path);
      if (!text) {
        if (options && typeof options.defaultValue === 'string') {
          text = options.defaultValue;
        } else {
          return path;
        }
      }
      return interpolateParams(text, options);
    };
    return {
      locale: 'en' as LocaleCode,
      setLocale: () => {},
      t: fallbackT,
      currentLocaleInfo: SUPPORTED_LOCALES[1],
      availableLocales: SUPPORTED_LOCALES,
    };
  }
  return context;
}
