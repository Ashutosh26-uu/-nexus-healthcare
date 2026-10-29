import { useState } from 'react';
import { PlugZap, KeyRound, Copy, X, Webhook, Send, ShieldCheck, BookOpen } from 'lucide-react';
import { Button, Card, Field, Modal, timeAgo, useAction, useToast } from './ui';
import { api } from '../api';
import { useLive } from '../live';

// What each kind of software can do with its key — shown so the facility's IT person knows what to build.
const DOCS = {
  hmis: {
    does: ['Keeps the bed counts here in step with your HMIS', 'Pulls referrals sent to your hospital', 'Gets a webhook the moment a new referral arrives'],
    calls: ['GET  /api/integration/v1/beds', 'PUT  /api/integration/v1/beds   { "beds": [{ "type": "icu", "total": 12, "occupied": 9 }] }', 'GET  /api/integration/v1/referrals?since=2026-10-01T00:00:00Z'],
    events: 'referral.created',
  },
  lis: {
    does: ['Pulls paid orders with LOINC test codes and sample IDs', 'Moves orders to received / processing', 'Sends analyser results to your pathologist to sign — software can never release a report on its own'],
    calls: ['GET  /api/integration/v1/lab-orders?status=collected,received', 'PUT  /api/integration/v1/lab-orders/{id}/status   { "status": "processing" }', 'POST /api/integration/v1/lab-orders/{id}/results   { "results": [{ "code": "718-7", "value": "11.2", "unit": "g/dL", "range": "12-15", "flag": "low" }] }'],
    events: 'lab_order.created',
  },
  billing: {
    does: ['Keeps your stock here in step with your billing software', 'Takes counter sales off your stock', 'Works with any software that can call a web API — ask your software provider'],
    calls: ['GET  /api/integration/v1/stock', 'PUT  /api/integration/v1/stock   { "mode": "set", "rows": [{ "drug": "Paracetamol 500mg", "batch": "PCM24A", "expiry": "2027-08-31", "qty": 480 }] }', 'POST /api/integration/v1/sales   { "lines": [{ "drug": "Paracetamol 500mg", "qty": 10 }] }'],
    events: null,
  },
};

