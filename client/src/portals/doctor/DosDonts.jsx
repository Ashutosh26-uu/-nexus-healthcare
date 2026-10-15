import { useState } from 'react';
import { Plus, X, ThumbsUp, Ban } from 'lucide-react';
import { cx } from '../../components/ui';

const DO_IDEAS = ['Drink plenty of water', 'Take rest', 'Steam inhalation twice a day', 'Walk 30 minutes daily', 'Eat light, home-cooked food', 'Check sugar every morning', 'Complete the full antibiotic course'];
const DONT_IDEAS = ['No oily or spicy food', 'Avoid cold drinks', 'No smoking or alcohol', 'Don’t skip doses', 'Avoid sugar and sweets', 'No heavy lifting', 'Don’t self-medicate with painkillers'];

function TagList({ kind, value, onChange, ideas }) {
  const [draft, setDraft] = useState('');
  const add = (t) => { const v = (t ?? draft).trim(); if (v && !value.includes(v)) onChange([...value, v].slice(0, 12)); setDraft(''); };
  const Icon = kind === 'do' ? ThumbsUp : Ban;
  return (
    <div className={cx('dr-dd', kind)}>
      <div className="dr-dd-head"><Icon size={14} /> <strong className="small">{kind === 'do' ? 'Do' : 'Don’t'}</strong></div>
      {value.length > 0 && <div className="dr-dd-tags">{value.map((v) => <span key={v} className="dr-dd-tag">{v}<button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`}><X size={11} /></button></span>)}</div>}
      <div className="row" style={{ gap: 6 }}>
        <input className="input sm grow" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={kind === 'do' ? 'Add an instruction…' : 'Add something to avoid…'} />
        <button type="button" className="icon-btn" onClick={() => add()} disabled={!draft.trim()} aria-label="Add"><Plus size={15} /></button>
      </div>
      <div className="dr-dd-ideas">{ideas.filter((i) => !value.includes(i)).slice(0, 4).map((i) => <button type="button" key={i} className="chip" onClick={() => add(i)}>+ {i}</button>)}</div>
    </div>
  );
}

// "What to do / what not to do" on a prescription — shown to the patient and printed on the PDF.
export default function DosDonts({ dos, donts, onDos, onDonts }) {
  return (
    <div className="dr-dd-grid">
      <TagList kind="do" value={dos} onChange={onDos} ideas={DO_IDEAS} />
      <TagList kind="dont" value={donts} onChange={onDonts} ideas={DONT_IDEAS} />
    </div>
  );
}
