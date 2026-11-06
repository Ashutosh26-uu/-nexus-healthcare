import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquareWarning, FileText, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { Button, Field, Modal, Switch, fmtDate, fmtDateTime, useToast } from './ui';
import { NoticeBody, usePrivacyNotice } from './PrivacyNotice';

// "Privacy & consent", from every portal's account menu (DPDP): what you agreed to and when, switch the optional
// Saathi AI consent on or off in one tap, read the notice, and raise a complaint we answer within 90 days.
const TOPICS = [
  { key: 'access', label: 'I want to see my data' },
  { key: 'correction', label: 'Something about me is wrong' },
  { key: 'erasure', label: 'Erase my data' },
  { key: 'consent', label: 'About my consent' },
  { key: 'misuse', label: 'I think my data was misused' },
  { key: 'other', label: 'Something else' },
];

export default function PrivacyCenter({ open, onClose }) {
  const toast = useToast();
  const { user, refresh } = useAuth();
  const { lang } = useI18n();
  const n = usePrivacyNotice();
  const [state, setState] = useState(null);
  const [mine, setMine] = useState([]);
  const [view, setView] = useState('home'); // home | notice | complain
  const [topic, setTopic] = useState('access');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => Promise.all([api.get('/me/consent'), api.get('/grievances')]).then(([c, g]) => { setState(c); setMine(g); }).catch((e) => setErr(e.message));
  useEffect(() => { if (open) { setView('home'); setErr(''); load(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn) => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const setAi = (ai) => run(async () => {
    await api.post('/me/consent', { version: state.version, care: true, ai, lang });
    await Promise.all([load(), refresh()]);
    toast(ai ? 'Saathi AI answers are on.' : 'Consent withdrawn — Saathi now uses only its built-in answers.');
  });
  const complain = () => run(async () => {
    await api.post('/grievances', { topic, text });
    setText(''); setView('home'); await load();
    toast('Complaint received. We will reply within 90 days — usually much sooner.');
  });

  const cur = state?.current;
  const patient = ['patient', 'caregiver'].includes(user?.role);
  return (
    <Modal open={open} onClose={onClose} title="Privacy & consent" subtitle="What you agreed to, and how to change it.">
      {!state && !err && <p className="muted">Loading…</p>}
      {state && view === 'home' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="card tint flat">
            <strong>Running your care</strong>
            <p className="small muted mb-0">{cur ? `Agreed on ${fmtDate(cur.at)} (notice ${cur.version}).` : 'Not agreed to the current notice yet.'} Needed to use Sehatra.{patient ? ' To stop completely, delete your account.' : ' To stop completely, ask us to close your account below.'}</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <strong>Saathi AI answers</strong>
              <p className="small muted mb-0">{n?.purposes.find((p) => p.key === 'ai')?.text}</p>
            </div>
            <Switch checked={!!cur?.ai} onChange={setAi} label="Saathi AI answers" />
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <Button variant="secondary" size="sm" icon={FileText} onClick={() => setView('notice')}>Read the notice</Button>
            <Button variant="secondary" size="sm" icon={MessageSquareWarning} onClick={() => setView('complain')}>Raise a privacy complaint</Button>
            {patient && <Link to="/patient/settings" className="btn ghost sm" onClick={onClose}><Trash2 size={15} /> Delete my account</Link>}
          </div>
          {mine.length > 0 && (
            <div>
              <strong>Your complaints</strong>
              <ul className="list" style={{ marginTop: 6 }}>
                {mine.map((g) => (
                  <li key={g.id} className="small" style={{ padding: '6px 0' }}>
                    <span className={`badge tiny ${g.status === 'open' ? 'sun' : 'green'}`}>{g.status === 'open' ? 'Open' : 'Resolved'}</span> {TOPICS.find((t) => t.key === g.topic)?.label} · {fmtDate(g.at)}
                    {g.status === 'open' && <span className="tiny muted"> · reply by {fmtDate(g.dueBy)}</span>}
                    {g.replies.map((r) => <div key={r.at} className="tiny muted" style={{ marginTop: 4 }}>Reply ({fmtDateTime(r.at)}): {r.text}</div>)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {state.history?.length > 0 && (
            <details className="small">
              <summary>Consent history</summary>
              <ul className="tiny muted">{state.history.map((h) => <li key={h.id}>{fmtDateTime(h.at)} · notice {h.version} · Saathi AI {h.ai ? 'on' : 'off'} · {h.via}</li>)}</ul>
            </details>
          )}
        </div>
      )}
      {view === 'notice' && (
        <div className="stack">
          <NoticeBody n={n} />
          <Button variant="ghost" onClick={() => setView('home')}>Back</Button>
        </div>
      )}
      {view === 'complain' && (
        <div className="stack">
          <Field label="What is it about?">
            <select className="input" value={topic} onChange={(e) => setTopic(e.target.value)}>
              {TOPICS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Tell us what happened">
            <textarea className="input" rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened, and what would you like us to do?" />
          </Field>
          <p className="tiny muted mb-0">We reply within 90 days. If you are not satisfied, you can approach the Data Protection Board of India.</p>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setView('home')}>Back</Button>
            <Button loading={busy} onClick={complain} disabled={text.trim().length < 10}>Send complaint</Button>
          </div>
        </div>
      )}
      {err && <div className="form-error mt-2" role="alert">{err}</div>}
    </Modal>
  );
}
