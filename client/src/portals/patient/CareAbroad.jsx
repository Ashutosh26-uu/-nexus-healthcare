import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, FileText, Video, ShieldCheck, Copy, MessageCircle, Mail, X, Eye, Landmark, ListChecks, ExternalLink } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Card, Field, cx, fmtDate, timeAgo, useAction, useToast } from '../../components/ui';
import { api } from '../../api';
import { usePatient, usePatientLive, firstName } from './shared';
import { EMERGENCY, abroadCountry, setAbroadCountry } from '../../emergencyNumbers';
import NearbyDoctors from './NearbyDoctors';

// Care abroad: an emergency in another country, treatment abroad, or a consultation from outside India.
// Everything here is real — the person's own records, doctors actually on Sehatra, official government help.
export default function CareAbroad() {
  const { patient, profileKey } = usePatient();
  const who = profileKey === 'self' ? 'your' : `${firstName(patient?.name)}’s`;
  return (
    <div className="stack lg">
      <PageHeader eyebrow="Get care" title="Care abroad" subtitle={`Treatment or a consultation in another country — or an emergency while travelling. ${who === 'your' ? 'Your' : who} records go with you.`} />
      <EmergencyAbroad />
      <TravelSummary who={who} />
      <Card title={<h3 className="row" style={{ gap: 8 }}><Video size={18} /> A consultation from another country</h3>}>
        <p className="small mt-0">Video consults work from anywhere with internet. Talk to your own doctor in India while you're away, or get a second opinion from a doctor practising abroad.</p>
        <div className="row wrap" style={{ gap: 8 }}>
          <Link className="btn sm" to="/patient/consult"><Video size={15} /> Talk to a doctor in India</Link>
        </div>
      </Card>
      <NearbyDoctors title="Doctors in other countries" defaultScope="abroad" />
      <Checklist />
    </div>
  );
}

// The country they're in decides which number SOS dials — kept on this phone only.
function EmergencyAbroad() {
  const [c, setC] = useState(() => abroadCountry() || 'IN');
  const info = EMERGENCY[c];
  const pick = (v) => { setC(v); setAbroadCountry(v); };
  return (
    <Card title={<h3 className="row" style={{ gap: 8 }}><Phone size={18} /> Emergency while travelling</h3>}>
      <Field label="Which country are you in right now?" hint="SOS and every “Call ambulance” button on this phone will dial this country’s number.">
        <select className="select" value={c} onChange={(e) => pick(e.target.value)}>
          {Object.entries(EMERGENCY).map(([code, x]) => <option key={code} value={code}>{x.name}</option>)}
        </select>
      </Field>
      <a className="btn danger block mt-1" href={`tel:${info.number}`}><Phone size={18} /> Call {info.number}{info.note ? ` — ${info.note}` : ''}</a>
      <ul className="small mb-0" style={{ paddingLeft: 18 }}>
        <li>Your emergency circle still gets your SOS alert, with your location, anywhere you have internet.</li>
        <li>Indian citizens in trouble abroad can ask the Indian embassy for help through <a href="https://www.madad.gov.in/" target="_blank" rel="noreferrer">MADAD <ExternalLink size={12} /></a> (Ministry of External Affairs), or find the <a href="https://www.mea.gov.in/indian-missions-abroad-new.htm" target="_blank" rel="noreferrer">nearest Indian mission <ExternalLink size={12} /></a>.</li>
      </ul>
    </Card>
  );
}

