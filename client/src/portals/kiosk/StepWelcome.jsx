import { useEffect } from 'react';
import { ArrowRight, Volume2 } from 'lucide-react';
import { cx } from '../../components/ui';
import { useKiosk } from './context';
import { LANGS, langOf, hasFullCopy } from './i18n';
import { KButton } from './KUi';

export default function StepWelcome() {
  const { lang, setLang, t, say, goto, kiosk, voiceOn, home } = useKiosk();
  const L = langOf(lang);
  const docsOnline = (home?.data?.doctors || []).filter((d) => d.online).length;

  useEffect(() => {
    const id = setTimeout(() => say('welcome_sub'), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (code) => {
    setLang(code);
    const l = langOf(code);
    say(hasFullCopy(code) ? 'welcome_title' : l.greet, { lang: code });
  };

  return (
    <section className="k-panel k-welcome">
      <div className="k-welcome-hero">
        <div className="k-welcome-greet" key={lang}>
          <span className="k-greet-native" translate="no">{L.greet}</span>
          <h1 className="k-title xl">{t('welcome_title')}</h1>
          <p className="k-sub">{t('welcome_sub')}</p>
          {!hasFullCopy(lang) && <p className="k-note">Screens continue in simple English with pictures; voice guidance and the doctor's notes follow {L.name} where available.</p>}
        </div>
        <div className="k-welcome-side">
          <div className="k-welcome-art" aria-hidden="true">
            <svg viewBox="0 0 200 160">
              <circle cx="100" cy="82" r="66" fill="#e3f0ea" />
              <path d="M100 128s-38-22-38-52a21 21 0 0 1 38-13 21 21 0 0 1 38 13c0 30-38 52-38 52z" fill="#0f5c4d" />
              <path d="M76 84h14l5-11 8 21 5-10h16" stroke="#f2b544" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="160" cy="34" r="8" fill="#d9734e" opacity=".8" />
              <circle cx="40" cy="128" r="5" fill="#3d7fb8" opacity=".6" />
            </svg>
          </div>
          <p className="k-welcome-facts">{kiosk?.name || 'E-Clinic'}{home?.data ? ` · ${docsOnline ? `${docsOnline} doctor${docsOnline === 1 ? '' : 's'} online now` : 'No doctor online right now'}` : ''}</p>
          {voiceOn && <p className="k-voice-hint"><Volume2 size={18} /> Voice guidance is on</p>}
        </div>
      </div>

      <div className="k-langs" role="radiogroup" aria-label="Language">
        {LANGS.map((l) => (
          <button key={l.code} role="radio" aria-checked={lang === l.code} className={cx('k-lang', lang === l.code && 'on')} onClick={() => pick(l.code)} lang={l.speech}>
            <span className="k-lang-native" translate="no">{l.native}</span>
            <span className="k-lang-en">{l.name}</span>
          </button>
        ))}
      </div>

      <div className="k-actions">
        <span className="k-hint">Need help? Ask the ASHA didi at the desk.</span>
        <KButton icon={ArrowRight} className="xl" onClick={() => goto(1)}>{t('start')}</KButton>
      </div>
    </section>
  );
}
