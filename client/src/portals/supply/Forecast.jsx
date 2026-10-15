import { TrendingUp, TrendingDown, ArrowRight, Info } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, BarChart, fmtNum } from '../../components/ui';

const short = (d) => d.replace(/ rapid kit| sachet| inhaler| \d+(mg|mcg)/gi, '').trim();

export default function Forecast({ home }) {
  const rows = home.forecast.map((f) => {
    const inv = home.inventory.find((i) => i.drug === f.drug);
    const usable = inv ? Math.max(inv.qty - inv.safetyStock, 0) : 0;
    return { ...f, stock: inv?.qty ?? 0, usable, gap: f.next14d - usable };
  });

  return (
    <>
      <PageHeader title="Regional demand forecast" subtitle="Expected demand over the next 14 days, from prescriptions, lab positives and outbreak alerts across your service area." />

      <div className="grid side">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Medicine</th><th>District</th><th className="right">Next 14 days</th><th>Trend</th><th className="right">Spare stock</th><th>Cover</th><th>Why</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.drug + r.district}>
                  <td><strong className="small" translate="no">{r.drug}</strong></td>
                  <td className="small">{r.district}</td>
                  <td className="right"><strong>{fmtNum(r.next14d)}</strong></td>
                  <td><Trend v={r.trend} /></td>
                  <td className="right small">{fmtNum(r.usable)}</td>
                  <td>{r.gap > 0 ? <span className="badge rose">Short {fmtNum(r.gap)}</span> : <span className="badge green">Covered</span>}</td>
                  <td className="small muted">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="stack lg">
          <Card title="Demand, next 14 days">
            <BarChart data={rows.map((r) => r.next14d)} labels={rows.map((r) => short(r.drug))} color="var(--green-2)" height={200} format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} />
          </Card>
          <div className="callout sky">
            <Info />
            <span>“Spare stock” is what's above your safety line. Where it says <strong>Short</strong>, raise a bulk order now — lead time from manufacturers is usually 7–10 days.</span>
          </div>
        </div>
      </div>
    </>
  );
}

function Trend({ v }) {
  const up = v > 5;
  const down = v < -5;
  const Icon = down ? TrendingDown : up ? TrendingUp : ArrowRight;
  return (
    <span className={`sup-trend ${up ? (v > 100 ? 'hot' : 'up') : down ? 'down' : 'flat'}`}>
      <Icon size={15} /> {v > 0 ? '+' : ''}{v}%
    </span>
  );
}
