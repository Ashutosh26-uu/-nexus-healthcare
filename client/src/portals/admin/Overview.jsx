import { Link } from 'react-router-dom';
import { Users, UserRound, Stethoscope, Building2, MonitorSmartphone, BadgeCheck, ShieldAlert, ArrowRight, Server, Gauge, Video, PhoneCall, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Stat, Sparkline, StatusBadge, fmtNum, timeAgo, cx } from '../../components/ui';
import { useLive } from '../../live';
import { LiveGate, RoleBadge } from './shared';

function Health({ icon: Icon, label, value, unit, ok, hint }) {
  return (
    <div className={cx('ad-health-tile', ok ? 'ok' : 'warn')}>
      <span className="ad-health-icon">{Icon && <Icon />}</span>
      <div className="grow">
        <div className="tiny muted">{label}</div>
        <div className="ad-health-value">{value}<span>{unit}</span></div>
        <div className="tiny muted">{hint}</div>
      </div>
    </div>
  );
}

export default function Overview() {
  const home = useLive('/admin/home', ['admin', 'doctors', 'kiosks', 'audit']);
  const audit = useLive('/admin/audit', ['audit', 'admin']);

  return (
    <LiveGate live={home}>
      {({ counts: c, monitoring: m }) => {
        const recent = (audit.data || []).slice(0, 6);
        return (
          <>
            <PageHeader eyebrow="Platform" title="Running Nexus Healthcare" subtitle="Who is on the network, how the system is holding up, and what needs a human decision today." />

            <div className="grid four mb-2 ad-counts">
              <Stat label="Accounts" icon={Users} value={fmtNum(c.users)} sub="all roles" />
              <Stat label="Health passports" icon={UserRound} value={fmtNum(c.patients)} sub="patients & family profiles" />
              <Stat label="Doctors" icon={Stethoscope} value={fmtNum(c.doctors)} sub="on the teleconsult network" />
              <Stat label="Facilities" icon={Building2} value={fmtNum(c.facilities)} sub={`${c.kiosksOnline}/${c.kiosksTotal} kiosks online`} />
            </div>

            <div className="ad-nudges mb-2">
              <Link to="/admin/onboarding" className={cx('ad-nudge', c.pendingVerification ? 'sun' : 'calm')}>
                <span className="ad-nudge-icon"><BadgeCheck /></span>
                <div className="grow">
                  <strong>{c.pendingVerification ? `${c.pendingVerification} verification${c.pendingVerification > 1 ? 's' : ''} waiting` : 'Onboarding queue is clear'}</strong>
                  <span className="small">{c.pendingVerification ? 'Doctors and facilities can’t go live until someone checks their registration.' : 'Every doctor and facility on the network is verified.'}</span>
                </div>
                <ArrowRight />
              </Link>
              <Link to="/admin/audit?action=break_glass" className={cx('ad-nudge', c.breakGlassUnreviewed ? 'rose' : 'calm')}>
                <span className="ad-nudge-icon"><ShieldAlert /></span>
                <div className="grow">
                  <strong>{c.breakGlassUnreviewed ? `${c.breakGlassUnreviewed} break-glass event${c.breakGlassUnreviewed > 1 ? 's' : ''} to review` : 'No break-glass events pending'}</strong>
                  <span className="small">{c.breakGlassUnreviewed ? 'Emergency access to a patient’s records must be reviewed by an admin.' : 'Every emergency access has been reviewed.'}</span>
                </div>
                <ArrowRight />
              </Link>
            </div>

            <div className="grid side">
              <Card title="System health" action={<Link to="/admin/monitoring" className="small">Monitoring →</Link>}>
                {m.uptime == null ? (
                  <div className="ad-health-grid">
                    <Health icon={Server} label="Server running for" value={m.processUptimeHours ?? 0} unit=" h" ok hint="since the last restart / deploy" />
                    <Health icon={PhoneCall} label="Active calls" value={m.activeCalls} unit="" ok hint="consults in progress now" />
                    <p className="tiny muted mb-0">Request, error and latency metrics: Catalyst → AppSail → Logs &amp; Metrics.</p>
                  </div>
                ) : (<>
                <div className="ad-health-grid">
                  <Health icon={Server} label="Uptime (30 days)" value={m.uptime} unit="%" ok={m.uptime >= 99.9} hint="target 99.9%" />
                  <Health icon={AlertTriangle} label="API error rate" value={m.apiErrorRate} unit="%" ok={m.apiErrorRate < 1} hint="5xx over all requests" />
                  <Health icon={Gauge} label="p95 latency" value={m.p95LatencyMs} unit=" ms" ok={m.p95LatencyMs < 500} hint="budget 500 ms" />
                  <Health icon={Video} label="Video call quality" value={m.videoQuality} unit=" / 5" ok={m.videoQuality >= 4} hint="mean opinion score" />
                  <Health icon={PhoneCall} label="Active calls" value={m.activeCalls} unit="" ok hint="consults in progress now" />
                </div>
                <div className="ad-uptime">
                  <div className="row between tiny muted"><span>Uptime · last 7 days</span><span>{Math.min(...m.uptimeSeries)}% lowest</span></div>
                  <Sparkline data={m.uptimeSeries} height={56} />
                  <div className="row between tiny muted"><span>7 days ago</span><span>today</span></div>
                </div>
                </>)}
              </Card>

              <Card title="Recent activity" action={<Link to="/admin/audit" className="small">Audit log →</Link>}>
                {recent.length === 0 ? <p className="small muted">No activity yet.</p> : (
                  <div className="list">
                    {recent.map((a) => (
                      <div key={a.id} className={cx('list-item ad-activity', a.action === 'break_glass' && 'bg')}>
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="small"><strong translate="no">{a.actorName}</strong> <span className="muted">{a.action.replace(/_/g, ' ')}</span></div>
                          <div className="tiny muted row wrap" style={{ gap: 6 }}><RoleBadge role={a.role} /> {timeAgo(a.at)}{a.patientId ? ` · ${a.patientId}` : ''}</div>
                        </div>
                        {a.action === 'break_glass' && (a.reviewed ? <CheckCircle2 size={18} color="var(--green-2)" /> : <StatusBadge status="pending">Review</StatusBadge>)}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        );
      }}
    </LiveGate>
  );
}
