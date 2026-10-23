import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Square } from 'lucide-react';
import { useI18n } from '../i18n';
import { cx } from './ui';
import { speechLang, Recognition, joinResults } from './speech';

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
  // The mic stays on until the person taps Stop. Browsers (Android Chrome especially) end recognition after a
  // pause or a few seconds of silence, so we start a fresh session each time it ends while this is set.
  const wantOn = useRef(false);
  const restarts = useRef(0);
  useEffect(() => () => { wantOn.current = false; rec.current?.abort?.(); }, []);
  if (!Recognition) return null;

  // One phrase per session: the browser ends it at a pause, the phrase is sent once, and a new session starts.
  // (Android Chrome repeats the growing sentence as separate results — "kafi", "kafi din", "kafi din se" —
  // so sending each result as it came wrote every version. Now the whole phrase goes once, de-duplicated.)
  const session = () => {
    const r = new Recognition();
    r.lang = speechLang(lang);
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 1;
    let said = '';
    r.onresult = (e) => { said = joinResults(e.results, { finalOnly: true }) || said; };
    r.onerror = (e) => {
      // Silence or a dropped session is normal while listening; onend restarts it.
      if (e.error === 'no-speech' || e.error === 'aborted' || e.error === 'network') return;
      wantOn.current = false;
      setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Allow the microphone for this site to speak.' : 'The mic stopped — tap to start again.');
    };
    r.onend = () => {
      if (said) { restarts.current = 0; onTextRef.current?.(said); said = ''; }
      // A runaway loop (mic grabbed by another app) stops after many empty restarts in a row.
      if (wantOn.current && restarts.current < 50) {
        restarts.current += 1;
        try { session(); return; } catch { /* fall through */ }
      }
      wantOn.current = false;
      setOn(false);
    };
    rec.current = r;
    r.start();
  };

  const start = () => {
    setError('');
    restarts.current = 0;
    wantOn.current = true;
    try { session(); setOn(true); onStart?.(); } catch { wantOn.current = false; setOn(false); }
  };
  const stop = () => { wantOn.current = false; rec.current?.stop(); setOn(false); };

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
