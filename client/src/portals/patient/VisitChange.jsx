import { useState } from 'react';
import { CalendarClock, XCircle, Hourglass, ShieldCheck } from 'lucide-react';
import { api } from '../../api';
import { Button, Modal, fmtDateTime, fmtMoney, fmtTime, useAction, useToast } from '../../components/ui';
import { SlotPicker } from './Consult';

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
