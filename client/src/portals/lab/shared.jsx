import { Check, TestTube, Building, FlaskConical, FileCheck2 } from 'lucide-react';
import { cx } from '../../components/ui';
import { getLocale } from '../../i18n';

export const STEPS = [
  { key: 'collected', label: 'Collected', icon: TestTube },
  { key: 'received', label: 'Received at lab', icon: Building },
  { key: 'processing', label: 'Processing', icon: FlaskConical },
  { key: 'reported', label: 'Reported', icon: FileCheck2 },
];
export const ORDER = ['ordered', 'collected', 'received', 'processing', 'reported'];
export const STATUS_LABEL = { ordered: 'New order', collected: 'Sample collected', received: 'Received', processing: 'Processing', reported: 'Reported' };

export const NEXT = {
  ordered: { status: 'collected', label: 'Mark sample collected', done: 'Sample marked collected' },
  collected: { status: 'received', label: 'Mark received at lab', done: 'Sample received at the lab' },
  received: { status: 'processing', label: 'Start processing', done: 'Processing started' },
};

export function Stepper({ order, compact }) {
  const idx = ORDER.indexOf(order.status);
  return (
    <ol className={cx('lab-stepper', compact && 'compact')}>
      {STEPS.map((s, i) => {
        const stepIdx = i + 1;
        const done = idx >= stepIdx;
        const current = idx + 1 === stepIdx;
        const at = order[`${s.key}At`];
        return (
          <li key={s.key} className={cx(done && 'done', current && 'current')}>
            <span className="lab-step-dot">{done ? <Check size={14} /> : <s.icon size={14} />}</span>
            <span className="lab-step-label">{s.label}</span>
            {!compact && at && <span className="lab-step-time">{new Date(at).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' })}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function TestChips({ tests }) {
  return (
    <div className="lab-tests">
      {tests.map((t) => (
        <span key={t.code + t.name} className="lab-test">
          {t.name}
          <span className="loinc" title="LOINC code">{t.code}</span>
        </span>
      ))}
    </div>
  );
}

export const genderShort = (g) => (g ? g[0].toUpperCase() : '');
