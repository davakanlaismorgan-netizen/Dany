import { createContext, useContext, useState, type ReactNode } from 'react';
import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';

export type Language = 'en' | 'fr';

interface I18nContextValue {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = { en, fr };

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('das-lang');
    return (saved === 'en' || saved === 'fr') ? saved : 'fr';
  });

  const setLang = (l: Language) => {
    setLangState(l);
    localStorage.setItem('das-lang', l);
  };

  const t = (key: string) => {
    const val = translations[lang][key] ?? translations.en[key];
    if (val === undefined) {
      console.warn(`[i18n] Missing key: "${key}"`);
      return key;
    }
    return val;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
