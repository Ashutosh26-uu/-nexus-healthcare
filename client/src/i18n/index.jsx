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

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detect);
  const [status, setStatus] = useState({ coverage: 100, pending: false, loading: false, autoTranslate: false });
  const pollRef = useRef(null);
  const sizeRef = useRef(0); // entries in the dictionary currently applied
  const info = langInfo(lang);

  const load = useCallback(async (code, silent) => {
    clearTimeout(pollRef.current);
    if (code === 'en') { setDictionary(null); setStatus({ coverage: 100, pending: false, loading: false }); return; }
    const cached = readCache(code);
    if (cached?.dict) setDictionary(cached.dict);
    if (!silent) setStatus((s) => ({ ...s, loading: !cached }));
    try {
      const res = await fetch(`/api/i18n/dict/${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (currentLang !== code) return;
      // Re-applying re-scans the whole page, so while polling only do it when new strings arrived.
      const size = Object.keys(data.dict || {}).length;
      if (!silent || size !== sizeRef.current) setDictionary(data.dict);
      sizeRef.current = size;
      writeCache(code, { dict: data.dict, at: Date.now() });
      setStatus({ coverage: data.coverage, pending: data.pending, loading: false, autoTranslate: data.autoTranslate });
      // Keep pulling while the server is still translating this language.
      if (data.pending) pollRef.current = setTimeout(() => load(code, true), 4000);
    } catch {
      setStatus((s) => ({ ...s, loading: false }));
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
