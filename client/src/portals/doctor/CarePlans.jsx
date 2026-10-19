import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeartPulse, Droplet, ClipboardCheck, Plus, CheckCircle2, AlertTriangle, FlaskConical, Pill, Target, CalendarClock } from 'lucide-react';
import { api } from '../../api';
import { useLive } from '../../live';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Card, Empty, Field, Loading, Modal, fmtDate, timeAgo, useAction, cx } from '../../components/ui';

// Chronic care plans: BP and diabetes patients followed month to month. Off-target readings and monthly reviews
// land in "Needs review"; a review can renew the last prescription so the patient orders the refill straight away.
const STATUS = { invited: { label: 'Invited', tone: 'sky' }, active: { label: 'Active', tone: 'green' }, lapsed: { label: 'Paused · unpaid', tone: 'sun' } };

const atTone = (v) => (v === true ? 'green' : v === false ? 'rose' : '');
function Metric({ icon: Icon, label, value, target, at, sub }) {
  return (
    <div className={cx('cp-metric', atTone(at))}>
      <span className="tiny muted row" style={{ gap: 6 }}><Icon size={14} /> {label}</span>
      <strong>{value ?? '—'}</strong>
      <span className="tiny muted">{target ? `target ${target}` : ''}{sub ? `${target ? ' · ' : ''}${sub}` : ''}</span>
    </div>
  );
}

export function PlanMetrics({ plan }) {
  const pr = plan.progress;
  if (!pr) return <p className="small muted mb-0">Starts when the patient joins.</p>;
  const t = plan.targets;
  return (
    <div className="cp-metrics">
      {pr.bp && <Metric icon={HeartPulse} label="BP · 2 weeks" value={pr.bp.count ? `${pr.bp.sys}/${pr.bp.dia}` : null} target={`${t.bpSys}/${t.bpDia}`} at={pr.bp.atTarget} sub={`${pr.bp.count} reading${pr.bp.count === 1 ? '' : 's'}`} />}
      {pr.sugar && <Metric icon={Droplet} label="Fasting sugar · 2 weeks" value={pr.sugar.fastingCount ? `${pr.sugar.fastingAvg} mg/dL` : null} target={`${t.fasting}`} at={pr.sugar.atTarget} sub={`${pr.sugar.fastingCount} reading${pr.sugar.fastingCount === 1 ? '' : 's'}`} />}
      {pr.hba1c !== undefined && <Metric icon={FlaskConical} label="HbA1c" value={pr.hba1c ? `${pr.hba1c.value}%` : null} target={`${t.hba1c}%`} at={pr.hba1c?.atTarget} sub={pr.hba1c ? fmtDate(pr.hba1c.at) : pr.hba1cDue ? 'due' : ''} />}
    </div>
  );
}

// Eight weekly averages as a small table — real readings only; empty weeks stay empty.
export function WeeklyTrend({ plan }) {
  const w = plan.progress?.weeks || [];
  if (!w.some((x) => x.bpCount || x.fastingCount)) return null;
  return (
    <div className="cp-trend" role="table" aria-label="Weekly averages">
      <div className="cp-trend-row head" role="row"><span>Week of</span>{plan.conditions.includes('bp') && <span>BP</span>}{plan.conditions.includes('diabetes') && <span>Fasting</span>}</div>
      {w.map((x) => (
        <div key={x.from} className="cp-trend-row" role="row">
          <span>{fmtDate(x.from)}</span>
          {plan.conditions.includes('bp') && <span className={cx(x.bpSys && (x.bpSys > plan.targets.bpSys || x.bpDia > plan.targets.bpDia) && 'off')}>{x.bpCount ? `${x.bpSys}/${x.bpDia}` : '·'}</span>}
          {plan.conditions.includes('diabetes') && <span className={cx(x.fasting && x.fasting > plan.targets.fasting && 'off')}>{x.fastingCount ? x.fasting : '·'}</span>}
        </div>
      ))}
    </div>
  );
}

