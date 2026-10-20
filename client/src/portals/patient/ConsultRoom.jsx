import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mic, MicOff, Video, VideoOff, PhoneOff, Send, Clock, CalendarClock, Pill, Star, FileText, MessageCircle, Phone, X, AlertTriangle, Check, MapPin, Building2, RefreshCw, Lock } from 'lucide-react';
import { api } from '../../api';
import { useE2EChat, E2EBar } from '../../components/E2EChat';
import { useCall } from '../../components/useCall';
import CallMedia from '../../components/CallMedia';
import { useLive } from '../../live';
import { Avatar, Button, Card, Empty, Modal, StatusBadge, TriageBadge, cx, fmtDateTime, fmtMoney, fmtTime, timeAgo, useAction, useToast } from '../../components/ui';
import { usePatient, PageSkeleton } from './shared';
import VisitPass from './VisitPass';
import PaymentStep from './Payment';

// In-person appointment (doctor's hospital/clinic or a Sehatra E-Clinic): the live QR pass to show at reception.
function InPersonVisit({ c }) {
  const where = c.location || {};
  return (
    <Card className="pt-visit">
      <div className="pt-visit-info">
        <span className="eyebrow">{where.kind === 'eclinic' ? 'Sehatra E-Clinic visit' : 'In-person visit'}</span>
        <h2 className="mb-0" translate="no">{c.doctorName}</h2>
        <p className="small muted mb-0">{c.doctorSpecialty}</p>
        <div className="pt-visit-where">
          <span><Building2 size={15} /> <strong translate="no">{where.name}</strong></span>
          {where.address && <span><MapPin size={15} /> {where.address}</span>}
          {where.district && !where.address && <span><MapPin size={15} /> {where.district}</span>}
          {c.scheduledAt && <span><CalendarClock size={15} /> {fmtDateTime(c.scheduledAt)}</span>}
          {where.hours && <span><Clock size={15} /> {where.hours}</span>}
        </div>
        <ol className="pt-visit-steps small">
          <li>Reach {where.kind === 'eclinic' ? 'the E-Clinic' : 'the reception'} a few minutes early.</li>
          <li>Show this QR (or read out the 6-digit code) — it checks you in instantly.</li>
          <li>After the visit, your prescription, medicines and tests appear right here and in <strong>Medicines</strong>.</li>
        </ol>
        {c.status === 'in_progress' && <div className="callout green small"><Check /><span>You&apos;re with the doctor now.</span></div>}
      </div>
      {c.status !== 'in_progress' && <VisitPass consultId={c.id} />}
    </Card>
  );
}

// Booked but not paid yet — finish payment to confirm.
function AwaitingPayment({ c, onPaid }) {
  const [pay, setPay] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!c.paymentId) return undefined;
    let alive = true;
    api.get(`/payments/${c.paymentId}`).then((p) => alive && setPay(p)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [c.paymentId]);
  return (
    <Card>
      <h3 className="mb-1">Complete payment to confirm your booking</h3>
      <p className="small muted">With <span translate="no">{c.doctorName}</span>{c.scheduledAt ? ` · ${fmtDateTime(c.scheduledAt)}` : ''}. The doctor is notified as soon as it's paid.</p>
      {pay ? <PaymentStep payment={pay} onPaid={onPaid} /> : error ? <div className="form-error">{error}</div> : <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />}
    </Card>
  );
}

export default function ConsultRoom() {
  const { id } = useParams();
  const { data: c, error, loading, setData, reload } = useLive(`/consults/${id}`, [`consult:${id}`, 'consults', 'queue', 'payments', 'prescriptions']);
  const { reloadHome } = usePatient();
  const navigate = useNavigate();

  if (loading && !c) return <PageSkeleton />;
  if (error && !c) return <Empty title="We couldn't find that consult">{error} <div className="mt-2"><Link to="/patient">Back home</Link></div></Empty>;

  return (
    <div className="stack lg">
      <div className="row wrap">
        <button className="btn ghost sm" onClick={() => navigate('/patient')}><ArrowLeft size={16} /> Home</button>
        <div className="grow" />
        <StatusBadge status={c.status}>{statusText(c.status)}</StatusBadge>
      </div>
      {/* Refetch in place instead of window.location.reload(): no white flash, keeps the SSE connection. */}
      {c.status === 'awaiting_payment' && <AwaitingPayment c={c} onPaid={() => { reload(); reloadHome(); }} />}
      {c.mode === 'in_person' && ['scheduled', 'queued', 'in_progress'].includes(c.status) && <InPersonVisit c={c} />}
      {c.mode !== 'in_person' && c.status === 'queued' && <Waiting c={c} setData={setData} />}
      {c.mode !== 'in_person' && c.status === 'scheduled' && <Scheduled c={c} />}
      {c.mode !== 'in_person' && c.status === 'in_progress' && <InCall c={c} setData={setData} />}
      {c.status === 'completed' && <Summary c={c} />}
      {c.status === 'cancelled' && (
        <Card className="center pad-lg">
          <Empty icon={X} title="This consult was cancelled">Any refund due goes back the way you paid. Whenever you&apos;re ready, a doctor is a tap away.</Empty>
          <Button onClick={() => navigate('/patient/consult')}>Find a doctor</Button>
        </Card>
      )}
      {c.status === 'expired' && (
        <Card className="center pad-lg">
          <Empty icon={X} title="This booking wasn&apos;t paid in time">Unpaid bookings are released after 30 minutes so the slot goes to someone else. If money left your account for it, ask Saathi or our team and it will be refunded. Book again whenever you&apos;re ready.</Empty>
          <Button onClick={() => navigate('/patient/consult')}>Find a doctor</Button>
        </Card>
      )}
    </div>
  );
}

