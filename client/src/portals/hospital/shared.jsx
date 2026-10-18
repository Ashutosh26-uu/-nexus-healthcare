import { useEffect, useState } from 'react';
import { PlugZap } from 'lucide-react';
import { PreviewBadge } from '../../components/ui';

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

/* No hospital software (HMIS) integration exists yet — say so honestly instead of a fake "synced" chip. */
export function HmisCard() {
  return (
    <div className="card hmis-card">
      <div className="row top">
        <span className="hmis-icon"><PlugZap size={20} /></span>
        <div className="grow">
          <h4 className="mb-0 row" style={{ gap: 8 }}>HMIS connector <PreviewBadge>Coming soon</PreviewBadge></h4>
          <div className="small muted">Not connected</div>
        </div>
      </div>
      <p className="small muted mt-1 mb-0">Linking your hospital software isn&apos;t available yet, so nothing syncs automatically. Please keep the bed counts here up to date by hand — they&apos;re what the network sees.</p>
    </div>
  );
}
