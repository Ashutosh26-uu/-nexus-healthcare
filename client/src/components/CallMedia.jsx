import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';

// Plays a call stream. Browsers block sound until the person has tapped the page; if that happens we
// start the picture silently and offer a one-tap "turn on sound" instead of a frozen black box.
export default function CallMedia({ stream, self = false, audioOnly = false, className, label }) {
  const ref = useRef(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream || null;
    if (!stream) return;
    el.muted = self;
    el.play?.()?.then(() => setBlocked(false)).catch(() => {
      if (self) return;
      setBlocked(true);
      if (!audioOnly) { el.muted = true; el.play?.()?.catch(() => {}); }
    });
  }, [stream, self, audioOnly]);

  const unblock = () => { const el = ref.current; if (!el) return; el.muted = false; el.play?.()?.then(() => setBlocked(false)).catch(() => {}); };

  return (
    <>
      {audioOnly
        ? <audio ref={ref} autoPlay aria-label={label} />
        : <video ref={ref} className={className} autoPlay playsInline muted={self} aria-label={label} />}
      {blocked && <button type="button" className="call-unmute" onClick={unblock}><Volume2 size={18} /> Tap to turn on sound</button>}
    </>
  );
}
