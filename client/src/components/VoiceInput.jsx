import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Square } from 'lucide-react';
import { useI18n } from '../i18n';
import { cx } from './ui';

// Speech language for the browser's recogniser — from the app language (hi → hi-IN, ta → ta-IN …).
const INDIAN = new Set(['hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as', 'ur']);
const speechLang = (code) => (!code || code === 'en' ? (navigator.language || 'en-IN') : INDIAN.has(code) ? `${code}-IN` : code);
const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const voiceSupported = () => !!Recognition;

// A mic button that types what the person says into a field — for patients who'd rather speak than
// type. Uses the browser's own speech recognition (Chrome / Edge / Android / Safari); hidden elsewhere.
export default function VoiceInput({ onText, onStart, className, label = 'Speak' }) {
  const { lang } = useI18n();
  const [on, setOn] = useState(false);
  const [error, setError] = useState('');
  const rec = useRef(null);
  // Recognition is continuous: a later phrase must reach the *current* onText (callers build on their latest
  // state), not the one captured when the mic was switched on — that dropped everything said before it.
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  useEffect(() => () => rec.current?.abort?.(), []);
  if (!Recognition) return null;

  const start = () => {
    setError('');
    const r = new Recognition();
    r.lang = speechLang(lang);
    r.interimResults = false;
    r.continuous = true;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const said = [...e.results].slice(e.resultIndex).filter((x) => x.isFinal).map((x) => x[0].transcript).join(' ').trim();
      if (said) onTextRef.current?.(said);
    };
    r.onerror = (e) => { setError(e.error === 'not-allowed' ? 'Allow the microphone for this site to speak.' : e.error === 'no-speech' ? 'We didn’t hear anything — try again.' : ''); setOn(false); };
    r.onend = () => setOn(false);
    rec.current = r;
    try { r.start(); setOn(true); onStart?.(); } catch { setOn(false); }
  };
  const stop = () => { rec.current?.stop(); setOn(false); };

  return (
    <span className={cx('voice-in', className)}>
      <button type="button" className={cx('voice-btn', on && 'on')} onClick={on ? stop : start} aria-pressed={on} title={on ? 'Stop' : 'Speak instead of typing'}>
        {on ? <Square size={14} /> : <Mic size={15} />}
        <span>{on ? 'Listening… tap to stop' : label}</span>
        {on && <span className="voice-wave" aria-hidden="true"><i /><i /><i /></span>}
      </button>
      {error && <span className="tiny voice-err"><MicOff size={12} /> {error}</span>}
    </span>
  );
}
