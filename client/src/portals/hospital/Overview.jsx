import { Link } from 'react-router-dom';
import { BedDouble, HeartPulse, Ambulance, Stethoscope, ArrowRight, Clock, Video } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Stat, Donut, Sparkline, TriageBadge, Avatar, Empty, timeAgo, fmtNum } from '../../components/ui';
import { useAuth } from '../../auth';
import { BED_TYPES, bedLabel, occTone } from './shared';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Overview({ home }) {
  const { user } = useAuth();
  const { beds, referrals, roster, analytics, facility } = home;
  const free = beds.reduce((s, b) => s + (b.total - b.occupied), 0);
  const total = beds.reduce((s, b) => s + b.total, 0);
  const occupied = total - free;
  const icu = beds.find((b) => b.type === 'icu');
  const pending = referrals.filter((r) => r.status === 'pending');
  const onDuty = roster.filter((r) => r.onDuty);
  const trend = [...analytics.occupancyTrend.slice(0, -1), Math.round((occupied / (total || 1)) * 100)];
  const nowPct = trend[trend.length - 1];

  return (
    <>
      <PageHeader eyebrow={facility.name} title={`${greeting()}, ${user?.name?.split(' ')[0] || 'there'}`} subtitle="Here's your hospital at a glance. Bed counts here are what the network sees when it routes patients." />

      <div className="grid four">
        <Stat label="Free beds right now" icon={BedDouble} value={fmtNum(free)} sub={`of ${fmtNum(total)} across all wards`} />
        <Stat label="ICU beds free" icon={HeartPulse} value={icu ? icu.total - icu.occupied : '—'} sub={icu && icu.total - icu.occupied <= 1 ? 'Almost full — keep this updated' : 'Updated live'} />
        <Stat label="Referrals waiting" icon={Ambulance} value={pending.length} sub={pending.length ? 'Ambulance crews are waiting on you' : 'Nothing pending'} />
        <Stat label="Doctors on duty" icon={Stethoscope} value={onDuty.length} sub={`${roster.filter((r) => r.teleconsult).length} open for teleconsult`} />
      </div>

      <div className="grid side mt-3">
        <Card title="Bed occupancy" action={<Link to="/hospital/beds" className="small row" style={{ gap: 4 }}>Update beds <ArrowRight size={14} /></Link>}>
          <div className="hosp-donuts">
            {beds.map((b) => {
              const pct = (b.occupied / (b.total || 1)) * 100;
              return (
                <div key={b.type} className="hosp-donut">
                  <Donut value={b.occupied} max={b.total} color={occTone(pct)} size={76} />
                  <div>
                    <strong className="small">{bedLabel(b.type)}</strong>
                    <div className="tiny muted">{b.total - b.occupied} free of {b.total}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hosp-trend">
            <div className="row between">
              <span className="small muted">Overall occupancy, last 14 days</span>
              <span className="serif" style={{ fontSize: '1.3rem', fontWeight: 600 }}>{nowPct}%</span>
            </div>
            <Sparkline data={trend} color={occTone(nowPct)} height={56} />
          </div>
        </Card>

        <Card title="Needs your decision" action={<Link to="/hospital/referrals" className="small row" style={{ gap: 4 }}>All referrals <ArrowRight size={14} /></Link>}>
          {pending.length === 0 ? (
            <Empty icon={Ambulance} title="No referrals waiting">New referrals from network doctors will pop up here.</Empty>
          ) : (
            <div className="list">
              {pending.map((r) => (
                <Link key={r.id} to="/hospital/referrals" className="list-item hosp-ref-mini">
                  <div className="grow">
                    <div className="row wrap" style={{ gap: 8 }}>
                      <strong translate="no">{r.patientName}</strong>
                      <span className="tiny muted">{r.age} yrs</span>
                      <TriageBadge level={r.urgency} />
                    </div>
                    <div className="small muted clamp-2">{r.reason}</div>
                    <div className="row wrap tiny muted mt-1" style={{ gap: '4px 12px' }}>
                      <span className="row nowrap" style={{ gap: 4 }}><Clock size={12} /> ETA {r.eta}</span>
                      <span>Needs {BED_TYPES[r.bedType]?.short || r.bedType} bed</span>
                      <span>{timeAgo(r.createdAt)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-3" title="On duty now" action={<Link to="/hospital/roster" className="small row" style={{ gap: 4 }}>Manage roster <ArrowRight size={14} /></Link>}>
        {onDuty.length === 0 ? <Empty title="No one marked on duty">Mark doctors on duty from the roster.</Empty> : (
          <div className="hosp-duty">
            {onDuty.map((r) => (
              <div key={r.id} className="hosp-duty-item">
                <Avatar name={r.name} />
                <div className="grow">
                  <strong className="small">{r.name}</strong>
                  <div className="tiny muted">{r.department} · {r.shift}</div>
                </div>
                {r.teleconsult && <span className="badge sky" title="Available for teleconsult"><Video /> Tele</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
