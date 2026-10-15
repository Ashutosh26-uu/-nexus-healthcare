import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mic, MicOff, Video, VideoOff, PhoneOff, Send, Languages, Sparkles, Activity, History, FlaskConical, ClipboardList, Signal, Monitor, Play, Maximize2, Building2 } from 'lucide-react';
import { api } from '../../api';
import { useLive } from '../../live';
import { useAuth } from '../../auth';
import { Avatar, Button, Card, Empty, Loading, Tabs, TriageBadge, TRIAGE, StatusBadge, Sparkline, timeAgo, fmtTime, useAction, cx } from '../../components/ui';
import { VitalsChips, VITAL_META, useLiveVitals, useNow, routeInfo } from './shared';
import { useRecord, AccessGate, EmergencyBanner, CriticalCard, HistoryPanel, VisitsPanel, LabsPanel, AllergyList } from './Record';
import RxComposer from './RxComposer';

function CallTimer({ since }) {
  const now = useNow(1000);
  if (!since) return <span>00:00</span>;
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return <span>{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>;
}

function VideoStage({ consult, doctorName, live, onStart, starting }) {
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [ended, setEnded] = useState(false);
  const from = consult.kioskName ? `connected from ${consult.kioskName.replace('E-Clinic · ', 'E-Clinic ')}` : consult.mode === 'chat' ? 'chat consult from the Nexus Healthcare app' : 'joining from the Nexus Healthcare app';
  return (
    <div className={cx('dr-stage', !live && 'idle', ended && 'ended')}>
      <div className="dr-stage-top">
        <span className="dr-live-pill">{live && !ended ? <><span className="dr-rec" />LIVE · <CallTimer since={consult.startedAt} /></> : ended ? 'Call ended' : 'Not started'}</span>
        <span className="dr-net"><Signal size={14} />{consult.kioskName ? 'HD · 2.1 Mbps' : 'Good connection'}</span>
      </div>
      <div className="dr-stage-center">
        <div className="dr-patient-tile">
          <Avatar name={consult.patientName} size="lg" />
          {live && !ended && <span className="dr-voice"><i /><i /><i /><i /></span>}
        </div>
        <div className="dr-stage-name" translate="no">{consult.patientName}</div>
        <div className="dr-stage-sub">{from}</div>
        {!live && consult.status === 'queued' && (
          <Button variant="clay" icon={Play} loading={starting} onClick={onStart} className="mt-2">Start consult</Button>
        )}
        {ended && <div className="dr-stage-sub mt-1">Finish the prescription below to close the visit.</div>}
      </div>
      <div className="dr-selfview">
        {cam ? <Avatar name={doctorName} size="sm" /> : <VideoOff size={16} />}
        <span>You</span>
      </div>
      <div className="dr-controls">
        <button className={cx('dr-ctl', !mic && 'off')} onClick={() => setMic((v) => !v)} aria-label={mic ? 'Mute' : 'Unmute'}>{mic ? <Mic /> : <MicOff />}</button>
        <button className={cx('dr-ctl', !cam && 'off')} onClick={() => setCam((v) => !v)} aria-label={cam ? 'Turn camera off' : 'Turn camera on'}>{cam ? <Video /> : <VideoOff />}</button>
        <button className="dr-ctl" aria-label="Full screen"><Maximize2 /></button>
        <button className="dr-ctl end" disabled={!live || ended} onClick={() => setEnded(true)} aria-label="End call"><PhoneOff /></button>
      </div>
    </div>
  );
}

// In-person visit at the doctor's hospital/clinic or a Nexus E-Clinic — no call, just the visit status.
function InPersonStage({ consult, live, onStart, starting }) {
  const where = consult.location || {};
  return (
    <div className="dr-inperson">
      <div className="dr-inperson-ic"><Building2 /></div>
      <div className="grow">
        <span className="eyebrow">{where.kind === 'eclinic' ? 'Nexus E-Clinic visit' : 'In-person visit'}</span>
        <h3 className="mb-0" translate="no">{consult.patientName}</h3>
        <p className="small muted mb-0">{where.name}{consult.scheduledAt ? ` · booked for ${new Date(consult.scheduledAt).toLocaleString()}` : ''}</p>
        <p className="small mb-0">{consult.checkedInAt ? `Checked in ${timeAgo(consult.checkedInAt)} with their live QR pass.` : 'Not checked in yet — scan their QR from “Check in patient” on your queue.'}</p>
      </div>
      {!live && consult.status === 'queued' && <Button variant="clay" icon={Play} loading={starting} onClick={onStart}>Start visit</Button>}
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

function LiveVitals({ consult, active }) {
  const { vitals, history } = useLiveVitals(consult.vitals, active);
  if (!consult.vitals) return <Empty icon={Activity} title="No device readings">This patient joined without kiosk vitals. Ask them about fever, breathing and pain.</Empty>;
  return (
    <div className="stack">
      <div className="row between">
        <span className="tiny muted row" style={{ gap: 6 }}>{active ? <><span className="dot green pulse" />Streaming from {consult.kioskName || 'device'}</> : 'Captured at check-in'}</span>
        <span className="tiny muted">{timeAgo(consult.createdAt)}</span>
      </div>
      <div className="dr-vgrid">
        {VITAL_META.filter((m) => vitals[m.key] !== undefined && vitals[m.key] !== null).map((m) => (
          <div key={m.key} className={cx('dr-vtile', m.flag(vitals[m.key]))}>
            <span className="dr-vtile-l"><m.icon size={14} />{m.label}</span>
            <span className="dr-vtile-v">{vitals[m.key]}<small>{m.unit}</small></span>
            {m.key === 'pulse' && history.pulse.length > 2 && <Sparkline data={history.pulse} height={26} color="var(--clay)" fill={false} />}
            {m.key === 'spo2' && history.spo2.length > 2 && <Sparkline data={history.spo2} height={26} color="var(--sky)" fill={false} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function TriagePanel({ consult, override, setOverride }) {
  const t = consult.triage;
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
        <span className="tiny muted">{override ? 'Override saved with the consult — it helps train the triage model.' : 'Decision support only. You can override.'}</span>
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
    { value: 'vitals', label: 'Live vitals', icon: Activity },
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
              <TriageBadge level={override || consult.triage.level} />
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

      {!done && translated && (
        <div className="dr-translate"><Languages size={15} />Patient speaks {consult.patientLanguage}. Symptoms, notes and chat are auto-translated {consult.patientLanguage} → {docFirstLang}. Your prescription will be printed in {consult.patientLanguage}.</div>
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
            {tab === 'vitals' && <LiveVitals consult={consult} active={live} />}
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
