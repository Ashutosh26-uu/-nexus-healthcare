import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ChevronRight, X, Sparkles } from 'lucide-react';
import { Card, Switch } from '../../components/ui';
import { useLive } from '../../live';
import { useEasyMode } from '../../components/easyMode';

const HIDE = 'oc_getting_started_hidden';

// For someone new (nothing booked, no prescriptions yet): one short list of what makes Sehatra useful, with
// progress — instead of three empty cards all saying "nothing here yet".
export default function GettingStarted({ p, profiles }) {
  const circle = useLive('/patient/circle', ['patients']);
  const [easy, toggleEasy] = useEasyMode();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HIDE) === '1'; } catch { return false; } });
  if (hidden) return null;
  const steps = [
    { done: p.profileComplete !== false && !(p.bookingMissing || []).length, to: '/patient/complete-profile', title: 'Finish your profile', text: 'Age and address — needed to book a doctor' },
    { done: p.bloodGroup && p.bloodGroup !== 'Unknown', to: '/patient/settings', title: 'Add blood group and allergies', text: 'They show on your emergency card' },
    { done: profiles.length > 1, to: '/patient/family?add=1', title: 'Add your family', text: 'Parents and children — vaccines, BP and visits for everyone' },
    { done: (circle.data?.members || []).length > 0, to: '/patient/sos', title: 'Set up your emergency circle', text: 'Family who get your SOS alert at once' },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (!left) return null;
  const hide = () => { try { localStorage.setItem(HIDE, '1'); } catch { /* ignore */ } setHidden(true); };
  return (
    <Card title={<h3 className="row" style={{ gap: 8 }}><Sparkles size={18} /> Get started · {steps.length - left} of {steps.length} done</h3>}
      action={<button type="button" className="icon-btn" aria-label="Hide this list" onClick={hide}><X size={16} /></button>}>
      <div className="gs-bar"><span style={{ width: `${((steps.length - left) / steps.length) * 100}%` }} /></div>
      <div className="stack" style={{ gap: 4 }}>
        {steps.map((s) => (
          <Link key={s.title} to={s.to} className={`gs-step ${s.done ? 'done' : ''}`}>
            {s.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
            <span className="grow"><strong className="small">{s.title}</strong><span className="tiny muted block">{s.text}</span></span>
            {!s.done && <ChevronRight size={16} />}
          </Link>
        ))}
      </div>
      <div className="row mt-2" style={{ gap: 10 }}>
        <Switch checked={easy} onChange={toggleEasy} label="Bigger text and a Listen button" />
        <span className="small grow">Bigger text and a <strong>Listen</strong> button — easier to read</span>
      </div>
      <p className="tiny muted mb-0 mt-1">When you book a doctor or get a prescription, it shows up here.</p>
    </Card>
  );
}
