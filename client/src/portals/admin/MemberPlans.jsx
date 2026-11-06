import { useState } from 'react';
import { BadgeCheck, Plus, Save } from 'lucide-react';
import { api } from '../../api';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Card, Empty, Field, Switch, fmtMoney, useAction } from '../../components/ui';
import { useLive } from '../../live';
import { LiveGate } from './shared';

// Membership plans patients can buy (server/membership.js). Nothing shows to patients until a plan is published
// here; changing a plan never changes what an existing member already paid for this month.
const EMPTY = { name: '', price: '', consults: '', family: false, note: '', active: true };

function PlanForm({ initial = EMPTY, onSaved, onCancel }) {
  const [run, busy] = useAction();
  const [f, setF] = useState({ ...initial, price: String(initial.price ?? ''), consults: String(initial.consults ?? '') });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const body = { ...f, price: Number(f.price), consults: Number(f.consults) };
    const ok = await run('save', () => (initial.id ? api.put(`/admin/member-plans/${initial.id}`, body) : api.post('/admin/member-plans', body)), initial.id ? 'Plan updated' : 'Plan published');
    if (ok) onSaved();
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="grid two">
        <Field label="Plan name"><input className="input" value={f.name} maxLength={60} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Family Care" /></Field>
        <Field label="Price per month (₹)"><input className="input" inputMode="numeric" value={f.price} onChange={(e) => set('price', e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Video consults included per month"><input className="input" inputMode="numeric" value={f.consults} onChange={(e) => set('consults', e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Short note (optional)"><input className="input" value={f.note} maxLength={300} onChange={(e) => set('note', e.target.value)} placeholder="Shown under the plan" /></Field>
      </div>
      <label className="row" style={{ gap: 10 }}><Switch checked={f.family} onChange={(v) => set('family', v)} label="Covers the whole family" /> <span className="small">Covers every family profile on the account</span></label>
      <label className="row" style={{ gap: 10 }}><Switch checked={f.active} onChange={(v) => set('active', v)} label="On sale" /> <span className="small">On sale to patients</span></label>
      <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button icon={Save} loading={busy === 'save'} onClick={save}>{initial.id ? 'Save' : 'Publish plan'}</Button>
      </div>
    </div>
  );
}

export default function MemberPlans() {
  const live = useLive('/admin/member-plans', ['membership', 'admin']);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  return (
    <>
      <PageHeader eyebrow="Revenue" title="Membership plans" subtitle="Monthly plans with included video consults. Patients see only the plans you publish here.">
        {!adding && <Button icon={Plus} onClick={() => setAdding(true)}>New plan</Button>}
      </PageHeader>
      <LiveGate live={live}>
        {(d) => (
          <div className="stack">
            <p className="small muted mb-0">{d.members} active member{d.members === 1 ? '' : 's'}. Doctors are paid their normal fee for plan-covered consults.</p>
            {adding && <Card title="New plan"><PlanForm onSaved={() => { setAdding(false); live.reload(); }} onCancel={() => setAdding(false)} /></Card>}
            <Card>
              {d.plans.length === 0 && !adding
                ? <Empty icon={BadgeCheck} title="No plans yet">Publish a plan and it appears in every patient's Wallet.</Empty>
                : (
                  <div className="stack">
                    {d.plans.map((p) => (editing === p.id
                      ? <PlanForm key={p.id} initial={p} onSaved={() => { setEditing(null); live.reload(); }} onCancel={() => setEditing(null)} />
                      : (
                        <div key={p.id} className="card flat row between wrap" style={{ gap: 10 }}>
                          <div>
                            <strong>{p.name}</strong> <span className={`badge tiny ${p.active ? 'green' : ''}`}>{p.active ? 'On sale' : 'Off sale'}</span>
                            <div className="small muted">{fmtMoney(p.price)}/month · {p.consults} video consult{p.consults > 1 ? 's' : ''}{p.family ? ' · whole family' : ''}{p.note ? ` · ${p.note}` : ''}</div>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(p.id)}>Edit</Button>
                        </div>
                      )))}
                  </div>
                )}
            </Card>
          </div>
        )}
      </LiveGate>
    </>
  );
}
