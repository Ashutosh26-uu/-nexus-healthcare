import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Save, RotateCcw, History, Siren, Route as RouteIcon, Activity, Info, Undo2 } from 'lucide-react';
import { api } from '../../api';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Button, Field, Modal, StatusBadge, useAction, fmtDateTime, cx } from '../../components/ui';
import { useLive } from '../../live';
import { LiveGate } from './shared';

const WEIGHTS = [
  { key: 'urgency', label: 'Urgency match', max: 60, sign: '+', hint: 'Doctor accepts this urgency level (e.g. takes "see doctor now" cases).' },
  { key: 'specialty', label: 'Specialty match', max: 60, sign: '+', hint: 'Doctor’s specialty is the one triage asked for.' },
  { key: 'language', label: 'Language match', max: 40, sign: '+', hint: 'Doctor speaks the patient’s language.' },
  { key: 'waitPenalty', label: 'Wait penalty', max: 10, sign: '−', unit: '/ min', hint: 'Points removed for every minute of queue.' },
  { key: 'distancePenalty', label: 'Distance penalty', max: 30, sign: '−', hint: 'Only applied when a physical visit is needed.' },
];

/* Two illustrative doctors so the effect of each weight is visible while dragging. */
const EXAMPLE = [
  { name: 'Dr. A · Pediatrics, Lucknow', urgency: true, specialty: true, language: true, wait: 14, far: true },
  { name: 'Dr. B · General, Bengaluru', urgency: true, specialty: false, language: false, wait: 2, far: true },
  { name: 'Dr. C · Pediatrics, Barabanki', urgency: true, specialty: true, language: true, wait: 22, far: false },
];
const scoreOf = (w, d, physical) => (d.urgency ? w.urgency : 0) + (d.specialty ? w.specialty : 0) + (d.language ? w.language : 0) - d.wait * w.waitPenalty - (physical && d.far ? w.distancePenalty : 0);

const clone = (c) => ({ triage: { ...c.triage, redFlags: [...c.triage.redFlags] }, routing: { ...c.routing }, outbreak: { ...c.outbreak } });

function diffList(base, draft) {
  const out = [];
  const added = draft.triage.redFlags.filter((f) => !base.triage.redFlags.includes(f));
  const removed = base.triage.redFlags.filter((f) => !draft.triage.redFlags.includes(f));
  if (added.length) out.push(`Red flags added: ${added.join(', ')}`);
  if (removed.length) out.push(`Red flags removed: ${removed.join(', ')}`);
  if (base.triage.spo2Emergency !== draft.triage.spo2Emergency) out.push(`SpO₂ emergency ${base.triage.spo2Emergency}% → ${draft.triage.spo2Emergency}%`);
  if (base.triage.tempHigh !== draft.triage.tempHigh) out.push(`High temperature ${base.triage.tempHigh}°F → ${draft.triage.tempHigh}°F`);
  WEIGHTS.forEach((w) => { if (base.routing[w.key] !== draft.routing[w.key]) out.push(`${w.label} ${base.routing[w.key]} → ${draft.routing[w.key]}`); });
  if (base.outbreak.multiplier !== draft.outbreak.multiplier) out.push(`Outbreak multiplier ${base.outbreak.multiplier}× → ${draft.outbreak.multiplier}×`);
  if (base.outbreak.minTests !== draft.outbreak.minTests) out.push(`Minimum tests ${base.outbreak.minTests} → ${draft.outbreak.minTests}`);
  return out;
}

function Slider({ label, value, min = 0, max, step = 1, onChange, sign, unit, hint }) {
  return (
    <div className="ad-slider">
      <div className="row between">
        <label className="small" style={{ fontWeight: 600 }}>{sign && <span className={cx('ad-sign', sign === '−' && 'neg')}>{sign}</span>}{label}</label>
        <span className="ad-slider-val">{value}{unit ? <span className="tiny muted"> {unit}</span> : null}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ '--p': `${((value - min) / (max - min)) * 100}%` }} aria-label={label} />
      {hint && <div className="tiny muted">{hint}</div>}
    </div>
  );
}

