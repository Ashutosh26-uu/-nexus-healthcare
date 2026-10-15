import { BadgeCheck, MapPin, Clock, Phone, FileBadge, CheckCircle2, Circle, PencilLine } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Button, useToast } from '../../components/ui';
import { useAuth } from '../../auth';
import { ProtectedImg } from '../../components/Availability';

export default function Profile({ home }) {
  const toast = useToast();
  const { user } = useAuth();
  const p = home.pharmacy;
  // The POC facility record has no licence fields — these are representative demo values.
  const licence = { number: p.licenceNo || `UP-${(p.district || 'XX').slice(0, 3).toUpperCase()}-20B/21B-2019-0457`, form: 'Form 20B & 21B (retail sale)', validTill: p.licenceNo ? '—' : '31 Mar 2029', pharmacist: user?.name, regNo: p.licenceNo ? '—' : 'UPPC/R/38812' };
  const steps = [
    { label: 'Drug licence verified', done: p.verified },
    { label: 'Registered pharmacist linked', done: true },
    { label: 'Store location pinned on map', done: true },
    { label: 'Opening hours set', done: Boolean(p.hours) },
    { label: 'Billing software sync (Marg / GoFrugal)', done: false },
  ];
  const done = steps.filter((s) => s.done).length;

  return (
    <>
      <PageHeader title="Store & licence" subtitle="Your verified listing. Patients choose a pharmacy based on these details.">
        <Button variant="secondary" icon={PencilLine} onClick={() => toast('Change request sent — our onboarding team will call you to confirm.')}>Request a change</Button>
      </PageHeader>

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
              <dt>Pharmacist</dt><dd>{licence.pharmacist} · <span className="mono">{licence.regNo}</span></dd>
            </dl>
          </div>

          <Card title="Store details">
            <div className="stack">
              {p.storePhotoFileId && <ProtectedImg fileId={p.storePhotoFileId} alt="Store" className="ph-store-photo" />}
              <div className="row"><MapPin size={17} className="muted" /> <span>{[p.name, p.address, p.district, p.state].filter(Boolean).join(', ')}{p.pincode ? ` – ${p.pincode}` : ''}</span></div>
              <div className="row"><span className="muted small">Home delivery:</span> <span className="small">{p.delivery ? 'Own delivery service' : 'Via Nexus riders'}</span></div>
              <div className="row"><Clock size={17} className="muted" /> <span>Open {p.hours || 'hours not set'}, all days</span></div>
              {p.phone && <div className="row"><Phone size={17} className="muted" /> <span translate="no" dir="ltr">{p.phone}</span></div>}
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
          <p className="tiny muted mb-0">Connecting your billing software keeps stock in sync automatically — no double entry at the counter.</p>
        </Card>
      </div>
    </>
  );
}
