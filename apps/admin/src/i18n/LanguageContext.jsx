import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import fr from './fr/index.js';

// ─────────────────────────────────────────────────────────────────────────
// Bilingual (FR/EN) UI, the lightest way that fits a codebase whose strings
// are already written in English.
//
// The English string IS the key: t('Save') returns the French translation
// when it exists and the English original otherwise. That means a string not
// yet translated still renders correctly (in English) instead of showing a
// missing-key placeholder — so translation can land area by area without ever
// leaving the app half-broken. Only the French overrides live in a dictionary
// (src/i18n/fr/), split into per-area fragments so several files can be
// translated in parallel without colliding.
//
// Interpolation: t('{n} days left', { n: 3 }) fills {n}. The French entry uses
// the same {placeholder} tokens, so word order can differ between languages.
//
// The target market is Québec, so a browser with a French locale defaults to
// French; an explicit choice (the header toggle) is remembered in
// localStorage and always wins.
// ─────────────────────────────────────────────────────────────────────────

const DICTS = { fr };
const STORAGE_KEY = 'dorafi_lang';

function getInitialLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'fr' || stored === 'en') return stored;
  } catch {
    // Private mode / disabled storage — fall through to browser detection.
  }
  try {
    const nav = (navigator.language || navigator.languages?.[0] || '').toLowerCase();
    if (nav.startsWith('fr')) return 'fr';
  } catch {
    // No navigator (SSR/tests) — English default.
  }
  return 'en';
}

function interpolate(str, vars) {
  if (!vars) return str;
  return Object.keys(vars).reduce(
    (acc, key) => acc.split(`{${key}}`).join(String(vars[key])),
    str
  );
}

const LanguageContext = createContext({
  lang: 'en',
  setLang: () => {},
  toggleLang: () => {},
  t: (key, vars) => interpolate(key, vars),
});

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(getInitialLang);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Non-fatal: the choice just won't persist across reloads.
    }
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (key, vars) => {
      const table = DICTS[lang];
      const translated = table && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : key;
      return interpolate(translated, vars);
    },
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang, toggleLang: () => setLang((l) => (l === 'fr' ? 'en' : 'fr')), t }),
    [lang, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Access the translator and current language. `const { t, lang, toggleLang } = useT();` */
export function useT() {
  return useContext(LanguageContext);
}
