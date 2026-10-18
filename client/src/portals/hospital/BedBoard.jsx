import { useRef, useState } from 'react';
import { Minus, Plus, Pencil, Check } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Progress, timeAgo, useToast, cx } from '../../components/ui';
import { api } from '../../api';
import { BED_TYPES, HmisCard, useTick } from './shared';

export default function BedBoard({ home, setData, reload }) {
  const toast = useToast();
  const [saving, setSaving] = useState({});
  const timers = useRef({});
  useTick(30000);

  // Optimistic: update the board instantly, then PUT. Debounced per bed type so
  // a nurse tapping "+" five times sends one request with the final number.
  const change = (type, patch) => {
    let next;
    setData((d) => {
      const beds = d.beds.map((b) => {
        if (b.type !== type) return b;
        const total = Math.max(0, patch.total ?? b.total);
        const occupied = Math.min(total, Math.max(0, patch.delta !== undefined ? b.occupied + patch.delta : b.occupied));
        next = { ...b, total, occupied, updatedAt: new Date().toISOString() };
        return next;
      });
      return { ...d, beds };
    });
    clearTimeout(timers.current[type]);
    timers.current[type] = setTimeout(async () => {
      if (!next) return;
      setSaving((s) => ({ ...s, [type]: true }));
      try {
        await api.put('/hospital/beds', { type, total: next.total, occupied: next.occupied });
      } catch (e) {
        toast(e.message, 'error');
        reload();
      } finally {
        setSaving((s) => ({ ...s, [type]: false }));
      }
    }, 450);
  };

  const totals = (home.beds || []).reduce((a, b) => ({ total: a.total + b.total, occ: a.occ + b.occupied }), { total: 0, occ: 0 });

  return (
    <>
      <PageHeader title="Live bed board" subtitle="Tap + when a patient is admitted, − when one is discharged. Changes reach referring doctors and the district command centre straight away." />

      <div className="grid side">
        <div className="bed-grid">
          {(home.beds || []).map((b) => (
            <BedCard key={b.type} bed={b} saving={saving[b.type]} onChange={(p) => change(b.type, p)} />
          ))}
        </div>
        <div className="stack lg">
          <HmisCard />
          <div className="card">
            <h4>Whole hospital</h4>
            <div className="row between mb-1">
              <span className="small muted">{totals.occ} occupied · {totals.total - totals.occ} free</span>
              <strong>{Math.round((totals.occ / (totals.total || 1)) * 100)}%</strong>
            </div>
            <Progress value={totals.occ} max={totals.total} />
            <p className="tiny muted mt-2 mb-0">Doctors see these free-bed counts when they choose where to refer a patient, and a ward with no free beds isn't offered to them.</p>
          </div>
        </div>
      </div>
    </>
  );
}

function BedCard({ bed, saving, onChange }) {
  const [editing, setEditing] = useState(false);
  const [total, setTotal] = useState(bed.total);
  const free = bed.total - bed.occupied;
  const pct = (bed.occupied / (bed.total || 1)) * 100;
  const meta = BED_TYPES[bed.type] || { label: bed.type };

  const saveTotal = () => {
    const n = Math.max(0, Number(total) || 0);
    onChange({ total: n });
    setEditing(false);
  };

  return (
    <div className={cx('card bed-card', free === 0 && 'full')}>
      <div className="row between">
        <div className="row" style={{ gap: 8 }}>
          <span className="bed-swatch" style={{ background: meta.color }} />
          <h3 className="mb-0">{meta.label}</h3>
        </div>
        {free === 0 ? <span className="badge solid-rose">Full</span> : pct >= 90 ? <span className="badge rose">Nearly full</span> : pct >= 75 ? <span className="badge sun">Filling up</span> : <span className="badge green">Space available</span>}
      </div>

      <div className="bed-figures">
        <div>
          <span className="bed-num">{free}</span>
          <span className="tiny muted">free</span>
        </div>
        <div className="bed-split">
          <div><strong>{bed.occupied}</strong> <span className="muted small">occupied</span></div>
          <div className="row" style={{ gap: 6 }}>
            {editing ? (
              <>
                <input className="input sm bed-total-input" type="number" min="0" value={total} autoFocus onChange={(e) => setTotal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveTotal()} aria-label="Total beds" />
                <button className="icon-btn" onClick={saveTotal} aria-label="Save total"><Check /></button>
              </>
            ) : (
              <>
                <strong>{bed.total}</strong> <span className="muted small">total</span>
                <button className="icon-btn bed-edit" onClick={() => { setTotal(bed.total); setEditing(true); }} aria-label="Edit total beds"><Pencil /></button>
              </>
            )}
          </div>
        </div>
      </div>

      <Progress value={bed.occupied} max={bed.total} />

      <div className="bed-stepper">
        <button className="step-btn" onClick={() => onChange({ delta: -1 })} disabled={bed.occupied <= 0} aria-label="Discharge one">
          <Minus /> <span>Discharge</span>
        </button>
        <button className="step-btn plus" onClick={() => onChange({ delta: 1 })} disabled={free <= 0} aria-label="Admit one">
          <Plus /> <span>Admit</span>
        </button>
      </div>

      <div className="tiny muted bed-updated">
        {saving ? <><span className="spinner sm" /> Saving…</> : <>Last updated {timeAgo(bed.updatedAt)}</>}
      </div>
    </div>
  );
}
