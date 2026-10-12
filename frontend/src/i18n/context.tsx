import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** The three languages DIP Kerala supports -- English, Malayalam, and Hindi, the languages
 * actually in use across Kerala (Malayalam as the state language, English and Hindi both
 * widely read, especially for official/disaster-management communication). */
export type Lang = 'en' | 'ml' | 'hi';

export const LANGUAGES: { code: Lang; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
];

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const STORAGE_KEY = 'dip_lang';

const LanguageContext = createContext<LanguageContextValue>({ lang: 'en', setLang: () => {} });

function readStoredLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ml' || saved === 'hi') return saved;
  } catch {
    // localStorage unavailable (private browsing etc) -- fall through to default
  }
  return 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // best-effort persistence only
    }
  };

  // Keeps the document's lang attribute honest for screen readers/browser features, and gives
  // us a hook to set lang-specific font-feature tweaks later if needed.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
