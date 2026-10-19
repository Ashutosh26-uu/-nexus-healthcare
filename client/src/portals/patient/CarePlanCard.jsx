import { useState } from 'react';
import { ClipboardCheck, HeartPulse, Droplet, FlaskConical, CheckCircle2, AlertTriangle, CalendarClock, LogOut } from 'lucide-react';
import { api } from '../../api';
import { Button, Card, fmtDate, useAction, cx } from '../../components/ui';
import { usePatientLive } from './shared';
import PaymentStep from './Payment';

// The patient's side of a chronic care plan: the invitation (targets, fee, what joining shares), then progress
// against the doctor's targets, what to log this week, the next review, and renewal when the month ends.
const tone = (v) => (v === true ? 'green' : v === false ? 'rose' : '');
const mark = (v) => (v === true ? 'On target' : v === false ? 'Above target' : 'Not enough readings yet');

function Target({ icon: Icon, label, now, target, at, note }) {
  return (
    <div className={cx('cp-metric', tone(at))}>
      <span className="tiny muted row" style={{ gap: 6 }}><Icon size={14} /> {label}</span>
      <strong>{now ?? '—'}</strong>
      <span className="tiny muted">target {target} · {note || mark(at)}</span>
    </div>
  );
}

export default function CarePlanCard({ who }) {
  const { data, reload } = usePatientLive('/patient/care-plan', ['careplans', 'vitals', 'lab', 'payments', 'notifications']);
  const [run, busy] = useAction();
  const [payment, setPayment] = useState(null);
  const plan = data?.plan;
  if (!plan) return null;
  const pending = payment || data.payment;
  const t = plan.targets;
  const pr = plan.progress;
  const daysLeft = plan.paidUntil ? Math.ceil((Date.parse(plan.paidUntil) - Date.now()) / 86400000) : null;

  const join = async () => {
    const r = await run('pay', () => api.post(`/patient/care-plan/${plan.id}/pay`, {}), plan.fee ? null : 'You joined the care plan');
    if (!r) return;
    if (r.payment) setPayment(r.payment); else reload();
  };
  const leave = async () => {
    if (!window.confirm(plan.status === 'invited' ? 'Decline this care plan?' : `Leave the care plan? ${plan.doctor.name} will stop seeing your readings through it.`)) return;
    if (await run('leave', () => api.post(`/patient/care-plan/${plan.id}/leave`, {}), plan.status === 'invited' ? 'Invitation declined' : 'You left the care plan')) reload();
  };

  const targetsLine = [plan.conditions.includes('bp') && `BP ${t.bpSys}/${t.bpDia} or lower`, plan.conditions.includes('diabetes') && `fasting sugar ${t.fasting} mg/dL or lower`, plan.conditions.includes('diabetes') && `HbA1c ${t.hba1c}% or lower`].filter(Boolean).join(' · ');

  if (pending && pending.status !== 'paid') {
    return (
      <Card title={<h3 className="row" style={{ gap: 8 }}><ClipboardCheck size={18} /> Care plan with <span translate="no">{plan.doctor.name}</span></h3>}>
        <PaymentStep payment={pending} onPaid={() => { setPayment(null); reload(); }} onError={() => { setPayment(null); reload(); }} />
      </Card>
    );
  }

  if (plan.status === 'invited') {
    return (
      <Card className="cp-invite" title={<h3 className="row" style={{ gap: 8 }}><ClipboardCheck size={18} /> {plan.doctor.name} invited {who === 'your' ? 'you' : 'this profile'} to a care plan</h3>}>
        <p className="small mb-1"><strong>{plan.conditionLabels.join(' & ')}</strong> — your doctor follows your home readings every month and adjusts your medicines when needed.</p>
        <ul className="small cp-list">
          <li>Targets: {targetsLine}</li>
          <li>Log {plan.conditions.includes('bp') ? `BP ${plan.perWeek.bp}×` : ''}{plan.conditions.length > 1 ? ' and ' : ''}{plan.conditions.includes('diabetes') ? `sugar ${plan.perWeek.sugar}×` : ''} a week — we&apos;ll remind you.</li>
          <li>A monthly review, and your medicines renewed so the refill is one tap.</li>
          <li>Joining lets <span translate="no">{plan.doctor.name}</span> see your readings, prescriptions and lab results while the plan runs. Leave any time.</li>
        </ul>
        <div className="row wrap" style={{ gap: 8 }}>
          <Button icon={CheckCircle2} loading={busy === 'pay'} onClick={join}>{plan.fee ? `Join · ₹${plan.fee}/month` : 'Join · free'}</Button>
          <Button variant="ghost" loading={busy === 'leave'} onClick={leave}>Not now</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cx('cp-patient', plan.status === 'lapsed' && 'lapsed')}
      title={<h3 className="row" style={{ gap: 8 }}><ClipboardCheck size={18} /> Care plan · <span translate="no">{plan.doctor.name}</span></h3>}
      action={<span className={cx('badge', plan.status === 'lapsed' ? 'sun' : 'green')}>{plan.status === 'lapsed' ? 'Paused' : 'Active'}</span>}>
      {plan.status === 'lapsed' && (
        <div className="callout sun small mb-1"><AlertTriangle size={16} /><span>Your month ended, so your doctor isn&apos;t following your readings right now. Renew to carry on.</span></div>
      )}
      {pr?.offTarget?.length > 0 && <div className="callout rose small mb-1"><AlertTriangle size={16} /><span>{pr.offTarget.join(' · ')}. Your doctor has been told and will review it.</span></div>}
      {pr && (
        <div className="cp-metrics">
          {pr.bp && <Target icon={HeartPulse} label="BP · last 2 weeks" now={pr.bp.count ? `${pr.bp.sys}/${pr.bp.dia}` : null} target={`${t.bpSys}/${t.bpDia}`} at={pr.bp.atTarget} />}
          {pr.sugar && <Target icon={Droplet} label="Fasting sugar · last 2 weeks" now={pr.sugar.fastingCount ? `${pr.sugar.fastingAvg}` : null} target={`${t.fasting} mg/dL`} at={pr.sugar.atTarget} />}
          {pr.hba1c !== undefined && <Target icon={FlaskConical} label="HbA1c" now={pr.hba1c ? `${pr.hba1c.value}%` : null} target={`${t.hba1c}%`} at={pr.hba1c?.atTarget} note={pr.hba1c ? `tested ${fmtDate(pr.hba1c.at)}` : 'not tested yet'} />}
        </div>
      )}
      {pr && (
        <p className="small mb-0 mt-1">
          This week: {pr.bp ? <strong>{Math.min(pr.bp.thisWeek, pr.bp.perWeek)}/{pr.bp.perWeek} BP</strong> : null}{pr.bp && pr.sugar ? ' · ' : ''}{pr.sugar ? <strong>{Math.min(pr.sugar.thisWeek, pr.sugar.perWeek)}/{pr.sugar.perWeek} sugar</strong> : null} readings
          {pr.hba1cDue ? <> · <span className="cp-due">HbA1c test due — book it from Tests</span></> : null}
        </p>
      )}
      <div className="row between wrap mt-1" style={{ gap: 8 }}>
        <span className="tiny muted"><CalendarClock size={12} style={{ verticalAlign: '-2px' }} /> {pr ? `Next review by ${fmtDate(pr.reviewDueOn)}` : ''}{plan.paidUntil ? ` · paid to ${fmtDate(plan.paidUntil)}` : plan.fee ? '' : ' · free plan'}</span>
        <span className="row" style={{ gap: 6 }}>
          <Button size="sm" variant="ghost" icon={LogOut} loading={busy === 'leave'} onClick={leave}>Leave</Button>
          {plan.fee > 0 && (plan.status === 'lapsed' || (daysLeft !== null && daysLeft <= 7)) && <Button size="sm" loading={busy === 'pay'} onClick={join}>Renew · ₹{plan.fee}</Button>}
        </span>
      </div>
      {plan.reviews?.[0]?.note && <p className="tiny mt-1 mb-0 cp-note"><strong translate="no">{plan.reviews[0].byName}</strong> · {fmtDate(plan.reviews[0].at)}: {plan.reviews[0].note}</p>}
    </Card>
  );
}
