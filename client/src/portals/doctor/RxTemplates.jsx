import { useCallback, useEffect, useState } from 'react';
import { BookmarkPlus, LayoutTemplate, Plus, Trash2, Star, Sparkles, AlertTriangle } from 'lucide-react';
import { api } from '../../api';
import { Button, Field, Modal, useAction, useToast } from '../../components/ui';

const summary = (t) => [
  t.items.length ? `${t.items.length} medicine${t.items.length > 1 ? 's' : ''}` : null,
  t.labTests?.length ? `${t.labTests.length} test${t.labTests.length > 1 ? 's' : ''}` : null,
  t.advice ? 'advice' : null,
  t.dos?.length || t.donts?.length ? 'dos & don’ts' : null,
].filter(Boolean).join(' · ');

/*
 * Templates picker + "Save as template" + the doctor's most-prescribed medicines as quick chips.
 * `form` is the current prescription in template shape: { diagnosis, items, advice, dos, donts, labTests }.
 */
export default function RxTemplateTools({ form, onApply, onAddItems }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [name, setName] = useState('');
  const [clash, setClash] = useState(null); // id of an existing template with the same name
  const [run, busy] = useAction();
  const toast = useToast();
  const load = useCallback(() => api.get('/doctor/rx-templates').then(setData).catch(() => setData({ templates: [], starters: [], frequent: [] })), []);
  useEffect(() => { load(); }, [load]);

  const use = (t) => {
    // Confirmation is per template: a pending question about one must not wave another through.
    if (form.items.length && confirm !== t) { setConfirm(t); return; }
    onApply(t);
    setConfirm(null); setOpen(false);
    toast(`“${t.name}” added — review doses before signing`);
  };
  const addStarter = (s) => run(`add-${s.id}`, async () => { await api.post('/doctor/rx-templates', { starterId: s.id }); await load(); }, `“${s.name}” saved to your templates`);
  const remove = (t) => run(`del-${t.id}`, async () => { await api.del(`/doctor/rx-templates/${t.id}`); await load(); }, 'Template deleted');
  const body = () => ({ name: name.trim(), diagnosis: form.diagnosis, items: form.items, advice: form.advice, dos: form.dos, donts: form.donts, labTests: form.labTests });
  const save = () => run('save', async () => {
    try {
      if (clash) await api.put(`/doctor/rx-templates/${clash}`, body());
      else await api.post('/doctor/rx-templates', body());
    } catch (e) {
      if (/already have a template/i.test(e.message)) { const same = data?.templates.find((t) => t.name.toLowerCase() === name.trim().toLowerCase()); if (same) { setClash(same.id); return false; } }
      throw e;
    }
    await load();
    setSaveOpen(false); setClash(null);
    return true;
  }).then((ok) => ok && toast(`Saved as “${name.trim()}”`));
  const canSave = form.items.length || form.labTests.length || form.advice.trim();

  return (
    <div className="dr-tpl-tools">
      <div className="row wrap" style={{ gap: 8 }}>
        <Button size="sm" variant="secondary" icon={LayoutTemplate} onClick={() => { setConfirm(null); setOpen(true); }}>Templates{data?.templates.length ? ` (${data.templates.length})` : ''}</Button>
        <Button size="sm" variant="ghost" icon={BookmarkPlus} disabled={!canSave} onClick={() => { setName(form.diagnosis || ''); setClash(null); setSaveOpen(true); }}>Save as template</Button>
      </div>
      {data?.frequent?.length > 0 && (
        <div className="dr-fav">
          <span className="tiny muted row" style={{ gap: 4 }}><Star size={13} />Your frequent:</span>
          {data.frequent.map((f) => {
            const on = form.items.some((i) => i.drug.toLowerCase() === f.drug.toLowerCase());
            return <button key={f.drug} type="button" className="chip" disabled={on} title={`${f.dose || ''} · ${f.freq || ''} · ${f.days || ''} days — prescribed ${f.count}×`} onClick={() => onAddItems([f])} translate="no">{on ? '✓ ' : '+ '}{f.drug}</button>;
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} wide title="Prescription templates" subtitle="Fill the prescription in one tap. Templates add to what you've written — nothing is removed.">
        {!data ? <p className="small muted">Loading…</p> : (
          <div className="stack">
            {confirm && (
              <div className="callout sun dr-tpl-confirm">
                <AlertTriangle />
                <div className="grow">
                  <span className="small">Add “{confirm.name}” to the {form.items.length} medicine{form.items.length > 1 ? 's' : ''} already on this prescription? Medicines already there are kept and not repeated.</span>
                  <div className="row mt-1" style={{ gap: 8 }}>
                    <Button size="sm" icon={Plus} onClick={() => use(confirm)}>Add to prescription</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
                  </div>
                </div>
              </div>
            )}
            <div>
              <h4 className="mb-1">Your templates</h4>
              {data.templates.length === 0 ? <p className="small muted mb-0">None yet. Write a prescription and tap “Save as template”, or add one of the suggestions below.</p> : (
                <div className="dr-tpl-list">
                  {data.templates.map((t) => (
                    <div key={t.id} className="dr-tpl">
                      <div className="grow" style={{ minWidth: 0 }}>
                        <strong className="small">{t.name}</strong>
                        <div className="tiny muted">{summary(t)}</div>
                        <div className="tiny muted dr-tpl-drugs" translate="no">{t.items.map((i) => i.drug).join(', ')}</div>
                      </div>
                      <Button size="sm" onClick={() => use(t)}>Use</Button>
                      <button type="button" className="icon-btn" aria-label={`Delete ${t.name}`} disabled={busy === `del-${t.id}`} onClick={() => remove(t)}><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              )}
              <p className="tiny muted mt-1 mb-0">To change a template: use it, edit the prescription, then “Save as template” with the same name.</p>
            </div>
            {data.starters.length > 0 && (
              <div>
                <h4 className="mb-1 row" style={{ gap: 6 }}><Sparkles size={16} />Suggestions to start with</h4>
                <p className="tiny muted">Common OPD plans with adult doses. They are editable suggestions — check every dose for the patient&apos;s age, weight, kidney function and allergies before signing.</p>
                <div className="dr-tpl-list">
                  {data.starters.map((s) => (
                    <div key={s.id} className="dr-tpl starter">
                      <div className="grow" style={{ minWidth: 0 }}>
                        <strong className="small">{s.name}</strong> <span className="badge sun tiny">Suggestion</span>
                        <div className="tiny muted">{summary(s)}</div>
                        <div className="tiny muted dr-tpl-drugs" translate="no">{s.items.map((i) => `${i.drug} (${i.freq})`).join(', ')}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => use(s)}>Use once</Button>
                      <Button size="sm" variant="secondary" icon={Plus} loading={busy === `add-${s.id}`} onClick={() => addStarter(s)}>Add</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save as template" subtitle="Saves the medicines, advice, dos & don’ts and tests — never the patient's details."
        footer={<><Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Button><Button icon={BookmarkPlus} loading={busy === 'save'} disabled={name.trim().length < 2} onClick={save}>{clash ? 'Replace template' : 'Save template'}</Button></>}>
        <Field label="Template name" hint={`Will save: ${summary(form) || 'nothing yet'}`}>
          <input className="input" value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setClash(null); }} placeholder="e.g. Viral fever, BP review" autoFocus />
        </Field>
        {clash && <div className="callout sun small mt-1"><AlertTriangle />You already have a template with this name. Replace it with this prescription?</div>}
      </Modal>
    </div>
  );
}
