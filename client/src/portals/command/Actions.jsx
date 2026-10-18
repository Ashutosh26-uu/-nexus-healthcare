import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, PackageX, Gauge, Route as RouteIcon, Truck, Megaphone, Check, Eye, X, ArrowRight, Send, Save, Inbox, Users, ShieldCheck } from 'lucide-react';
import { api } from '../../api';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Pills, Empty, StatusBadge, Button, Modal, Field, PreviewBadge, useAction, cx, fmtNum, timeAgo, fmtDateTime } from '../../components/ui';
import { useGov, regionOptions, ALERT_KIND, alertTitle, isOpen } from './shared';
import AlertAction from './AlertAction';
import { StockMoveModal } from './Supply';

const KIND_ICON = { outbreak: Activity, shortage: PackageX, overload: Gauge };
const LANGS = ['Hindi', 'English', 'Awadhi', 'Bhojpuri', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Kannada', 'Urdu'];

/* ---------- corridor ---------- */
function CorridorModal({ initialFrom, onClose, onDone }) {
  const { data } = useGov();
  const opts = regionOptions(data);
  const defFrom = opts.find((o) => o.district === initialFrom)?.label || (data.scope.level === 'district' ? opts.find((o) => o.district === data.scope.district)?.label : '') || '';
  const [form, setForm] = useState({ from: defFrom, to: '', reason: initialFrom ? 'Overflow load balancing — wait above threshold' : '' });
  const [run, busy] = useAction();
  const fromOpt = opts.find((o) => o.label === form.from);
  // The real teleconsult wait at the origin, when an overload alert reported one — never an estimate.
  const overload = fromOpt && (data.alerts || []).find((a) => a.type === 'overload' && a.district === fromOpt.district && isOpen(a));
  const sorted = opts.filter((o) => o.label !== form.from);

  const submit = async (e) => {
    e.preventDefault();
    const r = await run('open', () => api.post('/corridors', form), `Corridor open: ${form.from.split(',')[0]} → ${form.to.split(',')[0]}`);
    if (r) { onDone(); onClose(); }
  };

  return (
    <Modal open onClose={onClose} title={<>Open a virtual triage corridor <PreviewBadge /></>} subtitle="Records a decision to route teleconsults from an overloaded region to doctors elsewhere.">
      <form className="stack" onSubmit={submit}>
        <div className="cc-corridor-pick">
          <Field label="From (overloaded)">
            <select className="select" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} required>
              <option value="" disabled>Choose region…</option>
              {opts.map((o) => <option key={o.label}>{o.label}</option>)}
            </select>
          </Field>
          <span className="cc-corridor-arrow" aria-hidden="true"><ArrowRight /></span>
          <Field label="To (spare doctors)">
            <select className="select" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} required>
              <option value="" disabled>Choose region…</option>
              {sorted.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Reason">
          <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Dengue surge — teleconsult wait 46 min" />
        </Field>

        {overload?.message && <div className="callout small"><Gauge /><span>Latest report from {fromOpt.district}: {overload.message}</span></div>}
        <div className="callout small"><RouteIcon /><span>Preview: the corridor is recorded and shown to every official in scope, but patient routing doesn&apos;t use it yet — no consults are moved automatically. Close it by hand when the pressure eases.</span></div>

        <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="clay" icon={RouteIcon} loading={busy === 'open'} disabled={!form.from || !form.to}>Approve & open corridor</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- advisory ---------- */
function draftFromAlert(a, scope) {
  if (!a) return null;
  if (a.type === 'outbreak') {
    return {
      title: `${a.disease} cases rising around pin ${a.pincode}`,
      body: a.disease === 'Dengue'
        ? 'Empty coolers, pots and tyres every week. Sleep under a net and wear full sleeves. If fever lasts more than 2 days, see a doctor and get tested.'
        : 'Wash hands often, cover coughs and rest at home if you have fever. Elders and children with breathlessness should see a doctor straight away.',
      region: a.district,
    };
  }
  return { title: '', body: '', region: scope.level === 'district' ? scope.district : 'All India' };
}

function AdvisoryComposer({ prefill, onSaved }) {
  const { data } = useGov();
  const defRegion = data.scope.level === 'district' ? data.scope.district : 'All India';
  const [form, setForm] = useState(() => ({ title: '', body: '', region: defRegion, languages: ['Hindi', 'English'], ...(prefill || {}) }));
  const [reviewed, setReviewed] = useState(false);
  const [run, busy] = useAction();
  const toggle = (l) => setForm((f) => ({ ...f, languages: f.languages.includes(l) ? f.languages.filter((x) => x !== l) : [...f.languages, l] }));

  const save = async (publish) => {
    const r = await run(publish ? 'pub' : 'draft', () => api.post('/advisories', { ...form, publish }), publish ? 'Advisory published to patients in the region' : 'Saved as draft');
    if (r) { setForm({ title: '', body: '', region: defRegion, languages: ['Hindi', 'English'] }); setReviewed(false); onSaved?.(); }
  };
  const valid = form.title.trim() && form.body.trim() && form.languages.length;

  return (
    <div className="stack">
      <Field label="Headline"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Dengue cases rising in Barabanki" maxLength={90} /></Field>
      <Field label="Message" hint={`${form.body.length}/320 · plain words, one clear action. It will be translated for each language below.`}>
        <textarea className="textarea" rows={4} maxLength={320} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="What should people do?" />
      </Field>
      <Field label="Region">
        {data.scope.level === 'district'
          ? <input className="input" value={form.region} readOnly />
          : <input className="input" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} list="cc-adv-regions" />}
        <datalist id="cc-adv-regions">{['All India', ...(data.regions || []).map((r) => r.state), ...(data.regions || []).flatMap((r) => r.districts)].map((r) => <option key={r} value={r} />)}</datalist>
      </Field>
      <Field label="Languages">
        <div className="chip-select">
          {LANGS.map((l) => <button key={l} type="button" className={cx('chip', form.languages.includes(l) && 'on')} onClick={() => toggle(l)}>{l}</button>)}
        </div>
      </Field>
      <label className="check small"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> I have reviewed this advisory and confirm it can go to the public.</label>
      <div className="row wrap" style={{ gap: 8, justifyContent: 'flex-end' }}>
        {/* Either request in flight disables both — one advisory per click, never a draft and a published copy. */}
        <Button variant="secondary" icon={Save} loading={busy === 'draft'} disabled={!valid || !!busy} onClick={() => save(false)}>Save draft</Button>
        <Button icon={Send} loading={busy === 'pub'} disabled={!valid || !reviewed || !!busy} onClick={() => save(true)}>Publish now</Button>
      </div>
    </div>
  );
}

function AdvisoryList() {
  const { data, reload } = useGov();
  const [run, busy] = useAction();
  const [confirm, setConfirm] = useState(null);
  const list = data.advisories || [];
  const setStatus = async (a, status) => {
    const r = await run(a.id, () => api.put(`/advisories/${a.id}`, { status }), status === 'published' ? 'Advisory published' : 'Advisory withdrawn to draft');
    if (r) { setConfirm(null); reload(); }
  };
  if (!list.length) return <Empty icon={Megaphone} title="No advisories yet">Drafts and published advisories will appear here.</Empty>;
  return (
    <>
      <div className="stack" style={{ gap: 10 }}>
        {list.map((a) => (
          <div key={a.id} className="cc-adv">
            <div className="row between top" style={{ gap: 10 }}>
              <div className="grow">
                <div className="small" style={{ fontWeight: 700 }}>{a.title}</div>
                <div className="tiny muted">{a.region} · {(a.languages || []).join(', ')} · {timeAgo(a.createdAt)}{a.by ? ` · ${a.by}` : ''}</div>
              </div>
              <StatusBadge status={a.status} />
            </div>
            <p className="small mb-0 mt-1" style={{ color: 'var(--ink-2)' }}>{a.body}</p>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              {a.status === 'draft'
                ? <Button size="sm" icon={Send} onClick={() => setConfirm(a)}>Publish</Button>
                : <Button size="sm" variant="ghost" loading={busy === a.id} onClick={() => setStatus(a, 'draft')}>Withdraw</Button>}
            </div>
          </div>
        ))}
      </div>
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Publish this advisory?"
        subtitle={confirm?.title}
        footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button><Button icon={Send} loading={busy === confirm?.id} onClick={() => setStatus(confirm, 'published')}>Yes, publish</Button></>}
      >
        <p className="small">It goes out as an app notification and on kiosk screens in <strong>{confirm?.region}</strong>, in {(confirm?.languages || []).join(', ')}.</p>
        <div className="callout sky small"><ShieldCheck /> A human official must confirm every public advisory. Your name is recorded with it.</div>
      </Modal>
    </>
  );
}

