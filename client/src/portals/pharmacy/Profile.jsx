import { useState } from 'react';
import { BadgeCheck, MapPin, Clock, Phone, FileBadge, CheckCircle2, Circle, PencilLine, Receipt } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Button, Modal, fmtDate, useAction } from '../../components/ui';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { ProtectedImg } from '../../components/Availability';
import AadhaarVerify from '../../components/AadhaarVerify';
import SoftwareConnect from '../../components/SoftwareConnect';

export default function Profile({ home, reload }) {
  const { user, refresh } = useAuth();
  const [asking, setAsking] = useState(false);
  const p = home.pharmacy;
  // Only what the store record really holds — an empty field says so instead of showing a sample value.
  const NA = 'Not added';
  const licence = { number: p.licenceNo || NA, form: p.licenceForm || NA, validTill: p.licenceValidTill || NA, pharmacist: user?.name, regNo: p.pharmacistRegNo || NA };
  const openReqs = (p.changeRequests || []).filter((c) => c.status === 'open');
  const steps = [
    { label: 'Drug licence verified', done: p.verified },
    { label: 'Drug licence number added', done: Boolean(p.licenceNo) },
    { label: 'Store location pinned on map', done: Number.isFinite(p.lat) && Number.isFinite(p.lng) },
    { label: 'Opening hours set', done: Boolean(p.hours) },
  ];
  const done = steps.filter((s) => s.done).length;

  return (
    <>
      <PageHeader title="Store & licence" subtitle="Your verified listing. Patients choose a pharmacy based on these details.">
        <Button variant="secondary" icon={PencilLine} onClick={() => setAsking(true)}>Request a change</Button>
      </PageHeader>
      <ChangeRequestModal open={asking} onClose={() => setAsking(false)} reload={reload} />
      {openReqs.length > 0 && (
        <Card className="mb-2" title="Your change requests">
          <div className="list">
            {openReqs.map((c) => (
              <div key={c.id} className="list-item">
                <div className="grow"><div className="small">{c.message}</div><div className="tiny muted">Sent {fmtDate(c.at)}</div></div>
                <span className="badge sun">With our team</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid side">
        <div className="stack lg">
          <div className="card ph-licence">
            <div className="ph-licence-top">
              <FileBadge size={26} />
              <div className="grow">
                <div className="tiny" style={{ opacity: 0.8 }}>Drug licence</div>
                <div className="serif ph-lic-no">{licence.number}</div>
              </div>
              {p.verified ? <span className="badge green"><BadgeCheck /> Verified</span> : <span className="badge sun">Verification pending</span>}
            </div>
            <dl className="kv ph-lic-kv">
              <dt>Store</dt><dd translate="no">{p.name}</dd>
              <dt>Licence type</dt><dd>{licence.form}</dd>
              <dt>Valid till</dt><dd>{licence.validTill}</dd>
              <dt>Pharmacist</dt><dd translate="no">{licence.pharmacist}</dd>
              <dt>Pharmacist reg. no.</dt><dd className={p.pharmacistRegNo ? 'mono' : ''}>{licence.regNo}</dd>
            </dl>
          </div>

          <Card title="Owner identity">
            <p className="tiny muted">Optional. Scanning the QR on your Aadhaar proves the card is genuine — we keep only &lsquo;verified&rsquo;, the last 4 digits and year of birth.</p>
            <AadhaarVerify verification={user?.aadhaarVerification} onVerified={() => refresh()} />
          </Card>

          <Card title="Store details">
            <div className="stack">
              {p.storePhotoFileId && <ProtectedImg fileId={p.storePhotoFileId} alt="Store" className="ph-store-photo" />}
              <div className="row"><MapPin size={17} className="muted" /> <span>{[p.name, p.address, p.district, p.state].filter(Boolean).join(', ')}{p.pincode ? ` – ${p.pincode}` : ''}</span></div>
              <div className="row"><span className="muted small">Home delivery:</span> <span className="small">{p.delivery ? 'Own delivery service' : 'Via Sehatra riders'}</span></div>
              <div className="row"><Clock size={17} className="muted" /> <span>Open {p.hours || 'hours not set'}, all days</span></div>
              {p.phone && <div className="row"><Phone size={17} className="muted" /> <span translate="no" dir="ltr">{p.phone}</span></div>}
              <GstinField pharmacy={p} reload={reload} />
            </div>
          </Card>
        </div>

        <Card title="Onboarding checklist" action={<span className="tiny muted">{done} of {steps.length} done</span>}>
          <div className="steps mb-2">{steps.map((s) => <span key={s.label} className={s.done ? 'done' : ''} />)}</div>
          <ul className="ph-checklist">
            {steps.map((s) => (
              <li key={s.label} className={s.done ? 'done' : ''}>
                {s.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                {s.label}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="mt-3"><SoftwareConnect intro="Keep your stock here in step with your billing software (Marg, GoFrugal or any other). Software that can call a web API syncs stock and counter sales by itself; otherwise export a stock CSV and use “Import from billing software” on the Stock screen." /></div>
    </>
  );
}

// Verified details (name, licence, address) can't be self-edited — this sends a request to the admins.
function ChangeRequestModal({ open, onClose, reload }) {
  const [text, setText] = useState('');
  const [run, busy] = useAction();
  const send = async () => {
    const r = await run('chg', () => api.post('/pharmacy/change-requests', { message: text }), 'Request sent — our onboarding team will review it');
    if (r) { setText(''); onClose(); reload?.(); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Request a change" subtitle="Tell us what's wrong or what changed (e.g. new address, renewed licence). An admin will review it."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy === 'chg'} disabled={text.trim().length < 5} onClick={send}>Send request</Button></>}>
      <textarea className="textarea" rows={4} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} aria-label="What should change" />
    </Modal>
  );
}

// GSTIN is optional and printed on the patients' GST bills. Checked on the server too.
function GstinField({ pharmacy, reload }) {
  const [value, setValue] = useState(pharmacy.gstin || '');
  const [run, busy] = useAction();
  const valid = !value || /^[0-9]{2}[A-Z0-9]{13}$/.test(value);
  const save = () => run('gstin', async () => { await api.put('/pharmacy/profile', { gstin: value }); reload?.(); }, value ? 'GSTIN saved — it will appear on your bills' : 'GSTIN removed');
  return (
    <div className="stack" style={{ gap: 4 }}>
      <label className="small muted row" htmlFor="ph-gstin" style={{ gap: 6 }}><Receipt size={15} /> GSTIN (optional, printed on bills)</label>
      <div className="row" style={{ gap: 8 }}>
        <input id="ph-gstin" className="input sm mono" dir="ltr" value={value} onChange={(e) => setValue(e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 15))} placeholder="09AAACH7409R1ZZ" aria-invalid={!valid} />
        <Button size="sm" variant="secondary" loading={busy === 'gstin'} disabled={!valid || value === (pharmacy.gstin || '')} onClick={save}>Save</Button>
      </div>
      {!valid && <span className="tiny" style={{ color: 'var(--rose)' }}>15 characters: 2 digits, then 13 letters or digits.</span>}
    </div>
  );
}
