import { Link } from 'react-router-dom';
import { Users, UserRound, Stethoscope, Building2, BadgeCheck, ShieldAlert, ArrowRight, Server, PhoneCall, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Stat, StatusBadge, fmtNum, timeAgo, cx } from '../../components/ui';
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

// Chronic care plans across the network: how many run, and of the patients measured at the start and now (30+ days
// on a plan, enough readings at both ends), how many were at their doctor's target then vs now. Real counts only.
function CareOutcomes({ cp }) {
  const pct = (a, n) => (n ? `${Math.round((a / n) * 100)}%` : '—');
  const row = (label, o) => (
    <div className="row between small" style={{ gap: 8 }}>
      <span>{label}</span>
      <span>{o.n ? <><span className="muted">{pct(o.before, o.n)} at start</span> → <strong>{pct(o.now, o.n)} now</strong> <span className="tiny muted">({o.n} patient{o.n === 1 ? '' : 's'})</span></> : <span className="muted">not enough data yet</span>}</span>
    </div>
  );
  return (
    <Card className="mb-2" title={<h3 className="row" style={{ gap: 8 }}><ClipboardCheck size={18} /> Care plans · outcomes</h3>} action={<span className="tiny muted">{fmtNum(cp.active)} active · {fmtNum(cp.invited)} invited · {fmtNum(cp.lapsed)} paused</span>}>
      <div className="stack" style={{ gap: 6 }}>
        {row('Blood pressure at target', cp.bp)}
        {row('Fasting sugar at target', cp.fasting)}
        <p className="tiny muted mb-0">Patients 30+ days on a plan with readings at the start and now. {cp.reviewDue ? `${cp.reviewDue} plan${cp.reviewDue === 1 ? '' : 's'} waiting for a doctor review.` : ''}</p>
      </div>
    </Card>
  );
}

export default function Overview() {
  const home = useLive('/admin/home', ['admin', 'doctors', 'kiosks', 'audit', 'patients', 'consults', 'careplans', 'payments']);
  const audit = useLive('/admin/audit', ['audit', 'admin']);

  return (
    <LiveGate live={home}>
      {({ counts: c, monitoring: m, carePlans: cp }) => {
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

            {cp && <CareOutcomes cp={cp} />}

            <div className="grid side">
              <Card title="System health" action={<Link to="/admin/monitoring" className="small">Monitoring →</Link>}>
                {/* Only what the server knows — request, error and latency figures live on the hosting platform. */}
                <div className="ad-health-grid">
                  <Health icon={Server} label="Server running for" value={m?.processUptimeHours ?? '—'} unit={m?.processUptimeHours != null ? ' h' : ''} ok hint="since the last restart / deploy" />
                  <Health icon={PhoneCall} label="Active calls" value={m?.activeCalls ?? '—'} unit="" ok hint="consults in progress now" />
                  <p className="tiny muted mb-0">Request, error and latency metrics: Catalyst → AppSail → Logs &amp; Metrics.</p>
                </div>
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
