import { useState } from 'react';
import { BadgeIndianRupee, Phone, ExternalLink, CircleCheck, Hospital, ClipboardList, Navigation, Info } from 'lucide-react';
import { api } from '../../api';
import { Button, Card, cx, useToast } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient, usePatientLive, firstName, PageSkeleton } from './shared';

const OFFICIAL_CHECK = 'https://beneficiary.nha.gov.in';
const HELPLINE = '14555';

// Who is usually covered — the government's list decides; these questions only say whether it's worth checking.
const QUESTIONS = [
  { id: 'ration', q: 'Does your family have an Antyodaya (AAY) or priority-household ration card?' },
  { id: 'rural', q: 'Rural family with a kutcha house, landless labour as main income, or no adult earning member?' },
  { id: 'urban', q: 'Does anyone work as a street vendor, domestic worker, construction or daily-wage worker, rag picker or similar?' },
  { id: 'scheme', q: 'Do you have a state health scheme card (many states add more families to PM-JAY)?' },
];

// Ayushman Bharat (PM-JAY) helper: free hospital treatment for covered families. Sehatra can't decide who is
// covered — this page helps people check on the official site, keep their card on the passport, and find
// hospitals that have told Sehatra they accept PM-JAY.
export default function Ayushman() {
  const { patient, profiles } = usePatient();
  const { data, loading, reload } = usePatientLive('/patient/ayushman', ['facilities', 'patients']);
  const [answers, setAnswers] = useState({});
  const [cardNo, setCardNo] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  if (loading && !data) return <PageSkeleton />;
  const isSelf = profiles.find((x) => x.id === patient?.id)?.self;
  const who = isSelf ? 'your family' : `${firstName(patient?.name)}’s family`;
  const senior = data?.age != null && data.age >= 70;
  const anyYes = Object.values(answers).some((v) => v === 'yes');
  const answered = Object.keys(answers).length;

  const saveCard = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await api.post('/patient/ayushman/card', { number: cardNo }); toast('Ayushman card saved to the Health Passport'); setCardNo(''); reload(); } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Free treatment" title="Ayushman Bharat (PM-JAY)"
        subtitle="Covered families get free hospital treatment of up to ₹5 lakh a year. Check if you're covered and find hospitals that accept it." />

      <Card title={<span className="row" style={{ gap: 8 }}><BadgeIndianRupee size={18} /> Your Ayushman card</span>}>
        {data?.card ? (
          <p className="mb-0 row" style={{ gap: 8 }}><CircleCheck size={18} className="pt-green" /> Saved on the Health Passport: <strong className="mono" translate="no">{data.card.number}</strong></p>
        ) : (
          <form className="ay-card-form" onSubmit={saveCard}>
            <label className="small" htmlFor="ay-card">Already have a card? Save its number so hospitals can see it.</label>
            <div className="row wrap" style={{ gap: 8 }}>
              <input id="ay-card" className="input" style={{ maxWidth: 280 }} value={cardNo} onChange={(e) => setCardNo(e.target.value)} placeholder="Card / PM-JAY ID number" maxLength={30} />
              <Button type="submit" loading={saving} disabled={cardNo.trim().length < 4}>Save</Button>
            </div>
          </form>
        )}
      </Card>

      {!data?.card && (
        <Card title={`Is ${who} likely covered?`}>
          {senior && (
            <div className="callout green mb-2"><CircleCheck /><span><strong>Everyone aged 70 or older is covered</strong>, whatever the family income (Ayushman Vay Vandana card). Get the card on the official site or at a hospital’s Ayushman desk.</span></div>
          )}
          <div className="ay-qs">
            {QUESTIONS.map((x) => (
              <div key={x.id} className="ay-q">
                <span className="small">{x.q}</span>
                <div className="ay-yn" role="radiogroup" aria-label={x.q}>
                  {['yes', 'no'].map((v) => (
                    <button key={v} type="button" role="radio" aria-checked={answers[x.id] === v} className={cx(answers[x.id] === v && 'on')} onClick={() => setAnswers((a) => ({ ...a, [x.id]: v }))}>{v === 'yes' ? 'Yes' : 'No'}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {(answered > 0 || senior) && (
            <div className={cx('ay-result', (anyYes || senior) && 'likely')}>
              {anyYes || senior
                ? <><strong>{who[0].toUpperCase() + who.slice(1)} may well be covered.</strong> Confirm in two minutes on the official site with your Aadhaar or ration card.</>
                : <><strong>You may not be on the main list</strong> — but lists differ by state, and many states cover more families. It’s still worth checking.</>}
            </div>
          )}
          <div className="row wrap mt-2" style={{ gap: 8 }}>
            <a className="btn" href={OFFICIAL_CHECK} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Check on the official site</a>
            <a className="btn secondary" href={`tel:${HELPLINE}`}><Phone size={16} /> Call {HELPLINE} (free)</a>
          </div>
        </Card>
      )}

      <Card title={<span className="row" style={{ gap: 8 }}><ClipboardList size={18} /> What to take to the hospital</span>}>
        <ul className="ay-list small">
          <li>Aadhaar card of the patient (this is often enough — the hospital can look you up)</li>
          <li>Ration card, if you have one</li>
          <li>Ayushman card, if you have it</li>
          <li>A working mobile number for the one-time code</li>
        </ul>
        <p className="small mb-0">At the hospital, ask for the <strong>Ayushman Mitra</strong> desk — they check your name and handle the paperwork. Covered treatment is cashless: you should not be asked to pay for it.</p>
      </Card>

      <Card title={<span className="row" style={{ gap: 8 }}><Hospital size={18} /> Hospitals near you that accept it</span>}>
        {data?.hospitals?.length ? (
          <div className="ay-hosp">
            {data.hospitals.map((h) => (
              <div key={h.id} className="ay-h">
                <div className="grow">
                  <strong>{h.name}</strong>
                  <div className="tiny muted">{[h.km != null ? `${h.km} km` : null, h.emergency ? '24×7 emergency' : null, h.address].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {h.phone && <a className="btn sm secondary" href={`tel:${h.phone}`}><Phone size={14} /> Call</a>}
                  <a className="btn sm ghost" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([h.name, h.address].join(', '))}`} target="_blank" rel="noreferrer"><Navigation size={14} /> Map</a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="small mb-0">No hospital near you has marked this on Sehatra yet. Call <a href={`tel:${HELPLINE}`}>{HELPLINE}</a> to ask which hospitals near you accept it.</p>
        )}
        <p className="tiny muted mt-2 mb-0">Shown only for hospitals that have told Sehatra they accept PM-JAY. Always confirm at the hospital’s Ayushman desk.</p>
      </Card>

      <p className="tiny muted row" style={{ gap: 6 }}><Info size={13} /> Sehatra is not part of the government scheme — this page only helps you check and find care.</p>
    </div>
  );
}
