import { useState } from 'react';
import { BadgeCheck, MapPin, Phone, PencilLine, Building2, Wrench, Stethoscope, BedDouble } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Button, Modal, Field, useToast } from '../../components/ui';
import { bedLabel, HmisCard } from './shared';
import { useSupport } from '../../config';

export default function Profile({ home }) {
  const toast = useToast();
  const support = useSupport();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const f = home.facility;

  // There's no in-app request queue yet, so this opens an email to the Nexus Healthcare team instead of pretending it was sent.
  const send = (e) => {
    e.preventDefault();
    const subject = `Profile change request · ${f.name}`;
    window.location.href = `mailto:${support.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text.trim()}

Facility: ${f.name} (${f.id})`)}`;
    setOpen(false);
    setText('');
    toast('Your email app should open with the request — press send there to reach our team.');
  };

  return (
    <>
      <PageHeader title="Facility profile" subtitle="This is how your hospital appears to doctors, patients and the command centre.">
        {support.email ? <Button variant="secondary" icon={PencilLine} onClick={() => setOpen(true)}>Request a change</Button> : <span className="small muted">To change these details, contact the Nexus Healthcare team.</span>}
      </PageHeader>

      <div className="grid side">
        <div className="stack lg">
          <div className="card hosp-profile">
            <div className="hosp-profile-icon"><Building2 size={28} /></div>
            <div className="grow">
              <div className="row wrap" style={{ gap: 10 }}>
                <h2 className="mb-0" style={{ fontSize: '1.5rem' }} translate="no">{f.name}</h2>
                {f.verified && <span className="badge green"><BadgeCheck /> Verified facility</span>}
              </div>
              <div className="row wrap small muted mt-1" style={{ gap: 16 }}>
                <span className="row" style={{ gap: 5 }}><MapPin size={14} /> {f.district}, {f.state} · {f.pincode}</span>
                {f.phone && <span className="row" style={{ gap: 5 }}><Phone size={14} /> <bdi dir="ltr">{f.phone}</bdi></span>}
              </div>
            </div>
          </div>

          <Card title={<h3 className="row" style={{ gap: 8 }}><Stethoscope size={18} /> Departments & specialties</h3>}>
            <div className="chip-select">
              {(f.departments || []).map((d) => <span key={d} className="chip static">{d}</span>)}
              {!(f.departments || []).length && <span className="small muted">No departments listed yet.</span>}
            </div>
          </Card>

          <Card title={<h3 className="row" style={{ gap: 8 }}><Wrench size={18} /> Equipment</h3>}>
            <div className="chip-select">
              {(f.equipment || []).map((d) => <span key={d} className="chip static equip">{d}</span>)}
              {!(f.equipment || []).length && <span className="small muted">No equipment listed yet.</span>}
            </div>
            <p className="tiny muted mt-2 mb-0">Keep this list accurate — it's part of the facility profile the network sees.</p>
          </Card>
        </div>

        <div className="stack lg">
          <Card title={<h3 className="row" style={{ gap: 8 }}><BedDouble size={18} /> Sanctioned beds</h3>}>
            <dl className="kv">
              {(home.beds || []).map((b) => (
                <div key={b.type} style={{ display: 'contents' }}>
                  <dt>{bedLabel(b.type)}</dt><dd>{b.total}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <HmisCard />
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Request a profile change" subtitle="Profile details are verified, so changes go through our team. This opens an email to them with your request.">
        <form className="stack" onSubmit={send}>
          <Field label="What should change?" hint="e.g. New CT scanner installed in Radiology from 1 Nov">
            <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} required autoFocus />
          </Field>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Write email</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
