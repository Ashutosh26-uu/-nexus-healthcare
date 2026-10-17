import { useEffect, useRef, useState } from 'react';
import { Clock, MapPin, CircleCheck, Moon } from 'lucide-react';
import { api } from '../api';
import { cx } from './ui';

// Live doctor availability, as computed by the server (see server/availability.js).
// Green pill + pop-up when available; when not, the whole card is faded via `availClass`.
export const availClass = (a) => (a && !a.available ? 'is-unavailable' : '');

export function AvailBadge({ a, className }) {
  if (!a) return null;
  if (a.available) {
    return (
      <span className={cx('avail-pill on', className)} tabIndex={0}>
        <span className="avail-dot" />Available
        <span className="avail-pop" role="tooltip">
          <CircleCheck size={15} />
          <span>
            <strong>Available now</strong>
            <span>{a.label}{a.mode === 'presence' ? ' — checked in by the doctor' : ''}</span>
          </span>
        </span>
      </span>
    );
  }
  return (
    <span className={cx('avail-pill off', className)} title={a.next ? `Next available: ${a.next}` : undefined}>
      <Moon size={12} />Not available{a.next ? <span className="avail-next"> · next {a.next}</span> : null}
    </span>
  );
}

export function AvailLine({ a }) {
  if (!a) return null;
  return (
    <span className={cx('avail-line', a.available ? 'on' : 'off')}>
      {a.mode === 'presence' ? <MapPin size={13} /> : <Clock size={13} />}
      {a.available ? a.label : a.mode === 'schedule' ? `Hours over${a.next ? ` · back ${a.next}` : ''}` : `Not at an E-Clinic${a.next ? ` · usually ${a.next}` : ''}`}
    </span>
  );
}

// Protected image (e.g. a doctor's profile photo) loaded through the authenticated API.
// Fetched only when it comes near the screen (long store/doctor lists), like loading="lazy" does for a
// plain <img>; the placeholder carries the same class, so its size is reserved and nothing shifts.
export function ProtectedImg({ fileId, alt, className }) {
  const [src, setSrc] = useState(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const ph = useRef(null);
  useEffect(() => {
    if (near || !ph.current) return undefined;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setNear(true); }, { rootMargin: '300px' });
    io.observe(ph.current);
    return () => io.disconnect();
  }, [near]);
  useEffect(() => {
    if (!fileId || !near) return undefined;
    let url; let alive = true;
    // Resolved after unmount → nobody will revoke it later, so free the blob right away.
    api.fileObjectUrl(fileId).then((u) => { if (!alive) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => {});
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [fileId, near]);
  if (!src) return <span ref={ph} className={cx('protected-img ph', className)} />;
  return <img src={src} alt={alt} decoding="async" className={cx('protected-img', className)} />;
}
