import { useEffect, useRef, useState } from 'react';
import { MapPin, CalendarClock, CheckCircle2, RefreshCw } from 'lucide-react';
import { api, subscribe } from '../../api';
import { fmtDateTime, cx } from '../../components/ui';
import QR from '../../components/QR';

// Live visit pass for in-person appointments. The QR and 6-digit code change every 30 seconds
// (signed on the server), so a forwarded screenshot stops working almost immediately.
export default function VisitPass({ consultId, compact }) {
  const [pass, setPass] = useState(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.get(`/consults/${consultId}/pass`).then((p) => {
      if (!alive) return;
      setPass(p); setLeft(p.expiresIn); setError('');
      clearTimeout(timer.current);
      if (!p.checkedInAt) timer.current = setTimeout(load, p.expiresIn * 1000 + 300);
      else if (p.ahead != null) timer.current = setTimeout(load, 20000); // waiting with a token: keep "people ahead" fresh
    }).catch((e) => alive && setError(e.message));
    load();
    // Live: reception checking you in (or the queue moving) shows here at once, not on the next timer tick.
    const off = subscribe((topics) => {
      if (topics.includes('all') || topics.some((t) => t === 'queue' || t === 'consults' || t === `consult:${consultId}`)) load();
    });
    return () => { alive = false; clearTimeout(timer.current); off(); };
  }, [consultId]);

  useEffect(() => {
    if (!pass || pass.checkedInAt) return undefined;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [pass]);

  if (error) return <div className="form-error small">{error}</div>;
  if (!pass) return <div className="skeleton" style={{ width: 200, height: 200, borderRadius: 16 }} />;

  if (pass.checkedInAt) {
    return (
      <div className="pt-pass done">
        <CheckCircle2 size={36} />
        <strong>Checked in</strong>
        {pass.token != null && (
          <span className="pt-pass-token">Your token: <strong>{pass.token}</strong>{pass.ahead != null ? ` · ${pass.ahead === 0 ? 'you\'re next' : `${pass.ahead} ${pass.ahead === 1 ? 'person' : 'people'} ahead of you`}` : ''}</span>
        )}
        <span className="small muted">Please wait — {pass.doctorName} will call you shortly.</span>
      </div>
    );
  }
  return (
    <div className={cx('pt-pass', compact && 'compact')}>
      {pass.bookingNo && <div className="pt-pass-no"><span className="tiny muted">Booking ID</span><strong className="mono" translate="no">{pass.bookingNo}</strong></div>}
      <QR value={pass.payload} size={compact ? 180 : 220} label="Visit pass QR — show at reception" />
      <div className="pt-pass-code mono" aria-label={`Code ${pass.code}`}>{pass.code.slice(0, 3)} {pass.code.slice(3)}</div>
      <div className="pt-pass-timer">
        <span className="pt-pass-bar"><span style={{ width: `${(left / 30) * 100}%` }} /></span>
        <span className="tiny muted"><RefreshCw size={11} /> new code in {left}s</span>
      </div>
      {!compact && (
        <div className="pt-pass-meta small">
          <span><MapPin size={13} /> <span translate="no">{pass.location?.name}</span></span>
          {pass.scheduledAt && <span><CalendarClock size={13} /> {fmtDateTime(pass.scheduledAt)}</span>}
          {pass.payAtClinic > 0 && <span>Doctor&apos;s fee ₹{pass.payAtClinic} — pay at the clinic</span>}
        </div>
      )}
    </div>
  );
}
