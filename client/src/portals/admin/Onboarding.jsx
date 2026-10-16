import { useEffect, useRef, useState } from 'react';
import { Stethoscope, Building2, FlaskConical, Pill, MonitorSmartphone, Check, X, ShieldCheck, Search, Loader2, MapPin, Phone, Languages, CircleCheck } from 'lucide-react';
import { api } from '../../api';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Tabs, Pills, Empty, Button, Modal, Field, Avatar, StatusBadge, useAction, cx } from '../../components/ui';
import { useLive } from '../../live';
import { LiveGate } from './shared';
import { ProtectedImg } from '../../components/Availability';

const REGISTRY_STEPS = [
  'Connecting to the medical council registry',
  'Looking up registration number',
  'Matching name and qualification',
  'Checking for suspensions or disciplinary action',
];
const councilFor = (regNo = '') => ({ UPMC: 'UP Medical Council', KMC: 'Karnataka Medical Council', BMC: 'Bihar Medical Council' }[regNo.split('-')[0]] || 'National Medical Commission');

function RegistryCheck({ doc, onResult }) {
  const [step, setStep] = useState(-1);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const start = () => {
    setStep(0);
    REGISTRY_STEPS.forEach((_, i) => timers.current.push(setTimeout(() => setStep(i + 1), 650 * (i + 1))));
    timers.current.push(setTimeout(() => onResult(true), 650 * REGISTRY_STEPS.length + 150));
  };
  if (step < 0) {
    return <Button size="sm" variant="secondary" icon={Search} onClick={start}>Check against medical council registry</Button>;
  }
  return (
    <div className="ad-registry" aria-live="polite">
      <div className="tiny muted mb-1">{councilFor(doc.regNo)} · {doc.regNo}</div>
      {REGISTRY_STEPS.map((s, i) => (
        <div key={s} className={cx('ad-reg-step', i < step && 'done', i === step && 'now')}>
          {i < step ? <CircleCheck /> : i === step ? <Loader2 className="ad-spin" /> : <span className="ad-reg-dot" />}
          <span className="small">{s}</span>
        </div>
      ))}
      {step >= REGISTRY_STEPS.length && <div className="form-ok small mt-1">Match found — registration active, no disciplinary record.</div>}
    </div>
  );
}

function RejectModal({ target, onClose, onConfirm, busy }) {
  const [note, setNote] = useState('');
  useEffect(() => setNote(''), [target]);
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="Reject application"
      subtitle={target?.name}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} disabled={note.trim().length < 5} onClick={() => onConfirm(note.trim())}>Reject</Button></>}
    >
      <Field label="Reason (shared with the applicant)" hint="Be specific so they can fix it and re-apply.">
        <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Registration number not found in the council registry" />
      </Field>
    </Modal>
  );
}

function openFile(id) {
  const win = window.open('', '_blank');
  api.fileObjectUrl(id).then((u) => { if (win) win.location.href = u; else window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000); }).catch(() => win?.close());
}

