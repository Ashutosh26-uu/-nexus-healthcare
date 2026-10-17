import { useMemo, useState } from 'react';
import { CalendarClock, XCircle, Hourglass, ShieldCheck } from 'lucide-react';
import { api } from '../../api';
import { Button, Modal, cx, fmtDateTime, fmtMoney, fmtTime, useAction, useToast } from '../../components/ui';
import { getLocale } from '../../i18n';

/* ---------- date + time slot picker ---------- */
// Lives here (not in Consult.jsx) so Home, which shows the reschedule dialog, doesn't load the doctor finder.
function buildDays() {
  const out = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push({
      key: d.toISOString(),
      date: d,
      top: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(getLocale(), { weekday: 'short' }),
      bottom: d.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' }),
    });
  }
  return out;
}
const SLOT_TIMES = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '14:00', '14:30', '15:00', '15:30', '16:00', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'];

export function SlotPicker({ value, onChange }) {
  const days = useMemo(buildDays, []);
  const [dayIdx, setDayIdx] = useState(() => {
    if (!value) return 0;
    const i = days.findIndex((d) => new Date(value).toDateString() === d.date.toDateString());
    return i < 0 ? 0 : i;
  });
  const day = days[dayIdx].date;
  const now = Date.now();
  const slots = SLOT_TIMES.map((t) => {
    const [h, m] = t.split(':').map(Number);
    const d = new Date(day);
    d.setHours(h, m, 0, 0);
    return { t, iso: d.toISOString(), past: d.getTime() < now + 20 * 60000, label: d.toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' }) };
  });
  const open = slots.filter((s) => !s.past);
  return (
    <div className="stack">
      <div className="pt-days" role="radiogroup" aria-label="Choose a day">
        {days.map((d, i) => (
          <button key={d.key} type="button" role="radio" aria-checked={i === dayIdx} className={cx('pt-day', i === dayIdx && 'on')} onClick={() => { setDayIdx(i); onChange(null); }}>
            <span className="tiny">{d.top}</span>
            <span className="strong">{d.bottom}</span>
          </button>
        ))}
      </div>
      {open.length === 0 ? (
        <p className="small muted mb-0">All of today&apos;s slots have passed. Tomorrow has plenty open.</p>
      ) : (
        <div className="chip-select" role="radiogroup" aria-label="Choose a time">
          {open.map((s) => (
            <button key={s.t} type="button" role="radio" aria-checked={value === s.iso} className={cx('chip', value === s.iso && 'on')} onClick={() => onChange(s.iso)}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Mirrors the server rules in POST /api/consults/:id/reschedule and /cancel.
const CUTOFF_MS = 2 * 3600000;
const MAX_MOVES = 2;
const hoursAway = (c) => (c.scheduledAt ? Date.parse(c.scheduledAt) - Date.now() : Infinity);

// "Dr X is running about 20 min late" on an upcoming-visit card. Old delays (over 3 h) are ignored.
export function LateNotice({ c, className = '' }) {
  const late = c.runningLate;
  if (!late || !['scheduled', 'queued'].includes(c.status) || Date.now() - Date.parse(late.at) > 3 * 3600000) return null;
  const eta = c.scheduledAt ? new Date(Date.parse(c.scheduledAt) + late.minutes * 60000).toISOString() : null;
  return (
    <div className={`pt-late ${className}`} role="status">
      <Hourglass size={13} /> <span><span translate="no">{c.doctorName}</span> is running about {late.minutes} minutes late{eta ? ` — expect around ${fmtTime(eta)}` : ''}. We&apos;ll keep your place.</span>
    </div>
  );
}

// Reschedule + Cancel for a booked visit (patient side). Shows why when a change isn't allowed.
export function VisitChangeActions({ c, onChanged }) {
  const [mode, setMode] = useState(null); // 'move' | 'cancel'
  const [slot, setSlot] = useState(null);
  const [run, busy] = useAction();
  const toast = useToast();
  if (!['scheduled', 'queued'].includes(c.status)) return null;
  const left = hoursAway(c);
  const moves = c.rescheduled || 0;
  const moveBlock = c.status !== 'scheduled' || !c.scheduledAt ? null
    : left <= CUTOFF_MS ? 'Less than 2 hours to go — the time can no longer be changed.'
      : moves >= MAX_MOVES ? `Already moved ${MAX_MOVES} times — cancel and book again if needed.` : null;
  const canMove = c.status === 'scheduled' && c.scheduledAt && !moveBlock;
  const refundable = left > CUTOFF_MS;
  const close = () => { setMode(null); setSlot(null); };

  const move = () => run('move', async () => {
    await api.post(`/consults/${c.id}/reschedule`, { scheduledAt: slot });
    close(); onChanged?.();
  }, 'Visit moved — your doctor has been told');
  const cancel = () => run('cancel', async () => {
    const r = await api.post(`/consults/${c.id}/cancel`);
    close(); onChanged?.();
    toast(r?.refund ? `Visit cancelled — ${fmtMoney(r.refund)} will be refunded` : 'Visit cancelled');
  });

  return (
    <>
      <div className="pt-visit-actions">
        {c.status === 'scheduled' && c.scheduledAt && (
          <Button size="sm" variant="secondary" icon={CalendarClock} disabled={!canMove} title={moveBlock || undefined} onClick={() => setMode('move')}>Reschedule</Button>
        )}
        <Button size="sm" variant="ghost" icon={XCircle} onClick={() => setMode('cancel')}>Cancel visit</Button>
        {moveBlock && <span className="tiny muted pt-visit-why">{moveBlock}</span>}
      </div>

      <Modal open={mode === 'move'} onClose={close} title="Choose a new time" subtitle={`Now booked for ${fmtDateTime(c.scheduledAt)} with ${c.doctorName}`}
        footer={<><Button variant="ghost" onClick={close}>Keep current time</Button><Button loading={busy === 'move'} disabled={!slot} onClick={move}>Move my visit</Button></>}>
        <div className="stack">
          <SlotPicker value={slot} onChange={setSlot} />
          <p className="tiny muted mb-0"><ShieldCheck size={12} style={{ verticalAlign: '-2px' }} /> Your payment and booking ID stay the same. You can move a visit up to {MAX_MOVES} times{moves ? ` (moved ${moves} so far)` : ''}, until 2 hours before it starts.</p>
        </div>
      </Modal>

      <Modal open={mode === 'cancel'} onClose={close} title="Cancel this visit?" subtitle={`${c.doctorName}${c.scheduledAt ? ` · ${fmtDateTime(c.scheduledAt)}` : ''}`}
        footer={<><Button variant="ghost" onClick={close}>Keep my visit</Button><Button variant="danger" loading={busy === 'cancel'} onClick={cancel}>Yes, cancel visit</Button></>}>
        <div className="stack">
          {!c.paidAt ? <p className="mb-0">Nothing was paid for this visit, so there&apos;s nothing to refund. Your doctor will be told.</p>
            : refundable ? <p className="mb-0">You&apos;ll get a <strong>full refund{c.fee ? ` of ${fmtMoney(c.fee)}` : ''}</strong> to the way you paid, usually within 5–7 working days.</p>
            : <p className="mb-0">Your visit is <strong>less than 2 hours away</strong>, so the amount paid can&apos;t be refunded — the doctor has kept this time for you.</p>}
          <p className="tiny muted mb-0">Refund rule: cancel more than 2 hours before the visit for a full refund. Inside 2 hours there&apos;s no refund. If the doctor cancels, you always get a full refund.</p>
        </div>
      </Modal>
    </>
  );
}
