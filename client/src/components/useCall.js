// Real patient ↔ doctor calls: peer-to-peer WebRTC, with the handshake relayed through our server
// (POST/GET /api/consults/:id/signal). The doctor always makes the offer, so the two sides never both
// offer at once ("glare"). Every signal carries the sender's session id (sid) and the sid it is meant
// for, so leftovers from an earlier attempt (a reload, a dropped tab) are simply ignored.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, session, subscribe } from '../api';

const FALLBACK_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const newSid = () => `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

// A hangup has to get out even while the tab is closing: a keepalive fetch outlives the page
// (sendBeacon can't carry the auth header).
function sendHangup(consultId, sid) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (session.token) headers.Authorization = `Bearer ${session.token}`;
    if (session.profile) headers['X-Profile'] = session.profile;
    fetch(`/api/consults/${encodeURIComponent(consultId)}/signal`, { method: 'POST', headers, keepalive: true, body: JSON.stringify({ type: 'hangup', data: { sid } }) }).catch(() => {});
  } catch { /* ignore */ }
}

/**
 * useCall({ consultId, role: 'patient'|'doctor', audioOnly, enabled })
 * → { localStream, remoteStream, state, muted, cameraOff, toggleMute, toggleCamera, hangup, retry, error }
 * state: 'idle' (waiting for the other side) | 'connecting' | 'connected' | 'reconnecting' | 'ended' | 'failed'
 * error: '' | 'denied' (no camera/mic permission) | 'no-camera' (voice only) | 'unsupported' | 'closed' (consult over)
 */
export function useCall({ consultId, role, audioOnly = false, enabled = true }) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [state, setState] = useState('idle');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0); // bumped by retry() — starts a fresh session
  const ctl = useRef(null);

  useEffect(() => {
    if (!enabled || !consultId) return undefined;
    const base = `/consults/${encodeURIComponent(consultId)}/signal`;
    const sid = newSid();
    let alive = true;
    let over = false; // we hung up (or the consult closed): stop signalling
    let stream = null;
    let pc = null;
    let remoteSid = null;
    let since = 0;
    let offerN = 0; // doctor: number of the latest offer — an answer to an older one is dropped
    let answered = false;
    let connected = false;
    let restarts = 0;
    let pendingIce = [];
    let iceServers = FALLBACK_ICE;
    let timer = null;
    let sendQ = Promise.resolve();
    let work = Promise.resolve();
    let pulling = false;
    let again = false;
    let poll = null;
    let unsub = null;

    setState('idle'); setError(''); setRemoteStream(null);
    const set = (s) => { if (alive && !over) setState(s); };
    const later = (ms, fn) => { clearTimeout(timer); timer = setTimeout(fn, ms); };

    // Sent one after another, so an offer always reaches the server before its ICE candidates.
    const send = (type, data = {}) => {
      if (over) return sendQ;
      sendQ = sendQ.then(() => api.post(base, { type, data: { sid, ...data } })).catch((e) => { if (e.status === 409) close('closed'); });
      return sendQ;
    };

    const closePc = () => {
      clearTimeout(timer);
      if (pc) { pc.ontrack = null; pc.onicecandidate = null; pc.oniceconnectionstatechange = null; pc.close(); }
      pc = null; pendingIce = []; connected = false; answered = false;
      if (alive) setRemoteStream(null);
    };

    const stopAll = () => {
      over = true;
      clearInterval(poll); unsub?.(); unsub = null;
      window.removeEventListener('pagehide', onPageHide);
      closePc();
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };

    const close = (why) => {
      if (over) return;
      if (alive) { setState('ended'); if (why) setError(why); setLocalStream(null); }
      stopAll();
    };

    const restartIce = () => {
      if (!pc) return;
      if (restarts >= 1) { set('failed'); clearTimeout(timer); return; }
      restarts += 1;
      set('reconnecting');
      if (role === 'doctor') offer(true); else send('ready', { restart: true });
      const p = pc;
      later(15000, () => { if (pc === p && !connected) set('failed'); });
    };

    const makePc = () => {
      closePc();
      const p = new RTCPeerConnection({ iceServers });
      pc = p;
      const remote = new MediaStream();
      p.ontrack = (e) => {
        if (pc !== p) return;
        if (!remote.getTracks().includes(e.track)) remote.addTrack(e.track);
        setRemoteStream(new MediaStream(remote.getTracks())); // new object → the <video> re-renders with every track
      };
      p.onicecandidate = (e) => { if (e.candidate && pc === p && remoteSid) send('ice', { to: remoteSid, candidate: e.candidate.toJSON() }); };
      p.oniceconnectionstatechange = () => {
        if (pc !== p) return;
        const st = p.iceConnectionState;
        if (st === 'connected' || st === 'completed') { clearTimeout(timer); connected = true; restarts = 0; set('connected'); }
        else if (st === 'disconnected') { set('reconnecting'); later(4000, () => { if (pc === p && ['disconnected', 'failed'].includes(p.iceConnectionState)) restartIce(); }); }
        else if (st === 'failed') restartIce();
      };
      // Our own tracks. A side without a camera/mic still receives: the doctor asks for the media anyway.
      for (const kind of audioOnly ? ['audio'] : ['audio', 'video']) {
        const track = stream?.getTracks().find((t) => t.kind === kind);
        if (track && role === 'doctor') p.addTrack(track, stream);
        else if (!track && role === 'doctor') p.addTransceiver(kind, { direction: 'recvonly' });
      }
      return p;
    };

    const flushIce = async () => {
      const list = pendingIce; pendingIce = [];
      for (const c of list) await pc?.addIceCandidate(c).catch(() => {});
    };

    const offer = async (iceRestart) => {
      const p = pc;
      if (!p || !remoteSid) return;
      const n = ++offerN;
      const o = await p.createOffer(iceRestart ? { iceRestart: true } : undefined);
      if (pc !== p || n !== offerN) return;
      await p.setLocalDescription(o);
      send('offer', { to: remoteSid, n, sdp: { type: p.localDescription.type, sdp: p.localDescription.sdp } });
    };

    const handle = async (m) => {
      const d = m.data || {};
      if (m.type === 'hangup') {
        if (d.sid && d.sid === remoteSid) { closePc(); remoteSid = null; set('ended'); }
        return;
      }
      if (m.type === 'ready') {
        if (role !== 'doctor' || !d.sid) return;
        if (d.sid === remoteSid && pc) { await offer(true); return; } // the patient asked again (their reconnect) → ICE restart
        remoteSid = d.sid;
        const p = makePc();
        set('connecting');
        await offer(false);
        // Nobody answered (an old tab that never said goodbye) → back to waiting for the patient.
        later(20000, () => { if (pc === p && !answered) { closePc(); remoteSid = null; set('idle'); } });
        return;
      }
      if (d.to !== sid) return; // meant for an earlier session of ours
      if (m.type === 'offer' && role === 'patient' && d.sdp) {
        const fresh = d.sid !== remoteSid || !pc;
        if (fresh) { remoteSid = d.sid; makePc(); set('connecting'); }
        const p = pc;
        await p.setRemoteDescription(d.sdp);
        if (fresh) {
          // Added after the offer so the tracks ride the doctor's transceivers instead of needing a second round.
          for (const t of stream?.getTracks() || []) if (!audioOnly || t.kind === 'audio') p.addTrack(t, stream);
        }
        await flushIce();
        const a = await p.createAnswer();
        if (pc !== p) return;
        await p.setLocalDescription(a);
        send('answer', { to: remoteSid, n: d.n, sdp: { type: p.localDescription.type, sdp: p.localDescription.sdp } });
      } else if (m.type === 'answer' && role === 'doctor' && d.sdp) {
        if (!pc || d.sid !== remoteSid || d.n !== offerN || pc.signalingState !== 'have-local-offer') return;
        answered = true;
        await pc.setRemoteDescription(d.sdp);
        await flushIce();
      } else if (m.type === 'ice' && d.candidate) {
        if (!pc || d.sid !== remoteSid) return;
        if (!pc.remoteDescription) pendingIce.push(d.candidate);
        else await pc.addIceCandidate(d.candidate).catch(() => {});
      }
    };

    const processBatch = (msgs) => {
      // Joining late hands us the whole history: only the newest 'ready' matters, and not if that tab already hung up.
      const lastReady = msgs.map((m) => m.type).lastIndexOf('ready');
      const list = msgs.filter((m, i) => m.type !== 'ready' || (i === lastReady && !msgs.slice(i + 1).some((h) => h.type === 'hangup' && h.data?.sid === m.data?.sid)));
      for (const m of list) work = work.then(() => (over ? null : handle(m))).catch(() => {});
      return work;
    };

    const pull = async () => {
      if (over) return;
      if (pulling) { again = true; return; }
      pulling = true;
      try {
        do {
          again = false;
          const r = await api.get(`${base}?since=${since}`);
          if (over) return;
          if (r.seq < since) { since = 0; again = true; send('ready'); continue; } // the server restarted and lost the handshake
          since = r.seq;
          await processBatch(r.messages || []);
        } while (again && !over);
      } catch (e) {
        if (e.status === 409 || e.status === 403 || e.status === 404) close('closed');
      } finally { pulling = false; }
    };

    function onPageHide() { if (!over) sendHangup(consultId, sid); }

    ctl.current = {
      hangup: () => { if (!over) { sendHangup(consultId, sid); close(''); } },
    };

    (async () => {
      try { const cfg = await api.get('/rtc-config'); if (cfg?.iceServers?.length) iceServers = cfg.iceServers; } catch { /* STUN fallback */ }
      if (!navigator.mediaDevices?.getUserMedia) { if (alive) setError('unsupported'); }
      else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: audioOnly ? false : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
        } catch {
          // No camera (or it's busy) shouldn't cost the patient the call — try voice alone.
          if (!audioOnly) { try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { /* none */ } }
          if (alive) setError(stream ? 'no-camera' : 'denied');
        }
      }
      if (!alive || over) { stream?.getTracks().forEach((t) => t.stop()); stream = null; return; }
      setLocalStream(stream);
      window.addEventListener('pagehide', onPageHide);
      unsub = subscribe((topics) => { if (topics.includes(`call:${consultId}`) || topics.includes('all')) pull(); });
      poll = setInterval(pull, 3000); // fallback when the live stream is down
      await pull();
      send('ready');
    })();

    return () => {
      alive = false;
      if (!over) sendHangup(consultId, sid);
      stopAll();
      setLocalStream(null);
    };
  }, [consultId, role, audioOnly, enabled, attempt]);

  useEffect(() => { localStream?.getAudioTracks().forEach((t) => { t.enabled = !muted; }); }, [muted, localStream]);
  useEffect(() => { localStream?.getVideoTracks().forEach((t) => { t.enabled = !cameraOff; }); }, [cameraOff, localStream]);

  const toggleMute = useCallback(() => setMuted((v) => !v), []);
  const toggleCamera = useCallback(() => setCameraOff((v) => !v), []);
  const hangup = useCallback(() => ctl.current?.hangup(), []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { localStream, remoteStream, state, muted, cameraOff, toggleMute, toggleCamera, hangup, retry, error };
}