const statusText = (s) => ({ awaiting_payment: 'Payment pending', queued: 'In queue', scheduled: 'Booked', in_progress: 'Live now', completed: 'Completed', cancelled: 'Cancelled', expired: 'Expired' }[s] || s);
const MODE_LABEL = { video: 'Video call', audio: 'Audio call', chat: 'Chat' };

function CancelButton({ c, label = 'Cancel consult' }) {
  const [open, setOpen] = useState(false);
  const [run, busy] = useAction();
  const { reloadHome } = usePatient();
  const toast = useToast();
  // Same rule as the server: a full refund unless a booked time is less than 2 hours away.
  const lateCancel = !!c.scheduledAt && Date.parse(c.scheduledAt) - Date.now() <= 2 * 3600000;
  const cancel = () => run('cancel', async () => {
    const r = await api.post(`/consults/${c.id}/cancel`);
    reloadHome(); setOpen(false);
    toast(r?.refund ? `Cancelled — ${fmtMoney(r.refund)} will be refunded` : 'Cancelled');
  });
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Cancel this consult?" subtitle={`With ${c.doctorName}`}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Keep it</Button><Button variant="danger" loading={busy === 'cancel'} onClick={cancel}>Yes, cancel</Button></>}>
        <p className="mb-0">You&apos;ll lose your place{c.status === 'queued' ? ' in the queue' : ' for this slot'}. You can always book again.{' '}
          {lateCancel ? 'Your visit is less than 2 hours away, so a payment already made can’t be refunded.' : 'If you’ve paid, you’ll get a full refund.'}</p>
      </Modal>
    </>
  );
}

// Set by the doctor from their queue (c.runningLate = { minutes, at }).
function RunningLate({ c }) {
  const n = Math.round(Number(c.runningLate?.minutes) || 0);
  if (n <= 0) return null;
  return <div className="pt-late" role="status"><Clock size={15} /><span>{n === 1 ? 'Your doctor is running about 1 minute late' : <>Your doctor is running about {n} minutes late</>}</span></div>;
}

/* ---------- waiting room ---------- */
function Waiting({ c, setData }) {
  const ahead = Math.max(0, (Number(c.position) || 1) - 1);
  return (
    <div className="grid side">
      <section className="card pt-waiting">
        <div className="pt-orbit" aria-hidden="true">
          <span /><span /><span />
          <div className="pt-orbit-core"><Avatar name={c.doctorName} size="lg" /></div>
        </div>
        <div className="eyebrow">Waiting room</div>
        <h2 className="mb-1">{c.position <= 1 ? 'You’re next!' : `You’re number ${c.position} in line`}</h2>
        <p className="muted">
          {ahead === 0
            ? <>{c.doctorName} ({c.doctorSpecialty}) will join you as soon as they&apos;re free.</>
            : <>{c.doctorName} ({c.doctorSpecialty}) has <strong>{ahead === 1 ? '1 person' : `${ahead} people`}</strong> to see before you.</>}
          {' '}This page updates by itself — no need to refresh.
        </p>
        <RunningLate c={c} />
        <div className="pt-wait-facts">
          <div><span className="tiny muted">Mode</span><strong>{MODE_LABEL[c.mode]}</strong></div>
          <div><span className="tiny muted">Joined</span><strong>{fmtTime(c.createdAt)}</strong></div>
          <div><span className="tiny muted">Routed</span><strong>{c.routing ? `${c.routing.tier[0].toUpperCase()}${c.routing.tier.slice(1)} doctor` : 'Your choice'}</strong></div>
        </div>
        <div className="pt-wait-tips">
          <strong className="small">While you wait</strong>
          <ul className="small muted">
            <li>Find a quiet spot with good light.</li>
            <li>Keep any medicines you&apos;re taking nearby — the doctor may ask.</li>
            <li>Type anything you&apos;d like the doctor to know in the chat.</li>
          </ul>
        </div>
        <div className="row wrap" style={{ justifyContent: 'center' }}><CancelButton c={c} label="Leave the queue" /></div>
      </section>
      <ChatPanel c={c} setData={setData} title="Message the doctor" hint="The doctor will see this when they open your file." />
    </div>
  );
}

