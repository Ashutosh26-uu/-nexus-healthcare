import { useEffect, useState } from 'react';
import { Printer, Phone, Droplet, AlertTriangle, HeartPulse, Pill, Smartphone, Pencil, Lock, Copy, WifiOff, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, timeAgo, useToast } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { AadhaarBadge } from '../../components/AadhaarVerify';
import { api } from '../../api';
import { usePatient, firstName, PassportQR, PageSkeleton } from './shared';

export default function EmergencyCard() {
  const { patient: p, homeLoading, profiles } = usePatient();
  const navigate = useNavigate();
  if (homeLoading) return <PageSkeleton />;
  if (!p) return <Empty title="No passport found" />;
  const isSelf = profiles.find((x) => x.id === p.id)?.self;

  return (
    <div className="stack lg">
      <div className="no-print">
        <PageHeader eyebrow="Emergency card" title={isSelf ? 'Your emergency card' : `${firstName(p.name)}’s emergency card`}
          subtitle="If you’re ever unable to speak, this tells a doctor what they need in the first five minutes.">
          <Button variant="secondary" icon={Pencil} onClick={() => navigate('/patient/settings')}>Edit details</Button>
          <Button icon={Printer} onClick={() => window.print()}>Print card</Button>
        </PageHeader>
      </div>

      <div className="pt-ecard-wrap">
        <section className="pt-ecard print-area" aria-label="Emergency health card">
          <header className="pt-ecard-head">
            <div>
              <div className="pt-ecard-eyebrow">Nexus Healthcare · Emergency health card</div>
              <div className="pt-ecard-name" translate="no">{p.name}</div>
              <div className="pt-ecard-sub">{p.age != null ? `${p.age} yrs` : ''}{p.gender ? ` · ${p.gender}` : ''} · {p.district}, {p.state}</div>
              {p.aadhaarVerification?.verified && <div style={{ marginTop: 6 }}><AadhaarBadge v={p.aadhaarVerification} /></div>}
            </div>
            <div className="pt-ecard-blood" aria-label={`Blood group ${p.bloodGroup}`}>
              <Droplet size={16} />
              <span>{p.bloodGroup || '?'}</span>
            </div>
          </header>

          <div className="pt-ecard-body">
            <div className="pt-ecard-qr">
              <PassportQR value={p.id} size={150} />
              <div className="mono small" dir="ltr" translate="no">{p.id}</div>
              <div className="tiny">Scan for critical info</div>
            </div>
            <div className="pt-ecard-info">
              <Block icon={AlertTriangle} label="Allergies" tone="rose" items={p.allergies} empty="No known allergies" />
              <Block icon={HeartPulse} label="Conditions" items={p.conditions} empty="None recorded" />
              <Block icon={Pill} label="Current medicines" items={p.currentMeds} empty="None" />
            </div>
          </div>

          <footer className="pt-ecard-foot">
            <div className="tiny strong pt-ecard-label"><Phone size={13} /> In an emergency, call</div>
            <div className="pt-ecard-contacts">
              {(p.emergencyContacts || []).length === 0 && <span className="small">No contacts added</span>}
              {(p.emergencyContacts || []).map((c, i) => (
                <div key={i}><strong translate="no">{c.name}</strong> <span className="small">({c.relation})</span> <a href={`tel:${c.phone}`} className="mono" translate="no" dir="ltr">{c.phone}</a></div>
              ))}
              <div><strong>Ambulance</strong> <a href="tel:108" className="mono">108</a></div>
            </div>
            {p.abha && <div className="tiny pt-ecard-abha">ABHA <bdi dir="ltr" translate="no">{p.abha}</bdi></div>}
          </footer>
        </section>
      </div>

      <div className="grid two no-print">
        <Card>
          <div className="row top">
            <span className="pt-ic-tile green"><Smartphone size={18} /></span>
            <div className="grow small">
              <strong>Put it on your lock screen</strong>
              <p className="muted mb-0">Take a screenshot of the card and set it as your phone&apos;s lock-screen wallpaper. Paramedics can read it without unlocking your phone.</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="row top">
            <span className="pt-ic-tile clay"><Printer size={18} /></span>
            <div className="grow small">
              <strong>Keep a paper copy</strong>
              <p className="muted mb-0">Print it, fold along the middle and keep it in your wallet or purse. Any E-Clinic kiosk can also print it for you free of cost.</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="no-print"><Capsule patientId={p.id} /></div>
    </div>
  );
}

function Capsule({ patientId }) {
  const toast = useToast();
  const [cap, setCap] = useState(null);
  useEffect(() => { let a = true; api.get('/patient/capsule').then((c) => a && setCap(c)).catch(() => {}); return () => { a = false; }; }, [patientId]);
  if (!cap) return null;
  return (
    <Card className="pt-capsule">
      <div className="card-head">
        <div>
          <h3 className="mb-0"><Lock size={18} style={{ verticalAlign: '-3px' }} /> Offline Emergency Capsule</h3>
          <p className="small muted mb-0 mt-1">Your critical details are sealed with strong encryption inside this code. Any verified doctor can open it in an emergency — <strong>even with no internet</strong> — using a time-limited key. Every time it&apos;s opened, you&apos;re told.</p>
        </div>
        <span className="badge green"><WifiOff size={12} /> works offline</span>
      </div>
      <div className="pt-capsule-body">
        <div className="pt-capsule-qr">
          <PassportQR value={cap.qrPayload} size={150} label="Emergency capsule QR" />
          <div className="pt-capsule-key">
            <span className="tiny muted">Access key</span>
            <button className="pt-capsule-keyval mono" translate="no" onClick={() => navigator.clipboard?.writeText(cap.key).then(() => toast('Key copied')).catch(() => toast('Couldn’t copy — long-press the key to copy it.', 'error'))}>
              {cap.key} <Copy size={13} />
            </button>
          </div>
        </div>
        <div className="grow">
          <div className="pt-capsule-feat"><ShieldCheck size={16} /> <span className="small">AES-256 encrypted — unreadable without the key</span></div>
          <div className="pt-capsule-feat"><WifiOff size={16} /> <span className="small">Opens offline at any E-Clinic or hospital device</span></div>
          <div className="pt-capsule-feat"><Lock size={16} /> <span className="small">Key rotates monthly; old screenshots stop working</span></div>
          <div className="pt-capsule-opens">
            <div className="tiny strong">Access history</div>
            {(!cap.opens || cap.opens.length === 0)
              ? <div className="tiny muted">No one has opened your capsule yet.</div>
              : cap.opens.map((o) => (
                <div key={o.id} className="tiny pt-capsule-open">
                  <strong translate="no">{o.actorName}</strong> · {o.reason} · <span className="muted">{timeAgo(o.at)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Block({ icon, label, items = [], empty, tone }) {
  const Icon = icon;
  return (
    <div className={`pt-ecard-block ${tone || ''}`}>
      <div className="tiny strong pt-ecard-label"><Icon size={13} /> {label}</div>
      <div className="pt-ecard-val">{items?.length ? items.join(', ') : <span className="pt-ecard-none">{empty}</span>}</div>
    </div>
  );
}