function SetupForm({ value, onChange, conditions }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const setT = (k, v) => onChange({ ...value, targets: { ...value.targets, [k]: v } });
  const setW = (k, v) => onChange({ ...value, perWeek: { ...value.perWeek, [k]: v } });
  const toggle = (c) => set('conditions', value.conditions.includes(c) ? value.conditions.filter((x) => x !== c) : [...value.conditions, c]);
  return (
    <div className="stack">
      <div className="pills" role="group" aria-label="Conditions">
        {Object.entries(conditions).map(([k, label]) => (
          <button key={k} type="button" className={cx('pill', value.conditions.includes(k) && 'active')} onClick={() => toggle(k)} aria-pressed={value.conditions.includes(k)}>{label}</button>
        ))}
      </div>
      {value.conditions.includes('bp') && (
        <div className="grid three">
          <Field label="BP target · systolic"><input className="input" type="number" inputMode="numeric" value={value.targets.bpSys} onChange={(e) => setT('bpSys', e.target.value)} /></Field>
          <Field label="diastolic"><input className="input" type="number" inputMode="numeric" value={value.targets.bpDia} onChange={(e) => setT('bpDia', e.target.value)} /></Field>
          <Field label="BP readings a week"><input className="input" type="number" inputMode="numeric" min="1" max="14" value={value.perWeek.bp} onChange={(e) => setW('bp', e.target.value)} /></Field>
        </div>
      )}
      {value.conditions.includes('diabetes') && (
        <div className="grid three">
          <Field label="Fasting sugar target (mg/dL)"><input className="input" type="number" inputMode="numeric" value={value.targets.fasting} onChange={(e) => setT('fasting', e.target.value)} /></Field>
          <Field label="HbA1c target (%)"><input className="input" type="number" inputMode="decimal" step="0.1" value={value.targets.hba1c} onChange={(e) => setT('hba1c', e.target.value)} /></Field>
          <Field label="Sugar readings a week"><input className="input" type="number" inputMode="numeric" min="1" max="14" value={value.perWeek.sugar} onChange={(e) => setW('sugar', e.target.value)} /></Field>
        </div>
      )}
    </div>
  );
}

