import { useState } from 'react';
import { Server, AlertTriangle, Gauge, Video, CheckCircle2, CircleAlert } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Stat, Pills, LineChart, BarChart, Sparkline, cx } from '../../components/ui';
import { useLive } from '../../live';
import { LiveGate, around } from './shared';

const SERVICES = [
  { name: 'Core API', detail: 'Express · 3 instances', status: 'ok' },
  { name: 'Live updates (SSE)', detail: 'push to every portal', status: 'ok' },
  { name: 'Video relay', detail: 'TURN · Mumbai, Delhi', status: 'ok' },
  { name: 'SMS & OTP gateway', detail: 'delivery 98.7%', status: 'ok' },
  { name: 'ABDM / health ID connector', detail: 'sandbox', status: 'degraded', note: 'Slow responses from upstream sandbox' },
  { name: 'Lab LIS sync', detail: 'hourly batch', status: 'ok' },
];

const INCIDENTS = [
  { at: '3 days ago', title: 'Video relay latency spike (Mumbai)', body: 'p95 rose to 900 ms for 14 minutes; traffic shifted to Delhi relay. Resolved.' },
  { at: '9 days ago', title: 'OTP delays on one SMS route', body: 'Fallback route enabled automatically; 212 OTPs delayed by under 60 s.' },
];

export default function Monitoring() {
  const live = useLive('/admin/home', ['admin']);
  const [range, setRange] = useState('24h');

  return (
    <LiveGate live={live}>
      {({ monitoring: m }) => {
        const day = range === '24h';
        const n = day ? 12 : 7;
        const labels = day ? Array.from({ length: 12 }, (_, i) => `${String((i * 2) % 24).padStart(2, '0')}h`) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const uptime = day ? around('up-d', m.uptime, n, 0.05, { min: 99.6, max: 100 }) : m.uptimeSeries;
        const errors = around(`err-${range}`, m.apiErrorRate, n, m.apiErrorRate * 0.6, { min: 0.02 });
        const p95 = around(`p95-${range}`, m.p95LatencyMs, n, 70, { digits: 0, min: 120 });
        const p50 = p95.map((v, i) => Math.round(v * 0.42 + (i % 3) * 4));
        const mos = around(`mos-${range}`, m.videoQuality, n, 0.25, { min: 3.4, max: 5, digits: 1 });
        const calls = around(`calls-${range}`, m.activeCalls, n, m.activeCalls * 0.5, { digits: 0, min: 4 });

        return (
          <>
            <PageHeader eyebrow="Monitoring" title="System health" subtitle="Uptime, errors, latency and call quality. Figures update as the platform reports.">
              <Pills value={range} onChange={setRange} options={[{ value: '24h', label: 'Last 24 h' }, { value: '7d', label: 'Last 7 days' }]} />
            </PageHeader>

            <div className="grid four mb-2">
              <Stat label="Uptime" icon={Server} value={`${m.uptime}%`} sub="30-day rolling · target 99.9%" />
              <Stat label="API error rate" icon={AlertTriangle} value={`${m.apiErrorRate}%`} sub="5xx responses" />
              <Stat label="p95 latency" icon={Gauge} value={`${m.p95LatencyMs} ms`} sub="all API routes" />
              <Stat label="Video quality" icon={Video} value={`${m.videoQuality}/5`} sub={`${m.activeCalls} calls live`} />
            </div>

            <div className="grid two mb-2">
              <Card title="Uptime" action={<span className="tiny muted">downtime, seconds per {day ? '2 h' : 'day'}</span>}>
                <div className="ad-chart-scroll"><BarChart data={uptime.map((v) => Math.round(((100 - v) / 100) * (day ? 7200 : 86400)))} labels={labels} color="var(--green-2)" height={150} format={(v) => `${v}s`} /></div>
                <div className="mt-1"><Sparkline data={uptime} height={40} /></div>
                <p className="tiny muted mb-0">Availability {Math.min(...uptime)}% at the lowest point, {m.uptime}% now.</p>
              </Card>
              <Card title="API errors" action={<span className="tiny muted">% of requests</span>}>
                <div className="ad-chart-scroll"><BarChart data={errors} labels={labels} color="var(--clay)" height={180} format={(v) => v.toFixed(2)} /></div>
              </Card>
              <Card title="Latency" action={<span className="tiny muted">milliseconds</span>}>
                <LineChart labels={labels} series={[{ name: 'p95', data: p95, color: 'var(--sky)' }, { name: 'p50', data: p50, color: 'var(--ink-3)', dashed: true }]} />
              </Card>
              <Card title="Video call quality" action={<span className="tiny muted">MOS 1–5 · calls</span>}>
                <LineChart labels={labels} series={[{ name: 'Mean opinion score', data: mos, color: 'var(--green-2)' }]} height={150} />
                <div className="mt-1 ad-chart-scroll"><BarChart data={calls} labels={[]} color="var(--sky-soft)" height={70} format={(v) => v} /></div>
                <p className="tiny muted mb-0">Bars show concurrent calls. Calls under MOS 3.5 automatically drop to audio-only with captions.</p>
              </Card>
            </div>

            <div className="grid side">
              <Card title="Services">
                <div className="list">
                  {SERVICES.map((s) => (
                    <div key={s.name} className="list-item">
                      {s.status === 'ok' ? <CheckCircle2 size={18} color="var(--green-2)" /> : <CircleAlert size={18} color="#c28a16" />}
                      <div className="grow">
                        <div className="small" style={{ fontWeight: 600 }}>{s.name}</div>
                        <div className="tiny muted">{s.note || s.detail}</div>
                      </div>
                      <span className={cx('badge', s.status === 'ok' ? 'green' : 'sun')}>{s.status === 'ok' ? 'Operational' : 'Degraded'}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Recent incidents">
                <div className="stack">
                  {INCIDENTS.map((i) => (
                    <div key={i.title} className="ad-incident">
                      <div className="tiny muted">{i.at}</div>
                      <div className="small" style={{ fontWeight: 600 }}>{i.title}</div>
                      <div className="tiny muted">{i.body}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        );
      }}
    </LiveGate>
  );
}
