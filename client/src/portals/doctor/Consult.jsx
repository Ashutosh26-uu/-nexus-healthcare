import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mic, MicOff, Video, VideoOff, PhoneOff, Send, Languages, Sparkles, Activity, History, FlaskConical, ClipboardList, Signal, Monitor, Play, Maximize2, Building2, RefreshCw } from 'lucide-react';
import { api } from '../../api';
import { useCall } from '../../components/useCall';
import CallMedia from '../../components/CallMedia';
import { useLive } from '../../live';
import { useAuth } from '../../auth';
import { Avatar, Button, Card, Empty, Loading, Tabs, TriageBadge, TRIAGE, StatusBadge, timeAgo, fmtTime, fmtDateTime, useAction, cx } from '../../components/ui';
import { VitalsChips, VITAL_META, useNow, routeInfo } from './shared';
import { useRecord, AccessGate, EmergencyBanner, CriticalCard, HistoryPanel, VisitsPanel, LabsPanel, AllergyList } from './Record';
import RxComposer from './RxComposer';
import PatientSummary from './PatientSummary';

function CallTimer({ since }) {
  const now = useNow(1000);
  if (!since) return <span>00:00</span>;
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return <span>{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>;
}

// A booking opened from the "new patient" pop-up or Earnings is still `scheduled` — the server lets it start too.
const canStart = (c) => c.status === 'queued' || c.status === 'scheduled';

function VideoStage({ consult, doctorName, live, onStart, starting }) {
  const [ended, setEnded] = useState(false);
  const stage = useRef(null);
  const audioOnly = consult.mode === 'audio';
  const inCall = live && !ended && consult.mode !== 'chat';
  // Ending the call (or leaving the page) hangs up for the patient too; "Rejoin" starts a fresh connection.
  const call = useCall({ consultId: consult.id, role: 'doctor', audioOnly, enabled: inCall });
  const { localStream, remoteStream, state, muted, cameraOff } = call;
  const connected = inCall && state === 'connected';
  const remoteVideo = inCall && !audioOnly && remoteStream?.getVideoTracks().length > 0 && state !== 'ended';
  const selfVideo = inCall && !audioOnly && localStream?.getVideoTracks().length > 0 && !cameraOff;
  const from = consult.kioskName ? `connected from ${consult.kioskName.replace('E-Clinic · ', 'E-Clinic ')}` : consult.mode === 'chat' ? 'chat consult from the Sehatra app' : 'joining from the Sehatra app';
  const fullscreen = () => { const el = stage.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen?.(); else el.requestFullscreen?.(); };
  return (
    <div ref={stage} className={cx('dr-stage', !live && 'idle', ended && 'ended', remoteVideo && 'has-remote')}>
      {remoteVideo && <CallMedia stream={remoteStream} className="dr-remote" label="Patient’s video" />}
      {inCall && remoteStream && !remoteVideo && <CallMedia stream={remoteStream} audioOnly label="Patient’s voice" />}
      <div className="dr-stage-top">
        <span className="dr-live-pill">{live && !ended ? <><span className="dr-rec" />LIVE · <CallTimer since={consult.startedAt} /></> : ended ? 'Call ended' : 'Not started'}</span>
        {inCall
          ? <span className="dr-net" role="status"><Signal size={14} />{connected ? 'Connected' : state === 'reconnecting' ? 'Reconnecting…' : state === 'failed' ? 'Not connected' : state === 'ended' ? 'Patient left' : state === 'connecting' ? 'Connecting…' : 'Waiting'}</span>
          : <span className="dr-net"><Signal size={14} />{live ? 'Call off' : 'Call not started'}</span>}
      </div>
      {!(remoteVideo && connected) && (
        <div className={cx('dr-stage-center', remoteVideo && 'over-video')}>
          {!remoteVideo && (
            <div className="dr-patient-tile">
              <Avatar name={consult.patientName} size="lg" />
              {connected && <span className="dr-voice"><i /><i /><i /><i /></span>}
            </div>
          )}
          <div className="dr-stage-name" translate="no">{consult.patientName}</div>
          {!inCall && <div className="dr-stage-sub">{from}</div>}
          {inCall && state === 'idle' && <div className="dr-stage-sub" role="status">{consult.kioskName ? 'Waiting for the kiosk to join the call…' : 'Waiting for the patient to join…'}</div>}
          {inCall && state === 'connecting' && <div className="dr-stage-sub" role="status">Connecting…</div>}
          {inCall && state === 'reconnecting' && <div className="dr-stage-sub" role="status">Reconnecting… the call will pick up again.</div>}
          {inCall && state === 'ended' && <div className="dr-stage-sub" role="status">The patient left the call. They can rejoin from their app.</div>}
          {inCall && state === 'failed' && <div className="dr-stage-sub" role="status">The call couldn’t connect. Check your internet and try again, or use the chat.</div>}
          {connected && audioOnly && <div className="dr-call-clock"><CallTimer since={consult.startedAt} /></div>}
          {inCall && state === 'failed' && <Button size="sm" variant="secondary" icon={RefreshCw} onClick={call.retry} className="mt-2">Try again</Button>}
          {!live && canStart(consult) && (
            <Button variant="clay" icon={Play} loading={starting} onClick={onStart} className="mt-2">Start consult</Button>
          )}
          {ended && <div className="dr-stage-sub mt-1">Finish the prescription below to close the visit.</div>}
          {ended && live && consult.mode !== 'chat' && <Button size="sm" variant="secondary" icon={Video} onClick={() => setEnded(false)} className="mt-2">Rejoin call</Button>}
        </div>
      )}
      {inCall && call.error === 'denied' && <div className="dr-media-note">Camera or mic permission wasn’t given — the patient can’t see or hear you. Allow it in your browser settings, then tap Try again.</div>}
      {inCall && call.error === 'no-camera' && <div className="dr-media-note">Your camera isn’t available — the patient will only hear you.</div>}
      {inCall && call.error === 'unsupported' && <div className="dr-media-note">This browser can’t share your camera or mic. Use a recent Chrome, Edge, Safari or Firefox.</div>}
      {inCall && call.error === 'denied' && state !== 'failed' && <Button size="sm" variant="secondary" icon={RefreshCw} onClick={call.retry} className="dr-media-retry">Try again</Button>}
      {!audioOnly && (
        <div className={cx('dr-selfview', selfVideo && 'has-video')}>
          {selfVideo ? <CallMedia stream={localStream} self className="dr-self-video" label="Your camera" /> : <>{cameraOff && inCall ? <VideoOff size={16} /> : <Avatar name={doctorName} size="sm" />}<span>You</span></>}
        </div>
      )}
      <div className="dr-controls">
        <button className={cx('dr-ctl', muted && 'off')} onClick={call.toggleMute} disabled={!inCall || !localStream} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={muted}>{muted ? <MicOff /> : <Mic />}</button>
        {!audioOnly && <button className={cx('dr-ctl', cameraOff && 'off')} onClick={call.toggleCamera} disabled={!inCall || !localStream?.getVideoTracks().length} aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'} aria-pressed={cameraOff}>{cameraOff ? <VideoOff /> : <Video />}</button>}
        <button className="dr-ctl" onClick={fullscreen} aria-label="Full screen"><Maximize2 /></button>
        <button className="dr-ctl end" disabled={!live || ended} onClick={() => setEnded(true)} aria-label="End call"><PhoneOff /></button>
      </div>
    </div>
  );
}

// In-person visit at the doctor's hospital/clinic or a Sehatra E-Clinic — no call, just the visit status.
function InPersonStage({ consult, live, onStart, starting }) {
  const where = consult.location || {};
  return (
    <div className="dr-inperson">
      <div className="dr-inperson-ic"><Building2 /></div>
      <div className="grow">
        <span className="eyebrow">{where.kind === 'eclinic' ? 'Sehatra E-Clinic visit' : 'In-person visit'}</span>
        <h3 className="mb-0" translate="no">{consult.patientName}</h3>
        <p className="small muted mb-0">{where.name}{consult.scheduledAt ? ` · booked for ${fmtDateTime(consult.scheduledAt)}` : ''}</p>
        <p className="small mb-0">{consult.checkedInAt ? `Checked in ${timeAgo(consult.checkedInAt)} with their live QR pass.` : 'Not checked in yet — scan their QR from “Check in patient” on your queue.'}</p>
      </div>
      {!live && canStart(consult) && <Button variant="clay" icon={Play} loading={starting} onClick={onStart}>Start visit</Button>}
      {live && <span className="badge green">With you now</span>}
    </div>
  );
}

function ChatPanel({ consult, onSent }) {
  const [text, setText] = useState('');
  const [run, busy] = useAction();
  const endRef = useRef(null);
  const msgs = consult.messages || [];
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [msgs.length]);
  const send = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    run('send', async () => {
      await api.post(`/consults/${consult.id}/messages`, { text: t });
      setText('');
      onSent();
    });
  };
  const quick = ['Can you hear me clearly?', 'Please show me your throat.', 'Any medicine allergies?', 'I\'m writing your prescription now.'];
  return (
    <div className="card dr-chat">
      <div className="card-head"><h4>Chat</h4><span className="tiny muted">{consult.kioskName ? 'Operator reads messages aloud at the kiosk' : 'Visible to the patient'}</span></div>
      <div className="dr-chat-list">
        {msgs.length === 0 && <p className="tiny muted center" style={{ padding: '18px 8px' }}>No messages yet. Use chat for links, instructions or when the audio drops.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={cx('dr-msg', m.from === 'doctor' ? 'me' : 'them')}>
            <div translate="no">{m.text}</div>
            <span>{m.from === 'doctor' ? 'You' : m.name} · {fmtTime(m.at)}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="dr-quick">
        {quick.map((q) => <button key={q} type="button" className="chip" onClick={() => setText(q)}>{q}</button>)}
      </div>
      <form className="dr-chat-form" onSubmit={send}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" />
        <Button type="submit" icon={Send} loading={busy === 'send'} aria-label="Send" />
      </form>
    </div>
  );
}

// Exactly what the device recorded — never a simulated "live" drift around it (that invented readings).
function LiveVitals({ consult }) {
  const vitals = consult.vitals;
  if (!vitals) return <Empty icon={Activity} title="No device readings">This patient joined without kiosk vitals. Ask them about fever, breathing and pain.</Empty>;
  return (
    <div className="stack">
      <div className="row between">
        <span className="tiny muted row" style={{ gap: 6 }}>Captured{consult.kioskName ? ` at ${consult.kioskName}` : ' at check-in'}</span>
        <span className="tiny muted">{timeAgo(consult.createdAt)}</span>
      </div>
      <div className="dr-vgrid">
        {VITAL_META.filter((m) => vitals[m.key] !== undefined && vitals[m.key] !== null && vitals[m.key] !== '').map((m) => (
          <div key={m.key} className={cx('dr-vtile', m.flag(vitals[m.key]))}>
            <span className="dr-vtile-l"><m.icon size={14} />{m.label}</span>
            <span className="dr-vtile-v">{vitals[m.key]}<small>{m.unit}</small></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TriagePanel({ consult, override, setOverride }) {
  const t = consult.triage || {};
  return (
    <div className="stack">
      <div className="dr-triage-head">
        <div>
          <span className="tiny muted">AI triage level</span>
          <div className="row" style={{ gap: 8, marginTop: 4 }}><TriageBadge level={t.level} /><span className="small muted">score {t.score}/100</span></div>
        </div>
        <div className="dr-score"><span style={{ width: `${t.score}%` }} /></div>
      </div>
      <div className="dr-quote">
        <span className="tiny muted">Patient says</span>
        <p className="mb-0">"{t.symptoms}"</p>
      </div>
      <div>
        <span className="tiny muted row" style={{ gap: 6 }}><Sparkles size={13} />Note for doctor</span>
        <p className="small mb-0">{t.note}</p>
      </div>
      {t.redFlags?.length > 0 && <div className="callout rose small">Red flags: {t.redFlags.join(', ')}</div>}
      <div className="dr-override">
        <label className="small" style={{ fontWeight: 600 }} htmlFor="ovr">Your assessment</label>
        <select id="ovr" className="select sm" value={override || t.level} onChange={(e) => setOverride(e.target.value === t.level ? '' : e.target.value)}>
          {Object.entries(TRIAGE).map(([k, v]) => <option key={k} value={k}>{v.label}{k === t.level ? ' (AI)' : ''}</option>)}
        </select>
        <span className="tiny muted">{override ? 'Your assessment is saved with the consult when you finish the prescription.' : 'Decision support only. You can override.'}</span>
      </div>
    </div>
  );
}

export default function Consult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, doctor } = useAuth();
  const { data: consult, loading, error, reload } = useLive(`/consults/${id}`, [`consult:${id}`, 'consults']);
  const rec = useRecord(consult?.patientId);
  const [tab, setTab] = useState('triage');
  const [override, setOverride] = useState('');
  const [run, busy] = useAction();
  const [done, setDone] = useState(null);

  if (loading && !consult) return <Loading />;
  if (error && !consult) return <Empty title="Consult not found">{error} <Link to="/doctor">Back to queue</Link></Empty>;

  const live = consult.status === 'in_progress';
  const r = routeInfo(consult);
  const docFirstLang = (consult.doctorLanguages || doctor?.languages || [])[0];
  const translated = consult.patientLanguage && docFirstLang && consult.patientLanguage !== docFirstLang;

  const start = () => run('start', async () => { await api.post(`/consults/${id}/start`); reload(); }, 'Consult started — the patient has been told you\'re ready');

  const record = rec.data;
  const tabs = [
    { value: 'triage', label: 'AI triage', icon: Sparkles },
    { value: 'vitals', label: 'Vitals', icon: Activity },
    { value: 'history', label: 'History', icon: ClipboardList },
    { value: 'visits', label: 'Past visits', icon: History, count: record?.visits ? Math.max(0, record.visits.filter((v) => v.id !== id).length) : undefined },
    { value: 'labs', label: 'Labs', icon: FlaskConical, count: record?.labs?.length },
  ];

  const gated = (render) => {
    if (rec.loading && !record) return <Loading />;
    if (!record) return <Empty title="Record unavailable">{rec.error}</Empty>;
    if (record.restricted) return <AccessGate record={record} onChanged={rec.reload} compact />;
    if (record.emergency) return <div className="stack"><EmergencyBanner expiresAt={record.expiresAt} /><CriticalCard p={record.patient} /></div>;
    return render(record);
  };

  return (
    <div className="stack lg">
      <div className="row between wrap">
        <div className="row">
          <Link to="/doctor" className="icon-btn" aria-label="Back to queue"><ArrowLeft /></Link>
          <div>
            <div className="row wrap" style={{ gap: 8 }}>
              <h2 className="mb-0" style={{ fontSize: '1.6rem' }} translate="no">{consult.patientName}</h2>
              <TriageBadge level={override || consult.triage?.level} />
              <StatusBadge status={consult.status} />
            </div>
            <div className="small muted">
              {consult.patientAge} y · {consult.patientGender} · <span className="mono">{consult.patientId}</span> · speaks {consult.patientLanguage || '—'}
            </div>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          {record?.patient?.allergies && <AllergyList allergies={record.patient.allergies} />}
          <span className={cx('badge', r.tone)}>{r.label}{r.detail ? ` · ${r.detail}` : ''}</span>
          {consult.kioskName && <span className="badge"><Monitor />{consult.kioskName}</span>}
        </div>
      </div>

      {!done && consult.status !== 'completed' && <PatientSummary consultId={consult.id} />}

      {!done && translated && (
        <div className="dr-translate"><Languages size={15} />Patient speaks {consult.patientLanguage}. Chat messages are sent exactly as typed, so keep them short and simple — and check they understand the plan before you finish.</div>
      )}

      {!done && (
      <div className="dr-consult">
        <div className="stack">
          {consult.mode === 'in_person'
            ? <InPersonStage consult={consult} live={live} onStart={start} starting={busy === 'start'} />
            : <><VideoStage consult={consult} doctorName={user?.name} live={live} onStart={start} starting={busy === 'start'} />
              <ChatPanel consult={consult} onSent={reload} /></>}
        </div>
        <Card className="dr-summary">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          <div className="dr-summary-body">
            {tab === 'triage' && <TriagePanel consult={consult} override={override} setOverride={setOverride} />}
            {tab === 'vitals' && <LiveVitals consult={consult} />}
            {tab === 'history' && gated((d) => <HistoryPanel data={d} />)}
            {tab === 'visits' && gated((d) => <VisitsPanel visits={d.visits} excludeId={id} />)}
            {tab === 'labs' && gated((d) => <LabsPanel labs={d.labs} />)}
          </div>
          {tab !== 'vitals' && consult.vitals && (
            <div className="dr-summary-foot"><VitalsChips vitals={consult.vitals} compact /></div>
          )}
        </Card>
      </div>
      )}

      <RxComposer
        consult={consult}
        record={record}
        override={override}
        done={done}
        onDone={setDone}
        onBack={() => navigate('/doctor')}
      />
    </div>
  );
}
