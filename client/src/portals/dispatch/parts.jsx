import { useEffect, useRef, useState } from 'react';
import { Snowflake, MapPin, Package, Navigation, Camera, X, CheckCircle2, Store, Home, Warehouse } from 'lucide-react';
import { fmtMoney, cx } from '../../components/ui';

/* ---------- money & state helpers ---------- */
// No rider pay rate is stored in Sehatra yet, so this is an ESTIMATE (₹30 + ₹6/km, +₹20 cold chain) and always labelled as one.
export const payFor = (job) => 30 + Math.round((job.distanceKm || 0) * 6) + (job.coldChain ? 20 : 0);
export const isToday = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString();

// Acceptance lives on the server (job.acceptedAt) — two riders can never both hold one job.
export const stage = (job) => {
  if (job.status === 'delivered') return 'delivered';
  if (job.status === 'in_transit') return 'in_transit';
  if (job.status === 'picked') return 'picked';
  return job.acceptedAt ? 'accepted' : 'new';
};

const placeIcon = (name = '') => (/store|warehouse|distribut/i.test(name) ? Warehouse : /pharmacy|kendra|medic|apollo/i.test(name) ? Store : Home);
const shortPlace = (s = '') => s.split(/[·,]/)[0].trim();

/* ---------- job summary ---------- */
export function JobSummary({ job }) {
  const PickIcon = placeIcon(job.pickup);
  const DropIcon = placeIcon(job.drop);
  return (
    <div className="dj-route">
      <div className="dj-stop">
        <span className="dj-pin pick"><PickIcon size={15} /></span>
        <div className="grow">
          <span className="dj-tag">Pick up</span>
          <strong>{job.pickup}</strong>
        </div>
      </div>
      <div className="dj-line" />
      <div className="dj-stop">
        <span className="dj-pin drop"><DropIcon size={15} /></span>
        <div className="grow">
          <span className="dj-tag">Drop</span>
          <strong>{job.drop}</strong>
        </div>
      </div>
    </div>
  );
}

export function JobMeta({ job }) {
  return (
    <>
      <div className="dj-meta">
        <span><Package size={14} /> {job.items}</span>
        {job.distanceKm != null && <span><MapPin size={14} /> {job.distanceKm} km</span>}
        <span className="dj-pay" title="Estimated pay">~{fmtMoney(payFor(job))}</span>
      </div>
      {job.coldChain && (
        <div className="dj-cold">
          <span className="dj-cold-badge"><Snowflake size={14} /> Cold chain</span>
          <span>Keep 2–8°C. Use the insulated box with ice packs, and don't leave it in the sun.</span>
        </div>
      )}
    </>
  );
}

