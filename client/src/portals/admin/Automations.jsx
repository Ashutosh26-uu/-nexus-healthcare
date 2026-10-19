import { useCallback, useEffect, useState } from 'react';
import { Workflow, Send, CheckCircle2, CircleAlert, KeyRound, ShieldCheck, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { api, subscribe } from '../../api';
import { Button, Card, Stat, Empty, timeAgo, useAction, cx } from '../../components/ui';

const STATUS_TONE = { sent: 'green', retrying: 'sun', failed: 'rose' };

// n8n connection: is it set up, what's been sent, and a test button. Secrets never leave the server.
export default function Automations() {
  const [s, setS] = useState(null);
  const [run, busy] = useAction();
  // A failed refresh keeps the last good status on screen instead of flipping the page to the error state.
  const load = useCallback(() => api.get('/admin/automation').then(setS).catch(() => setS((prev) => (prev && !prev.error ? prev : { error: true }))), []);
  // Live: every delivery attempt pushes an update; the slow poll only covers a dropped live connection.
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useEffect(() => subscribe((topics) => { if (topics.includes('all') || topics.includes('automation')) load(); }), [load]);
  const test = () => run('test', () => api.post('/admin/automation/test', {}).finally(load), 'Test event delivered to n8n ✅');

  if (!s) return <div className="skeleton" style={{ height: 240, borderRadius: 16 }} />;
  if (s.error) return <Card><Empty icon={CircleAlert} title="Couldn't load automation status">Try again in a moment.</Empty></Card>;
  const { webhook, api: inApi, stats } = s;

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Automations" title="n8n workflows" subtitle="Nexus sends signed events to n8n when things happen; n8n workflows can read summaries and send reminders with a limited key.">
        <Button variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Button>
        <Button icon={Send} loading={busy === 'test'} disabled={!webhook.on} onClick={test}>Send test event</Button>
      </PageHeader>

      {s.problems.length > 0 && <div className="callout rose"><CircleAlert /><span>{s.problems.join(' ')}</span></div>}

      <div className="grid two">
        <Card title="Events → n8n" action={<span className={cx('badge', webhook.on ? 'green' : '')}>{webhook.on ? 'Connected' : 'Off'}</span>}>
          {webhook.on ? (
            <div className="stack sm small">
              <span><Workflow size={14} style={{ verticalAlign: '-2px' }} /> Sending to <strong translate="no">{webhook.host}</strong></span>
              <span className="muted">Events: {webhook.events === 'all' ? 'all' : webhook.events.join(', ')}</span>
              <span className="muted">{webhook.shareContact ? 'Patient first name, mobile and email are included (for reminders).' : 'IDs only — no patient contact details.'} Medical details are never sent.</span>
            </div>
          ) : (
            <p className="small muted mb-0">Set <code>N8N_WEBHOOK_URL</code> and <code>N8N_WEBHOOK_SECRET</code> on the server (Catalyst → AppSail → Environment variables), then restart.</p>
          )}
        </Card>
        <Card title="n8n → Nexus API" action={<span className={cx('badge', inApi.on ? 'green' : '')}>{inApi.on ? 'Key set' : 'Off'}</span>}>
          <p className="small mb-0">
            <KeyRound size={14} style={{ verticalAlign: '-2px' }} /> {inApi.on ? 'Workflows can call /api/automation/* with the key.' : <>Set <code>N8N_API_KEY</code> (32+ characters) to let workflows read summaries and upcoming visits.</>}
            <span className="muted block mt-1"><ShieldCheck size={13} style={{ verticalAlign: '-2px' }} /> The key only reaches automation routes — never patient records or admin actions.</span>
          </p>
        </Card>
      </div>

      <div className="grid four">
        <Stat label="Delivered" value={stats.sent} icon={CheckCircle2} />
        <Stat label="Retried" value={stats.retried} />
        <Stat label="Failed" value={stats.failed} icon={CircleAlert} />
        <Stat label="Waiting" value={s.queue} sub={stats.lastSuccessAt ? `last sent ${timeAgo(stats.lastSuccessAt)}` : 'nothing sent yet'} />
      </div>

      {stats.lastError && <div className="callout"><CircleAlert /><span>Last problem {timeAgo(stats.lastError.at)}: <strong>{stats.lastError.event}</strong> — {stats.lastError.message}. Nexus retries automatically for about 45 minutes.</span></div>}

      <div className="grid two">
        <Card title="Recent deliveries">
          {stats.recent.length === 0 ? <Empty icon={Send} title="Nothing sent yet">Events appear here as they go out.</Empty> : (
            <table className="table small">
              <tbody>
                {stats.recent.map((r) => (
                  <tr key={`${r.id}-${r.at}`}>
                    <td><code>{r.event}</code></td>
                    <td><span className={cx('badge', STATUS_TONE[r.status])}>{r.status}{r.code ? ` · ${r.code}` : ''}</span></td>
                    <td className="muted right">{timeAgo(r.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Events you can use">
          <div className="stack sm">
            {s.catalog.map((e) => <div key={e.name} className="small"><code>{e.name}</code> <span className="muted">— {e.about}</span></div>)}
          </div>
        </Card>
      </div>
    </div>
  );
}
