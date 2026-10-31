import { Server, Video, CheckCircle2, CircleAlert, Activity, Gauge, Bug, Check } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Card, Empty, Stat, cx, timeAgo, useAction } from '../../components/ui';
import { api } from '../../api';
import { usePublicConfig } from '../../config';
import { useLive } from '../../live';
import { LiveGate } from './shared';

// Only what the server actually knows — no synthesized series. Requests, 5xx rate and p95 latency are measured
// by this server over the last hour (monitor.js); errors are grouped from the server and from people's browsers.
export default function Monitoring() {
  const live = useLive('/admin/home', ['admin', 'consults']);
  const config = usePublicConfig();

  return (
    <LiveGate live={live}>
      {({ monitoring }) => {
        const m = monitoring || {};
        return (
          <>
            <PageHeader eyebrow="Monitoring" title="System health" subtitle="Measured by this server over the last hour, plus every error people or the server hit." />
            <div className="grid four mb-2">
              <Stat label="Server running for" icon={Server} value={m.processUptimeHours != null ? `${m.processUptimeHours} h` : '—'} sub="since the last restart / deploy" />
              <Stat label="Consults live now" icon={Video} value={m.activeCalls ?? '—'} sub="in progress" />
              <Stat label="Server errors" icon={Activity} value={m.apiErrorRate != null ? `${m.apiErrorRate}%` : '—'} sub={m.requestsLastHour != null ? `${m.serverErrorsLastHour} of ${m.requestsLastHour} requests, last hour` : 'no requests yet'} />
              <Stat label="Slowest 5% of requests" icon={Gauge} value={m.p95LatencyMs != null ? `${m.p95LatencyMs} ms` : '—'} sub="p95 response time, last hour" />
            </div>
            <div className="grid side">
              <Card title="Services">
                <div className="list">
                  <Service name="Core API" ok detail="Answering — this page loaded from it" />
                  <Service name="Email codes (sign-in, password reset)" ok={config?.emailLive} detail={config?.emailLive ? 'Live email delivery' : 'Not connected — codes are not being emailed'} />
                  <Service name="SMS codes" ok={config?.smsLive} detail={config?.smsLive ? 'Live SMS delivery' : 'Not connected'} />
                </div>
              </Card>
              <Card title="Uptime and database">
                <p className="mb-0 small">The site is checked from outside every 15 minutes (GitHub Actions → Uptime); a failed check emails the repository owner. Database load is in the <strong>Neon console → Monitoring</strong>; server logs in <strong>Zoho Catalyst → AppSail → Logs</strong>.</p>
              </Card>
            </div>
            <Errors />
          </>
        );
      }}
    </LiveGate>
  );
}

// Errors grouped by kind: what broke, where, how often, since when. Resolving one hides it until it happens again.
function Errors() {
  const { data, reload } = useLive('/admin/errors', ['admin']);
  const [run, busy] = useAction();
  if (!data) return null;
  const resolve = async (g) => { if (await run(g.id, () => api.post(`/admin/errors/${g.id}/resolve`), 'Marked as fixed')) reload(); };
  return (
    <Card className="mt-3" title={<h3 className="row" style={{ gap: 8 }}><Bug size={18} /> Errors {data.open.length > 0 && <span className="badge clay">{data.open.length}</span>}</h3>}>
      {data.open.length === 0 ? <Empty icon={CheckCircle2} title="No open errors">New errors from the server or from people's browsers appear here, and admins get an email.</Empty> : (
        <div className="list">
          {data.open.map((g) => (
            <div key={g.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small" style={{ fontWeight: 600, wordBreak: 'break-word' }}>{g.message}</div>
                <div className="tiny muted">{g.source === 'browser' ? 'In the app' : 'On the server'}{g.route ? ` · ${g.method ? `${g.method} ` : ''}${g.route}` : ''} · {g.count}× · first {timeAgo(g.firstAt)}, last {timeAgo(g.lastAt)}</div>
                {g.stack && <details className="tiny"><summary className="muted">Where in the code</summary><pre className="mono tiny" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{g.stack}</pre></details>}
              </div>
              <Button size="sm" variant="ghost" icon={Check} loading={busy === g.id} onClick={() => resolve(g)}>Fixed</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Service({ name, ok, detail }) {
  return (
    <div className="list-item">
      {ok ? <CheckCircle2 size={18} color="var(--green-2)" /> : <CircleAlert size={18} color="#c28a16" />}
      <div className="grow">
        <div className="small" style={{ fontWeight: 600 }}>{name}</div>
        <div className="tiny muted">{detail}</div>
      </div>
      <span className={cx('badge', ok ? 'green' : 'sun')}>{ok ? 'Working' : 'Off'}</span>
    </div>
  );
}