/* ---------- stylised route map ---------- */
// A schematic of pickup (A) → drop, not a real map: there is no live GPS, so no rider position is drawn.
export function RouteMap({ job }) {
  const seed = [...job.id].reduce((s, c) => s + c.charCodeAt(0), 0);
  const p0 = [44, 128];
  const p2 = [282, 50];
  const p1 = [120 + (seed % 70), 24 + (seed % 40)];
  return (
    <div className="dj-map" dir="ltr">
      <svg viewBox="0 0 320 170" role="img" aria-label={`Schematic route from ${shortPlace(job.pickup)} to ${shortPlace(job.drop)}${job.distanceKm != null ? `, ${job.distanceKm} km` : ''}`}>
        <rect width="320" height="170" fill="#f3eee3" />
        {/* blocks */}
        {[[12, 12, 70, 40], [96, 70, 60, 34], [190, 104, 80, 44], [236, 10, 70, 26], [20, 70, 50, 28], [168, 18, 46, 36]].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="6" fill="#ebe4d6" />
        ))}
        {/* roads */}
        <path d="M0 60 H320 M0 112 H320 M88 0 V170 M230 0 V170" stroke="#fffdf9" strokeWidth="7" />
        <path d="M0 60 H320 M0 112 H320 M88 0 V170 M230 0 V170" stroke="#e6dfd3" strokeWidth="1" strokeDasharray="4 6" />
        {/* route */}
        <path d={`M${p0} Q${p1} ${p2}`} fill="none" stroke="#0f5c4d" strokeOpacity="0.18" strokeWidth="9" strokeLinecap="round" />
        <path d={`M${p0} Q${p1} ${p2}`} fill="none" stroke="#0f5c4d" strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" className="dj-route-path" />
        {/* pins */}
        <g transform={`translate(${p0[0]} ${p0[1]})`}>
          <circle r="11" fill="#d9734e" />
          <text y="4" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">A</text>
        </g>
        <g transform={`translate(${p2[0]} ${p2[1]})`}>
          <path d="M0 -24 C 10 -24 14 -16 14 -11 C 14 -2 0 8 0 8 C 0 8 -14 -2 -14 -11 C -14 -16 -10 -24 0 -24 Z" fill="#0f5c4d" />
          <circle cy="-11" r="5" fill="#fff" />
        </g>
      </svg>
      <div className="dj-map-labels">
        <span><b className="a">A</b> {shortPlace(job.pickup)}</span>
        <span><b className="b" /> {shortPlace(job.drop)}</span>
      </div>
      <a className="dj-nav-btn" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.status === 'in_transit' ? String(job.drop || '').split(' · ').slice(-1)[0] : job.pickup)}`} target="_blank" rel="noreferrer">
        <Navigation size={15} /> Navigate
      </a>
    </div>
  );
}

/* ---------- OTP + photo proof sheet ---------- */
export function DeliverSheet({ job, open, onClose, onSubmit }) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const refs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) {
      setDigits(['', '', '', '']); setError(''); setDone(false); setPhoto(null);
      setTimeout(() => refs[0].current?.focus(), 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  if (!open || !job) return null;
  const code = digits.join('');

  const setAt = (i, v) => {
    const clean = v.replace(/\D/g, '');
    if (clean.length > 1) { // pasted the whole code
      const arr = clean.slice(0, 4).split('');
      setDigits([0, 1, 2, 3].map((k) => arr[k] || ''));
      refs[Math.min(arr.length, 3)].current?.focus();
      return;
    }
    setDigits((d) => d.map((x, k) => (k === i ? clean : x)));
    setError('');
    if (clean && i < 3) refs[i + 1].current?.focus();
  };
  const onKey = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs[i - 1].current?.focus();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (code.length < 4) { setError('Enter all 4 digits.'); return; }
    setBusy(true);
    const err = await onSubmit(code, photo?.file);
    setBusy(false);
    if (err) { setError(err); setDigits(['', '', '', '']); refs[0].current?.focus(); } else setDone(true);
  };

  return (
    <div className="dj-sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dj-sheet" role="dialog" aria-modal="true" aria-label="Confirm delivery">
        <span className="dj-grab" />
        {done ? (
          <div className="dj-done">
            <CheckCircle2 size={56} />
            <h2>Delivered!</h2>
            <p className="muted">About {fmtMoney(payFor(job))} added to today&apos;s estimated earnings. Shabaash, keep going.</p>
            <button className="dj-big-btn" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="row between">
              <h3 className="mb-0">Confirm delivery</h3>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X /></button>
            </div>
            <p className="small muted">Ask {shortPlace(job.drop)} for the 4-digit code from their Sehatra app or SMS.</p>
            <div className={cx('dj-otp', error && 'shake')} dir="ltr">
              {digits.map((d, i) => (
                <input key={i} ref={refs[i]} value={d} inputMode="numeric" autoComplete="one-time-code" maxLength={i === 0 ? 4 : 1}
                  onChange={(e) => setAt(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} aria-label={`OTP digit ${i + 1}`} />
              ))}
            </div>
            {error ? <div className="dj-error">{error}</div> : <div className="tiny muted center">The recipient sees this code in their app.</div>}

            <div className="dj-photo">
              <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto({ file: f, url: URL.createObjectURL(f) }); }} />
              {photo ? (
                <div className="dj-photo-preview">
                  <img src={photo.url} alt="Proof of delivery" />
                  <button type="button" onClick={() => { setPhoto(null); fileRef.current.value = ''; }} aria-label="Remove photo"><X size={14} /></button>
                </div>
              ) : (
                <button type="button" className="dj-photo-btn" onClick={() => fileRef.current?.click()}>
                  <Camera size={18} /> Add photo proof <span className="tiny muted">(optional)</span>
                </button>
              )}
            </div>
            <button type="submit" className="dj-big-btn" disabled={busy || code.length < 4}>
              {busy ? <span className="spinner sm" style={{ borderTopColor: '#fff' }} /> : <CheckCircle2 size={20} />} Confirm delivered
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
