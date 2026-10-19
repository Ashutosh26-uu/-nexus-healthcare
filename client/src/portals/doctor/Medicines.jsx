import { useEffect, useState } from 'react';
import { Pill, Plus, Trash2, Search, Sparkles, Pencil } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';
import { useTopicTick } from '../../live';
import { Button, Card, Empty, Field, Loading, useAction, cx } from '../../components/ui';
import { TimingPicker, FOOD, FORMS, emptyTiming, freqText } from './medTiming';

export const blankMed = (name = '') => ({ name, strength: '', form: 'Tablet', dose: '1 tablet', timing: { ...emptyTiming(), morning: 1, night: 1 }, food: 'after food', sos: false, days: 5, note: '' });

// The form is shared with the prescription writer's "add a new medicine" pop-up.
export function MedicineForm({ value, onChange }) {
  const m = value;
  const set = (k, v) => onChange({ ...m, [k]: v });
  return (
    <div className="stack">
      <div className="grid three">
        <Field label="Medicine name"><input className="input" value={m.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Cetirizine" autoFocus /></Field>
        <Field label="Strength"><input className="input" value={m.strength} onChange={(e) => set('strength', e.target.value)} placeholder="e.g. 10 mg" /></Field>
        <Field label="Form">
          <select className="select" value={m.form} onChange={(e) => set('form', e.target.value)}>{FORMS.map((f) => <option key={f}>{f}</option>)}</select>
        </Field>
      </div>
      <Field label="When to take it">
        <div className="row wrap" style={{ gap: 10 }}>
          <TimingPicker value={m.timing} onChange={(t) => onChange({ ...m, timing: t, sos: false })} />
          <label className={cx('chip', m.sos && 'on')} style={{ cursor: 'pointer' }}><input type="checkbox" hidden checked={m.sos} onChange={(e) => set('sos', e.target.checked)} />SOS / when needed</label>
        </div>
      </Field>
      <div className="grid three">
        <Field label="Dose"><input className="input" value={m.dose} onChange={(e) => set('dose', e.target.value)} placeholder="e.g. 1 tablet, 5 ml" /></Field>
        <Field label="Food">
          <select className="select" value={m.food} onChange={(e) => set('food', e.target.value)}>{FOOD.map((f) => <option key={f}>{f}</option>)}</select>
        </Field>
        <Field label="Days"><input className="input" type="number" min="1" max="365" value={m.days} onChange={(e) => set('days', e.target.value)} /></Field>
      </div>
      <Field label="Note for the patient (optional)"><input className="input" value={m.note} onChange={(e) => set('note', e.target.value)} placeholder="e.g. 30 minutes before breakfast" /></Field>
      <div className="dr-med-preview small">
        <Sparkles size={15} />
        <span><strong translate="no">{[m.name || 'Medicine', m.strength].filter(Boolean).join(' ')}</strong> — {m.dose}, {freqText(m)}, {m.days} days{m.note ? ` · ${m.note}` : ''}</span>
      </div>
    </div>
  );
}

export default function Medicines() {
  const [list, setList] = useState(null);
  const [draft, setDraft] = useState(blankMed());
  const [q, setQ] = useState('');
  const [run, busy] = useAction();

  const live = useTopicTick(['mymeds']); // saved on another device
  useEffect(() => { api.get('/doctor/medicines').then(setList).catch(() => setList((cur) => cur || [])); }, [live]);

  const save = () => run('save', async () => {
    const m = await api.post('/doctor/medicines', draft);
    setList((l) => [m, ...(l || []).filter((x) => x.id !== m.id)]);
    setDraft(blankMed());
  }, `${draft.name} saved — it now auto-fills in your prescriptions`);
  const remove = (m) => run(`del-${m.id}`, async () => {
    await api.del(`/doctor/medicines/${m.id}`);
    setList((l) => l.filter((x) => x.id !== m.id));
  }, `${m.name} removed`);

  const shown = (list || []).filter((m) => !q || `${m.name} ${m.strength}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Prescribing" title="My medicines"
        subtitle="Add the medicines you prescribe often, with their usual dose and timing. When you type one in a prescription, it fills in automatically." />
      <div className="grid side">
        <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Plus size={17} />Add a medicine</h4>}>
          <MedicineForm value={draft} onChange={setDraft} />
          <div className="row mt-2" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="ghost" onClick={() => setDraft(blankMed())}>Clear</Button>
            <Button icon={Plus} loading={busy === 'save'} disabled={draft.name.trim().length < 2} onClick={save}>Save to my list</Button>
          </div>
        </Card>
        <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Pill size={17} />Saved ({list?.length || 0})</h4>}>
          {!list ? <Loading /> : list.length === 0 ? (
            <Empty icon={Pill} title="No medicines yet">Add your first one on the left.</Empty>
          ) : (
            <>
              <div className="input-wrap mb-2"><Search /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your list" /></div>
              <div className="dr-med-list">
                {shown.map((m) => (
                  <div key={m.id} className="dr-med-item">
                    <span className="dr-med-ic"><Pill size={16} /></span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <strong className="small" translate="no">{[m.name, m.strength].filter(Boolean).join(' ')}</strong> <span className="tiny muted">{m.form}</span>
                      <div className="tiny muted">{m.dose} · {freqText(m)} · {m.days} days{m.note ? ` · ${m.note}` : ''}</div>
                    </div>
                    <button type="button" className="icon-btn" onClick={() => setDraft({ ...blankMed(), ...m })} aria-label={`Edit ${m.name}`} title="Edit"><Pencil size={15} /></button>
                    <button type="button" className="icon-btn" onClick={() => remove(m)} aria-label={`Remove ${m.name}`} disabled={busy === `del-${m.id}`}><Trash2 /></button>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
