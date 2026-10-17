import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Volume2, Maximize } from 'lucide-react';
import './QueueDisplay.css';

// Waiting-room TV. No login: the unguessable link IS the key, and the server sends only token numbers,
// doctor names and rooms — never a patient's name. Labels are fixed English + Hindi (translate="no"),
// so the page translator never rewrites them on a shared screen.
const POLL_MS = 5000;

// A soft two-note chime made in the browser (no audio file). Browsers block sound until someone taps the
// page once, so the screen starts muted and shows a "tap for sound" button.
function chime(ctx) {
  const t = ctx.currentTime;
  [[660, 0], [880, 0.28]].forEach(([f, at]) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(0.25, t + at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.9);
    o.connect(g).connect(ctx.destination);
    o.start(t + at); o.stop(t + at + 1);
  });
}

const keyOf = (x) => `${x.name}|${x.room || ''}`;

export default function QueueDisplay() {
  const { code } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | offline | invalid
  const [flash, setFlash] = useState({});
  const [soundOn, setSoundOn] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const audio = useRef(null);
  const prev = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true; let timer;
    const load = async () => {
      try {
        const res = await fetch(`/api/public/queue-display/${encodeURIComponent(code)}`, { cache: 'no-store' });
        if (!alive) return;
        if (res.status === 404) { setState('invalid'); return; } // stop polling a dead link
        if (!res.ok) throw new Error(String(res.status));
        const d = await res.json();
        if (!alive) return;
        // Which doctors moved on since the last poll? Flash them, and chime once.
        const before = prev.current;
        if (before) {
          const changed = {};
          d.doctors.forEach((x) => { if (x.nowSeeing != null && before.get(keyOf(x)) !== x.nowSeeing) changed[keyOf(x)] = Date.now(); });
          if (Object.keys(changed).length) {
            setFlash((f) => ({ ...f, ...changed }));
            if (audio.current && audio.current.state === 'running') chime(audio.current);
          }
        }
        prev.current = new Map(d.doctors.map((x) => [keyOf(x), x.nowSeeing]));
        setData(d); setState('ok');
      } catch {
        if (alive) setState((s) => (s === 'invalid' ? s : 'offline'));
      }
      if (alive) timer = setTimeout(load, POLL_MS);
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [code]);

  // Flashes fade after 8 s.
  useEffect(() => {
    if (!Object.keys(flash).length) return undefined;
    const t = setTimeout(() => setFlash((f) => Object.fromEntries(Object.entries(f).filter(([, at]) => Date.now() - at < 8000))), 8100);
    return () => clearTimeout(t);
  }, [flash]);

  const enableSound = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!audio.current && Ctx) audio.current = new Ctx();
      audio.current?.resume().then(() => { setSoundOn(true); chime(audio.current); });
    } catch { /* no audio on this device */ }
  };
  const fullscreen = () => { document.documentElement.requestFullscreen?.().catch(() => {}); };

  if (state === 'invalid') {
    return (
      <div className="qd qd-center" translate="no">
        <h1>This screen link is no longer valid</h1>
        <p>यह स्क्रीन लिंक अब मान्य नहीं है</p>
        <p className="qd-muted">Ask the reception for the current display link.</p>
      </div>
    );
  }
  if (!data) {
    return <div className="qd qd-center" translate="no"><p className="qd-muted">{state === 'offline' ? 'Connecting… · कनेक्ट हो रहा है…' : 'Loading… · लोड हो रहा है…'}</p></div>;
  }

  const time = now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="qd" translate="no">
      <header className="qd-head">
        <div>
          <h1 className="qd-fac">{data.facility}</h1>
          <div className="qd-sub">OPD queue · ओपीडी कतार</div>
        </div>
        <div className="qd-head-right">
          {state === 'offline' && <span className="qd-offline">Reconnecting… · पुनः जुड़ रहा है</span>}
          {!soundOn && <button type="button" className="qd-btn" onClick={enableSound}><Volume2 size={22} /> Tap for sound · आवाज़ चालू करें</button>}
          <button type="button" className="qd-btn ghost" onClick={fullscreen} aria-label="Full screen"><Maximize size={22} /></button>
          <div className="qd-clock">{time}</div>
        </div>
      </header>

      {data.doctors.length === 0 ? (
        <div className="qd-center qd-empty">
          <h2>No tokens yet today</h2>
          <p>आज अभी कोई टोकन नहीं</p>
          <p className="qd-muted">Please collect a token at the reception · कृपया रिसेप्शन से टोकन लें</p>
        </div>
      ) : (
        <main className={`qd-grid n${Math.min(data.doctors.length, 6)}`}>
          {data.doctors.map((x) => (
            <section key={keyOf(x)} className={`qd-card${flash[keyOf(x)] ? ' flash' : ''}`} aria-live="polite">
              <div className="qd-doc">
                <div className="qd-doc-name">{x.name}</div>
                <div className="qd-doc-meta">{x.specialty}{x.room ? <> · <strong>{x.room}</strong></> : null}</div>
              </div>
              <div className="qd-now">
                <span className="qd-label">Now seeing · अभी</span>
                <span className="qd-token">{x.nowSeeing ?? '—'}</span>
              </div>
              <div className="qd-next">
                <span className="qd-label">Next · अगला</span>
                <div className="qd-next-list">
                  {x.next.length ? x.next.map((n) => <span key={n} className="qd-chip">{n}</span>) : <span className="qd-muted">—</span>}
                </div>
              </div>
              <div className="qd-foot">
                <span>{x.waiting} waiting · प्रतीक्षा में</span>
                {x.avgWaitMin > 0 && x.waiting > 0 &&<span>~{x.avgWaitMin} min wait · मिनट</span>}
              </div>
            </section>
          ))}
        </main>
      )}
      <footer className="qd-footer">Please wait for your token number · कृपया अपने टोकन नंबर की प्रतीक्षा करें · Nexus Healthcare</footer>
    </div>
  );
}
