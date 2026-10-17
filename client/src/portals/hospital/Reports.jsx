import { useEffect, useState } from 'react';
import { Users, Footprints, Globe, IndianRupee, UserX, Timer, Download } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Card, Stat, Empty, Loading, Pills, fmtMoney } from '../../components/ui';
import { api } from '../../api';

// Local calendar dates (toISOString() is UTC and slips a day for IST early in the morning).
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthRange = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return [`${m}-01`, ymd(new Date(y, mo, 0))];
};
const hourLabel = (h) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`;
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function downloadCsv(r) {
  const lines = [
    [`Front-desk report · ${r.facility}`, `${r.from} to ${r.to}`],
    [],
    ['Doctor', 'Specialty', 'Visits', 'Seen', 'Walk-in', 'Online (in person)', 'Video', 'Revenue (INR)', 'Online payments (INR)', 'Desk fees (INR)', 'No-shows', 'Avg wait (min)'],
    ...r.doctors.map((x) => [x.name, x.specialty, x.visits, x.seen, x.walkIn, x.online, x.video, x.revenue, x.revenueOnline, x.revenueDesk, x.noShows, x.avgWaitMin ?? '']),
    ['Total', '', r.totals.visits, r.totals.seen, r.totals.walkIn, r.totals.online, r.totals.video, r.totals.revenue, r.totals.revenueOnline, r.totals.revenueDesk, r.totals.noShows, r.totals.avgWaitMin ?? ''],
    [],
    ['Date', 'Visits', 'Seen', 'Walk-in', 'Online', 'Revenue (INR)', 'No-shows'],
    ...r.days.map((x) => [x.date, x.visits, x.seen, x.walkIn, x.online, x.revenue, x.noShows]),
    [],
    ['Hour', 'Arrivals'],
    ...r.hours.map((n, h) => [`${String(h).padStart(2, '0')}:00`, n]),
  ];
  // BOM so Excel opens the ₹ / Hindi names as UTF-8.
  const blob = new Blob([String.fromCharCode(0xfeff), `${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `front-desk-${r.from}${r.to !== r.from ? `_to_${r.to}` : ''}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Reports() {
  const today = ymd(new Date());
  const [mode, setMode] = useState('day');
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [from, to] = mode === 'day' ? [day, day] : monthRange(month);

  useEffect(() => {
    let alive = true;
    setError('');
    api.get(`/hospital/reports?from=${from}&to=${to}`).then((r) => alive && setReport(r)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [from, to]);

  const r = report && report.from === from && report.to === to ? report : null;
  const maxHour = r ? Math.max(1, ...r.hours) : 1;
  // Show the usual OPD day (8 am – 8 pm), widened to any hour that actually had arrivals.
  const busy = r ? r.hours.map((n, h) => (n ? h : null)).filter((h) => h !== null) : [];
  const [h0, h1] = [Math.min(8, ...busy), Math.max(20, ...busy)];
  const hours = r ? r.hours.map((n, h) => ({ n, h })).filter(({ h }) => h >= h0 && h <= h1) : [];

  return (
    <>
      <PageHeader title="Front-desk reports" subtitle="Patients seen, walk-ins vs online, money collected and waiting times — from what your desk and doctors recorded.">
        <Button icon={Download} variant="secondary" disabled={!r} onClick={() => downloadCsv(r)}>Download CSV</Button>
      </PageHeader>

      <div className="rep-range mb-2">
        <Pills value={mode} onChange={setMode} options={[{ value: 'day', label: 'Day' }, { value: 'month', label: 'Month' }]} />
        {mode === 'day'
          ? <input className="input sm" type="date" max={today} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Day" />
          : <input className="input sm" type="month" max={today.slice(0, 7)} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />}
      </div>

      {error ? <div className="card"><Empty title="Couldn't load the report">{error}</Empty></div> : !r ? <Loading /> : (
        <>
          <div className="grid four">
            <Stat label="Patients seen" icon={Users} value={r.totals.seen} sub={`${r.totals.visits} visits`} />
            <Stat label="Walk-in vs online" icon={Footprints} value={`${r.totals.walkIn} / ${r.totals.online}`} sub={r.totals.video ? `+ ${r.totals.video} video` : 'In person'} />
            <Stat label="Collected" icon={IndianRupee} value={fmtMoney(r.totals.revenue)} sub={`${fmtMoney(r.totals.revenueOnline)} online · ${fmtMoney(r.totals.revenueDesk)} desk`} />
            <Stat label="Avg wait" icon={Timer} value={r.totals.avgWaitMin != null ? `${r.totals.avgWaitMin} min` : '—'} sub={<span><UserX size={12} /> {r.totals.noShows} no-show{r.totals.noShows === 1 ? '' : 's'}</span>} />
          </div>

          <div className="grid side mt-3">
            <Card title="By doctor">
              {r.doctors.length === 0 ? <Empty icon={Globe}title="Nothing recorded for this period">Tokens issued at the reception desk and paid bookings show up here.</Empty> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Doctor</th><th>Seen</th><th>Walk-in</th><th>Online</th><th>Revenue</th><th>No-shows</th><th>Avg wait</th></tr></thead>
                    <tbody>
                      {r.doctors.map((x) => (
                        <tr key={x.doctorId}>
                          <td><strong translate="no">{x.name}</strong><div className="tiny muted">{x.specialty}</div></td>
                          <td>{x.seen}<span className="tiny muted"> / {x.visits}</span></td>
                          <td>{x.walkIn}</td>
                          <td>{x.online}{x.video ? <span className="tiny muted"> +{x.video} video</span> : null}</td>
                          <td className="nowrap">{fmtMoney(x.revenue)}</td>
                          <td>{x.noShows}</td>
                          <td className="nowrap">{x.avgWaitMin != null ? `${x.avgWaitMin} min` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card title="Busiest hours" action={<span className="tiny muted">Arrivals at the desk</span>}>
              {r.hours.every((n) => !n) ? <Empty title="No arrivals yet">Check-ins and walk-in tokens are counted by the hour.</Empty> : (
                <div className="rep-hours" role="img" aria-label="Arrivals by hour">
                  {hours.map(({ n, h }) => (
                    <div key={h} title={`${hourLabel(h)}: ${n}`}>
                      <span className="tiny muted">{n || ''}</span>
                      <span className="bar" style={{ height: `${(n / maxHour) * 100}%` }} />
                      <span className="lbl">{h % 2 === 0 ? hourLabel(h) : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
