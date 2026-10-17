import { useState } from 'react';
import { Lock, ShieldAlert, ShieldCheck, Send, Timer, AlertTriangle, Pill, HeartPulse, Phone, FlaskConical, FileText, History, Droplet } from 'lucide-react';
import { api } from '../../api';
import { useLive } from '../../live';
import { Button, Field, Modal, Empty, Loading, StatusBadge, fmtDate, useAction, cx } from '../../components/ui';
import { VitalsChips, useNow } from './shared';
import HomeReadings from './HomeReadings';

/* Fetches a patient's record with consent gating. Refreshes when consents change. */
export function useRecord(patientId) {
  return useLive(patientId ? `/doctor/patient/${encodeURIComponent(patientId)}` : null, ['consents', 'audit', 'records', 'lab', 'prescriptions']);
}

const REASONS = [
  'Patient unconscious on arrival — need allergy and medication list',
  'Severe breathlessness, patient unable to give history',
  'Suspected drug reaction — need current medicines urgently',
];

/* Shown when the doctor has no consent: request access (Flow G) or break-glass (Flow F). */
export function AccessGate({ record, onChanged, compact }) {
  const [run, busy] = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const p = record.patient;

  const request = () => run('req', async () => {
    await api.post('/doctor/consent-request', { patientId: p.id, purpose: 'Teleconsult — review past records' });
    onChanged?.();
  }, `Request sent. ${p.name.split(' ')[0]} will get it on their phone or at the kiosk.`);

  const breakGlass = () => run('bg', async () => {
    await api.post('/break-glass', { patientId: p.id, reason });
    setOpen(false);
    setReason('');
    onChanged?.();
  }, 'Emergency access opened for 60 minutes. This has been logged.');

  return (
    <div className={cx('dr-gate', compact && 'compact')}>
      <div className="dr-gate-icon"><Lock /></div>
      <h3>{p.name}'s records are private</h3>
      <p className="muted small">
        {p.age} y · {p.gender}. You don't have consent to see their history yet. Ask the patient — they can approve from the
        Nexus Healthcare app or by OTP at any kiosk, and choose how long you can see it.
      </p>
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        {record.pendingRequest ? (
          <span className="badge sun"><Timer />Request pending with patient</span>
        ) : (
          <Button icon={Send} loading={busy === 'req'} onClick={request}>Request access</Button>
        )}
        <Button variant="danger" icon={ShieldAlert} onClick={() => setOpen(true)}>Emergency access</Button>
      </div>
      <p className="tiny muted mt-2 mb-0">Emergency access shows critical data only, for 60 minutes. The patient and their emergency contact are notified, and an admin reviews every use.</p>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Break-glass emergency access"
        subtitle={`You're about to open ${p.name}'s critical health data without consent.`}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" icon={ShieldAlert} loading={busy === 'bg'} disabled={reason.trim().length < 10} onClick={breakGlass}>Open for 60 minutes</Button>
          </>
        )}
      >
        <div className="stack">
          <div className="callout rose"><AlertTriangle /><div>Use this only when the patient can't consent and delay could cause harm. Your name, the time and your reason go into the audit log.</div></div>
          <Field label="What is the emergency?" hint="At least 10 characters. Be specific — an admin will read this.">
            <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Patient drowsy with SpO₂ 86%, family not reachable, need allergy list before giving antibiotics" autoFocus />
          </Field>
          <div className="chip-select">
            {REASONS.map((r) => <button key={r} type="button" className="chip" onClick={() => setReason(r)}>{r.split(' — ')[0]}</button>)}
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function EmergencyBanner({ expiresAt }) {
  const now = useNow(1000);
  const secs = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  const left = Math.floor(secs / 60);
  return (
    <div className="dr-bg-banner">
      <ShieldAlert />
      <div className="grow">
        <strong>Emergency access · critical data only</strong>
        <div className="small">{secs ? `Access expires in ${left} min.` : 'Access has expired.'} Everything you view is logged and the patient has been notified.</div>
      </div>
      <span className="dr-bg-timer"><Timer size={15} />{left}:{String(secs % 60).padStart(2, '0')}</span>
    </div>
  );
}