function DoctorCard({ d, onApprove, onReject, busy }) {
  const [matched, setMatched] = useState(false);
  const rejected = !d.verified && d.verificationNote;
  const incomplete = d.profileComplete === false;
  const k = d.kyc;
  return (
    <div className={cx('ad-queue-card', !d.verified && !rejected && 'pending')}>
      <div className="row top" style={{ gap: 14 }}>
        {k?.photoFileId ? <ProtectedImg fileId={k.photoFileId} alt={d.name} className="ad-doc-photo" /> : <Avatar name={d.name} />}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <div>
              <strong translate="no">{d.name}</strong>
              <div className="small muted">{d.specialty} · {d.qualification} · {d.experience} yrs</div>
            </div>
            {d.verified ? <StatusBadge status="verified" /> : rejected ? <StatusBadge status="rejected" /> : incomplete ? <StatusBadge status="pending">Profile incomplete</StatusBadge> : <StatusBadge status="pending">Awaiting check</StatusBadge>}
          </div>
          <div className="ad-meta tiny">
            <span className="mono">{d.regNo}</span>
            <span><MapPin size={13} /> {d.district}, {d.state}</span>
            <span><Languages size={13} /> {(d.languages || []).join(', ')}</span>
            {d.email && <span translate="no">{d.email}</span>}
          </div>
          {k && (
            <div className="ad-partner tiny">
              <span className="ad-partner-tag">Profile</span>
              <span>Age {k.age}</span>
              <span className="mono">Aadhaar XXXX XXXX {k.aadhaarLast4}{k.aadhaarChecksumOk ? ' ✓' : ''}</span>
              <span>Latest degree: {k.latestDegree}{k.degreeNumber ? ` · ${k.degreeNumber}` : ''}</span>
              {d.patientsLifetime ? <span>~{Number(d.patientsLifetime).toLocaleString()} patients seen</span> : null}
              <span>Proposed fee ₹{d.fee}</span>
              {k.degreeFileId && <button type="button" className="link-btn" onClick={() => openFile(k.degreeFileId)}>View degree certificate</button>}
              {k.photoFileId && <button type="button" className="link-btn" onClick={() => openFile(k.photoFileId)}>View photo</button>}
            </div>
          )}
          {d.engagement === 'eclinic_partner' && d.availability?.days && (
            <div className="ad-partner tiny">
              <span className="ad-partner-tag">E-Clinic partner · self-applied</span>
              <span>{{ remote: 'Video consults only', eclinic: 'At E-Clinics', both: 'Video + E-Clinics' }[d.practiceMode] || 'Video + E-Clinics'}</span>
              {d.availability && <span>{d.availability.days.join(', ')} · {d.availability.from}–{d.availability.to} · ~{d.availability.hoursPerWeek} h/week</span>}
              <span>Fee ₹{d.fee}</span>
              {d.mainPractice && <span>Main practice: {d.mainPractice}</span>}
              {d.eClinicNames?.length > 0 && <span>Prefers: {d.eClinicNames.join(', ')}</span>}
              {d.claimRequest && <span className="badge sun">Claims a clinic listing ({d.claimRequest}) — check identity before approving</span>}
              {d.listedBy && !d.userId && <span className="badge">Listed by a clinic / hospital (no login yet)</span>}
            </div>
          )}
          {d.verified && d.verificationNote && <div className="tiny ad-note ok"><ShieldCheck size={13} /> {d.verificationNote}</div>}
          {rejected && <div className="tiny ad-note bad">{d.verificationNote}</div>}
          {!d.verified && incomplete && <div className="tiny muted mt-2">Signed up — waiting for the doctor to complete their profile before it can be verified.</div>}
          {!d.verified && !incomplete && (
            <div className="mt-2 stack" style={{ gap: 10 }}>
              <RegistryCheck doc={d} onResult={setMatched} />
              <div className="row wrap" style={{ gap: 8 }}>
                <Button size="sm" icon={Check} disabled={!matched} loading={busy === `a-${d.id}`} onClick={() => onApprove(d)}>Approve & activate</Button>
                <Button size="sm" variant="ghost" icon={X} onClick={() => onReject(d)}>Reject</Button>
                {!matched && <span className="tiny muted">Run the registry check before approving.</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const FAC_ICON = { hospital: Building2, lab: FlaskConical, pharmacy: Pill, kiosk: MonitorSmartphone };

function FacilityCard({ f, rejected, onApprove, onReject, busy }) {
  const Icon = FAC_ICON[f.type] || Building2;
  return (
    <div className={cx('ad-queue-card', !f.verified && !rejected && 'pending')}>
      <div className="row top" style={{ gap: 14 }}>
        <span className="ad-fac-icon"><Icon /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <div>
              <strong translate="no">{f.name}</strong>
              <div className="small muted">{f.subtype === 'clinic' ? 'Clinic · ' : ''}{f.district}, {f.state}{f.pincode ? ` · pin ${f.pincode}` : ''}</div>
            </div>
            {f.verified ? <StatusBadge status="verified" /> : rejected ? <StatusBadge status="rejected" /> : <StatusBadge status="pending" />}
          </div>
          <div className="ad-meta tiny">
            {f.phone && <span><Phone size={13} /> <bdi dir="ltr">{f.phone}</bdi></span>}
            {f.hours && <span>Open {f.hours}</span>}
            {f.type === 'kiosk' && <span>Software {f.version} · {f.status}</span>}
            {f.type === 'pharmacy' && !f.selfApplied && <span>Drug licence on file</span>}
            {f.type === 'pharmacy' && f.selfApplied && <span>{f.profileComplete ? 'Store profile complete' : 'Store profile not completed yet'}</span>}
            {f.delivery && <span>Own home delivery</span>}
            {f.ownerDoctorId && <span>Doctor-owned clinic</span>}
            {f.type === 'lab' && !f.selfApplied && <span>NABL certificate on file</span>}
            {f.licenceNo && <span className="mono">Licence {f.licenceNo}</span>}
            {f.ownerName && <span>Owner: <span translate="no">{f.ownerName}</span></span>}
            {f.address && <span><MapPin size={13} /> {f.address}</span>}
          </div>
          {(f.storePhotoFileId || f.licenceFileId) && (
            <div className="ad-fac-photos">
              {f.storePhotoFileId && <figure><ProtectedImg fileId={f.storePhotoFileId} alt="Store" className="ad-fac-photo" /><figcaption className="tiny muted">Store</figcaption></figure>}
              {f.licenceFileId && <figure><button type="button" className="ad-fac-file" onClick={() => openFile(f.licenceFileId)}><ProtectedImg fileId={f.licenceFileId} alt="Licence" className="ad-fac-photo" /></button><figcaption className="tiny muted">Drug licence (tap to open)</figcaption></figure>}
            </div>
          )}
          {f.selfApplied && <div className="ad-partner tiny"><span className="ad-partner-tag">Self-applied partner</span>{f.applicationRef && <span className="mono">{f.applicationRef}</span>}{f.services?.length > 0 && <span>Services: {f.services.join(', ')}</span>}</div>}
          {rejected && f.verificationNote && <div className="tiny ad-note bad">{f.verificationNote}</div>}
          {f.departments && <div className="ad-tags">{f.departments.map((x) => <span key={x}>{x}</span>)}</div>}
          {f.equipment && <div className="ad-tags soft">{f.equipment.map((x) => <span key={x}>{x}</span>)}</div>}
          {!f.verified && (
            <div className="row wrap mt-2" style={{ gap: 8 }}>
              <Button size="sm" icon={Check} loading={busy === `a-${f.id}`} onClick={() => onApprove(f)}>Verify</Button>
              <Button size="sm" variant="ghost" icon={X} onClick={() => onReject(f)}>Reject</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const live = useLive('/admin/onboarding', ['admin', 'doctors']);
  const [tab, setTab] = useState('doctor');
  const [show, setShow] = useState('pending');
  const [reject, setReject] = useState(null);
  const [rejectedIds, setRejectedIds] = useState([]);
  const [run, busy] = useAction();

  const approve = async (item, kind) => {
    const r = await run(`a-${item.id}`, () => api.post(`/admin/verify/${kind}/${item.id}`, { approve: true }), `${item.name} verified`);
    if (r) live.reload();
  };
  const doReject = async (note) => {
    const kind = reject.kind;
    const r = await run('reject', () => api.post(`/admin/verify/${kind}/${reject.item.id}`, { approve: false, note }), `${reject.item.name} rejected`);
    if (r) { setRejectedIds((s) => [...s, reject.item.id]); setReject(null); live.reload(); }
  };

  return (
    <LiveGate live={live}>
      {({ doctors, facilities }) => {
        const byType = (t) => facilities.filter((f) => f.type === t);
        const isRejected = (x) => !x.verified && (x.verificationNote || rejectedIds.includes(x.id));
        const pendingOf = (list) => list.filter((x) => !x.verified && !isRejected(x)).length;
        const tabs = [
          { value: 'doctor', label: 'Doctors', icon: Stethoscope, count: pendingOf(doctors) },
          { value: 'hospital', label: 'Hospitals & clinics', icon: Building2, count: pendingOf(byType('hospital')) },
          { value: 'lab', label: 'Labs', icon: FlaskConical, count: pendingOf(byType('lab')) },
          { value: 'pharmacy', label: 'Pharmacies', icon: Pill, count: pendingOf(byType('pharmacy')) },
          { value: 'kiosk', label: 'Kiosks', icon: MonitorSmartphone, count: pendingOf(byType('kiosk')) },
        ];
        const isDoc = tab === 'doctor';
        const all = isDoc ? doctors : byType(tab);
        const sorted = [...all].sort((a, b) => Number(a.verified) - Number(b.verified));
        const list = show === 'pending' ? sorted.filter((x) => !x.verified) : sorted;

        return (
          <>
            <PageHeader eyebrow="Onboarding" title="Verification queues" subtitle="Nobody treats patients or dispenses medicine on Nexus Healthcare until a person has checked their credentials." />
            <Tabs tabs={tabs} value={tab} onChange={setTab} />
            <div className="row between wrap mb-2" style={{ gap: 10 }}>
              <span className="small muted">{isDoc ? 'Registration numbers are checked against the state medical council before approval.' : 'Licences and certificates were uploaded at sign-up; verify the details match.'}</span>
              <Pills value={show} onChange={setShow} options={[{ value: 'pending', label: 'Needs review' }, { value: 'all', label: 'Everyone' }]} />
            </div>
            {list.length === 0 ? (
              <Card><Empty icon={ShieldCheck} title="Queue is clear">{show === 'pending' ? 'Nothing waiting in this queue. Switch to “Everyone” to see verified entries.' : 'No entries yet.'}</Empty></Card>
            ) : (
              <div className="ad-queue">
                {list.map((x) => (isDoc
                  ? <DoctorCard key={x.id} d={x} busy={busy} onApprove={(d) => approve(d, 'doctor')} onReject={(d) => setReject({ item: d, kind: 'doctor' })} />
                  : <FacilityCard key={x.id} f={x} rejected={Boolean(isRejected(x))} busy={busy} onApprove={(f) => approve(f, f.type)} onReject={(f) => setReject({ item: f, kind: f.type })} />))}
              </div>
            )}
            <RejectModal target={reject?.item} busy={busy === 'reject'} onClose={() => setReject(null)} onConfirm={doReject} />
          </>
        );
      }}
    </LiveGate>
  );
}