export default function AIConfig() {
  const live = useLive('/admin/ai-config', ['admin']);
  const cfg = live.data;
  const [draft, setDraft] = useState(null);
  const [note, setNote] = useState('');
  const [flag, setFlag] = useState('');
  const [physical, setPhysical] = useState(false);
  const [rollback, setRollback] = useState(null);
  const [run, busy] = useAction();

  useEffect(() => { if (cfg) setDraft(clone(cfg)); }, [cfg?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const changes = useMemo(() => (cfg && draft ? diffList(cfg, draft) : []), [cfg, draft]);

  const setT = (k, v) => setDraft((d) => ({ ...d, triage: { ...d.triage, [k]: v } }));
  const setR = (k, v) => setDraft((d) => ({ ...d, routing: { ...d.routing, [k]: v } }));
  const setO = (k, v) => setDraft((d) => ({ ...d, outbreak: { ...d.outbreak, [k]: v } }));
  const addFlag = (e) => {
    e.preventDefault();
    const f = flag.trim().toLowerCase();
    if (f && !draft.triage.redFlags.includes(f)) setT('redFlags', [...draft.triage.redFlags, f]);
    setFlag('');
  };

  const save = async () => {
    const r = await run('save', () => api.put('/admin/ai-config', { ...draft, note: note.trim() }), 'Configuration saved — live for new triage and routing decisions');
    if (r) { setNote(''); live.setData(r); }
  };
  const doRollback = async () => {
    const r = await run('rb', () => api.post(`/admin/ai-config/rollback/${rollback}`), `Rolled back to v${rollback}`);
    setRollback(null);
    if (r) live.setData(r);
  };

  return (
    <LiveGate live={live}>
      {() => {
        if (!draft) return null;
        const w = draft.routing;
        const scored = EXAMPLE.map((d) => ({ ...d, score: scoreOf(w, d, physical) })).sort((a, b) => b.score - a.score);
        const history = [...cfg.history].filter((h) => !h.hidden).reverse();
        const hasSnap = (v) => cfg.history.some((h) => h.version === v && h.snapshot);

        return (
          <>
            <PageHeader eyebrow="AI configuration" title={<>Rules & weights <span className="ad-version">v{cfg.version}</span></>} subtitle="Every engine starts as clear, reviewable rules. Changes apply to new decisions only and are versioned so they can be rolled back." />

            <div className="callout sky small mb-2"><Info /> <span>AI output is decision support, never a diagnosis. Red-flag symptoms always go straight to Emergency without AI judgement, and every triage result is reviewed by the consulting doctor.</span></div>

            <div className="ad-ai-grid">
              <div className="stack lg">
                <Card title={<div className="row" style={{ gap: 8 }}><Siren size={18} className="ad-ico-rose" /><h3>Triage rules</h3></div>}>
                  <Field label="Red-flag phrases" hint="If a patient says any of these, triage jumps straight to Emergency.">
                    <div className="ad-flags">
                      {draft.triage.redFlags.map((f) => (
                        <span key={f} className={cx('ad-flag', !cfg.triage.redFlags.includes(f) && 'new')}>
                          {f}
                          <button type="button" aria-label={`Remove ${f}`} onClick={() => setT('redFlags', draft.triage.redFlags.filter((x) => x !== f))}><X /></button>
                        </span>
                      ))}
                    </div>
                  </Field>
                  <form className="row mt-1" style={{ gap: 8 }} onSubmit={addFlag}>
                    <input className="input sm grow" placeholder="Add a phrase, e.g. blue lips" value={flag} onChange={(e) => setFlag(e.target.value)} />
                    <Button size="sm" variant="secondary" icon={Plus} type="submit" disabled={!flag.trim()}>Add</Button>
                  </form>
                  <div className="grid two mt-2" style={{ gap: 18 }}>
                    <Slider label="SpO₂ emergency below" value={draft.triage.spo2Emergency} min={80} max={95} unit="%" onChange={(v) => setT('spo2Emergency', v)} hint="Oxygen saturation that triggers Emergency." />
                    <Slider label="High temperature from" value={draft.triage.tempHigh} min={100} max={105} step={0.1} unit="°F" onChange={(v) => setT('tempHigh', Number(v.toFixed(1)))} hint="Flags the case for “see doctor now”." />
                  </div>
                </Card>

                <Card title={<div className="row" style={{ gap: 8 }}><RouteIcon size={18} className="ad-ico-green" /><h3>Routing weights</h3></div>}>
                  <div className="ad-formula">
                    <span className="tiny muted">Score =</span>
                    <span className="pos">urgency <b>{w.urgency}</b></span><i>+</i>
                    <span className="pos">specialty <b>{w.specialty}</b></span><i>+</i>
                    <span className="pos">language <b>{w.language}</b></span><i>−</i>
                    <span className="neg">wait × <b>{w.waitPenalty}</b></span><i>−</i>
                    <span className="neg">distance <b>{w.distancePenalty}</b></span>
                  </div>
                  <div className="stack" style={{ gap: 16 }}>
                    {WEIGHTS.map(({ key, ...x }) => <Slider key={key} {...x} value={w[key]} onChange={(v) => setR(key, v)} />)}
                  </div>
                  <div className="ad-example mt-2">
                    <div className="row between wrap" style={{ gap: 8 }}>
                      <strong className="small">Live example · child with high fever, speaks Awadhi</strong>
                      <label className="check tiny"><input type="checkbox" checked={physical} onChange={(e) => setPhysical(e.target.checked)} /> needs a physical visit</label>
                    </div>
                    {scored.map((d, i) => (
                      <div key={d.name} className={cx('ad-ex-row', i === 0 && 'win')}>
                        <span className="ad-ex-rank">{i + 1}</span>
                        <div className="grow">
                          <div className="small" style={{ fontWeight: 600 }}>{d.name}</div>
                          <div className="tiny muted">{[d.specialty && 'specialty', d.language && 'language'].filter(Boolean).join(' + ') || 'no specialty or language match'} · waits {d.wait} min{physical && d.far ? ' · far' : ''}</div>
                        </div>
                        <span className="ad-ex-score">{d.score}</span>
                      </div>
                    ))}
                    <p className="tiny muted mb-0 mt-1">Search order stays the same: same district → same state → national.</p>
                  </div>
                </Card>

                <Card title={<div className="row" style={{ gap: 8 }}><Activity size={18} className="ad-ico-clay" /><h3>Outbreak thresholds</h3></div>}>
                  <div className="grid two" style={{ gap: 18 }}>
                    <Slider label="Alert when positives exceed" value={draft.outbreak.multiplier} min={1.5} max={5} step={0.1} unit="× baseline" onChange={(v) => setO('multiplier', Number(v.toFixed(1)))} hint="Lower catches outbreaks earlier but raises more false alerts." />
                    <Slider label="Minimum tests per pin code" value={draft.outbreak.minTests} min={3} max={50} unit="tests" onChange={(v) => setO('minTests', v)} hint="Smaller pin codes are grouped with neighbours to protect privacy." />
                  </div>
                </Card>
              </div>

              <div className="stack lg ad-ai-side">
                <Card title="Save a new version">
                  {changes.length ? (
                    <ul className="ad-changes small">{changes.map((c) => <li key={c}>{c}</li>)}</ul>
                  ) : <p className="small muted">No changes yet. Adjust a rule or weight to begin.</p>}
                  <Field label="Change note (required)" hint="Why are you changing this? Shown in version history and the audit log.">
                    <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Medical advisor asked to add blue lips as a red flag" />
                  </Field>
                  <div className="row wrap mt-2" style={{ gap: 8, justifyContent: 'flex-end' }}>
                    <Button variant="ghost" icon={Undo2} disabled={!changes.length} onClick={() => setDraft(clone(cfg))}>Discard</Button>
                    <Button icon={Save} loading={busy === 'save'} disabled={!changes.length || note.trim().length < 5} onClick={save}>Save as v{cfg.version + 1}</Button>
                  </div>
                </Card>

                <Card title={<div className="row" style={{ gap: 8 }}><History size={18} /><h3>Version history</h3></div>}>
                  <ol className="ad-versions">
                    {history.map((h, i) => {
                      const current = h.version === cfg.version;
                      return (
                        <li key={`${h.version}-${i}`} className={cx(current && 'current')}>
                          <span className="ad-v">v{h.version}</span>
                          <div className="grow" style={{ minWidth: 0 }}>
                            <div className="small">{h.note}</div>
                            <div className="tiny muted">{h.by} · {fmtDateTime(h.at)}</div>
                          </div>
                          {current ? <StatusBadge status="active">Live</StatusBadge> : (
                            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setRollback(h.version)} title={hasSnap(h.version) ? 'Restore this version' : 'Seeded versions only have notes'}>
                              Roll back
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  <p className="tiny muted mb-0">Older seeded versions carry notes only; snapshots are kept for every version saved from this console.</p>
                </Card>
              </div>
            </div>

            <Modal
              open={rollback !== null}
              onClose={() => setRollback(null)}
              title={`Roll back to v${rollback}?`}
              subtitle="This creates a new version with the old settings. Nothing is deleted."
              footer={<><Button variant="ghost" onClick={() => setRollback(null)}>Cancel</Button><Button icon={RotateCcw} loading={busy === 'rb'} onClick={doRollback}>Roll back</Button></>}
            >
              {rollback !== null && !hasSnap(rollback) && <div className="callout small"><Info /> v{rollback} was seeded with a note only, so there may be no snapshot to restore.</div>}
              <p className="small mb-0 mt-1">New triage and routing decisions use the restored rules immediately.</p>
            </Modal>
          </>
        );
      }}
    </LiveGate>
  );
}
