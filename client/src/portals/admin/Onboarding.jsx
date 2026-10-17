import { useEffect, useState } from 'react';
import { Stethoscope, Building2, FlaskConical, Pill, MonitorSmartphone, Check, X, ShieldCheck, Search, ExternalLink, MapPin, Phone, Languages } from 'lucide-react';
import { api } from '../../api';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Tabs, Pills, Empty, Button, Modal, Field, Avatar, StatusBadge, useAction, timeAgo, cx } from '../../components/ui';
import { useLive } from '../../live';
import { LiveGate } from './shared';
import { ProtectedImg } from '../../components/Availability';

// The council a registration prefix usually belongs to — only a hint for where to look, not a check.
const councilFor = (regNo = '') => ({ UPMC: 'UP Medical Council', KMC: 'Karnataka Medical Council', BMC: 'Bihar Medical Council' }[String(regNo).split('-')[0]] || null);
const NMC_REGISTER = 'https://www.nmc.org.in/information-desk/indian-medical-register/';

// No registry API is connected, so this is an honest manual check: the admin looks the number up on the
// official register and ticks the box. The server stores who confirmed it and when (registryCheckedBy/At).
function RegistryCheck({ doc, checked, onChange }) {
  const council = doc.council || councilFor(doc.regNo);
  return (
    <div className="ad-registry">
      <div className="small">Registration <span className="mono" translate="no">{doc.regNo || 'Not added'}</span> · {council ? <>{council}{!doc.council && <span className="tiny muted"> (from the number's prefix)</span>}</> : <span className="muted">Council not stated</span>}</div>
      <a className="link-btn small row mt-1" style={{ gap: 6, flexWrap: 'nowrap', alignItems: 'flex-start' }} href={NMC_REGISTER} target="_blank" rel="noreferrer"><Search size={14} style={{ flexShrink: 0, marginTop: 2 }} /> <span>Search the official Indian Medical Register (NMC)</span> <ExternalLink size={13} style={{ flexShrink: 0, marginTop: 2 }} /></a>
      <label className="row small mt-1" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <input type="checkbox" style={{ flexShrink: 0, marginTop: 2 }} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>I checked this registration on the official register and it is active</span>
      </label>
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
              {k.aadhaarLast4 ? <span className="mono">Aadhaar XXXX XXXX {k.aadhaarLast4}{k.aadhaarChecksumOk ? ' ✓' : ''}</span> : <span className="muted">Aadhaar not given (optional)</span>}
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
              <RegistryCheck doc={d} checked={matched} onChange={setMatched} />
              <div className="row wrap" style={{ gap: 8 }}>
                <Button size="sm" icon={Check} disabled={!matched} loading={busy === `a-${d.id}`} onClick={() => onApprove(d)}>Approve & activate</Button>
                <Button size="sm" variant="ghost" icon={X} onClick={() => onReject(d)}>Reject</Button>
                {!matched && <span className="tiny muted">Check the official register and tick the box before approving.</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const FAC_ICON = { hospital: Building2, lab: FlaskConical, pharmacy: Pill, kiosk: MonitorSmartphone };

// Open "Request a change" messages a verified store sent from its profile (POST /api/pharmacy/change-requests).
const openChanges = (f) => (f.changeRequests || []).filter((c) => c.status === 'open');

function FacilityCard({ f, rejected, onApprove, onReject, onResolve, busy }) {
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
          {openChanges(f).map((c) => (
            <div key={c.id} className="ad-partner tiny">
              <span className="ad-partner-tag">Change request</span>
              <span className="grow">{c.message}</span>
              <span className="muted">{c.byName} · {timeAgo(c.at)}</span>
              <Button size="sm" variant="secondary" loading={busy === `cr-${c.id}`} onClick={() => onResolve(f, c)}>Mark done</Button>
            </div>
          ))}
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
    // Doctors: only reachable once the admin ticked the manual register check (the server requires it too).
    const r = await run(`a-${item.id}`, () => api.post(`/admin/verify/${kind}/${item.id}`, { approve: true, ...(kind === 'doctor' ? { registryChecked: true } : {}) }), `${item.name} verified`);
    if (r) live.reload();
  };
  const resolve = async (f, c) => {
    const r = await run(`cr-${c.id}`, () => api.post(`/admin/facilities/${f.id}/change-requests/${c.id}/resolve`, {}), 'Marked done — the store has been told');
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
        const needsReview = (x) => (!x.verified && !isRejected(x)) || openChanges(x).length > 0;
        const pendingOf = (list) => list.filter(needsReview).length;
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
        const list = show === 'pending' ? sorted.filter((x) => !x.verified || openChanges(x).length > 0) : sorted;

        return (
          <>
            <PageHeader eyebrow="Onboarding" title="Verification queues" subtitle="Nobody treats patients or dispenses medicine on Nexus Healthcare until a person has checked their credentials." />
            <Tabs tabs={tabs} value={tab} onChange={setTab} />
            <div className="row between wrap mb-2" style={{ gap: 10 }}>
              <span className="small muted">{isDoc ? 'Look each registration number up on the official medical register before approving.' : 'Licences and certificates were uploaded at sign-up; verify the details match.'}</span>
              <Pills value={show} onChange={setShow} options={[{ value: 'pending', label: 'Needs review' }, { value: 'all', label: 'Everyone' }]} />
            </div>
            {list.length === 0 ? (
              <Card><Empty icon={ShieldCheck} title="Queue is clear">{show === 'pending' ? 'Nothing waiting in this queue. Switch to “Everyone” to see verified entries.' : 'No entries yet.'}</Empty></Card>
            ) : (
              <div className="ad-queue">
                {list.map((x) => (isDoc
                  ? <DoctorCard key={x.id} d={x} busy={busy} onApprove={(d) => approve(d, 'doctor')} onReject={(d) => setReject({ item: d, kind: 'doctor' })} />
                  : <FacilityCard key={x.id} f={x} rejected={Boolean(isRejected(x))} busy={busy} onApprove={(f) => approve(f, f.type)} onReject={(f) => setReject({ item: f, kind: f.type })} onResolve={resolve} />))}
              </div>
            )}
            <RejectModal target={reject?.item} busy={busy === 'reject'} onClose={() => setReject(null)} onConfirm={doReject} />
          </>
        );
      }}
    </LiveGate>
  );
}
