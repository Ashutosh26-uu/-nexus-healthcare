import { Mic, MicOff, Square } from 'lucide-react';
import { useI18n } from '../i18n';
import { cx } from './ui';
import { speechLang, Recognition, useDictation } from './speech';

export const voiceSupported = () => !!Recognition;

// A mic button that types what the person says into a field — for patients who'd rather speak than
// type. Uses the browser's own speech recognition (Chrome / Edge / Android / Safari); hidden elsewhere.
// It keeps listening until tapped again; each finished phrase is passed to onText once, and the words
// being spoken show live under the button so the person can see it is working.
export default function VoiceInput({ onText, onStart, className, label = 'Speak' }) {
  const { lang } = useI18n();
  const mic = useDictation({ lang: speechLang(lang), onPhrase: (t) => onText?.(t) });
  if (!mic.supported) return null;

  return (
    <span className={cx('voice-in', className)}>
      <button type="button" className={cx('voice-btn', mic.listening && 'on')} onClick={() => { if (!mic.listening) onStart?.(); mic.toggle(); }}
        aria-pressed={mic.listening} title={mic.listening ? 'Stop' : 'Speak instead of typing'}>
        {mic.listening ? <Square size={14} /> : <Mic size={15} />}
        <span>{mic.listening ? 'Listening… tap to stop' : label}</span>
        {mic.listening && <span className="voice-wave" aria-hidden="true"><i /><i /><i /></span>}
      </button>
      {mic.listening && (
        <span className="tiny voice-live" aria-live="polite">{mic.interim ? `“${mic.interim}”` : 'Speak now — your words appear here'}</span>
      )}
      {mic.error && <span className="tiny voice-err"><MicOff size={12} /> {mic.error}</span>}
      {!mic.error && mic.note && !mic.listening && <span className="tiny muted">{mic.note}</span>}
    </span>
  );
}
