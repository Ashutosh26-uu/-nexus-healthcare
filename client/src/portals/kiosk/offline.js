// Offline visits on the kiosk: kept in this browser only until they reach Sehatra, then deleted. Anything not
// sent within 72 hours is dropped, so no patient details linger on a shared device.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';

const KEY = 'oc_kiosk_outbox';
const MAX_AGE_MS = 72 * 3600000;
const EVT = 'oc:outbox';

export function readOutbox() {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '[]');
    const fresh = (Array.isArray(all) ? all : []).filter((v) => Date.now() - Date.parse(v.recordedAt) < MAX_AGE_MS);
    if (fresh.length !== all.length) localStorage.setItem(KEY, JSON.stringify(fresh));
    return fresh;
  } catch { return []; }
}
function writeOutbox(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ }
  window.dispatchEvent(new Event(EVT));
}
export function addToOutbox(visit) {
  const v = { ...visit, localId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, recordedAt: new Date().toISOString() };
  writeOutbox([...readOutbox(), v]);
  return v;
}

// Real network state (not the "offline mode" status the operator shows to the network).
export function useNetwork() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

// Sends waiting visits whenever there's a connection: at once when it comes back, and every 30 s to be sure.
// Each visit has its own id, so a retry after a dropped reply never creates it twice.
export function useOutboxSync(online) {
  const [waiting, setWaiting] = useState(() => readOutbox().length);
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState(0);
  const sync = useCallback(async () => {
    const list = readOutbox();
    setWaiting(list.length);
    if (!list.length || !navigator.onLine) return;
    setSending(true);
    let sent = 0;
    for (const v of list) {
      try {
        await api.post('/kiosk/intakes', v);
        writeOutbox(readOutbox().filter((x) => x.localId !== v.localId));
        sent += 1;
      } catch { break; } // still offline or the server is busy — try again later, in order
    }
    setSending(false);
    setWaiting(readOutbox().length);
    if (sent) setLastSent(sent);
  }, []);
  useEffect(() => {
    const onChange = () => setWaiting(readOutbox().length);
    window.addEventListener(EVT, onChange);
    return () => window.removeEventListener(EVT, onChange);
  }, []);
  useEffect(() => {
    if (online) sync();
    const t = setInterval(() => { if (navigator.onLine) sync(); }, 30000);
    return () => clearInterval(t);
  }, [online, sync]);
  return { waiting, sending, lastSent, sync };
}

// Danger signs checked on the device, so "call 108" works with no connection at all.
export function dangerFrom({ vitals = {}, signs = [] }) {
  const out = [...signs];
  const spo2 = Number(vitals.spo2);
  const temp = Number(vitals.temp);
  const sugar = Number(vitals.sugar);
  const pulse = Number(vitals.pulse);
  const [sys, dia] = String(vitals.bp || '').split('/').map(Number);
  if (spo2 && spo2 < 90) out.push(`Low oxygen (SpO₂ ${spo2}%)`);
  if (sys >= 180 || dia >= 120) out.push(`Very high BP (${vitals.bp})`);
  if (sys && sys < 90) out.push(`Low BP (${vitals.bp})`);
  if (temp >= 104) out.push(`Very high fever (${temp}°F)`);
  if (sugar && (sugar < 70 || sugar > 400)) out.push(`Blood sugar ${sugar} mg/dL`);
  if (pulse && (pulse > 130 || pulse < 45)) out.push(`Pulse ${pulse}/min`);
  return out;
}
