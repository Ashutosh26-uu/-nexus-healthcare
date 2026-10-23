import { CalendarClock, Truck } from 'lucide-react';
import { Button, Card, cx, fmtNum, useAction } from '../../components/ui';
import { useLive } from '../../live';
import { api } from '../../api';

// Refills due here in the next two weeks: regular patients whose medicines run out soon, totalled per medicine
// against the shelf. Short lines can be requested from a nearby store or warehouse in one tap.
export default function RefillForecast() {
  const { data, reload } = useLive('/pharmacy/refill-forecast', ['pharmacy', 'prescriptions', 'medorders', 'supply']);
  const [run, busy] = useAction();
  const items = data?.items || [];
  if (!items.length) return null;
  const request = (r) => run(`rq-${r.drug}`, () => api.post('/transfers/request', { drug: r.drug, qty: r.short }), `Requested ${r.short} × ${r.drug}`).then(reload);
  return (
    <Card className="ex-card" title={<h3 className="row" style={{ gap: 8 }}><CalendarClock size={18} /> Refills due in the next 2 weeks</h3>}>
      <p className="small muted mt-0">{data.patients} regular patient{data.patients === 1 ? '' : 's'} who buy here will need these soon. Keep them on the shelf.</p>
      <div className="list">
        {items.map((r) => (
          <div key={r.drug} className="list-item">
            <div className="grow" style={{ minWidth: 0 }}>
              <strong className="small" translate="no">{r.drug}</strong>
              <div className="tiny muted">{fmtNum(r.units)} units for {r.patients} patient{r.patients === 1 ? '' : 's'} · {fmtNum(r.thisWeek)} this week · {fmtNum(r.stock)} in stock</div>
            </div>
            {r.short > 0
              ? <><span className={cx('badge', 'rose')}>Short by {fmtNum(r.short)}</span><Button size="sm" variant="secondary" icon={Truck} loading={busy === `rq-${r.drug}`} onClick={() => request(r)}>Request</Button></>
              : <span className="badge green">Enough stock</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}