// Connect a hospital's HMIS, a lab's LIS or a chemist's billing software with a key (and optionally a webhook).
export default function SoftwareConnect({ intro }) {
  const { data, reload } = useLive('/facility/integrations', ['integrations']);
  const [adding, setAdding] = useState(false);
  const [made, setMade] = useState(null);
  const [docs, setDocs] = useState(false);
  const [run, busy] = useAction();
  if (!data) return null;
  const doc = DOCS[data.kind];
  const off = async (k) => {
    if (!window.confirm(`Switch off “${k.name}”? It stops working straight away.`)) return;
    if (await run(`off-${k.id}`, () => api.del(`/facility/integrations/${k.id}`), 'Switched off')) reload();
  };
  const test = async (k) => {
    const r = await run(`test-${k.id}`, () => api.post(`/facility/integrations/${k.id}/test`));
    if (r) reload();
  };
  return (
    <Card title={<h3 className="row" style={{ gap: 8 }}><PlugZap size={18} /> {data.label}</h3>} action={<Button size="sm" variant="ghost" icon={BookOpen} onClick={() => setDocs(true)}>For your IT person</Button>}>
      <p className="small muted mt-0">{intro}</p>
      <ul className="small" style={{ paddingLeft: 18 }}>{doc.does.map((t) => <li key={t}>{t}</li>)}</ul>
      {data.keys.length === 0 ? <p className="small muted">Nothing connected yet.</p> : (
        <div className="stack" style={{ gap: 8 }}>
          {data.keys.map((k) => (
            <div key={k.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <strong className="small">{k.name}</strong> <span className="mono tiny muted" dir="ltr">{k.keyPrefix}…</span>
                <div className="tiny muted">Added {timeAgo(k.createdAt)} by {k.createdBy} · {k.lastUsedAt ? `last used ${timeAgo(k.lastUsedAt)}` : 'not used yet'}</div>
                {k.webhookUrl && (
                  <div className="tiny muted" style={{ wordBreak: 'break-all' }}>
                    <Webhook size={12} /> {new URL(k.webhookUrl).host}
                    {k.webhookPausedAt ? <span style={{ color: 'var(--rose)' }}> · paused — save the address again to resume</span>
                      : k.lastDelivery ? <span style={{ color: k.lastDelivery.ok ? undefined : 'var(--rose)' }}> · last {k.lastDelivery.event} {timeAgo(k.lastDelivery.at)}: {k.lastDelivery.ok ? 'delivered' : k.lastDelivery.error}</span> : ''}
                  </div>
                )}
              </div>
              {k.webhookUrl && <Button size="sm" variant="ghost" icon={Send} loading={busy === `test-${k.id}`} onClick={() => test(k)}>Test</Button>}
              <button type="button" className="icon-btn" aria-label={`Switch off ${k.name}`} onClick={() => off(k)} disabled={busy === `off-${k.id}`}><X size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="row wrap mt-2" style={{ gap: 8 }}>
        <Button size="sm" icon={KeyRound} onClick={() => setAdding(true)}>Connect software</Button>
      </div>
      <AddModal open={adding} kind={data.kind} onClose={() => setAdding(false)} onMade={(k) => { setAdding(false); setMade(k); reload(); }} />
      <MadeModal made={made} onClose={() => setMade(null)} />
      <DocsModal open={docs} doc={doc} onClose={() => setDocs(false)} />
    </Card>
  );
}

function AddModal({ open, kind, onClose, onMade }) {
  const [name, setName] = useState('');
  const [hook, setHook] = useState('');
  const [run, busy] = useAction();
  if (!open) return null;
  const save = async () => {
    const r = await run('add', () => api.post('/facility/integrations', { name, webhookUrl: hook.trim() || undefined }));
    if (r) { setName(''); setHook(''); onMade(r); }
  };
  return (
    <Modal open onClose={onClose} title="Connect software" subtitle="You'll get a key to paste into your software's settings. Only your facility's own data can be reached with it."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button icon={KeyRound} loading={busy === 'add'} disabled={name.trim().length < 2} onClick={save}>Create key</Button></>}>
      <div className="stack">
        <Field label="Which software?" hint={kind === 'billing' ? 'e.g. Marg ERP, GoFrugal, Tally, your own' : kind === 'lis' ? 'e.g. Lab analyser PC, LIS server' : 'e.g. Hospital HMIS'}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
        </Field>
        {kind !== 'billing' && (
          <Field label="Webhook address (optional)" hint={`Your software is told instantly when there's a ${kind === 'lis' ? 'new lab order' : 'new referral'}. Must start with https://`}>
            <input className="input" type="url" inputMode="url" value={hook} onChange={(e) => setHook(e.target.value)} placeholder="https://" dir="ltr" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function MadeModal({ made, onClose }) {
  const toast = useToast();
  if (!made) return null;
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copied'); } catch { toast('Press and hold to copy', 'error'); } };
  return (
    <Modal open onClose={onClose} title="Copy your key now" subtitle="For safety it's shown only once. If it's lost, switch this one off and make a new one."
      footer={<Button onClick={onClose}>I've saved it</Button>}>
      <div className="stack">
        <Field label="Key"><div className="row" style={{ gap: 8 }}><code className="grow mono small" style={{ wordBreak: 'break-all' }} dir="ltr">{made.key}</code><button type="button" className="icon-btn" aria-label="Copy key" onClick={() => copy(made.key)}><Copy size={16} /></button></div></Field>
        {made.webhookUrl && <Field label="Webhook signing secret" hint="Your software checks each webhook with this (HMAC-SHA256)."><div className="row" style={{ gap: 8 }}><code className="grow mono small" style={{ wordBreak: 'break-all' }} dir="ltr">{made.webhookSecret}</code><button type="button" className="icon-btn" aria-label="Copy secret" onClick={() => copy(made.webhookSecret)}><Copy size={16} /></button></div></Field>}
        <div className="callout sky small"><ShieldCheck /><span>Keep it like a password: anyone with it can update your facility's data. Every call is logged under the software's name.</span></div>
      </div>
    </Modal>
  );
}

function DocsModal({ open, doc, onClose }) {
  if (!open) return null;
  const base = window.location.origin;
  return (
    <Modal open wide onClose={onClose} title="Connecting your software" subtitle="A short guide for whoever looks after your computers or software." footer={<Button onClick={onClose}>Close</Button>}>
      <div className="stack small">
        <p className="mb-0">Send the key with every call: <code dir="ltr">Authorization: Bearer sehatra_…</code> to <code dir="ltr">{base}</code>. Up to 4 calls a second. Answers are JSON.</p>
        <pre className="mono tiny" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--paper-2, var(--paper))', padding: 10, borderRadius: 8 }} dir="ltr">{doc.calls.join('\n')}</pre>
        {doc.events && <p className="mb-0">Webhook: a POST of <code dir="ltr">{'{ "event": "' + doc.events + '", "id", "facilityId", "occurredAt" }'}</code> — only ids, never patient details; fetch the rest with your key. Check it with <code dir="ltr">X-Sehatra-Signature: sha256=HMAC(secret, X-Sehatra-Timestamp + "." + body)</code>. Failed deliveries are retried in order.</p>}
        {!doc.events && <p className="mb-0 muted">Software that can't call a web API (Marg, GoFrugal and most others can export stock as CSV): import the file from the stock screen with “Import from billing software”.</p>}
      </div>
    </Modal>
  );
}
