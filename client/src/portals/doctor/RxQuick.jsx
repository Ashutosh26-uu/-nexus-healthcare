import { useMemo, useState } from 'react';
import { Zap, AlertTriangle, CornerDownLeft, Repeat, Stethoscope, LayoutTemplate, X, Plus } from 'lucide-react';
import { Button, fmtDate, cx } from '../../components/ui';
import { interpret, quickLine } from './rxShorthand';
import { lc, writeAutoNext } from './rxKit';

/*
 * Speed tools shared by the consult composer (RxComposer) and walk-in prescribing (Prescribe):
 * shorthand quick entry, smart defaults, repeat-last, diagnosis chips and never-lost drafts.
 */


const SOURCE = { last: 'your last dose', saved: 'your saved medicine', catalog: 'usual adult dose' };

/** One text box: "para 650 1-0-1 5d" ⏎ → a full line. Enter keeps focus here for the next one. */
export function QuickEntry({ kit, onAdd, existing = [], inputRef, autoFocus }) {
  const [text, setText] = useState('');
  const [pick, setPick] = useState({ q: '', i: 0 });
  const index = kit?.index;
  const base = useMemo(() => (index && text.trim() ? interpret(text, index, 0) : null), [text, index]);
  const i = base && pick.q === base.query ? pick.i : 0;
  const out = useMemo(() => (index && text.trim() ? quickLine(text, index, kit.ctx, i) : null), [text, index, kit, i]);
  const line = out?.line;
  const matches = out?.r.matches || [];
  const dup = line && existing.some((d) => lc(d) === lc(line.drug));

  const add = () => {
    if (!line) return;
    onAdd(line);
    setText(''); setPick({ q: '', i: 0 });
  };
  const cycle = (dir) => setPick({ q: base.query, i: (i + dir + matches.length) % matches.length });
  const onKey = (e) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); add(); return; }
    if (e.key === 'Escape') { if (text) { e.preventDefault(); e.stopPropagation(); setText(''); } return; }
    if (matches.length > 1 && ((e.key === 'Tab' && text.trim()) || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      cycle(e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1);
    }
  };
  const muted = (f) => (line?.filled.includes(f) ? 'dr-qe-def' : undefined);

  return (
    <div className="dr-qe">
      <div className="input-wrap">
        <Zap />
        <input ref={inputRef} className="input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} autoFocus={autoFocus}
          placeholder="Quick add — para 650 1-0-1 5d · amlo 5 od 30 · ors sos"
          aria-label="Quick add a medicine in shorthand" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="enter" />
      </div>
      {line ? (
        <div className="dr-qe-preview" aria-live="polite">
          <div className="dr-qe-line">
            <strong translate="no">{line.drug}</strong>
            {line.unknown && <span className="badge sun" title="Not in the formulary or your list — check the spelling"><AlertTriangle />Not in list — added as typed</span>}
            {line.strengthMismatch && <span className="badge sun" title="This strength isn't in the formulary"><AlertTriangle />Strength not in list</span>}
            {out.r.alias && <span className="tiny muted" translate="no">({out.r.alias})</span>}
            <span className={muted('dose')}>{line.dose}</span>
            <span className={muted('freq')}>{line.freq}</span>
            <span className={muted('days')}>{line.days ? `${line.days} days` : 'no duration'}</span>
            <Button size="sm" icon={dup ? Repeat : Plus} onClick={add} className="dr-qe-add">{dup ? 'Update' : 'Add'}</Button>
          </div>
          {matches.length > 1 && (
            <div className="dr-qe-matches" role="listbox" aria-label="Other matching medicines">
              {matches.map((m, k) => (
                <button key={m.name + (m.alias || '')} type="button" role="option" aria-selected={k === out.r.pick} className={cx('chip', k === out.r.pick && 'on')} onMouseDown={(e) => e.preventDefault()} onClick={() => setPick({ q: base.query, i: k })} translate="no">
                  {m.frequent && '★ '}{m.name}
                </button>
              ))}
            </div>
          )}
          <div className="tiny muted dr-qe-hint">
            {line.filled.length > 0 && <span>Grey = {SOURCE[line.source]}. </span>}
            {dup && <span>Already on the prescription — this updates it. </span>}
            <span className="dr-qe-keys"><CornerDownLeft size={12} /> Enter adds{matches.length > 1 ? ' · Tab / ↑↓ other match' : ''} · Esc clears · Ctrl+Enter signs</span>
          </div>
        </div>
      ) : (
        <div className="tiny muted dr-qe-hint">Type drug · strength · how often (od, bd, tds, hs, sos, 1-0-1) · food (af, bf) · days (5, 2w, 1m) — then Enter.</div>
      )}
    </div>
  );
}