/* ---------- scheduled ---------- */
function Scheduled({ c }) {
  const soon = c.scheduledAt && new Date(c.scheduledAt).getTime() - Date.now() < 15 * 60000;
  return (
    <section className="card pad-lg pt-scheduled">
      <div className="row top wrap">
        <span className="pt-ic-tile sky big"><CalendarClock size={26} /></span>
        <div className="grow">
          <div className="eyebrow">You&apos;re booked</div>
          <h2 className="mb-1">{fmtDateTime(c.scheduledAt)}</h2>
          <p className="muted">{MODE_LABEL[c.mode]} with <strong translate="no">{c.doctorName}</strong>, {c.doctorSpecialty}. That&apos;s {timeAgo(c.scheduledAt)}.</p>
        </div>
      </div>
      <div className="pt-result-note small"><strong>Reason:</strong> {c.triage?.symptoms}</div>
      <RunningLate c={c} />
      <div className="callout sky mt-2">
        <Clock />
        <span>{soon ? 'Your doctor will open the room any moment now — stay on this page.' : 'We’ll send a reminder before it starts. When the doctor opens the room, this page turns into your call.'}</span>
      </div>
      <div className="row wrap mt-2"><CancelButton c={c} /></div>
    </section>
  );
}

/* ---------- live call ---------- */
// Ticks in its own leaf so the call view and chat don't re-render every second.
function CallTimer({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((now - new Date(since || now).getTime()) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function InCall({ c, setData }) {
  const [left, setLeft] = useState(false);
  const { patient } = usePatient();
  const audioOnly = c.mode === 'audio';
  // Leaving turns the call off (the doctor is told at once); rejoining starts a fresh connection.
  const call = useCall({ consultId: c.id, role: 'patient', audioOnly, enabled: c.mode !== 'chat' && !left });
  const { localStream, remoteStream, state, muted, cameraOff: camOff, error: mediaError } = call;

  if (left) {
    return (
      <Card className="center pad-lg">
        <Empty icon={PhoneOff} title="You've left the call">{c.doctorName} is finishing your notes. Your summary and prescription will appear here as soon as they&apos;re done.</Empty>
        <Button onClick={() => setLeft(false)}>Rejoin call</Button>
      </Card>
    );
  }

  const hasVideo = !audioOnly && localStream?.getVideoTracks().length > 0 && !camOff;
  const remoteVideo = !audioOnly && remoteStream?.getVideoTracks().length > 0 && state !== 'ended';
  const live = state === 'connected';

  return (
    <div className={cx('pt-call-layout', c.mode === 'chat' && 'chat-only')}>
      {c.mode !== 'chat' && (
        <section className={cx('pt-call', remoteVideo && 'has-remote')} aria-label="Call">
          {remoteVideo && <CallMedia stream={remoteStream} className="pt-remote" label="Your doctor’s video" />}
          {remoteStream && !remoteVideo && <CallMedia stream={remoteStream} audioOnly label="Your doctor’s voice" />}
          <div className="pt-call-top">
            <span className="pt-live"><span className={cx('dot pulse', live ? 'green' : 'sun')} /> {live ? 'Live' : 'Call'} · <CallTimer since={c.startedAt} /></span>
            <span className="small">{MODE_LABEL[c.mode]}</span>
          </div>
          {!(remoteVideo && live) && (
            <div className={cx('pt-doc-tile', remoteVideo && 'over-video')}>
              <div className="pt-doc-tile-inner" role="status" aria-live="polite">
                {!remoteVideo && <div className={cx(live && 'pt-speaking')}><Avatar name={c.doctorName} size="lg" /></div>}
                <strong translate="no">{c.doctorName}</strong>
                {state === 'idle' && <span className="small">Waiting for the doctor to join…</span>}
                {state === 'connecting' && <span className="small">Connecting…</span>}
                {state === 'reconnecting' && <span className="small">Reconnecting… hold on, the call will pick up again.</span>}
                {state === 'ended' && <span className="small">Call ended. Your doctor may call back — stay on this page.</span>}
                {state === 'failed' && <span className="small">We couldn’t connect the call. Check your internet, then try again — or use the chat.</span>}
                {live && <span className="small">{c.doctorSpecialty} · speaking {c.doctorLanguages?.includes(patient?.language) ? patient.language : c.doctorLanguages?.[0]}</span>}
                {live && audioOnly && <span className="pt-call-clock"><CallTimer since={c.startedAt} /></span>}
                {state === 'failed' && <Button size="sm" variant="secondary" icon={RefreshCw} onClick={call.retry} className="mt-1">Try again</Button>}
              </div>
            </div>
          )}
          {c.mode === 'video' && (
            <div className="pt-self">
              {hasVideo ? <CallMedia stream={localStream} self label="Your camera" /> : <div className="pt-self-ph"><Avatar name={patient?.name || 'You'} /><span className="tiny">{camOff ? 'Camera off' : 'You'}</span></div>}
            </div>
          )}
          {mediaError === 'denied' && <div className="pt-media-note small"><AlertTriangle size={15} /> Camera or mic permission wasn’t given. You can still chat, and allow it from your browser settings any time.</div>}
          {mediaError === 'unsupported' && <div className="pt-media-note small"><AlertTriangle size={15} /> Your browser can’t share your camera or mic here — you can still see and hear the doctor, and chat.</div>}
          {mediaError === 'no-camera' && <div className="pt-media-note small"><AlertTriangle size={15} /> Your camera isn’t available, so the doctor will only hear you.</div>}
          <div className="pt-call-controls">
            <button className={cx('pt-ctl', muted && 'off')} onClick={call.toggleMute} disabled={!localStream} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={muted}>{muted ? <MicOff /> : <Mic />}<span>{muted ? 'Unmute' : 'Mute'}</span></button>
            {c.mode === 'video' && <button className={cx('pt-ctl', camOff && 'off')} onClick={call.toggleCamera} disabled={!localStream?.getVideoTracks().length} aria-label={camOff ? 'Turn camera on' : 'Turn camera off'} aria-pressed={camOff}>{camOff ? <VideoOff /> : <Video />}<span>Camera</span></button>}
            <button className="pt-ctl end" onClick={() => setLeft(true)} aria-label="Leave call"><PhoneOff /><span>Leave</span></button>
          </div>
        </section>
      )}
      <ChatPanel c={c} setData={setData} title={c.mode === 'chat' ? `Chat with ${c.doctorName}` : 'Chat'} hint={c.mode === 'chat' ? <>Live · <CallTimer since={c.startedAt} /></> : 'Share a link, a reading, or anything you forgot to say.'} tall={c.mode === 'chat'} />
    </div>
  );
}

/* ---------- chat ---------- */
function ChatPanel({ c, setData, title, hint, tall }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const toast = useToast();
  const msgs = c.messages || [];
  const e2e = useE2EChat(c.id, c.messages);

  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length]);

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const temp = { id: `tmp_${Date.now()}`, from: 'patient', text: t, at: new Date().toISOString(), pending: true };
    setData((d) => ({ ...d, messages: [...(d.messages || []), temp] }));
    setText('');
    setSending(true);
    try {
      const messages = await api.post(`/consults/${c.id}/messages`, await e2e.bodyFor(t));
      setData((d) => ({ ...d, messages }));
    } catch (err) {
      setData((d) => ({ ...d, messages: (d.messages || []).filter((m) => m.id !== temp.id) }));
      setText(t);
      toast(err.message, 'error');
    } finally { setSending(false); }
  };

  return (
    <section className={cx('card pt-chat', tall && 'tall')} aria-label={title}>
      <div className="pt-chat-head">
        <MessageCircle size={18} />
        <div className="grow"><div className="strong">{title}</div>{hint && <div className="tiny muted">{hint}</div>}</div>
      </div>
      <E2EBar e2e={e2e} />
      <div className="pt-chat-list" ref={listRef} aria-live="polite">
        {msgs.length === 0 && <p className="small muted center pt-chat-empty">No messages yet. Say hello, or describe anything you&apos;d like the doctor to know.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={cx('pt-msg', m.from === 'patient' ? 'me' : 'them', m.pending && 'pending')}>
            <div className="pt-bubble" translate="no">{m.e2e && <Lock size={11} className="msg-lock" aria-label="End-to-end encrypted" />}{m.pending ? m.text : e2e.textOf(m)}</div>
            <div className="tiny muted">{m.from === 'doctor' ? `${m.name} · ` : ''}{m.pending ? 'Sending…' : fmtTime(m.at)}</div>
          </div>
        ))}
      </div>
      <form className="pt-chat-form" onSubmit={send}>
        <label htmlFor="chat-input" className="sr-only">Type a message</label>
        <input id="chat-input" className="input" placeholder="Type a message…" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        <button className="btn" type="submit" disabled={!text.trim() || sending} aria-label="Send message"><Send size={17} /></button>
      </form>
    </section>
  );
}