export function CriticalCard({ p }) {
  return (
    <div className="stack">
      <div className="grid two">
        <div className="dr-crit">
          <span className="tiny muted">Blood group</span>
          <strong className="serif" style={{ fontSize: '1.6rem' }}><Droplet size={18} style={{ display: 'inline', color: 'var(--rose)', verticalAlign: '-2px' }} /> {p.bloodGroup || 'Unknown'}</strong>
        </div>
        <div className="dr-crit">
          <span className="tiny muted">Allergies</span>
          <AllergyList allergies={p.allergies} />
        </div>
      </div>
      <Section icon={HeartPulse} title="Conditions"><TagList items={p.conditions} empty="None recorded" /></Section>
      <Section icon={Pill} title="Current medicines"><TagList items={p.currentMeds} empty="None recorded" /></Section>
      {p.emergencyContacts?.length > 0 && (
        <Section icon={Phone} title="Emergency contacts">
          {p.emergencyContacts.map((c) => <div key={c.phone} className="small">{c.name} <span className="muted">({c.relation})</span> · <span className="mono" translate="no" dir="ltr">{c.phone}</span></div>)}
        </Section>
      )}
    </div>
  );
}

export function AllergyList({ allergies }) {
  if (!allergies?.length) return <span className="badge green"><ShieldCheck />No known allergies</span>;
  return <div className="row wrap" style={{ gap: 6 }}>{allergies.map((a) => <span key={a} className="badge solid-rose"><AlertTriangle />{a}</span>)}</div>;
}

export function TagList({ items, empty }) {
  if (!items?.length) return <span className="small muted">{empty}</span>;
  return <div className="row wrap" style={{ gap: 6 }}>{items.map((x) => <span key={x} className="badge">{x}</span>)}</div>;
}

export function Section({ icon: Icon, title, children }) {
  return (
    <div className="dr-sec">
      <div className="dr-sec-h">{Icon && <Icon />}{title}</div>
      {children}
    </div>
  );
}

export function HistoryPanel({ data }) {
  const p = data.patient;
  return (
    <div className="stack">
      <CriticalCard p={p} />
      {data.homeReadings?.count > 0 && (
        <Section icon={HeartPulse} title="Home readings">
          <HomeReadings data={data.homeReadings} />
        </Section>
      )}
      {p.vaccinations?.length > 0 && (
        <Section icon={ShieldCheck} title="Vaccinations">
          {p.vaccinations.map((v) => <div key={`${v.name}|${v.date}`} className="small">{v.name} <span className="muted">· {fmtDate(v.date)}</span></div>)}
        </Section>
      )}
      {data.prescriptions?.length > 0 && (
        <Section icon={Pill} title="Recent prescriptions">
          {data.prescriptions.slice(0, 3).map((r) => (
            <div key={r.id} className="dr-mini">
              <div className="row between"><span className="small" style={{ fontWeight: 600 }} translate="no">{r.doctorName}</span><span className="tiny muted">{fmtDate(r.createdAt)}</span></div>
              <div className="tiny muted">{r.items.map((i) => i.drug).join(' · ')}</div>
            </div>
          ))}
        </Section>
      )}
      {data.uploads?.length > 0 && (
        <Section icon={FileText} title="Uploaded reports">
          {data.uploads.map((u) => <div key={u.id} className="small">{u.title || u.name || u.type} <span className="muted">· {fmtDate(u.date || u.createdAt)}</span></div>)}
        </Section>
      )}
    </div>
  );
}

