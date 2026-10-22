import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HeartPulse, Video, FolderHeart, Pill, ShieldCheck, AlertTriangle, CalendarClock, ChevronRight, Droplet, IdCard, Megaphone, Clock, MessageCircle, Phone, UserRoundPen, X, Truck } from 'lucide-react';
import { Button, Card, Empty, StatusBadge, fmtDateTime, timeAgo } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient, greeting, firstName, PageSkeleton, PassportQR } from './shared';
import { passportUrl } from '../../scanLinks';
import { getLocale } from '../../i18n';
import { LateNotice, VisitChangeActions } from './VisitChange';
import { useLive } from '../../live';
import { HealthToday, FamilyInvite } from './HomeHealth';
import InviteCard from './InviteCard';

const MODE_ICON = { video: Video, audio: Phone, chat: MessageCircle };
const HIDDEN_ALERTS = 'oc_hidden_alerts';
const readHidden = () => { try { return JSON.parse(localStorage.getItem(HIDDEN_ALERTS)) || []; } catch { return []; } };

export default function Home() {
  const { home, homeLoading, homeError, profiles, reloadHome } = usePatient();
  const navigate = useNavigate();
  const hub = useLive('/family/overview', ['vitals', 'vaccines', 'consults', 'family', 'patients']);
  const [hidden, setHidden] = useState(readHidden);

  if (homeLoading) return <PageSkeleton />;
  if (homeError && !home) return <Empty title="We couldn't load your home screen">{homeError}</Empty>;
  if (!home?.patient) return <Empty title="No health passport yet">Create your passport to get started.</Empty>;

  const p = home.patient;
  const me = profiles.find((x) => x.self);
  const isSelf = me?.id === p.id;
  const rxList = home.prescriptions || [];
  const activeRx = rxList.filter((r) => !['delivered', 'collected'].includes(r.status));
  const pastRx = rxList.filter((r) => ['delivered', 'collected'].includes(r.status)).slice(0, 2);

  const today = new Date().toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const alerts = (home.alerts || []).filter((a) => !hidden.includes(a.id));
  const hideAlert = (id) => {
    const next = [...hidden, id].slice(-30);
    setHidden(next);
    try { localStorage.setItem(HIDDEN_ALERTS, JSON.stringify(next)); } catch { /* ignore */ }
  };

  return (
    <div className="stack lg">
      <PageHeader
        eyebrow={today}
        title={isSelf ? `${greeting()}, ${firstName(p.name)}` : `${greeting()}, ${firstName(me?.name || '')}`}
        subtitle={isSelf ? 'What would you like to do today?' : `You’re looking after ${firstName(p.name)}. Anything you do here is saved to their passport.`}
      />

      {/* The four things people come here for — first, before anything else. */}
      <div className="pt-quick">
        <QuickAction to="/patient/symptoms" icon={HeartPulse} title="I feel unwell" text="Answer a few questions — 2 minutes" tone="clay" />
        <QuickAction to="/patient/consult" icon={Video} title="Talk to a doctor" text="Video, audio, chat or a clinic visit" tone="green" />
        <QuickAction to="/patient/medicines" icon={Pill} title="Medicines" text="Order, track or pick up" tone="sun" />
        <QuickAction to="/patient/records" icon={FolderHeart} title="My reports" text="Reports, visits & prescriptions" tone="sky" />
      </div>

      <WhatsNext home={home} p={p} isSelf={isSelf} activeRx={activeRx} />

      {alerts.slice(0, 1).map((a) => (
        <div key={a.id} className="pt-alert-strip fade-in" role="status">
          <AlertTriangle size={18} />
          <div className="grow small">
            <strong>{a.disease} is rising in {a.district}.</strong>{' '}
            {/dengue|malaria|chikungunya/i.test(a.disease || '') ? 'Use mosquito nets and empty standing water.' : 'Take care with hygiene and clean water.'}{' '}
            <Link to="/patient/symptoms">Check symptoms</Link>
            <span className="tiny muted block">{a.status === 'confirmed' ? 'Confirmed by the health department' : 'Early warning from local lab results'} · {timeAgo(a.createdAt)}</span>
          </div>
          <button type="button" className="icon-btn" onClick={() => hideAlert(a.id)} aria-label="Hide this alert"><X size={16} /></button>
        </div>
      ))}

      <HealthToday card={(hub.data || []).find((x) => x.id === p.id)} isSelf={isSelf} name={firstName(p.name)} />
      {isSelf && profiles.length <= 1 && <FamilyInvite />}

      <div className="grid side">
        <div className="stack lg">
          <Card title="Coming up" action={<Link to="/patient/follow-ups" className="small">All follow-ups <ChevronRight size={14} className="inline-ic" /></Link>}>
            {!home.upcoming?.length ? (
              <Empty icon={CalendarClock} title="Nothing scheduled">
                When you book a consult it will show up here, with a button to join.
              </Empty>
            ) : (
              <div className="list">
                {home.upcoming.map((c) => {
                  const Icon = MODE_ICON[c.mode] || Video;
                  const live = c.status === 'in_progress';
                  return (
                    <div key={c.id} className="list-item pt-upcoming">
                      <span className={`pt-ic-tile ${live ? 'clay' : 'green'}`}><Icon size={18} /></span>
                      <div className="grow">
                        <div className="strong">{c.doctorName} <span className="muted small">· {c.doctorSpecialty}</span></div>
                        <div className="small muted">
                          {c.status === 'scheduled' && <><Clock size={13} className="inline-ic" /> {fmtDateTime(c.scheduledAt)} ({timeAgo(c.scheduledAt)})</>}
                          {c.status === 'queued' && 'You’re in the queue — we’ll let you know when the doctor is ready.'}
                          {live && 'Your doctor is waiting for you right now.'}
                        </div>
                        <LateNotice c={c} />
                        <VisitChangeActions c={c} onChanged={reloadHome} />
                      </div>
                      {live ? (
                        <Button size="sm" variant="clay" onClick={() => navigate(`/patient/consult/${c.id}`)}>Join now</Button>
                      ) : (
                        <Button size="sm" variant={c.status === 'queued' ? 'primary' : 'secondary'} onClick={() => navigate(`/patient/consult/${c.id}`)}>
                          {c.status === 'queued' ? 'Open waiting room' : 'Details'}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Medicines" action={<Link to="/patient/medicines" className="small">See all <ChevronRight size={14} className="inline-ic" /></Link>}>
            {rxList.length === 0 ? (
              <Empty icon={Pill} title="No prescriptions yet">After a consult, your doctor&apos;s e-prescription lands here.</Empty>
            ) : (
              <div className="list">
                {[...activeRx, ...pastRx].slice(0, 4).map((r) => (
                  <Link key={r.id} to="/patient/medicines" className="list-item pt-rx-row">
                    <span className="pt-ic-tile sun"><Pill size={18} /></span>
                    <div className="grow">
                      <div className="strong pt-ellipsis">{r.items.map((i) => i.drug).join(', ')}</div>
                      <div className="small muted">{r.doctorName} · {timeAgo(r.createdAt)}{r.pharmacyName ? ` · ${r.pharmacyName}` : ''}</div>
                    </div>
                    <StatusBadge status={r.status}>{rxStatusLabel(r)}</StatusBadge>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="stack lg">
          <PassportCard patient={p} />
          {isSelf && <InviteCard />}

          {home.advisories?.length > 0 && (
            <Card title={<h3 className="row" style={{ gap: 8 }}><Megaphone size={18} className="pt-clay" /> Health tips near you</h3>}>
              <div className="stack">
                {home.advisories.map((a) => (
                  <div key={a.id} className="pt-advisory">
                    <div className="strong small">{a.title}</div>
                    <div className="small muted">{a.body || a.message}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export function rxStatusLabel(r) {
  return {
    issued: 'Ready to order',
    sent: 'With pharmacy',
    dispensed: r.fulfilment === 'pickup' ? 'Ready to pick up' : 'Packed',
    out_for_delivery: 'On the way',
    delivered: 'Delivered',
    collected: 'Collected',
  }[r.status] || r.status;
}

// One card for everything that needs the person's attention, instead of a stack of banners.
function WhatsNext({ home, p, isSelf, activeRx }) {
  const rows = [];
  if (isSelf && p.profileComplete === false) {
    rows.push({ key: 'profile', to: '/patient/complete-profile', icon: UserRoundPen, tone: 'clay', title: 'Finish your profile', text: 'Age and address — so we can show doctors near you' });
  }
  const next = [...(home.upcoming || [])].filter((c) => c.scheduledAt || c.status !== 'scheduled').sort((a, b) => String(a.scheduledAt || '').localeCompare(String(b.scheduledAt || '')))[0];
  if (next) {
    const live = next.status === 'in_progress';
    const when = next.scheduledAt ? new Date(next.scheduledAt).toLocaleString(getLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
    rows.push({
      key: 'visit', to: live || next.status === 'queued' ? `/patient/consult/${next.id}` : '/patient/follow-ups', icon: CalendarClock, tone: live ? 'clay' : 'green',
      title: live ? 'Your doctor is waiting — join now' : next.status === 'queued' ? 'You’re in the queue' : `${next.followUp ? 'Follow-up' : 'Appointment'}: ${when}`,
      text: <>with <span translate="no">{next.doctorName}</span>{next.mode === 'in_person' ? ` at ${next.location?.name || 'the clinic'}` : next.mode === 'audio' ? ' · audio call' : next.mode === 'chat' ? ' · chat' : ' · video'}{next.runningLate ? ` · running ~${next.runningLate.minutes} min late` : ''}</>,
    });
  }
  const toOrder = activeRx.filter((r) => r.status === 'issued').length;
  if (toOrder) rows.push({ key: 'rx', to: '/patient/medicines', icon: Pill, tone: 'sun', title: toOrder === 1 ? 'A prescription is ready to order' : `${toOrder} prescriptions are ready to order`, text: 'Order delivery or pick up from a chemist' });
  if (home.medicineOrders > 0) rows.push({ key: 'orders', to: '/patient/medicines', icon: Truck, tone: 'sun', title: home.medicineOrders === 1 ? 'A medicine order is in progress' : `${home.medicineOrders} medicine orders in progress`, text: 'Track where it is' });
  if (home.pendingConsents > 0) {
    rows.push({ key: 'consent', to: '/patient/consents', icon: ShieldCheck, tone: 'sky', title: home.pendingConsents === 1 ? 'Someone wants to see your records' : `${home.pendingConsents} requests to see your records`, text: 'Nothing is shared until you say yes' });
  }
  if (!rows.length) return null;
  return (
    <Card title="What’s next" className="pt-whatsnext fade-in">
      <div className="pt-wn-list">
        {rows.map((r) => (
          <Link key={r.key} to={r.to} className="pt-wn-row">
            <span className={`pt-ic-tile ${r.tone}`}><r.icon size={18} /></span>
            <span className="grow">
              <span className="strong block">{r.title}</span>
              <span className="small muted">{r.text}</span>
            </span>
            <ChevronRight size={18} className="muted" />
          </Link>
        ))}
      </div>
    </Card>
  );
}

function QuickAction({ to, icon, title, text, tone }) {
  const Icon = icon;
  return (
    <Link to={to} className={`pt-quick-card ${tone}`}>
      <span className="pt-quick-ic"><Icon /></span>
      <span className="strong">{title}</span>
      <span className="small muted">{text}</span>
    </Link>
  );
}

function PassportCard({ patient: p }) {
  return (
    <section className="card pt-passport" aria-label="Health passport">
      <div className="row between top">
        <div>
          <div className="pt-passport-eyebrow">Sehatra Health Passport</div>
          <div className="pt-passport-name" translate="no">{p.name}</div>
          <div className="pt-passport-id mono" dir="ltr" translate="no">{p.id}</div>
        </div>
        <div className="pt-passport-qr"><PassportQR value={passportUrl(p.id, p.cardSig)} size={88} label="Health Passport QR — scan to open on Sehatra" /></div>
      </div>
      <dl className="pt-passport-grid">
        <div><dt>Blood group</dt><dd><Droplet size={14} className="inline-ic" /> {p.bloodGroup || '—'}</dd></div>
        <div><dt>Age</dt><dd>{p.age != null ? `${p.age} yrs` : '—'}{p.gender ? ` · ${p.gender}` : ''}</dd></div>
        <div className="wide"><dt>Allergies</dt><dd>{p.allergies?.length ? p.allergies.join(', ') : 'None known'}</dd></div>
        <div className="wide"><dt>ABHA</dt><dd className="mono">{p.abha || <Link to="/patient/settings" className="pt-passport-link">Link your ABHA ID</Link>}</dd></div>
      </dl>
      <Link to="/patient/emergency" className="pt-passport-foot">
        <IdCard size={16} /> Emergency card & QR <ChevronRight size={16} />
      </Link>
    </section>
  );
}