function NewPlan({ data, onClose, onDone }) {
  const [run, busy] = useAction();
  const first = data.candidates[0];
  const [patientId, setPatientId] = useState(first?.id || '');
  const cand = data.candidates.find((c) => c.id === patientId);
  const guess = (c) => [/bp|hypertension|blood pressure/i.test((c?.conditions || []).join(' ')) && 'bp', /diabet|sugar/i.test((c?.conditions || []).join(' ')) && 'diabetes'].filter(Boolean);
  const [form, setForm] = useState(() => ({ conditions: guess(first), targets: { ...(first?.defaults || data.defaults) }, perWeek: { bp: 3, sugar: 3 }, fee: 249 }));
  const pick = (id) => { const c = data.candidates.find((x) => x.id === id); setPatientId(id); setForm((f) => ({ ...f, conditions: guess(c), targets: { ...(c?.defaults || data.defaults) } })); };
  const submit = async () => {
    const r = await run('new', () => api.post('/doctor/care-plans', { patientId, ...form, fee: Number(form.fee) }), 'Invitation sent — the plan starts when the patient joins');
    if (r) { onDone(); onClose(); }
  };
  return (
    <Modal open onClose={onClose} title="Start a care plan" subtitle="The patient is invited and joins from their app. Joining gives you access to their readings, prescriptions and labs while the plan runs."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button icon={ClipboardCheck} loading={busy === 'new'} disabled={!patientId || !form.conditions.length} onClick={submit}>Send invitation</Button></>}>
      {data.candidates.length === 0 ? <Empty title="No patients to enrol">You can start a plan for a patient who has shared their record with you (a consult or a consent request).</Empty> : (
        <div className="stack">
          <Field label="Patient">
            <select className="select" value={patientId} onChange={(e) => pick(e.target.value)}>
              {data.candidates.map((c) => <option key={c.id} value={c.id}>{c.name}{c.age != null ? ` · ${c.age}y` : ''}{c.conditions?.length ? ` · ${c.conditions.slice(0, 2).join(', ')}` : ''}</option>)}
            </select>
          </Field>
          {cand && <SetupForm value={form} onChange={setForm} conditions={data.conditions} />}
          <Field label="Monthly fee (₹)" hint="What the patient pays each month for you to follow their readings. 0 for a free plan.">
            <input className="input" type="number" inputMode="numeric" min="0" max="5000" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function ReviewModal({ plan, conditions, onClose, onDone }) {
  const [run, busy] = useAction();
  const [note, setNote] = useState('');
  const [renew, setRenew] = useState(Boolean(plan.lastRx));
  const [editing, setEditing] = useState(false);
  const [setup, setSetup] = useState({ conditions: plan.conditions, targets: plan.targets, perWeek: plan.perWeek });
  const save = async () => {
    if (editing) {
      const t = await run('targets', () => api.put(`/doctor/care-plans/${plan.id}`, setup));
      if (!t) return;
    }
    const r = await run('review', () => api.post(`/doctor/care-plans/${plan.id}/review`, { note, renewRxId: renew ? plan.lastRx?.id : undefined }), renew ? 'Reviewed — medicines renewed for the patient to order' : 'Review saved');
    if (r) { onDone(); onClose(); }
  };
  const pr = plan.progress;
  return (
    <Modal open onClose={onClose} title={`Review · ${plan.patient.name}`} subtitle={plan.conditionLabels.join(' & ')}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button icon={CheckCircle2} loading={busy === 'review' || busy === 'targets'} onClick={save}>Save review</Button></>}>
      <div className="stack">
        {pr?.offTarget?.length > 0 && <div className="callout rose small"><AlertTriangle size={16} /><span>{pr.offTarget.join(' · ')}</span></div>}
        <PlanMetrics plan={plan} />
        {pr && <p className="tiny muted mb-0">This week: {pr.bp ? `${pr.bp.thisWeek}/${pr.bp.perWeek} BP` : ''}{pr.bp && pr.sugar ? ' · ' : ''}{pr.sugar ? `${pr.sugar.thisWeek}/${pr.sugar.perWeek} sugar` : ''} readings{pr.missing.length ? ` · nothing logged for ${pr.missing.join(' & ')} in 3+ days` : ''}</p>}
        <WeeklyTrend plan={plan} />
        {plan.lastRx ? (
          <label className="cp-renew">
            <input type="checkbox" checked={renew} onChange={(e) => setRenew(e.target.checked)} />
            <span><strong className="small"><Pill size={14} style={{ verticalAlign: '-2px' }} /> Renew the same medicines</strong>
              <span className="tiny muted block">{plan.lastRx.items.map((i) => `${i.drug}${i.dose ? ` ${i.dose}` : ''}${i.freq ? ` · ${i.freq}` : ''}`).join(' · ')} — from {fmtDate(plan.lastRx.createdAt)}. To change a dose, write a new prescription from the patient&apos;s record instead.</span></span>
          </label>
        ) : <p className="tiny muted mb-0">No earlier prescription from you to renew — write one from the patient&apos;s record if needed.</p>}
        <Field label="Note to the patient (optional)"><textarea className="textarea" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Good progress — keep the evening walk. Recheck fasting sugar for a week." /></Field>
        <button type="button" className="link-btn small" onClick={() => setEditing((v) => !v)}><Target size={14} /> {editing ? 'Keep the current targets' : 'Change targets'}</button>
        {editing && <SetupForm value={setup} onChange={setSetup} conditions={conditions} />}
      </div>
    </Modal>
  );
}

export default function CarePlans() {
  const { data, loading, error, reload } = useLive('/doctor/care-plans', ['careplans', 'vitals', 'lab', 'consents', 'prescriptions']);
  const navigate = useNavigate();
  const [tab, setTab] = useState('due');
  const [adding, setAdding] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [run] = useAction();

  if (loading && !data) return <Loading />;
  if (error && !data) return <div className="form-error">{error}</div>;
  const due = data.plans.filter((p) => p.progress?.reviewDue);
  const shown = tab === 'due' ? due : tab === 'invited' ? data.plans.filter((p) => p.status === 'invited') : data.plans;
  const end = async (pl) => {
    if (!window.confirm(`End ${pl.patient.name}'s care plan?`)) return;
    if (await run('end', () => api.post(`/doctor/care-plans/${pl.id}/end`, { reason: 'Ended by the doctor' }), 'Care plan ended')) reload();
  };

  return (
    <div className="stack">
      <PageHeader eyebrow="Between visits" title="Care plans"
        subtitle="Blood pressure and diabetes patients you follow month to month. Off-target readings and monthly reviews show up here and in your notifications.">
        <Button icon={Plus} onClick={() => setAdding(true)}>Start a care plan</Button>
      </PageHeader>

      <div className="pills">
        <button type="button" className={cx('pill', tab === 'due' && 'active')} onClick={() => setTab('due')}>{due.length ? `Needs review (${due.length})` : 'Needs review'}</button>
        <button type="button" className={cx('pill', tab === 'all' && 'active')} onClick={() => setTab('all')}>All plans ({data.plans.length})</button>
        <button type="button" className={cx('pill', tab === 'invited' && 'active')} onClick={() => setTab('invited')}>Invited</button>
      </div>

      {shown.length === 0 ? (
        <Card><Empty icon={ClipboardCheck} title={tab === 'due' ? 'Nothing needs review' : 'No care plans yet'}>
          {tab === 'due' ? 'Patients appear here when their readings are off target or their monthly review is due.' : 'Start a plan for a BP or diabetes patient who has shared their record with you.'}
        </Empty></Card>
      ) : (
        <div className="stack">
          {shown.map((pl) => {
            const st = STATUS[pl.status] || { label: pl.status, tone: '' };
            const pr = pl.progress;
            return (
              <Card key={pl.id} className={cx('cp-card', pr?.reviewDue && 'due')}>
                <div className="row between wrap" style={{ gap: 8 }}>
                  <div>
                    <button type="button" className="link-btn" onClick={() => navigate(`/doctor/patients/${pl.patient.id}`)}><strong translate="no">{pl.patient.name}</strong></button>
                    <span className="tiny muted"> · {[pl.patient.age != null ? `${pl.patient.age}y` : null, pl.conditionLabels.join(' & '), pl.fee ? `₹${pl.fee}/month` : 'free'].filter(Boolean).join(' · ')}</span>
                  </div>
                  <span className={cx('badge', st.tone)}>{st.label}</span>
                </div>
                {pr?.offTarget?.length > 0 && <div className="tiny mt-1" style={{ color: 'var(--rose, #b42318)' }}><AlertTriangle size={12} style={{ verticalAlign: '-2px' }} /> {pr.offTarget.join(' · ')}</div>}
                <div className="mt-1"><PlanMetrics plan={pl} /></div>
                <div className="row between wrap mt-1" style={{ gap: 8 }}>
                  <span className="tiny muted"><CalendarClock size={12} style={{ verticalAlign: '-2px' }} /> {pl.status === 'invited' ? `Invited ${timeAgo(pl.createdAt)}` : pl.lastReviewAt ? `Last review ${timeAgo(pl.lastReviewAt)}` : `Started ${timeAgo(pl.startedAt)}`}{pr ? ` · next review by ${fmtDate(pr.reviewDueOn)}` : ''}{pl.paidUntil ? ` · paid to ${fmtDate(pl.paidUntil)}` : ''}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <Button size="sm" variant="ghost" onClick={() => end(pl)}>End plan</Button>
                    {pl.status === 'active' && <Button size="sm" icon={CheckCircle2} onClick={() => setReviewing(pl)}>Review</Button>}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {adding && <NewPlan data={data} onClose={() => setAdding(false)} onDone={reload} />}
      {reviewing && <ReviewModal plan={reviewing} conditions={data.conditions} onClose={() => setReviewing(null)} onDone={reload} />}
    </div>
  );
}