export function VisitsPanel({ visits, excludeId }) {
  const list = (visits || []).filter((v) => v.id !== excludeId);
  if (!list.length) return <Empty icon={History} title="No past visits on Nexus Healthcare">This looks like their first consult with the network.</Empty>;
  return (
    <div className="dr-timeline">
      {list.map((v) => (
        <div key={v.id} className="dr-tl-item">
          <div className="row between wrap">
            <strong className="small" translate="no">{v.diagnosis || v.triage?.symptoms}</strong>
            <span className="tiny muted">{fmtDate(v.completedAt || v.createdAt)}</span>
          </div>
          <div className="tiny muted">{v.doctorName} · {v.doctorSpecialty}{v.kioskName ? ` · via ${v.kioskName}` : ''}</div>
          {v.notes && <p className="small mb-0 mt-1" translate="no">{v.notes}</p>}
          {v.vitals && <div className="mt-1"><VitalsChips vitals={v.vitals} compact /></div>}
        </div>
      ))}
    </div>
  );
}

export function LabsPanel({ labs }) {
  if (!labs?.length) return <Empty icon={FlaskConical} title="No lab reports yet">Order tests from the prescription below.</Empty>;
  return (
    <div className="stack">
      {labs.map((o) => (
        <div key={o.id} className="dr-lab">
          <div className="row between wrap">
            <strong className="small">{o.tests.map((t) => t.name).join(', ')}</strong>
            <StatusBadge status={o.status} />
          </div>
          <div className="tiny muted">{o.labName} · ordered {fmtDate(o.createdAt)}{o.doctorName ? ` by ${o.doctorName}` : ''}</div>
          {o.results?.length > 0 && (
            <table className="dr-lab-table">
              <tbody>
                {o.results.map((r) => (
                  <tr key={r.name} className={r.flag}>
                    <td>{r.name}</td>
                    <td translate="no" dir="ltr"><strong>{r.value}</strong> <span className="muted">{r.unit}</span></td>
                    <td className="muted">{r.range}</td>
                    <td>{r.flag && r.flag !== 'normal' && <span className={cx('badge', r.flag === 'high' || r.flag === 'positive' ? 'rose' : 'sun')}>{r.flag}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}

/* Full record view used on the Patients screen. */
export function RecordView({ patientId }) {
  const rec = useRecord(patientId);
  if (rec.loading && !rec.data) return <Loading />;
  if (rec.error && !rec.data) return <Empty title="Couldn't open this record">{rec.error}</Empty>; // a failed live refetch keeps the record on screen
  const d = rec.data;
  if (d.restricted) return <AccessGate record={d} onChanged={rec.reload} />;
  if (d.emergency) {
    return (
      <div className="stack">
        <EmergencyBanner expiresAt={d.expiresAt} />
        <PatientHead p={d.patient} />
        <CriticalCard p={d.patient} />
        <p className="tiny muted mb-0">Past visits, prescriptions and lab reports stay hidden under emergency access. Request consent to see the full record.</p>
      </div>
    );
  }
  return (
    <div className="stack lg">
      <div className="row between wrap">
        <PatientHead p={d.patient} />
        {d.copyOnly ? <span className="badge sun">Read-only copy</span> : <span className="badge green"><ShieldCheck />Consent active</span>}
      </div>
      {d.copyOnly && <div className="callout"><ShieldCheck /><span>This patient moved their care to another doctor. You keep a read-only copy of their records up to {fmtDate(d.copyUntil)} — nothing recorded after that is shared with you.</span></div>}
      <div className="grid two">
        <div className="stack"><h4 className="mb-0">Health summary</h4><HistoryPanel data={d} /></div>
        <div className="stack">
          <h4 className="mb-0">Past visits</h4>
          <VisitsPanel visits={d.visits} />
          <h4 className="mb-0 mt-2">Lab reports</h4>
          <LabsPanel labs={d.labs} />
        </div>
      </div>
    </div>
  );
}

export function PatientHead({ p }) {
  return (
    <div>
      <h2 className="mb-0" translate="no">{p.name}</h2>
      <div className="small muted">
        {p.age} y · {p.gender} · <span className="mono" dir="ltr" translate="no">{p.id}</span>
        {p.language ? ` · speaks ${p.language}` : ''}{p.district ? ` · ${p.district}, ${p.state}` : ''}
      </div>
    </div>
  );
}