function TravelSummary({ who }) {
  const { data: links, reload } = usePatientLive('/patient/travel-summary/links', ['patients', 'records']);
  const [days, setDays] = useState(30);
  const [sections, setSections] = useState({ prescriptions: true, labs: true, pregnancy: true });
  const [made, setMade] = useState(null);
  const [run, busy] = useAction();
  const toast = useToast();
  const create = async () => {
    const r = await run('make', () => api.post('/patient/travel-summary/links', { days, sections }));
    if (r) { setMade(r.url); reload(); }
  };
  const off = async (l) => { if (await run(`off-${l.id}`, () => api.del(`/patient/travel-summary/links/${l.id}`), 'Link switched off — it no longer opens')) reload(); };
  const msg = made ? `My medical summary (in English) for your review: ${made}` : '';
  const copy = async () => { try { await navigator.clipboard.writeText(made); toast('Link copied'); } catch { toast('Press and hold the link to copy it', 'error'); } };
  const toggle = (k) => setSections({ ...sections, [k]: !sections[k] });
  return (
    <Card title={<h3 className="row" style={{ gap: 8 }}><FileText size={18} /> Medical summary in English</h3>}>
      <p className="small mt-0">For a hospital or doctor in another country: {who} allergies, conditions, current medicines, recent prescriptions and lab results, vaccinations and emergency contacts on one page. Share a private link — they don’t need a Sehatra account. You’ll be told when it’s opened, and you can switch it off any time.</p>
      <div className="chip-select">
        {[['prescriptions', 'Recent prescriptions'], ['labs', 'Lab results'], ['pregnancy', 'Pregnancy (if tracked)']].map(([k, label]) => (
          <button key={k} type="button" className={cx('chip', sections[k] && 'on')} onClick={() => toggle(k)}>{label}</button>
        ))}
      </div>
      <div className="row wrap mt-1" style={{ gap: 8, alignItems: 'flex-end' }}>
        <Field label="Link works for">
          <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
          </select>
        </Field>
        <Button icon={ShieldCheck} loading={busy === 'make'} onClick={create}>Create a private link</Button>
      </div>
      {made && (
        <div className="callout sky small mt-2">
          <span className="grow" style={{ wordBreak: 'break-all' }}>Send this to the doctor or hospital:<br /><strong>{made}</strong></span>
          <div className="row wrap mt-1" style={{ gap: 8 }}>
            <a className="btn sm" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>
            <a className="btn sm secondary" href={`mailto:?subject=${encodeURIComponent('Medical summary')}&body=${encodeURIComponent(msg)}`}><Mail size={15} /> Email</a>
            <button type="button" className="btn sm ghost" onClick={copy}><Copy size={15} /> Copy</button>
            <a className="btn sm ghost" href={made} target="_blank" rel="noreferrer"><Eye size={15} /> Open / print</a>
          </div>
        </div>
      )}
      {(links || []).length > 0 && (
        <div className="mt-2">
          <div className="tiny muted">Links that work now</div>
          {links.map((l) => (
            <div key={l.id} className="row" style={{ gap: 8, padding: '6px 0' }}>
              <span className="grow small">Made {timeAgo(l.createdAt)} · until {fmtDate(l.expiresAt)} · {l.views ? `opened ${l.views}×, last ${timeAgo(l.lastViewAt)}` : 'not opened yet'}</span>
              <button type="button" className="icon-btn" aria-label="Switch this link off" onClick={() => off(l)} disabled={busy === `off-${l.id}`}><X size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Checklist() {
  const items = [
    'Ask your doctor for a referral letter and, if you will fly, a “fit to fly” note.',
    'Get the hospital abroad to send a written treatment plan and cost estimate before you travel.',
    'Check the medical visa rules on the official embassy website of the country you are going to.',
    'Carry medicines in their original packs with the prescription — generic names help abroad.',
    'Take insurance that covers treatment in that country, and keep the policy number handy.',
    'Share your medical summary link with the hospital, and keep a printed copy with you.',
    'Add the family who travel with you (or stay home) to your emergency circle on the SOS page.',
  ];
  return (
    <Card title={<h3 className="row" style={{ gap: 8 }}><ListChecks size={18} /> Before you travel for treatment</h3>}>
      <ul className="small mb-0" style={{ paddingLeft: 18 }}>{items.map((t) => <li key={t}>{t}</li>)}</ul>
      <p className="tiny muted mb-0 mt-1"><Landmark size={12} /> General guidance only — rules differ by country; the destination’s embassy has the final word.</p>
    </Card>
  );
}

