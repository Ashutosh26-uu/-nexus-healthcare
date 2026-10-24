import { useState } from 'react';
import { Languages, X } from 'lucide-react';
import { useI18n } from '../i18n';
import LanguagePicker from './LanguagePicker';

const ASKED = 'oc_lang_chosen';
// The languages most people in India read, in their own script — one tap, no menus.
const TOP = ['hi', 'en', 'bn', 'mr', 'te', 'ta', 'gu', 'kn', 'ml', 'pa', 'or', 'ur'];
const askedBefore = () => { try { return localStorage.getItem(ASKED) === '1' || window.__ocLangSaved === true; } catch { return true; } };

// First visit only: "choose your language" right at the top of the page, instead of hoping people find the
// globe icon. Phones are usually set to English even when their owner reads Hindi or Tamil more easily.
export default function LanguageStrip() {
  const { lang, setLang, languages } = useI18n();
  const [show, setShow] = useState(() => !askedBefore());
  if (!show) return null;
  const done = () => { try { localStorage.setItem(ASKED, '1'); } catch { /* ignore */ } setShow(false); };
  const pick = (code) => { setLang(code); done(); };
  return (
    <div className="lang-strip" role="group" aria-label="Choose your language">
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <Languages size={18} />
        <strong className="grow" translate="no">अपनी भाषा चुनें · Choose your language</strong>
        <button type="button" className="icon-btn" aria-label="Close" onClick={done}><X size={16} /></button>
      </div>
      <div className="lang-strip-list">
        {TOP.map((code) => {
          const l = languages.find((x) => x.code === code);
          if (!l) return null;
          return <button key={code} type="button" translate="no" className={`chip ${lang === code ? 'on' : ''}`} lang={code} onClick={() => pick(code)}>{l.native || l.name}</button>;
        })}
        <LanguagePicker compact onChange={done} />
      </div>
    </div>
  );
}
