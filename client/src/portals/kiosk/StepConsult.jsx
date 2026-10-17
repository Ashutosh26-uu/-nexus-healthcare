import { useEffect, useRef, useState } from 'react';
import { Video, VideoOff, Mic, MicOff, Signal, Languages, Gauge, HeartPulse, Activity, Thermometer, Send, X, ShieldCheck, Clock, Stethoscope, RefreshCw } from 'lucide-react';
import { api } from '../../api';
import { useCall } from '../../components/useCall';
import CallMedia from '../../components/CallMedia';
import { useLive } from '../../live';
import { Avatar, cx } from '../../components/ui';
import { useKiosk } from './context';
import { KButton, KError, StepFrame } from './KUi';

const TIPS = [
  'Keep old reports and medicine strips handy — the doctor may ask.',
  'Sit facing the screen so the doctor can see you clearly.',
  'Tell the doctor about any medicine allergies.',
  'The ASHA didi can speak to the doctor for you if you prefer.',
];

function useDrift(base) {
  const [v, setV] = useState(base);
  useEffect(() => {
    if (!base) return undefined;
    const tick = () => setV({ ...base, pulse: base.pulse ? Math.round(base.pulse + (Math.random() - 0.5) * 6) : base.pulse, spo2: base.spo2 ? Math.min(100, Math.round(base.spo2 + (Math.random() - 0.5) * 2)) : base.spo2 });
    tick();
    const id = setInterval(tick, 2500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(base)]);
  return v;
}

function Timer({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const s = Math.max(0, Math.floor((now - new Date(since || now).getTime()) / 1000));
  return <>{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</>;
}

function Waiting({ c, t, onCancel, cancelling }) {
  const [tip, setTip] = useState(0);
  useEffect(() => { const id = setInterval(() => setTip((x) => (x + 1) % TIPS.length), 6000); return () => clearInterval(id); }, []);
  const pos = c.position || 1;
  return (
    <div className="k-wait fade-in">
      <div className="k-wait-orb">
        <span className="k-orb-ring r1" /><span className="k-orb-ring r2" />
        <div className="k-wait-num"><small>No.</small>{pos}</div>
      </div>
      <h2 className="k-title">{t('position', { n: pos })}</h2>
      <p className="k-sub">About {Math.max(2, pos * 6)} minutes. Please stay seated — we'll chime when the doctor joins.</p>
      <div className="k-docchip">
        <Avatar name={c.doctorName} size="lg" />
        <div>
          <strong translate="no">{c.doctorName}</strong>
          <span>{c.doctorSpecialty} · speaks {(c.doctorLanguages || []).join(', ')}</span>
          {c.routedFrom && <span className="k-route">Matched by routing: {c.routedFrom}</span>}
        </div>
      </div>
      <p className="k-tip" key={tip}>{TIPS[tip]}</p>
      <KButton variant="ghost" icon={X} loading={cancelling} onClick={onCancel}>Cancel and go back</KButton>
    </div>
  );
}

function InCall({ c, t, vitals, onSend }) {
  const [msg, setMsg] = useState('');
  const endRef = useRef(null);
  const v = useDrift(vitals);
  // The kiosk is the patient's side of the call (the operator's account is allowed on its own consults).
  const audioOnly = c.mode === 'audio';
  const call = useCall({ consultId: c.id, role: 'patient', audioOnly, enabled: c.mode !== 'chat' });
  const { localStream, remoteStream, state, muted, cameraOff } = call;
  const live = state === 'connected';
  const remoteVideo = !audioOnly && remoteStream?.getVideoTracks().length > 0 && state !== 'ended';
  const selfVideo = !audioOnly && localStream?.getVideoTracks().length > 0 && !cameraOff;
  const stateKey = { idle: 'call_waiting', connecting: 'call_connecting', reconnecting: 'call_reconnecting', ended: 'call_ended', failed: 'call_failed', connected: 'call_connected' }[state];
  const mediaKey = { denied: 'cam_denied', 'no-camera': 'cam_none', unsupported: 'cam_unsupported' }[call.error];
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [c.messages?.length]);
  const send = (e) => { e.preventDefault(); if (msg.trim()) { onSend(msg.trim()); setMsg(''); } };
  return (
    <div className="k-call fade-in">
      <div className={cx('k-video', remoteVideo && 'has-remote')}>
        {remoteVideo && <CallMedia stream={remoteStream} className="k-remote" label="Doctor’s video" />}
        {remoteStream && !remoteVideo && <CallMedia stream={remoteStream} audioOnly label="Doctor’s voice" />}
        <div className="k-video-top">
          <span className="k-live"><span />{t('in_call')} · <Timer since={c.startedAt} /></span>
          {live && <span className="k-hd"><Signal size={16} />{t(stateKey)}</span>}
        </div>
        {!(remoteVideo && live) && (
          <div className={cx('k-video-doc', remoteVideo && 'over-video')} aria-live="polite">
            {!remoteVideo && <Avatar name={c.doctorName} size="lg" />}
            <strong translate="no">{c.doctorName}</strong>
            <span>{live ? c.doctorSpecialty : t(stateKey)}</span>
            {live && audioOnly && <span className="k-call-clock"><Timer since={c.startedAt} /></span>}
            {(state === 'failed' || call.error === 'denied') && <KButton icon={RefreshCw} onClick={call.retry} className="k-retry">{t('try_again')}</KButton>}
          </div>
        )}
        {mediaKey && <div className="k-media-note">{t(mediaKey)}</div>}
        {!audioOnly && (
          <div className={cx('k-video-self', selfVideo && 'has-video')}>
            {selfVideo ? <CallMedia stream={localStream} self className="k-self-video" label="Kiosk camera" /> : <><Avatar name={c.patientName} size="sm" /><span translate="no">{c.patientName?.split(' ')[0]}</span></>}
          </div>
        )}
        <div className="k-video-ctl">
          <button type="button" className={cx(muted && 'off')} onClick={call.toggleMute} disabled={!localStream} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={muted}>{muted ? <MicOff /> : <Mic />}</button>
          {!audioOnly && <button type="button" className={cx(cameraOff && 'off')} onClick={call.toggleCamera} disabled={!localStream?.getVideoTracks().length} aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'} aria-pressed={cameraOff}>{cameraOff ? <VideoOff /> : <Video />}</button>}
          <span className="k-video-cap"><Languages size={16} />Live captions in {c.patientLanguage || 'Hindi'}</span>
        </div>
      </div>
      <aside className="k-callside">
        <div className="k-callbox">
          <h3>Live vitals <span className="k-live-dot" /></h3>
          <p className="k-fine">The doctor sees these as they update.</p>
          {v ? (
            <div className="k-lv" dir="ltr">
              {v.bp && <div><Gauge /><span>BP</span><strong>{v.bp}</strong></div>}
              {v.pulse && <div><HeartPulse /><span>Pulse</span><strong>{v.pulse}</strong></div>}
              {v.spo2 && <div><Activity /><span>SpO₂</span><strong>{v.spo2}%</strong></div>}
              {v.temp && <div><Thermometer /><span>Temp</span><strong>{v.temp}°F</strong></div>}
            </div>
          ) : <p className="k-fine">No device readings for this visit.</p>}
        </div>
        <div className="k-callbox k-callchat">
          <h3>Messages</h3>
          <div className="k-msgs">
            {(c.messages || []).length === 0 && <p className="k-fine">Messages from the doctor appear here.</p>}
            {(c.messages || []).map((m) => <div key={m.id} translate="no" className={cx('k-msg', m.from === 'doctor' ? 'doc' : 'me')}>{m.text}</div>)}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="k-msgform">
            <input className="k-input" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Type for the doctor…" />
            <button type="submit" className="k-btn primary" aria-label="Send"><Send /></button>
          </form>
        </div>
      </aside>
    </div>
  );
}

export default function StepConsult() {
  const { t, say, flow, setFlow, goto } = useKiosk();
  const id = flow.consultId;
  const { data: c, error, reload } = useLive(id ? `/consults/${id}` : null, ['queue', 'consults', `consult:${id}`], [], { cache: false });
  const [err, setErr] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const lastStatus = useRef(null);

  // Gentle fallback poll in case the live stream drops on a weak rural connection.
  useEffect(() => { const p = setInterval(() => reload(), 8000); return () => clearInterval(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!c) return;
    if (lastStatus.current !== c.status) {
      if (c.status === 'queued') say('waiting_title');
      if (c.status === 'in_progress') say('in_call');
      if (c.status === 'completed') {
        say('call_done');
        const id2 = setTimeout(() => setFlow({ step: 5 }), 1800);
        lastStatus.current = c.status;
        return () => clearTimeout(id2);
      }
      lastStatus.current = c.status;
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.status]);

  if (!id) {
    return (
      <StepFrame title={t('waiting_title')} onBack={() => goto(3)}>
        <p className="k-sub">No consult has been started yet. Go back to the symptoms step to connect a doctor.</p>
      </StepFrame>
    );
  }

  const cancel = async () => {
    setCancelling(true);
    try {
      await api.post(`/consults/${id}/cancel`);
      setFlow({ consultId: null, step: 3 });
    } catch (e) { setErr(e.message); } finally { setCancelling(false); }
  };

  const send = async (text) => {
    try { await api.post(`/consults/${id}/messages`, { text }); reload(); } catch (e) { setErr(e.message); }
  };

  const title = !c ? t('waiting_title') : c.status === 'in_progress' ? t('in_call') : c.status === 'completed' ? t('call_done') : t('waiting_title');

  return (
    <StepFrame title={title} wide aside={c && <span className={cx('k-pill', c.status)}><ShieldCheck size={16} />{c.patientName}</span>}>
      <KError>{err || (!c && error)}</KError>
      {!c && <div className="k-center"><span className="k-spin big" /></div>}
      {c?.status === 'queued' && <Waiting c={c} t={t} onCancel={cancel} cancelling={cancelling} />}
      {c?.status === 'in_progress' && <InCall c={c} t={t} vitals={c.vitals} onSend={send} />}
      {c?.status === 'completed' && (
        <div className="k-center fade-in">
          <div className="k-done-icon"><Stethoscope /></div>
          <h2 className="k-title">{t('call_done')}</h2>
          <KButton className="xl" onClick={() => setFlow({ step: 5 })}>{t('next')}</KButton>
        </div>
      )}
      {c?.status === 'cancelled' && (
        <div className="k-center">
          <Clock />
          <p className="k-sub">This consult was cancelled.</p>
          <KButton onClick={() => setFlow({ consultId: null, step: 3 })}>{t('back')}</KButton>
        </div>
      )}
      {c?.status === 'queued' && <p className="k-fine center"><Video size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Camera and microphone are tested and ready.</p>}
    </StepFrame>
  );
}
