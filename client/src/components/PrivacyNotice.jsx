import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { Button, Modal } from './ui';

// The DPDP privacy notice (server/dpdp.js holds the text and version). Shown before sign-up, and once to every
// existing account until they accept the current version.
let cached = null;
export function usePrivacyNotice() {
  const [n, setN] = useState(cached);
  useEffect(() => {
    if (cached) return undefined;
    let alive = true;
    api.get('/public/privacy-notice').then((x) => { cached = x; if (alive) setN(x); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return n;
}

export function NoticeBody({ n }) {
  if (!n) return <p className="muted">Loading…</p>;
  return (
    <div className="privacy-notice small">
      <h4>What we collect</h4>
      <ul>{n.collect.map((x) => <li key={x}>{x}</li>)}</ul>
      <h4>Why we use it</h4>
      <ul>{n.purposes.map((p) => <li key={p.key}><strong>{p.title}.</strong> {p.text}</li>)}</ul>
      <h4>Your rights</h4>
      <ul>{n.rights.map((x) => <li key={x}>{x}</li>)}</ul>
      <h4>How long we keep it</h4>
      <p>{n.retention}</p>
      <h4>Complaints</h4>
      <p>
        {n.grievance.officer ? <>Grievance officer: <strong translate="no">{n.grievance.officer}</strong>. </> : null}
        {n.grievance.email ? <>Email <a href={`mailto:${n.grievance.email}`} translate="no">{n.grievance.email}</a>, or use </> : 'Use '}
        {n.grievance.inApp}.
      </p>
      <p className="tiny muted mb-0">Notice version {n.version}. Full details: <a href="/privacy" target="_blank" rel="noreferrer">Privacy policy</a>.</p>
    </div>
  );
}

// Tick-boxes for sign-up: agreeing to the notice is required; Saathi AI is optional and starts unticked.
export function ConsentChoices({ value, onChange }) {
  const n = usePrivacyNotice();
  const [open, setOpen] = useState(false);
  const ai = n?.purposes.find((p) => p.key === 'ai');
  return (
    <div className="consent-choices stack" style={{ gap: 8 }}>
      <label className="consent-line">
        <input type="checkbox" checked={!!value.care} onChange={(e) => onChange({ ...value, care: e.target.checked })} />
        <span className="small">I have read the <button type="button" className="link-btn" onClick={() => setOpen(true)}>privacy notice</button> and agree to Sehatra using my details to run my care.</span>
      </label>
      {ai && (
        <label className="consent-line">
          <input type="checkbox" checked={!!value.ai} onChange={(e) => onChange({ ...value, ai: e.target.checked })} />
          <span className="small"><strong>Optional:</strong> {ai.text}</span>
        </label>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Privacy notice" footer={<Button onClick={() => setOpen(false)}>Close</Button>}>
        <NoticeBody n={n} />
      </Modal>
    </div>
  );
}
export const consentPayload = (n, value, lang) => ({ version: n?.version, care: !!value.care, ai: !!value.ai, lang });

// Existing accounts: shown once per notice version, on top of any portal. Can't be dismissed without a choice —
// the alternative to agreeing is signing out (and, for patients, deleting the account from Settings).
export function NoticeGate() {
  const { user, refresh, signOut } = useAuth();
  const { lang } = useI18n();
  const n = usePrivacyNotice();
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!user || !n || user.consent?.version === n.version) return null;
  const aiPurpose = n.purposes.find((p) => p.key === 'ai');
  const accept = async () => {
    setBusy(true); setErr('');
    try { await api.post('/me/consent', { version: n.version, care: true, ai, lang }); await refresh(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open title="Our privacy notice" subtitle="Please read how we use your information. You can change your choices any time from the account menu → Privacy & consent."
      footer={<><Button variant="ghost" onClick={signOut}>Sign out</Button><Button icon={ShieldCheck} loading={busy} onClick={accept}>I agree</Button></>}>
      <div className="privacy-gate" />
      <NoticeBody n={n} />
      {aiPurpose && (
        <label className="consent-line mt-2">
          <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
          <span className="small"><strong>Optional — Saathi AI answers.</strong> {aiPurpose.text}</span>
        </label>
      )}
      {err && <div className="form-error mt-2">{err}</div>}
    </Modal>
  );
}
