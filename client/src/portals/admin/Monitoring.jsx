import { Server, Video, CheckCircle2, CircleAlert } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Stat, cx } from '../../components/ui';
import { usePublicConfig } from '../../config';
import { useLive } from '../../live';
import { LiveGate } from './shared';

// Only what the server actually knows — no synthesized uptime/latency/MOS series, services list or incidents.
// Request, error and latency metrics live on the hosting platform; we point there instead of inventing them.
export default function Monitoring() {
  const live = useLive('/admin/home', ['admin', 'consults']);
  const config = usePublicConfig();

  return (
    <LiveGate live={live}>
      {({ monitoring }) => {
        const m = monitoring || {};
        return (
          <>
            <PageHeader eyebrow="Monitoring" title="System health" subtitle="What this server knows right now. Request rates, errors and latency come from your hosting platform." />
            <div className="grid four mb-2">
              <Stat label="Server running for" icon={Server} value={m.processUptimeHours != null ? `${m.processUptimeHours} h` : '—'} sub="since the last restart / deploy" />
              <Stat label="Consults live now" icon={Video} value={m.activeCalls ?? '—'} sub="in progress" />
            </div>
            <div className="grid side">
              <Card title="Services">
                <div className="list">
                  <Service name="Core API" ok detail="Answering — this page loaded from it" />
                  <Service name="Email codes (sign-in, password reset)" ok={config?.emailLive} detail={config?.emailLive ? 'Live email delivery' : 'Not connected — codes are not being emailed'} />
                  <Service name="SMS codes" ok={config?.smsLive} detail={config?.smsLive ? 'Live SMS delivery' : 'Not connected'} />
                </div>
              </Card>
              <Card title="Metrics and incidents">
                <p className="mb-0 small">For request rates, error rates and latency, open <strong>Zoho Catalyst → AppSail → your app → Logs &amp; Metrics</strong>. Database load is in the <strong>Neon console → Monitoring</strong>. Sehatra doesn&apos;t track incidents itself yet.</p>
              </Card>
            </div>
          </>
        );
      }}
    </LiveGate>
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
