import { useState } from 'react';
import { GraduationCap, Plus, Save, Trash2, Search } from 'lucide-react';
import { api } from '../../api';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Card, Empty, Field, Switch, useAction } from '../../components/ui';
import { useLive } from '../../live';
import { LiveGate } from './shared';

// Teach Saathi (server/saathifaq.js): the team's own answers, given word for word when a message contains a
// trigger word. They win over the AI and the built-in answers; emergencies still go to 108 first.
const EMPTY = { question: '', answer: '', triggers: '', active: true };

function FaqForm({ initial = EMPTY, onSaved, onCancel }) {
  const [run, busy] = useAction();
  const [f, setF] = useState(initial);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const ok = await run('save', () => (initial.id ? api.put(`/admin/saathi-faqs/${initial.id}`, f) : api.post('/admin/saathi-faqs', f)), initial.id ? 'Answer updated' : 'Saathi learnt it');
    if (ok) onSaved();
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      <Field label="The question people ask"><input className="input" maxLength={200} value={f.question} onChange={(e) => set('question', e.target.value)} placeholder="e.g. What time does the E-Clinic open?" /></Field>
      <Field label="Saathi's answer" hint="Given word for word (translated into the person's language). Up to 1,500 characters."><textarea className="input" rows={4} maxLength={1500} value={f.answer} onChange={(e) => set('answer', e.target.value)} /></Field>
      <Field label="Trigger words" hint="Comma-separated. Saathi uses this answer when a message contains any of them as whole words — add Hindi and Hinglish too, e.g. timing, open, khulta, समय"><input className="input" value={f.triggers} onChange={(e) => set('triggers', e.target.value)} /></Field>
      <label className="row" style={{ gap: 10 }}><Switch checked={f.active} onChange={(v) => set('active', v)} label="In use" /> <span className="small">In use</span></label>
      <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button icon={Save} loading={busy === 'save'} onClick={save}>Save</Button>
      </div>
    </div>
  );
}

function TryIt() {
  const [msg, setMsg] = useState('');
  const [res, setRes] = useState(undefined);
  const test = async (e) => { e.preventDefault(); if (msg.trim()) setRes((await api.post('/admin/saathi-faqs/test', { message: msg })).match); };
  return (
    <Card title="Try it">
      <form className="row" style={{ gap: 8 }} onSubmit={test}>
        <input className="input grow" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Type a message as a patient would" />
        <Button type="submit" icon={Search} variant="secondary">Check</Button>
      </form>
      {res === null && <p className="small muted mt-2 mb-0">No taught answer matches — Saathi answers this the usual way.</p>}
      {res && <p className="small mt-2 mb-0">Matches <strong>“{res.question}”</strong> (on: {res.hits.join(', ')}). Saathi replies: {res.answer}</p>}
    </Card>
  );
}

export default function TeachSaathi() {
  const live = useLive('/admin/saathi-faqs', ['admin']);
  const [run, busy] = useAction();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const remove = async (id) => { if (window.confirm('Delete this answer?') && await run(id, () => api.del(`/admin/saathi-faqs/${id}`), 'Deleted')) live.reload(); };
  return (
    <>
      <PageHeader eyebrow="Saathi" title="Teach Saathi" subtitle="Your own answers about Sehatra — timings, how things work, where to go. Saathi gives them word for word when a message contains a trigger word.">
        {!adding && <Button icon={Plus} onClick={() => setAdding(true)}>New answer</Button>}
      </PageHeader>
      <LiveGate live={live}>
        {(list) => (
          <div className="stack">
            {adding && <Card title="New answer"><FaqForm onSaved={() => { setAdding(false); live.reload(); }} onCancel={() => setAdding(false)} /></Card>}
            <TryIt />
            <Card>
              {list.length === 0 && !adding
                ? <Empty icon={GraduationCap} title="Nothing taught yet">Add the questions people ask most. Never put medical advice here that a doctor hasn&apos;t written.</Empty>
                : (
                  <div className="stack">
                    {list.map((e) => (editing === e.id
                      ? <FaqForm key={e.id} initial={e} onSaved={() => { setEditing(null); live.reload(); }} onCancel={() => setEditing(null)} />
                      : (
                        <div key={e.id} className="card flat">
                          <div className="row between wrap" style={{ gap: 8 }}>
                            <strong className="small">{e.question}</strong>
                            <span className="row" style={{ gap: 6 }}>
                              {!e.active && <span className="badge tiny">Off</span>}
                              <span className="tiny muted">used {e.uses}×</span>
                              <Button size="sm" variant="ghost" onClick={() => setEditing(e.id)}>Edit</Button>
                              <Button size="sm" variant="ghost" icon={Trash2} loading={busy === e.id} onClick={() => remove(e.id)} aria-label="Delete" />
                            </span>
                          </div>
                          <p className="small mb-1 mt-1">{e.answer}</p>
                          <div className="tiny muted">Triggers: {e.triggers}</div>
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