/** "Repeat last prescription (date, N medicines)" — merges like a template; asks first if lines exist. */
export function RepeatLast({ lastRx, count, onRepeat }) {
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  if (!lastRx || !lastRx.items?.length || done) return null;
  const n = lastRx.items.length;
  const go = () => { onRepeat(lastRx); setDone(true); setConfirm(false); };
  return (
    <div className="dr-repeat">
      <Button size="sm" variant="secondary" icon={Repeat} onClick={() => (count ? setConfirm(true) : go())}>Repeat last prescription ({fmtDate(lastRx.date)}, {n} medicine{n > 1 ? 's' : ''})</Button>
      <span className="tiny muted" translate="no">{lastRx.withYou ? 'by you' : lastRx.doctorName}{lastRx.diagnosis ? ` · ${lastRx.diagnosis}` : ''} · {lastRx.items.map((x) => x.drug).join(', ')}</span>
      {confirm && (
        <div className="callout sun small dr-repeat-confirm">
          <AlertTriangle />
          <div className="grow">Add these {n} medicine{n > 1 ? 's' : ''} to the {count} already on this prescription? Ones already listed are kept, not repeated.
            <div className="row mt-1" style={{ gap: 8 }}><Button size="sm" icon={Plus} onClick={go}>Add</Button><Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The doctor's 10 most frequent diagnoses; tapping one fills the field and offers a matching template. */
export function DiagnosisChips({ kit, value, onPick, onApplyTemplate }) {
  const [offer, setOffer] = useState(null);
  const list = kit?.diagnoses || [];
  if (!list.length) return null;
  const tap = (text) => {
    onPick(text);
    const t = (kit.templates || []).find((x) => lc(x.name) === lc(text) || (x.diagnosis && lc(x.diagnosis) === lc(text)));
    setOffer(t || null);
  };
  return (
    <div className="dr-dx">
      <div className="dr-fav" role="group" aria-label="Your frequent diagnoses">
        <span className="tiny muted row" style={{ gap: 4 }}><Stethoscope size={13} />Frequent:</span>
        {list.map((d) => <button key={d.text} type="button" className={cx('chip', lc(value) === lc(d.text) && 'on')} onClick={() => tap(d.text)} title={`Used ${d.count}×`}>{d.text}</button>)}
      </div>
      {offer && (
        <div className="callout small dr-dx-offer">
          <LayoutTemplate />
          <span className="grow">Apply your template “{offer.name}”{offer.items?.length ? ` (${offer.items.length} medicine${offer.items.length > 1 ? 's' : ''})` : ''}? It adds to what’s already written.</span>
          <Button size="sm" onClick={() => { onApplyTemplate(offer); setOffer(null); }}>Apply</Button>
          <button type="button" className="icon-btn" aria-label="No thanks" onClick={() => setOffer(null)}><X size={15} /></button>
        </div>
      )}
    </div>
  );
}

export function DraftNote({ onDiscard }) {
  return <div className="dr-draft-note tiny" role="status">Draft restored <span aria-hidden>·</span> <button type="button" className="link-btn" onClick={onDiscard}>Discard</button></div>;
}


export function AutoNextToggle({ value, onChange }) {
  return <label className="check tiny dr-autonext-toggle"><input type="checkbox" checked={value} onChange={(e) => { writeAutoNext(e.target.checked); onChange(e.target.checked); }} />Open next patient automatically</label>;
}
