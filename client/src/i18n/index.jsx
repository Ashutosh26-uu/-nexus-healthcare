import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import LANGUAGES from './languages.json';
import { setDictionary, tr } from './translator';

export { LANGUAGES, tr };

const KEY = 'oc_lang';
const I18nContext = createContext(null);
let currentLocale = 'en-IN';
let currentLang = 'en';

/** Locale for Intl date/number formatting, e.g. "hi-IN", "ar". */
export const getLocale = () => currentLocale;
export const getLang = () => currentLang;
export const langInfo = (code) => LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];

// Map profile language names ("Hindi", "Awadhi") to codes.
export function codeForName(name) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  return LANGUAGES.find((l) => l.name.toLowerCase() === n || l.native.toLowerCase() === n || l.code === n)?.code || null;
}

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch { /* ignore */ }
  for (const nav of navigator.languages || [navigator.language || 'en']) {
    const exact = LANGUAGES.find((l) => l.code.toLowerCase() === nav.toLowerCase());
    if (exact) return exact.code;
    const base = LANGUAGES.find((l) => l.code === nav.split('-')[0]);
    if (base) return base.code;
  }
  return 'en';
}

function readCache(lang) {
  try { return JSON.parse(localStorage.getItem(`oc_i18n_${lang}`)); } catch { return null; }
}
function writeCache(lang, data) {
  try { localStorage.setItem(`oc_i18n_${lang}`, JSON.stringify(data)); } catch { /* storage full — fine */ }
}

// Applying a dictionary re-scans the whole page, so identical data (cache → same server copy, or a
// poll that brought nothing new) is skipped.
let appliedJson = '';
function apply(dict) {
  const json = JSON.stringify(dict || {});
  if (json === appliedJson) return;
  appliedJson = json;
  setDictionary(dict);
}

// Returning visitors: install the cached dictionary before React commits anything, so the first
// paint is already in their language instead of flashing English until the effect runs.
function initialLang() {
  const lang = detect();
  if (lang !== 'en') { const cached = readCache(lang); if (cached?.dict) apply(cached.dict); }
  return lang;
}

const EN_STATUS = { coverage: 100, pending: false, loading: false, autoTranslate: false };
const sameStatus = (a, b) => a.coverage === b.coverage && a.pending === b.pending && a.loading === b.loading && a.autoTranslate === b.autoTranslate;

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);
  const [status, setStatus] = useState(EN_STATUS);
  const pollRef = useRef(null);
  const info = langInfo(lang);

  const load = useCallback(async (code, silent) => {
    clearTimeout(pollRef.current);
    if (code === 'en') { appliedJson = ''; setDictionary(null); setStatus((s) => (sameStatus(s, EN_STATUS) ? s : EN_STATUS)); return; }
    const cached = readCache(code);
    if (cached?.dict) apply(cached.dict);
    if (!silent) setStatus((s) => (s.loading === !cached ? s : { ...s, loading: !cached }));
    try {
      const res = await fetch(`/api/i18n/dict/${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (currentLang !== code) return;
      apply(data.dict);
      writeCache(code, { dict: data.dict, at: Date.now() });
      // Polls every 4 s while pending — only publish a new status object when something changed,
      // or every useI18n consumer re-renders each tick.
      const next = { coverage: data.coverage, pending: data.pending, loading: false, autoTranslate: data.autoTranslate };
      setStatus((s) => (sameStatus(s, next) ? s : next));
      // Keep pulling while the server is still translating this language.
      if (data.pending) pollRef.current = setTimeout(() => load(code, true), 4000);
    } catch {
      setStatus((s) => (s.loading ? { ...s, loading: false } : s));
    }
  }, []);

  useEffect(() => {
    currentLang = lang;
    currentLocale = info.locale || lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = info.dir || 'ltr';
    document.body.classList.toggle('rtl', info.dir === 'rtl');
    try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
    load(lang);
    return () => clearTimeout(pollRef.current);
  }, [lang, info, load]);

  const setLang = useCallback((code) => {
    if (LANGUAGES.some((l) => l.code === code)) setLangState(code);
  }, []);

  const value = useMemo(() => ({ lang, setLang, info, languages: LANGUAGES, ...status, t: tr, locale: info.locale || lang }), [lang, setLang, info, status]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