/* ---------- page ---------- */
export default function Actions() {
  const { data, reload } = useGov();
  const [params, setParams] = useSearchParams();
  // ?compose=<alertId> (from a confirmed alert) or ?disease=&district=&pin= (from a Health Weather forecast).
  const fcDisease = params.get('disease');
  const composeFor = params.get('compose') || (fcDisease ? `fc-${fcDisease}-${params.get('pin')}` : null);
  const prefill = useMemo(() => draftFromAlert(data.alerts.find((a) => a.id === composeFor), data.scope)
    || (fcDisease ? draftFromAlert({ type: 'outbreak', disease: fcDisease, district: data.scope.level === 'district' ? data.scope.district : params.get('district'), pincode: params.get('pin') }, data.scope) : null), [composeFor]); // eslint-disable-line react-hooks/exhaustive-deps
  // Arriving from a forecast's "Act on this": bring the pre-filled composer into view.
  // (after the layout's own scroll-to-top on navigation has run)
  useEffect(() => {
    if (!fcDisease) return undefined;
    const t = setTimeout(() => document.getElementById('cc-compose')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    return () => clearTimeout(t);
  }, [fcDisease]);
  const [filter, setFilter] = useState('open');
  const [act, setAct] = useState(null);
  const [corridor, setCorridor] = useState(null);
  const [move, setMove] = useState(null);
  const [run, busy] = useAction();

  const alerts = [...data.alerts].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || new Date(b.createdAt) - new Date(a.createdAt));
  const shown = filter === 'open' ? alerts.filter(isOpen) : alerts;
  const corridors = data.corridors || [];
  const active = corridors.filter((c) => c.status === 'active');
  const closed = corridors.filter((c) => c.status !== 'active');

  const closeCorridor = async (c) => {
    const r = await run(c.id, () => api.post(`/corridors/${c.id}/close`), 'Corridor closed');
    if (r) reload();
  };

  return (
    <>
      <PageHeader eyebrow="Alerts & actions" title="Decide and act" subtitle="Every signal in one inbox, and the levers you can pull: corridors, stock and public advice.">
        <Button variant="secondary" icon={Truck} onClick={() => setMove({})}>Order stock movement</Button>
        <Button variant="clay" icon={RouteIcon} onClick={() => setCorridor({})}>Open corridor</Button>
      </PageHeader>

      <Card className="mb-2" title={<h3>Alert inbox</h3>} action={<Pills value={filter} onChange={setFilter} options={[{ value: 'open', label: `Open (${alerts.filter(isOpen).length})` }, { value: 'all', label: 'All' }]} />}>
        {shown.length === 0 ? <Empty icon={Inbox} title="Inbox zero">No open alerts. New signals appear here the moment they are raised.</Empty> : (
          <div className="cc-inbox">
            {shown.map((a) => {
              const k = ALERT_KIND[a.type] || {};
              const Icon = KIND_ICON[a.type] || Activity;
              return (
                <div key={a.id} className={cx('cc-inbox-row', !isOpen(a) && 'done')}>
                  <span className={cx('cc-inbox-icon', k.tone)}><Icon /></span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <strong className="small">{alertTitle(a)}</strong>
                      <StatusBadge status={a.status} />
                      {a.confidence != null && <span className="tiny muted">{Math.round(a.confidence * 100)}% confidence</span>}
                    </div>
                    <div className="tiny muted">{a.message}</div>
                    <div className="tiny muted">{k.label} · {a.district}, {a.state} · {timeAgo(a.createdAt)}{a.actions?.length ? ` · last: ${a.actions.at(-1).action} (${a.actions.at(-1).by})` : ''}</div>
                  </div>
                  {isOpen(a) && (
                    <div className="cc-inbox-actions">
                      {a.type === 'overload' && <Button size="sm" variant="clay" icon={RouteIcon} onClick={() => setCorridor({ from: a.district })}>Open corridor</Button>}
                      {a.type === 'shortage' && <Button size="sm" variant="soft" icon={Truck} onClick={() => setMove({ drug: a.drug })}>Move stock</Button>}
                      {a.type === 'outbreak' && <Button size="sm" variant="clay" icon={Check} onClick={() => setAct({ alert: a, action: 'confirm' })}>Confirm</Button>}
                      {a.status !== 'acknowledged' && <Button size="sm" variant="secondary" icon={Eye} onClick={() => setAct({ alert: a, action: 'acknowledge' })}>Acknowledge</Button>}
                      {a.type === 'outbreak'
                        ? <Button size="sm" variant="ghost" icon={X} onClick={() => setAct({ alert: a, action: 'dismiss' })}>Dismiss</Button>
                        : <Button size="sm" variant="ghost" icon={Check} onClick={() => setAct({ alert: a, action: 'resolve' })}>Resolve</Button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="mb-2" title={<div><h3>Virtual triage corridors <PreviewBadge /></h3><p className="tiny muted mb-0">Recorded decisions to route an overloaded region&apos;s teleconsults elsewhere. Patient routing doesn&apos;t use them yet.</p></div>} action={<Button size="sm" variant="secondary" icon={RouteIcon} onClick={() => setCorridor({})}>New corridor</Button>}>
        {active.length === 0 ? <Empty icon={RouteIcon} title="No active corridors">Open one when a region's teleconsult wait crosses its threshold.</Empty> : (
          <div className="cc-corridors">
            {active.map((c) => (
              <div key={c.id} className="cc-corridor">
                <div className="cc-corridor-route">
                  <div><span className="tiny muted">From</span><strong>{c.from}</strong></div>
                  <span className="cc-corridor-line"><span /></span>
                  <div><span className="tiny muted">To</span><strong>{c.to}</strong></div>
                </div>
                <div className="row between wrap" style={{ gap: 10 }}>
                  <div>
                    <div className="row" style={{ gap: 6 }}><Users size={15} className="muted" /><strong>{fmtNum(c.patientsRouted)}</strong><span className="small muted">patients routed</span></div>
                    <div className="tiny muted">{c.reason} · opened by {c.openedBy} · {timeAgo(c.createdAt)}</div>
                  </div>
                  <Button size="sm" variant="secondary" loading={busy === c.id} onClick={() => closeCorridor(c)}>Close corridor</Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {closed.length > 0 && (
          <details className="cc-closed mt-2">
            <summary className="small muted">{closed.length} closed corridor{closed.length > 1 ? 's' : ''}</summary>
            {closed.map((c) => <div key={c.id} className="tiny muted" style={{ padding: '6px 0' }}>{c.from} → {c.to} · {fmtNum(c.patientsRouted)} routed · closed {fmtDateTime(c.closedAt)}</div>)}
          </details>
        )}
      </Card>

      <div className="grid two">
        <Card id="cc-compose" title={<div><h3>Send a public advisory</h3><p className="tiny muted mb-0">{prefill?.title ? `Pre-filled from the ${fcDisease ? 'forecast' : 'confirmed alert'} — edit before sending.` : 'Short, practical, in the languages people read.'}</p></div>}>
          <AdvisoryComposer key={composeFor || 'blank'} prefill={prefill} onSaved={() => { if (composeFor) setParams({}); reload(); }} />
        </Card>
        <Card title="Advisories">
          <AdvisoryList />
        </Card>
      </div>

      {act && <AlertAction alert={act.alert} action={act.action} onClose={() => setAct(null)} onDone={reload} />}
      {corridor && <CorridorModal initialFrom={corridor.from} onClose={() => setCorridor(null)} onDone={reload} />}
      {move && <StockMoveModal open onClose={() => setMove(null)} drug={move.drug} />}
    </>
  );
}
