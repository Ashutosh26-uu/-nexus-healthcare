import { Timer, CheckCircle2, XCircle, TrendingUp } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Stat, LineChart, BarChart, Empty } from '../../components/ui';
import { getLocale } from '../../i18n';

const shortDate = (d) => d.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' });

export default function Analytics({ home }) {
  const a = home.analytics || {};
  // Live networks: occupancy history isn't stored yet (null or one point) and turnaround is null until a decision.
  const trend = Array.isArray(a.occupancyTrend) ? a.occupancyTrend.filter((v) => typeof v === 'number') : [];
  const weeks = Array.isArray(a.referralsWeek) ? a.referralsWeek : [];
  const accepted = a.accepted || 0;
  const rejected = a.rejected || 0;
  const hasTrend = trend.length > 1;
  const dayLabels = trend.map((_, i) => {
    const d = new Date(Date.now() - (trend.length - 1 - i) * 86400000);
    return i % 2 === (trend.length - 1) % 2 ? shortDate(d) : '';
  }).map((l, i) => l || ' '.repeat(i + 1)); // unique keys for blank labels
  const weekLabels = weeks.map((_, i) => {
    const d = new Date(Date.now() - (weeks.length - 1 - i) * 7 * 86400000);
    return i === weeks.length - 1 ? 'This wk' : shortDate(d);
  });
  const decided = accepted + rejected;
  const avg = trend.length ? Math.round(trend.reduce((s, v) => s + v, 0) / trend.length) : null;
  const totalRefs = weeks.reduce((s, v) => s + (v || 0), 0);

  return (
    <>
      <PageHeader title="Facility analytics" subtitle="How busy you've been, and how quickly you respond to the network." />
      <div className="grid four">
        <Stat label="Avg referral turnaround" icon={Timer} value={a.avgTurnaroundMin != null ? `${a.avgTurnaroundMin} min` : '—'} sub={a.avgTurnaroundMin != null ? 'From request to decision' : 'Shows once you decide a referral'} />
        <Stat label="Referrals accepted" icon={CheckCircle2} value={accepted} sub={decided ? `${Math.round((accepted / decided) * 100)}% acceptance` : 'No decisions yet'} />
        <Stat label="Referrals declined" icon={XCircle} value={rejected} />
        <Stat label={hasTrend ? `Avg occupancy, ${trend.length} days` : 'Occupancy now'} icon={TrendingUp} value={avg != null ? `${avg}%` : '—'} sub={avg == null ? 'Add your beds to see occupancy' : avg > 85 ? 'Running hot — consider overflow tie-ups' : 'Healthy headroom'} />
      </div>

      <div className="grid two mt-3">
        <Card title="Bed occupancy trend">
          {hasTrend ? (
            <LineChart labels={dayLabels} series={[
              { name: 'Occupancy %', data: trend, color: 'var(--green-2)' },
              { name: '85% safe limit', data: trend.map(() => 85), color: 'var(--clay)', dashed: true },
            ]} />
          ) : <Empty icon={TrendingUp} title="Trend builds up over time">Keep your bed counts updated — a daily history appears here as it accumulates.</Empty>}
        </Card>
        <Card title="Referrals received per week" action={weeks.length ? <span className="tiny muted">{totalRefs} in {weeks.length} weeks</span> : null}>
          {totalRefs > 0
            ? <BarChart data={weeks} labels={weekLabels} color="var(--clay)" height={190} />
            : <Empty icon={TrendingUp} title="No referrals yet">Referrals doctors send you are counted here week by week.</Empty>}
        </Card>
      </div>
    </>
  );
}
