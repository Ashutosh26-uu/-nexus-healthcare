import { useState } from 'react';
import { BedDouble, Stethoscope, Check, X, Ambulance, IdCard, Home } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Button, TriageBadge, StatusBadge, Empty, Tabs, timeAgo, fmtDateTime, useAction } from '../../components/ui';
import { api } from '../../api';
import { BED_TYPES, bedLabel } from './shared';

const QUICK_REJECT = ['No ICU bed free', 'Specialist not on duty', 'Equipment under maintenance', 'Better suited to a higher centre'];

export default function Referrals({ home, reload }) {
  const [tab, setTab] = useState('pending');
  const all = home.referrals || [];
  const pending = all.filter((r) => r.status === 'pending');
  const admitted = all.filter((r) => r.status === 'accepted').sort((a, b) => new Date(a.decidedAt || a.createdAt) - new Date(b.decidedAt || b.createdAt));
  const history = all.filter((r) => !['pending', 'accepted'].includes(r.status)).sort((a, b) => new Date(b.decidedAt || b.createdAt) - new Date(a.decidedAt || a.createdAt));

  return (
    <>
      <PageHeader title="Incoming referrals" subtitle="Patients the network wants to send you. A quick yes or no helps the doctor find another bed fast if you can't take them." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'pending', label: 'Waiting for you', count: pending.length }, { value: 'admitted', label: 'Admitted', count: admitted.length }, { value: 'history', label: 'History', count: history.length }]} />

      {tab === 'admitted' ? (
        admitted.length === 0 ? (
          <Card><Empty icon={BedDouble} title="No one admitted from referrals">Patients you accept show here until you discharge them.</Empty></Card>
        ) : (
          <div className="stack lg">
            {admitted.map((r) => <AdmittedCard key={r.id} r={r} reload={reload} />)}
          </div>
        )
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <Card><Empty icon={Ambulance} title="All caught up">No referrals are waiting. New ones appear here as soon as a doctor sends them.</Empty></Card>
        ) : (
          <div className="stack lg">
            {pending.map((r) => <ReferralCard key={r.id} r={r} beds={home.beds} reload={reload} />)}
          </div>
        )
      ) : history.length === 0 ? (
        <Card><Empty title="No decisions yet">Accepted and declined referrals will be listed here.</Empty></Card>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Patient</th><th>Reason</th><th>Bed</th><th>Urgency</th><th>Decision</th><th>Note</th><th>When</th></tr></thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td><strong translate="no">{r.patientName}</strong><div className="tiny muted">{r.age} yrs · {r.patientId}</div></td>
                  <td className="small" style={{ maxWidth: 280 }}>{r.reason}</td>
                  <td className="small nowrap">{BED_TYPES[r.bedType]?.short || r.bedType}</td>
                  <td><TriageBadge level={r.urgency} /></td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="small muted">{r.note || '—'}</td>
                  <td className="small nowrap muted">{fmtDateTime(r.dischargedAt || r.decidedAt || r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// Discharge in one go: the summary lands in the patient's records, the bed is freed, the referring doctor is told.
function AdmittedCard({ r, reload }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ diagnosis: '', summary: '', medicines: '', instructions: '', followUpDays: 7 });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const discharge = async () => {
    const ok = await run('dis', () => api.post(`/hospital/referrals/${r.id}/discharge`, f), `${r.patientName} discharged — summary sent to the patient and ${r.fromName?.split(' (')[0] || 'their doctor'}`);
    if (ok) reload();
  };
  return (
    <div className="card ref-card">
      <div className="row wrap" style={{ gap: 10 }}>
        <h3 className="mb-0 grow" translate="no">{r.patientName}</h3>
        <span className="badge sky"><BedDouble /> {bedLabel(r.bedType)}</span>
      </div>
      <div className="tiny muted mt-1">Admitted {timeAgo(r.decidedAt || r.createdAt)} · from {r.fromName}</div>
      <p className="ref-reason">{r.reason}</p>
      {open ? (
        <div className="ref-decide fade-in stack">
          <input className="input" value={f.diagnosis} onChange={set('diagnosis')} placeholder="Final diagnosis (e.g. Dengue fever, recovered)" maxLength={200} />
          <textarea className="textarea" rows={3} value={f.summary} onChange={set('summary')} placeholder="What was done, and how the patient is now" maxLength={1500} />
          <textarea className="textarea" rows={2} style={{ minHeight: 56 }} value={f.medicines} onChange={set('medicines')} placeholder="Medicines to take at home (optional)" maxLength={600} />
          <textarea className="textarea" rows={2} style={{ minHeight: 56 }} value={f.instructions} onChange={set('instructions')} placeholder="Care at home and warning signs (optional)" maxLength={600} />
          <label className="small row wrap" style={{ gap: 8 }}>Follow-up with their doctor in
            <select className="select" style={{ width: 'auto' }} value={f.followUpDays} onChange={set('followUpDays')}>
              {[[0, 'Not needed'], [3, '3 days'], [7, '1 week'], [14, '2 weeks'], [30, '1 month']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" icon={Home} loading={busy === 'dis'} disabled={f.summary.trim().length < 10} onClick={discharge}>Discharge</Button>
          </div>
        </div>
      ) : (
        <div className="row ref-actions"><Button icon={Home} onClick={() => setOpen(true)}>Discharge home</Button></div>
      )}
    </div>
  );
}

function ReferralCard({ r, beds, reload }) {
  const [run, busy] = useAction();
  const [mode, setMode] = useState(null); // 'accept' | 'reject'
  const [note, setNote] = useState('');
  const bed = beds.find((b) => b.type === r.bedType);
  const free = bed ? bed.total - bed.occupied : 0;

  const decide = async (action) => {
    if (action === 'reject' && !note.trim()) return;
    const ok = await run(action, () => api.post(`/referrals/${r.id}/${action}`, { note: note.trim() || undefined }),
      action === 'accept' ? `${r.patientName} accepted — a ${bedLabel(r.bedType).toLowerCase()} bed is held for them` : `Declined. ${r.fromName?.split(' (')[0] || 'The doctor'} will be told right away.`);
    if (ok) reload();
  };

  return (
    <div className={`card ref-card ${r.urgency}`}>
      <div className="ref-top">
        <div className="grow">
          <div className="row wrap" style={{ gap: 10 }}>
            <h3 className="mb-0" translate="no">{r.patientName}</h3>
            <span className="muted small">{r.age} yrs</span>
            <TriageBadge level={r.urgency} />
          </div>
          <div className="row wrap tiny muted mt-1" style={{ gap: 14 }}>
            <span className="row" style={{ gap: 4 }}><IdCard size={13} /> {r.patientId}</span>
            <span className="row" style={{ gap: 4 }}><Stethoscope size={13} /> {r.fromName}</span>
            <span>Sent {timeAgo(r.createdAt)}</span>
          </div>
        </div>
      </div>

      <p className="ref-reason">{r.reason}</p>

      <div className="row wrap" style={{ gap: 8 }}>
        <span className={`badge ${free > 0 ? 'green' : 'rose'}`}><BedDouble /> Needs {bedLabel(r.bedType).toLowerCase()} bed · {free} free now</span>
        {free === 0 && <span className="small muted">You're full in this ward — accepting won't block a bed automatically.</span>}
      </div>

      {mode ? (
        <div className="ref-decide fade-in">
          <label className="small" style={{ fontWeight: 600 }}>{mode === 'accept' ? 'Note to keep with this referral (optional)' : 'Why can\'t you take this patient?'}</label>
          {mode === 'reject' && (
            <div className="chip-select">
              {QUICK_REJECT.map((q) => <button key={q} type="button" className={`chip ${note === q ? 'on' : ''}`} onClick={() => setNote(q)}>{q}</button>)}
            </div>
          )}
          <textarea className="textarea" rows={2} style={{ minHeight: 64 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'accept' ? 'e.g. Bring to Emergency gate 2, ortho on call is Dr. Chauhan' : 'A short reason helps the doctor find the next best option'} />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => { setMode(null); setNote(''); }}>Cancel</Button>
            {mode === 'accept'
              ? <Button size="sm" icon={Check} loading={busy === 'accept'} onClick={() => decide('accept')}>Confirm accept</Button>
              : <Button size="sm" variant="danger" icon={X} loading={busy === 'reject'} disabled={!note.trim()} onClick={() => decide('reject')}>Decline referral</Button>}
          </div>
        </div>
      ) : (
        <div className="row ref-actions">
          <Button variant="secondary" icon={X} onClick={() => setMode('reject')}>Can't take</Button>
          <Button icon={Check} onClick={() => setMode('accept')}>Accept patient</Button>
        </div>
      )}
    </div>
  );
}
