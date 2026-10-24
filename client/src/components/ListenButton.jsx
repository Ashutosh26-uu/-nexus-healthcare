import { useEffect, useState } from 'react';
import { Volume2, Square } from 'lucide-react';
import { speak, stopSpeaking, speakSupported, voiceLangFor } from './speech';
import { getLang } from '../i18n';

// Reads the visible page aloud (title, then the main content), in the app's language where the phone has that voice.
export default function ListenButton() {
  const [on, setOn] = useState(false);
  useEffect(() => () => stopSpeaking(), []);
  if (!speakSupported()) return null;
  const go = () => {
    if (on) { stopSpeaking(); setOn(false); return; }
    const main = document.querySelector('.portal-content') || document.querySelector('main');
    const text = (main?.innerText || '').replace(/\n{2,}/g, '. ').replace(/\s+/g, ' ').slice(0, 2500);
    if (!text) return;
    setOn(true);
    if (!speak(text, voiceLangFor(text, getLang()), { onEnd: () => setOn(false) })) setOn(false);
  };
  return (
    <button type="button" className="btn sm secondary listen-btn" onClick={go} aria-pressed={on}>
      {on ? <Square size={15} /> : <Volume2 size={15} />} {on ? 'Stop' : 'Listen'}
    </button>
  );
}