/* ---------- summary ---------- */
function Summary({ c }) {
  const navigate = useNavigate();
  const [run, busy] = useAction();
  // The server keeps one review per visit (c.review); the local copy makes the stars light up at once.
  const [rating, setRating] = useState(c.review?.stars || 0);
  const rated = !!c.review || rating > 0;
  const rate = (n) => run('rate', async () => {
    await api.post(`/consults/${c.id}/review`, { stars: n });
    setRating(n);
  }, n >= 4 ? 'Thank you! Your rating is saved.' : 'Thanks for telling us — your rating is saved.');
  const rx = c.prescription;
  return (
    <div className="grid side">
      <div className="stack lg">
        <section className="card pad-lg pt-summary">
          <div className="row top wrap">
            <Avatar name={c.doctorName} size="lg" />
            <div className="grow">
              <div className="eyebrow">Consult summary</div>
              <h2 className="mb-0">{c.diagnosis || 'Consult completed'}</h2>
              <div className="small muted">{c.doctorName} · {c.doctorSpecialty} · {fmtDateTime(c.completedAt)}</div>
            </div>
            {c.triage?.level && <TriageBadge level={c.triage.level} />}
          </div>
          {c.notes && (
            <div className="pt-notes">
              <div className="small strong"><FileText size={15} className="inline-ic" /> Doctor&apos;s notes</div>
              <p className="mb-0" translate="no">{c.notes}</p>
            </div>
          )}
          {c.triage?.symptoms && <p className="small muted mb-0 mt-2">You told us: &ldquo;{c.triage.symptoms}&rdquo;</p>}
        </section>

        {rx ? (
          <Card title={<h3 className="row" style={{ gap: 8 }}><Pill size={18} className="pt-clay" /> Your prescription</h3>} action={<StatusBadge status={rx.status} />}>
            <div className="pt-rx-items">
              {rx.items.map((it, i) => (
                <div key={i} className="pt-rx-item">
                  <strong translate="no">{it.drug}</strong>
                  <span className="small muted">{[it.dose, it.freq, it.days ? `${it.days} days` : null].filter(Boolean).join(' · ')}</span>
                </div>
              ))}
            </div>
            {rx.advice && <div className="callout green mt-2"><Check /> <span translate="no">{rx.advice}</span></div>}
            {rx.warnings?.length > 0 && (
              <div className="callout mt-2"><AlertTriangle /><span>{rx.warnings.map((w) => w.msg || w.message || w).join(' ')}</span></div>
            )}
            <div className="pt-signature small muted mt-2">Digitally signed · {rx.signature}</div>
            <div className="row wrap mt-2">
              {rx.status === 'issued'
                ? <Button size="lg" variant="clay" icon={Pill} onClick={() => navigate(`/patient/medicines?order=${rx.id}`)}>Order medicines</Button>
                : <Button variant="secondary" icon={Pill} onClick={() => navigate('/patient/medicines')}>Track medicines</Button>}
            </div>
          </Card>
        ) : (
          <Card><Empty icon={Pill} title="No medicines prescribed">The doctor didn&apos;t prescribe anything this time. Follow the advice in the notes above.</Empty></Card>
        )}
      </div>

      <div className="stack lg">
        <Card title="How did it go?">
          <p className="small muted">{rated ? 'Thanks for rating this visit.' : 'Your feedback helps us match you with the right doctor next time.'}</p>
          <div className="pt-stars" role="radiogroup" aria-label="Rate your consult">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={cx('pt-star', n <= rating && 'on')}
                disabled={rated || busy === 'rate'} onClick={() => rate(n)}>
                <Star size={26} />
              </button>
            ))}
          </div>
        </Card>
        <Card className="tint">
          <div className="stack">
            <strong>Saved to your passport</strong>
            <span className="small muted">This summary is in My Records. Any doctor you give consent to can see it.</span>
            <div className="row wrap">
              <Button size="sm" variant="secondary" onClick={() => navigate('/patient/records')}>Open records</Button>
              <Button size="sm" variant="ghost" icon={c.mode === 'audio' ? Phone : Clock} onClick={() => navigate('/patient/consult')}>Book a follow-up</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
