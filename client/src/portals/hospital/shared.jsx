import { useEffect, useState } from 'react';
import SoftwareConnect from '../../components/SoftwareConnect';

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

/* Hospital software (HMIS): a key and an optional webhook — beds, referrals and new-referral alerts in sync. */
export function HmisCard() {
  return <SoftwareConnect intro="Connect your hospital software so bed counts update here by themselves and new referrals reach it instantly. Until then, keep the bed counts here up to date by hand — they're what the network sees." />;
}
