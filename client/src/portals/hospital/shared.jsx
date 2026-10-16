import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, PlugZap } from 'lucide-react';
import { timeAgo, useToast, cx } from '../../components/ui';

export const BED_TYPES = {
  general: { label: 'General ward', short: 'General', color: 'var(--green-2)' },
  icu: { label: 'ICU', short: 'ICU', color: 'var(--rose)' },
  oxygen: { label: 'Oxygen-supported', short: 'Oxygen', color: 'var(--sky)' },
  pediatric: { label: 'Paediatric', short: 'Paediatric', color: 'var(--clay)' },
};
export const bedLabel = (t) => BED_TYPES[t]?.label || t;
export const occTone = (pct) => (pct >= 90 ? 'var(--rose)' : pct >= 75 ? 'var(--sun)' : 'var(--green-2)');

/* Re-render every `ms` so "x min ago" labels stay honest. */
export function useTick(ms = 30000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/* Simulated HMIS connector — the POC has no real hospital software to talk to. */
export function useHmis() {
  const toast = useToast();
  const [lastSync, setLastSync] = useState(() => new Date(Date.now() - 2 * 60000).toISOString());
  const [syncing, setSyncing] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const syncNow = useCallback(() => {
    setSyncing(true);
    timer.current = setTimeout(() => {
      setSyncing(false);
      setLastSync(new Date().toISOString());
      toast('HMIS sync done — bed counts and duty roster match eHospital');
    }, 1400);
  }, [toast]);
  return { lastSync, syncing, syncNow, system: 'eHospital (NIC) v3.2' };
}

export function HmisChip({ hmis, compact }) {
  useTick(30000); // only the chip shows "x min ago" — ticking here keeps the whole portal from re-rendering every 30 s
  return (
    <div className={cx('hmis-chip', compact && 'compact')}>
      <span className={cx('dot', hmis.syncing ? 'sun' : 'green', !hmis.syncing && 'pulse')} />
      <span className="hmis-text">
        <strong>{hmis.syncing ? 'Syncing with HMIS…' : 'HMIS synced'}</strong>
        {!hmis.syncing && <span className="muted"> · {timeAgo(hmis.lastSync)}</span>}
      </span>
      <button className="hmis-btn" onClick={hmis.syncNow} disabled={hmis.syncing} title="Pull latest from HMIS">
        <RefreshCw size={14} className={hmis.syncing ? 'spin' : ''} />
        {!compact && <span>Sync now</span>}
      </button>
    </div>
  );
}

export function HmisCard({ hmis }) {
  return (
    <div className="card hmis-card">
      <div className="row top">
        <span className="hmis-icon"><PlugZap size={20} /></span>
        <div className="grow">
          <h4 className="mb-0">HMIS connector</h4>
          <div className="small muted">{hmis.system} · two-way sync every 5 min</div>
        </div>
      </div>
      <p className="small muted mt-1 mb-1">Admissions and discharges in your hospital software update this board automatically, so nobody has to type the same thing twice. Use the steppers only when the HMIS is down or lagging.</p>
      <HmisChip hmis={hmis} />
    </div>
  );
}
