import { Timer, CheckCircle2, XCircle, TrendingUp } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Stat, LineChart, BarChart } from '../../components/ui';
import { getLocale } from '../../i18n';

const shortDate = (d) => d.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' });

export default function Analytics({ home }) {
  const a = home.analytics;
  const trend = a.occupancyTrend;
  const dayLabels = trend.map((_, i) => {
    const d = new Date(Date.now() - (trend.length - 1 - i) * 86400000);
    return i % 2 === (trend.length - 1) % 2 ? shortDate(d) : '';
  }).map((l, i) => l || ' '.repeat(i + 1)); // unique keys for blank labels
  const weekLabels = a.referralsWeek.map((_, i) => {
    const d = new Date(Date.now() - (a.referralsWeek.length - 1 - i) * 7 * 86400000);
    return i === a.referralsWeek.length - 1 ? 'This wk' : shortDate(d);
  });
  const decided = a.accepted + a.rejected;
  const avg = Math.round(trend.reduce((s, v) => s + v, 0) / trend.length);
  const totalRefs = a.referralsWeek.reduce((s, v) => s + v, 0);

  return (
    <>
      <PageHeader title="Facility analytics" subtitle="How busy you've been, and how quickly you respond to the network." />
      <div className="grid four">
        <Stat label="Avg referral turnaround" icon={Timer} value={`${a.avgTurnaroundMin} min`} sub="From request to decision" delta="6 min faster than last month" deltaDir="up" />
        <Stat label="Referrals accepted" icon={CheckCircle2} value={a.accepted} sub={decided ? `${Math.round((a.accepted / decided) * 100)}% acceptance` : 'No decisions yet'} />
        <Stat label="Referrals declined" icon={XCircle} value={a.rejected} />
        <Stat label="Avg occupancy, 14 days" icon={TrendingUp} value={`${avg}%`} sub={avg > 85 ? 'Running hot — consider overflow tie-ups' : 'Healthy headroom'} />
      </div>

      <div className="grid two mt-3">
        <Card title="Bed occupancy trend">
          <LineChart labels={dayLabels} series={[
            { name: 'Occupancy %', data: trend, color: 'var(--green-2)' },
            { name: '85% safe limit', data: trend.map(() => 85), color: 'var(--clay)', dashed: true },
          ]} />
        </Card>
        <Card title="Referrals received per week" action={<span className="tiny muted">{totalRefs} in 7 weeks</span>}>
          <BarChart data={a.referralsWeek} labels={weekLabels} color="var(--clay)" height={190} />
        </Card>
      </div>
    </>
  );
}
