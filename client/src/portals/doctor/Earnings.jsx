import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Stethoscope, Star, TrendingUp, Landmark, Inbox } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Stat, Loading, BarChart, TriageBadge, Empty, Avatar, fmtMoney, fmtNum, fmtDateTime } from '../../components/ui';
import { useDoctorHome } from './context';
import { getLocale } from '../../i18n';

// Typical recent volume for this doctor; today's bar uses real completions.
const DEMO_WEEK = [11, 14, 9, 16, 13, 7];

export default function Earnings() {
  const home = useDoctorHome();
  const data = home.data;

  const week = useMemo(() => {
    if (!data) return { values: [], labels: [] };
    const values = [];
    const labels = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000);
      const key = day.toISOString().slice(0, 10);
      const real = data.completed.filter((c) => (c.completedAt || '').startsWith(key)).length;
      values.push(i === 0 ? real : DEMO_WEEK[6 - i] + real);
      labels.push(i === 0 ? 'Today' : day.toLocaleDateString(getLocale(), { weekday: 'short' }));
    }
    return { values, labels };
  }, [data]);

  if (!data) return <Loading />;
  const { doctor, completed } = data;
  const weekTotal = week.values.reduce((a, b) => a + b, 0);
  const weekEarn = weekTotal * doctor.fee;
  const nextMonday = new Date();
  nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Earnings & reports" title="Your practice at a glance" subtitle="Payouts are settled every Monday. Kiosk pilot consults are reimbursed by the state health mission." />

      <div className="grid four">
        <Stat label="Consults done" value={fmtNum(doctor.consultsDone)} icon={Stethoscope} sub="since you joined" />
        <Stat label="Total earnings" value={fmtMoney(doctor.earnings)} icon={Wallet} sub={`${fmtMoney(doctor.fee)} per consult`} />
        <Stat label="This week" value={fmtMoney(weekEarn)} icon={TrendingUp} delta={`${weekTotal} consults`} deltaDir="up" />
        <Stat label="Patient rating" value={`${doctor.rating?.toFixed ? doctor.rating.toFixed(1) : doctor.rating} ★`} icon={Star} sub="from post-visit feedback" />
      </div>

      <div className="grid side">
        <Card title="Consults · last 7 days" action={<span className="tiny muted">{weekTotal} total</span>}>
          <BarChart data={week.values} labels={week.labels} height={180} />
        </Card>
        <Card className="green">
          <div className="row" style={{ gap: 10 }}><Landmark size={20} /><h3 className="mb-0">Next payout</h3></div>
          <div className="dr-payout">{fmtMoney(Math.round(weekEarn * 0.9))}</div>
          <p className="small mb-1" style={{ opacity: 0.85 }}>On {nextMonday.toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'short' })} to your bank account ending ••4421, after the 10% platform fee.</p>
          <p className="tiny mb-0" style={{ opacity: 0.7 }}>TDS under section 194J is deducted and shown on your monthly statement.</p>
        </Card>
      </div>

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
                    <td><TriageBadge level={c.triage.level} /></td>
                    <td className="small muted">{c.kioskName || 'App'}</td>
                    <td className="small muted nowrap">{fmtDateTime(c.completedAt)}</td>
                    <td className="right">{c.kioskName ? <span className="badge sky">Pilot</span> : fmtMoney(doctor.fee)}</td>
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
