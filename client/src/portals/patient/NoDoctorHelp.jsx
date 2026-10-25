import { BellRing, Check, ExternalLink, Phone, Video } from 'lucide-react';
import { Button, useAction } from '../../components/ui';
import { api } from '../../api';
import { usePatientLive } from './shared';

// When no doctor on Sehatra fits yet: what to do right now (real public services), and "tell me when one joins".
export default function NoDoctorHelp({ canAsk = true, district, state }) {
  const alert = usePatientLive(canAsk ? '/patient/doctor-alert' : null, ['patients']);
  const [run, busy] = useAction();
  const ask = (anywhere) => run('ask', () => api.post('/patient/doctor-alert', { anywhere, district, state }), 'Done — we’ll tell you as soon as a doctor joins').then(alert.reload);
  const stop = () => run('stop', () => api.del('/patient/doctor-alert')).then(alert.reload);
  const waiting = alert.data;
  return (
    <div className="card stack mt-2" style={{ gap: 10 }}>
      <strong>Need a doctor today? These work right now:</strong>
      <a className="nd-row" href="https://esanjeevani.mohfw.gov.in/" target="_blank" rel="noreferrer">
        <Video size={20} /><span className="grow"><strong>eSanjeevani</strong> — free video consult with a government doctor<span className="tiny muted block">Ministry of Health · works on any phone</span></span><ExternalLink size={16} />
      </a>
      <a className="nd-row" href="tel:104">
        <Phone size={20} /><span className="grow"><strong>Call 104</strong> — health helpline<span className="tiny muted block">Advice and the nearest government hospital, in most states</span></span>
      </a>
      <a className="nd-row danger" href="tel:108">
        <Phone size={20} /><span className="grow"><strong>Call 108</strong> — emergency ambulance<span className="tiny muted block">Chest pain, breathlessness, bleeding, fits, accident</span></span>
      </a>
      {canAsk && (waiting ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="badge green"><Check size={14} /> We’ll tell you when a doctor joins {waiting.anywhere ? 'Sehatra' : `in ${waiting.district}`}</span>
          <button type="button" className="link-btn tiny" onClick={stop} disabled={busy === 'stop'}>Stop</button>
        </div>
      ) : (
        <div className="row wrap" style={{ gap: 8 }}>
          <Button size="sm" icon={BellRing} loading={busy === 'ask'} onClick={() => ask(false)}>Tell me when a doctor joins near me</Button>
          <button type="button" className="link-btn small" onClick={() => ask(true)}>Any doctor (video is fine)</button>
        </div>
      ))}
    </div>
  );
}
