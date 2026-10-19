import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Stethoscope, Star, TrendingUp, Landmark, Inbox, FileText, Printer } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Card, Stat, Loading, BarChart, TriageBadge, Empty, Avatar, fmtMoney, fmtNum, fmtDateTime } from '../../components/ui';
import { useDoctorHome } from './context';
import { getLocale } from '../../i18n';

// Real numbers only, in every mode — nothing is padded so the chart "looks busy".
export default function Earnings() {
  const home = useDoctorHome();
  const data = home.data;
  // Local calendar month (not UTC), so the picker never defaults to next/last month around midnight.
  const thisMonth = useMemo(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; }, []);
  const [month, setMonth] = useState(thisMonth);

  // The server counts every completed consult per day (`completed` is only the latest 20) and sums what
  // patients actually paid, so free follow-ups don't inflate the earnings.
  const week = useMemo(() => {
    if (!data) return { values: [], labels: [], earned: 0 };
    const days = data.week || [];
    return {
      values: days.map((d) => d.consults || 0),
      labels: days.map((d, i) => (i === days.length - 1 ? 'Today' : new Date(`${d.date}T12:00:00`).toLocaleDateString(getLocale(), { weekday: 'short' }))),
      earned: days.reduce((s, d) => s + (d.earnings || 0), 0),
      plans: days.reduce((s, d) => s + (d.plans || 0), 0),
      planFees: days.reduce((s, d) => s + (d.planFees || 0), 0),
    };
  }, [data]);

  if (!data) return <Loading />;
  const { doctor } = data;
  const completed = data.completed || [];
  const weekTotal = week.values.reduce((a, b) => a + b, 0);
  const weekEarn = week.earned;
  // Only real patient reviews count — a doctor with none shows "no reviews yet", not a number.
  const reviews = doctor.reviewStats?.count || 0;
  const rating = reviews && Number(doctor.rating) ? Number(doctor.rating) : null;

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Earnings & reports" title="Your practice at a glance" subtitle="What patients paid for the consults you completed and the care plans you run, straight from your records." />

      <div className="grid four">
        <Stat label="Consults done" value={fmtNum(doctor.consultsDone)} icon={Stethoscope} sub="since you joined" />
        <Stat label="Total earnings" value={fmtMoney(doctor.earnings)} icon={Wallet} sub={`${fmtMoney(doctor.fee)} per consult`} />
        <Stat label="Last 7 days" value={fmtMoney(weekEarn)} icon={TrendingUp} sub={`${weekTotal} consult${weekTotal === 1 ? '' : 's'}${week.plans ? ` · ${week.plans} care-plan month${week.plans === 1 ? '' : 's'} (${fmtMoney(week.planFees)})` : ''}`} />
        <Stat label="Patient rating" value={rating ? `${rating.toFixed(1)} ★` : '—'} icon={Star} sub={rating ? `from ${reviews} patient review${reviews === 1 ? '' : 's'}` : 'No reviews yet'} />
      </div>

      <div className="grid side">
        <Card title="Consults · last 7 days" action={<span className="tiny muted">{weekTotal} total</span>}>
          {weekTotal > 0
            ? <BarChart data={week.values} labels={week.labels} height={180} />
            : <Empty icon={Stethoscope} title="No consults in the last 7 days">Each day fills in as you complete visits.</Empty>}
        </Card>
        <Card className="green">
          <div className="row" style={{ gap: 10 }}><Landmark size={20} /><h3 className="mb-0">Your share, last 7 days</h3></div>
          <div className="dr-payout">{fmtMoney(Math.round(weekEarn * 0.9))}</div>
          <p className="small mb-1" style={{ opacity: 0.85 }}>Fees from the last 7 days after the 10% platform fee — an estimate, not a payout statement. The Nexus Healthcare team settles payouts to your registered account; contact them with any questions.</p>
          <p className="tiny mb-0" style={{ opacity: 0.7 }}>Amounts shown are before TDS (section 194J), which is deducted at payout where applicable.</p>
        </Card>
      </div>

      <Card title="Monthly statement" action={<FileText size={18} className="muted" />}>
        <p className="small muted">Consults and care-plan months day by day, fees collected, the 10% platform fee and your payout — ready to print or save as PDF.</p>
        <div className="dr-statement-pick">
          <input className="input" type="month" value={month} max={thisMonth} min="2024-01" onChange={(e) => setMonth(e.target.value)} aria-label="Statement month" />
          <Button icon={Printer} disabled={!/^\d{4}-\d{2}$/.test(month) || month > thisMonth} onClick={() => window.open(`/statement/${month}`, '_blank', 'noopener')}>Open statement</Button>
        </div>
      </Card>

      <Card title="Recently completed" action={<span className="tiny muted">last {completed.length}</span>}>
        {completed.length === 0 ? (
          <Empty icon={Inbox} title="No completed consults yet">Finished visits land here with what you prescribed.</Empty>
        ) : (
          <div className="table-wrap" style={{ border: 0 }}>
            <table className="table">
              <thead><tr><th>Patient</th><th>Diagnosis</th><th>Triage</th><th>Via</th><th>Completed</th><th className="right">Fee</th></tr></thead>
              <tbody>
                {completed.map((c) => (
                  <tr key={c.id}>
                    <td><div className="row" style={{ gap: 10 }}><Avatar name={c.patientName} size="sm" /><Link to={`/doctor/consult/${c.id}`} translate="no">{c.patientName}</Link></div></td>
                    <td className="small">{c.diagnosis || <span className="muted">—</span>}</td>
                    <td><TriageBadge level={c.triage?.level} /></td>
                    <td className="small muted">{c.kioskName || 'App'}</td>
                    <td className="small muted nowrap">{fmtDateTime(c.completedAt)}</td>
                    <td className="right">{c.kioskId ? fmtMoney(doctor.fee) : Number(c.fee) > 0 ? fmtMoney(c.fee) : <span className="muted">Free</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
