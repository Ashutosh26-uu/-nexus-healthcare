import { useState } from 'react';
import { Plus, Check, Send, Megaphone, Languages, Search, Undo2 } from 'lucide-react';
import { api } from '../../api';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Empty, Button, Modal, Field, StatusBadge, Tabs, useAction, timeAgo, cx } from '../../components/ui';
import { useLive } from '../../live';
import { LiveGate } from './shared';

const LANGS = [
  { key: 'en', label: 'English' },
  { key: 'hi', label: 'हिन्दी Hindi' },
  { key: 'ta', label: 'தமிழ் Tamil' },
  { key: 'bn', label: 'বাংলা Bengali' },
];
const ADV_LANGS = ['Hindi', 'English', 'Awadhi', 'Bhojpuri', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Kannada'];

function Cell({ row, lang, onSave }) {
  const [val, setVal] = useState(row[lang] || '');
  const [state, setState] = useState('');
  const dirty = val !== (row[lang] || '');
  const commit = async () => {
    if (!dirty) return;
    setState('saving');
    const ok = await onSave(row.key, lang, val);
    setState(ok ? 'saved' : '');
    if (ok) setTimeout(() => setState(''), 1600);
  };
  return (
    <div className={cx('ad-cell', !val && 'missing', state)}>
      <input
        className="ad-cell-input"
        value={val}
        lang={lang}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setVal(row[lang] || ''); } }}
        placeholder="Needs translation"
        aria-label={`${row.key} in ${lang}`}
      />
      {state === 'saved' && <Check className="ad-cell-ok" />}
      {state === 'saving' && <span className="spinner sm ad-cell-ok" />}
    </div>
  );
}

function Translations({ rows, reload }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ key: '', en: '', hi: '', ta: '', bn: '' });
  const [run, busy] = useAction();
  const save = async (key, lang, value) => {
    const r = await run(`${key}-${lang}`, () => api.put(`/admin/translations/${encodeURIComponent(key)}`, { [lang]: value }), 'Translation saved');
    if (r) reload();
    return Boolean(r);
  };
  const add = async (e) => {
    e.preventDefault();
    const key = form.key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const { key: _k, ...langs } = form;
    const r = await run('add', () => api.put(`/admin/translations/${key}`, langs), `Added “${key}”`);
    if (r) { setAdding(false); setForm({ key: '', en: '', hi: '', ta: '', bn: '' }); reload(); }
  };
  const shown = rows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
  const missing = rows.reduce((s, r) => s + LANGS.filter((l) => !r[l.key]).length, 0);

  return (
    <Card>
      <div className="row wrap between" style={{ gap: 10, marginBottom: 14 }}>
        <div className="input-wrap grow" style={{ minWidth: 200, maxWidth: 360 }}>
          <Search />
          <input className="input sm" placeholder="Search keys or text" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="tiny muted">{rows.length} strings · {missing} missing</span>
          <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Add string</Button>
        </div>
      </div>
      {shown.length === 0 ? <Empty icon={Languages} title="No strings match" /> : (
        <div className="table-wrap">
          <table className="table ad-trans">
            <thead><tr><th>Key</th>{LANGS.map((l) => <th key={l.key}>{l.label}</th>)}</tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key}>
                  <td className="mono small nowrap">{r.key}</td>
                  {LANGS.map((l) => <td key={l.key}><Cell row={r} lang={l.key} onSave={save} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="tiny muted mb-0 mt-1">Click any cell to edit. Changes save when you leave the cell (Enter saves, Esc undoes). Medical terms are reviewed by a clinician before release.</p>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a string">
        <form className="stack" onSubmit={add}>
          <Field label="Key" hint="Lowercase with underscores, e.g. book_slot"><input className="input mono" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} required /></Field>
          {LANGS.map((l) => (
            <Field key={l.key} label={l.label}><input className="input" lang={l.key} value={form[l.key]} onChange={(e) => setForm({ ...form, [l.key]: e.target.value })} required={l.key === 'en'} /></Field>
          ))}
          <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" loading={busy === 'add'}>Add string</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

function Advisories({ list, reload }) {
  const [run, busy] = useAction();
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', region: 'All India', languages: ['Hindi', 'English'] });
  const setStatus = async (a, status) => {
    const r = await run(a.id, () => api.put(`/advisories/${a.id}`, { status }), status === 'published' ? 'Advisory published' : 'Advisory unpublished');
    if (r) reload();
  };
  const create = async (e) => {
    e.preventDefault();
    const r = await run('new', () => api.post('/advisories', { ...form, publish: false }), 'Draft saved');
    if (r) { setComposing(false); setForm({ title: '', body: '', region: 'All India', languages: ['Hindi', 'English'] }); reload(); }
  };
  const toggle = (l) => setForm((f) => ({ ...f, languages: f.languages.includes(l) ? f.languages.filter((x) => x !== l) : [...f.languages, l] }));

  return (
    <Card title="Health advisories" action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setComposing(true)}>New draft</Button>}>
      {list.length === 0 ? <Empty icon={Megaphone} title="No advisories">Drafts from officials and admins appear here.</Empty> : (
        <div className="ad-advs">
          {list.map((a) => (
            <div key={a.id} className={cx('ad-adv', a.status)}>
              <div className="row between top" style={{ gap: 10 }}>
                <strong className="small">{a.title}</strong>
                <StatusBadge status={a.status} />
              </div>
              <p className="small muted mb-1 mt-1">{a.body}</p>
              <div className="row between wrap" style={{ gap: 8 }}>
                <span className="tiny muted">{a.region} · {(a.languages || []).join(', ')} · {timeAgo(a.createdAt)}{a.by ? ` · ${a.by}` : ''}</span>
                {a.status === 'published'
                  ? <Button size="sm" variant="ghost" icon={Undo2} loading={busy === a.id} onClick={() => setStatus(a, 'draft')}>Unpublish</Button>
                  : <Button size="sm" icon={Send} loading={busy === a.id} onClick={() => setStatus(a, 'published')}>Publish</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={composing} onClose={() => setComposing(false)} title="New advisory draft" subtitle="Saved as a draft. Outbreak advisories should come from a confirmed alert in the Command Center.">
        <form className="stack" onSubmit={create}>
          <Field label="Headline"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
          <Field label="Message"><textarea className="textarea" rows={4} maxLength={320} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required /></Field>
          <Field label="Region"><input className="input" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></Field>
          <Field label="Languages">
            <div className="chip-select">{ADV_LANGS.map((l) => <button key={l} type="button" className={cx('chip', form.languages.includes(l) && 'on')} onClick={() => toggle(l)}>{l}</button>)}</div>
          </Field>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <Button type="button" variant="ghost" onClick={() => setComposing(false)}>Cancel</Button>
            <Button type="submit" loading={busy === 'new'} disabled={!form.languages.length}>Save draft</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

export default function Content() {
  const live = useLive('/admin/content', ['admin', 'advisories']);
  const [tab, setTab] = useState('translations');
  return (
    <LiveGate live={live}>
      {({ translations, advisories }) => (
        <>
          <PageHeader eyebrow="Content" title="Content & languages" subtitle="The words patients see on kiosks and phones, in their own language — and the public health advice that goes with them." />
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'translations', label: 'Translations', icon: Languages, count: translations.length },
              { value: 'advisories', label: 'Health advisories', icon: Megaphone, count: advisories.length },
            ]}
          />
          {tab === 'translations'
            ? <Translations rows={translations} reload={live.reload} />
            : <Advisories list={advisories} reload={live.reload} />}
        </>
      )}
    </LiveGate>
  );
}
