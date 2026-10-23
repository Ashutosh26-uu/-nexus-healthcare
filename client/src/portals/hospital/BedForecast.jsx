import { TrendingUp } from 'lucide-react';
import { Card, Sparkline } from '../../components/ui';
import { useLive } from '../../live';

// How fast beds are filling, from this hospital's own hourly bed counts. No guess until there are 3 days of data.
export default function BedForecast() {
  const { data } = useLive('/hospital/bed-forecast', ['beds']);
  if (!data || data.status === 'no-beds') return null;
  let body;
  if (data.status === 'collecting') {
    body = <p className="small muted mb-0">Learning your bed pattern — {data.days} of {data.needDays} days recorded. A forecast appears once there is enough real data.</p>;
  } else {
    const free = data.total - data.occupied;
    const line = data.daysToFull != null
      ? (data.daysToFull <= 3 ? <strong style={{ color: 'var(--rose)' }}>At this rate you'll be full in about {data.daysToFull} day{data.daysToFull === 1 ? '' : 's'} ({data.fullBy}).</strong> : <>At this rate you'll be full in about <strong>{data.daysToFull} days</strong> ({data.fullBy}).</>)
      : data.perDay < -0.05 ? <>Occupancy is falling — about <strong>{Math.abs(data.perDay)} fewer beds a day</strong>.</> : <>Occupancy is steady.</>;
    body = (
      <>
        <p className="small mt-0">{line} {free} bed{free === 1 ? '' : 's'} free now{data.perDay > 0.05 ? `, filling by about ${data.perDay} a day` : ''}.</p>
        {data.series?.length > 1 && <Sparkline data={data.series.map((s) => s.pct)} />}
        <p className="tiny muted mb-0">Busiest hour of each of the last {data.series.length} days. Plan staff and discharges ahead.</p>
      </>
    );
  }
  return <Card title={<h3 className="row" style={{ gap: 8 }}><TrendingUp size={18} /> Bed forecast</h3>}>{body}</Card>;
}
