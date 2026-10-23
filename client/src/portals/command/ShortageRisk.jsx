import { ShieldAlert } from 'lucide-react';
import { Card, Button, cx, fmtNum } from '../../components/ui';
import { useLive } from '../../live';

const TONE = { critical: 'rose', low: 'sun' };
const WORD = { critical: 'Under a week', low: 'Under 2 weeks' };

// Essential medicines, district by district: total pharmacy stock against the last 30 days of sales.
export default function ShortageRisk({ onMove }) {
  const { data } = useLive('/gov/shortage-risk', ['gov', 'supply', 'pharmacy']);
  const rows = data?.rows || [];
  return (
    <Card title={<div><h3 className="row" style={{ gap: 8 }}><ShieldAlert size={18} /> Essential medicines at risk</h3><p className="tiny muted mb-0">By district · all pharmacies' stock vs. the last 30 days of sales</p></div>}>
      {!data ? null : rows.length === 0 ? <p className="small muted mb-0">No essential medicine is under two weeks of cover in any district.</p> : (
        <div className="stack" style={{ gap: 6 }}>
          {rows.slice(0, 25).map((r) => (
            <div key={`${r.district}-${r.item}`} className="row wrap" style={{ gap: 8 }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small"><strong translate="no">{r.item}</strong> · {r.district}</div>
                <div className="tiny muted">{fmtNum(r.stock)} in stock across {r.pharmacies} pharmac{r.pharmacies === 1 ? 'y' : 'ies'}{r.perDay ? ` · ~${r.perDay}/day` : ''}{r.daysCover != null ? ` · ${r.daysCover} days left` : ''}</div>
              </div>
              <span className={cx('badge', TONE[r.risk])}>{WORD[r.risk]}</span>
              <Button size="sm" variant="secondary" onClick={() => onMove?.(r.item)}>Move stock</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
