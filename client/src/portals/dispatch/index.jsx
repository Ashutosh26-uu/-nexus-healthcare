import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { ListTodo, Bike, History, UserRound, LogOut, Wallet, CheckCircle2, PackageCheck, Truck, Star, ShieldCheck, Phone, Snowflake, BellRing } from 'lucide-react';
import { useAuth } from '../../auth';
import { useLive } from '../../live';
import { api } from '../../api';
import { Avatar, Empty, Switch, fmtMoney, fmtTime, fmtDateTime, timeAgo, useAction, useToast, cx } from '../../components/ui';
import { JobSummary, JobMeta, RouteMap, DeliverSheet, useAccepted, stage, payFor, isToday } from './parts';
import LanguagePicker from '../../components/LanguagePicker';
import './dispatch.css';

export default function DispatchApp() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const live = useLive('/dispatch/jobs', ['dispatch']);
  const [accepted, accept] = useAccepted();
  const [online, setOnline] = useState(true);
  const jobs = live.data || [];

  // Lift the floating help button above the bottom tab bar while this app is open.
  useEffect(() => {
    document.body.classList.add('oc-dispatch');
    return () => document.body.classList.remove('oc-dispatch');
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  const fresh = jobs.filter((j) => stage(j, accepted) === 'new');
  const active = jobs.filter((j) => ['accepted', 'picked', 'in_transit'].includes(stage(j, accepted)));
  const done = jobs.filter((j) => j.status === 'delivered').sort((a, b) => new Date(b.deliveredAt || b.createdAt) - new Date(a.deliveredAt || a.createdAt));
  const today = done.filter((j) => isToday(j.deliveredAt));
  const earnedToday = today.reduce((s, j) => s + payFor(j), 0);

  const props = { jobs, fresh, active, done, today, earnedToday, accepted, accept, reload: live.reload, online };

  return (
    <div className="dj-app">
      <header className="dj-header">
        <Avatar name={user?.name} size="sm" />
        <div className="grow">
          <div className="dj-hello">Namaste, <span translate="no">{user?.name?.split(' ')[0]}</span></div>
          <div className="tiny dj-online-text">{online ? 'Online · receiving jobs' : 'Offline · no new jobs'}</div>
        </div>
        <Switch checked={online} onChange={setOnline} label="Go online" />
        <LanguagePicker compact />
        <button className="dj-icon" onClick={() => { signOut(); navigate('/'); }} aria-label="Sign out" title="Sign out"><LogOut size={19} /></button>
      </header>

      <main className="dj-main">
        {live.loading && !live.data ? (
          <div className="page-loading"><div className="spinner" /></div>
        ) : !live.data ? (
          <Empty title="Couldn't load your jobs">{live.error || 'Check your internet and pull to refresh.'}</Empty>
        ) : (
          <Routes>
            <Route index element={<Jobs {...props} />} />
            <Route path="active" element={<Active {...props} />} />
            <Route path="history" element={<HistoryPage {...props} />} />
            <Route path="profile" element={<Profile {...props} user={user} onSignOut={() => { signOut(); navigate('/'); }} />} />
            <Route path="*" element={<Navigate to="/dispatch" replace />} />
          </Routes>
        )}
      </main>

      <nav className="dj-tabs" aria-label="Rider app">
        <NavLink end to="/dispatch" className={({ isActive }) => cx('dj-tab', isActive && 'on')}>
          <ListTodo size={22} /><span>Jobs</span>{fresh.length > 0 && <i>{fresh.length}</i>}
        </NavLink>
        <NavLink to="/dispatch/active" className={({ isActive }) => cx('dj-tab', isActive && 'on')}>
          <Bike size={22} /><span>Active</span>{active.length > 0 && <i>{active.length}</i>}
        </NavLink>
        <NavLink to="/dispatch/history" className={({ isActive }) => cx('dj-tab', isActive && 'on')}>
          <History size={22} /><span>History</span>
        </NavLink>
        <NavLink to="/dispatch/profile" className={({ isActive }) => cx('dj-tab', isActive && 'on')}>
          <UserRound size={22} /><span>Profile</span>
        </NavLink>
      </nav>
    </div>
  );
}

function EarningsCard({ earnedToday, today, active }) {
  const pipeline = active.reduce((s, j) => s + payFor(j), 0);
  return (
    <div className="dj-earn">
      <div className="row between">
        <span className="small row" style={{ gap: 6 }}><Wallet size={16} /> Earned today</span>
        <span className="tiny">{today.length} drop{today.length === 1 ? '' : 's'}</span>
      </div>
      <div className="dj-earn-amt">{fmtMoney(earnedToday)}</div>
      <div className="tiny">{pipeline ? `+${fmtMoney(pipeline)} more when you finish your active jobs` : 'Accept a job below to start earning'}</div>
    </div>
  );
}

function Jobs({ fresh, active, today, earnedToday, accept, online }) {
  const toast = useToast();
  const navigate = useNavigate();
  return (
    <>
      <EarningsCard earnedToday={earnedToday} today={today} active={active} />
      {active.length > 0 && (
        <button className="dj-active-strip" onClick={() => navigate('/dispatch/active')}>
          <Bike size={18} /> <span className="grow">{active.length} job{active.length > 1 ? 's' : ''} in progress</span> <span className="tiny">Open →</span>
        </button>
      )}
      <h2 className="dj-h">New jobs near you</h2>
      {!online ? (
        <div className="dj-card"><Empty icon={BellRing} title="You're offline">Switch on at the top when you're ready to take jobs.</Empty></div>
      ) : fresh.length === 0 ? (
        <div className="dj-card"><Empty icon={PackageCheck} title="No new jobs right now">Stay online — we'll buzz you as soon as a pharmacy has a pickup.</Empty></div>
      ) : (
        fresh.map((j) => (
          <article key={j.id} className={cx('dj-card dj-job', j.coldChain && 'cold')}>
            <div className="row between dj-job-top">
              <span className="dj-kind">{j.kind === 'transfer' ? <><Truck size={14} /> Stock transfer</> : <><PackageCheck size={14} /> Medicine delivery</>}</span>
              <span className="tiny muted">{timeAgo(j.createdAt)}</span>
            </div>
            <JobSummary job={j} />
            <JobMeta job={j} />
            <button className="dj-big-btn" onClick={() => { accept(j.id); toast('Job accepted — head to the pickup'); navigate('/dispatch/active'); }}>
              Accept job · {fmtMoney(payFor(j))}
            </button>
          </article>
        ))
      )}
    </>
  );
}

const STEP_LABELS = ['Accepted', 'Picked up', 'On the way', 'Delivered'];
const STEP_IDX = { accepted: 0, picked: 1, in_transit: 2, delivered: 3 };

function Active({ active, accepted, reload }) {
  const [run, busy] = useAction();
  const [sheetFor, setSheetFor] = useState(null);
  const navigate = useNavigate();

  const move = async (j, status, msg) => {
    const ok = await run(j.id + status, () => api.post(`/deliveries/${j.id}/status`, { status }), msg);
    if (ok) reload();
  };
  const deliver = async (otp) => {
    try {
      await api.post(`/deliveries/${sheetFor.id}/status`, { status: 'delivered', otp });
      reload();
      return null;
    } catch (e) { return e.message; }
  };

  const sheet = <DeliverSheet job={sheetFor} open={!!sheetFor} onClose={() => setSheetFor(null)} onSubmit={deliver} />;
  if (!active.length) {
    return (
      <>
      <div className="dj-card mt-2">
        <Empty icon={Bike} title="No active jobs">Accept a job from the Jobs tab and it'll show here with the route.</Empty>
        <button className="dj-big-btn ghost" onClick={() => navigate('/dispatch')}>See new jobs</button>
      </div>
      {sheet}
      </>
    );
  }

  return (
    <>
      <h2 className="dj-h">On the road</h2>
      {active.map((j) => {
        const st = stage(j, accepted);
        const idx = STEP_IDX[st];
        return (
          <article key={j.id} className={cx('dj-card dj-job', j.coldChain && 'cold')}>
            <div className="dj-steps">
              {STEP_LABELS.map((l, i) => <span key={l} className={cx(i <= idx && 'done', i === idx && 'cur')}><i />{l}</span>)}
            </div>
            <RouteMap job={j} progress={st === 'in_transit' ? 0.55 : st === 'picked' ? 0.04 : 0} />
            <JobSummary job={j} />
            <JobMeta job={j} />
            {st === 'accepted' && (
              <button className="dj-big-btn" disabled={busy === j.id + 'picked'} onClick={() => move(j, 'picked', j.coldChain ? 'Picked up — keep the cold box closed' : 'Picked up. Check the seal before you leave.')}>
                {busy === j.id + 'picked' ? <span className="spinner sm" style={{ borderTopColor: '#fff' }} /> : <PackageCheck size={20} />} I've picked it up
              </button>
            )}
            {st === 'picked' && (
              <button className="dj-big-btn clay" disabled={busy === j.id + 'in_transit'} onClick={() => move(j, 'in_transit', 'Trip started — the recipient can track you live')}>
                {busy === j.id + 'in_transit' ? <span className="spinner sm" style={{ borderTopColor: '#fff' }} /> : <Bike size={20} />} Start trip
              </button>
            )}
            {st === 'in_transit' && (
              <button className="dj-big-btn" onClick={() => setSheetFor(j)}><CheckCircle2 size={20} /> Reached — enter OTP</button>
            )}
          </article>
        );
      })}
      {sheet}
    </>
  );
}

function HistoryPage({ done, today, earnedToday }) {
  const week = done.filter((j) => j.deliveredAt && Date.now() - new Date(j.deliveredAt) < 7 * 86400000);
  return (
    <>
      <div className="dj-stats">
        <div><span>Today</span><strong>{fmtMoney(earnedToday)}</strong><em>{today.length} drop{today.length === 1 ? "" : "s"}</em></div>
        <div><span>This week</span><strong>{fmtMoney(week.reduce((s, j) => s + payFor(j), 0))}</strong><em>{week.length} drop{week.length === 1 ? "" : "s"}</em></div>
      </div>
      <h2 className="dj-h">Completed</h2>
      {done.length === 0 ? <div className="dj-card"><Empty title="No deliveries yet">Your completed drops will be listed here.</Empty></div> : (
        <div className="dj-card dj-hist">
          {done.map((j) => (
            <div key={j.id} className="dj-hist-row">
              <span className="dj-hist-icon">{j.coldChain ? <Snowflake size={16} /> : <CheckCircle2 size={16} />}</span>
              <div className="grow">
                <strong className="small">{j.drop.split(/[·,]/)[0]}</strong>
                <div className="tiny muted">{j.items}</div>
                <div className="tiny muted">{isToday(j.deliveredAt) ? `Today, ${fmtTime(j.deliveredAt)}` : fmtDateTime(j.deliveredAt || j.createdAt)} · {j.distanceKm} km</div>
              </div>
              <strong className="dj-hist-pay">{fmtMoney(payFor(j))}</strong>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Profile({ user, done, onSignOut }) {
  const km = done.reduce((s, j) => s + (j.distanceKm || 0), 0);
  return (
    <>
      <div className="dj-card dj-profile">
        <Avatar name={user?.name} size="lg" />
        <h2 translate="no">{user?.name}</h2>
        <div className="small muted">Delivery partner · {user?.region?.district || 'Barabanki'}</div>
        <div className="dj-rating"><Star size={15} /> 4.8 · {done.length + 212} deliveries</div>
      </div>
      <div className="dj-card">
        <dl className="kv">
          <dt>Phone</dt><dd className="row" style={{ gap: 6 }}><Phone size={14} /> <bdi dir="ltr">{user?.phone || '—'}</bdi></dd>
          <dt>Vehicle</dt><dd>Bike · UP 41 AB 2290</dd>
          <dt>Distance logged</dt><dd>{Math.round(km)} km on Nexus Healthcare</dd>
          <dt>Payouts</dt><dd>Every Monday to your UPI</dd>
        </dl>
      </div>
      <div className="dj-card">
        <div className="dj-badges">
          <span className="badge sky"><Snowflake /> Cold-chain trained</span>
          <span className="badge green"><ShieldCheck /> ID verified</span>
        </div>
        <p className="tiny muted mb-0 mt-1">Stuck on a delivery? Call the dispatch desk at 1800-200-4455 — we pick up 24×7.</p>
      </div>
      <button className="dj-big-btn ghost" onClick={onSignOut}><LogOut size={18} /> Sign out</button>
    </>
  );
}
