import { Activity } from 'lucide-react';
import { cx, fmtDate } from '../../components/ui';

const LABEL = { bp: 'BP', sugar: 'Sugar', weight: 'Weight', spo2: 'SpO₂', temp: 'Temp' };

// Compact "Home readings" block (patient-logged BP / sugar / weight / SpO₂ / temperature). The server only sends
// it under the record's consent rules, so nothing here decides access.
export default function HomeReadings({ data, compact }) {
  if (!data?.count) return null;
  const l = data.last30;
  return (
    <div className={cx('dr-home-readings', compact && 'compact')} style={{ marginTop: compact ? 10 : 0, display: 'grid', gap: 4 }}>
      <span className="tiny muted row" style={{ gap: 4 }}><Activity size={13} />Home readings{l?.readings ? ` · ${l.readings} in 30 days` : ''}</span>
      <ul className="dr-psum-list">
        {data.latest.map((r) => (
          <li key={r.kind} className={cx(r.flag?.level !== 'ok' && 'abn')}>
            <span className="small">{LABEL[r.kind]}</span> <strong className="small" translate="no" dir="ltr">{r.text}</strong>
            {r.flag?.level === 'urgent' && <span className="badge solid-rose tiny">urgent</span>}
            {r.flag?.level === 'watch' && <span className="badge rose tiny">out of range</span>}
            <span className="tiny muted nowrap"> · {fmtDate(r.at)}</span>
          </li>
        ))}
      </ul>
      {l && (l.bpAvg || l.fastingAvg) && (
        <p className="tiny muted mb-0">30-day average{l.bpAvg ? ` BP ${l.bpAvg} (${l.bpCount})` : ''}{l.fastingAvg ? `${l.bpAvg ? ' ·' : ''} fasting sugar ${l.fastingAvg} (${l.fastingCount})` : ''}{l.flagged ? ` · ${l.flagged} flagged` : ''}</p>
      )}
      <p className="tiny muted mb-0">{data.note}</p>
    </div>
  );
}
