// Push notifications on this browser / phone (server side: server/push.js, shown by public/sw.js).
// The service worker is only registered in production builds, so alerts can't be turned on in `npm run dev`.
import { api } from './api';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
// iPhone / iPad Safari only allows push for an app added to the Home Screen.
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

const registration = async () => {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? navigator.serviceWorker.ready : null;
};
export async function currentSubscription() {
  try { return (await (await registration())?.pushManager.getSubscription()) || null; } catch { return null; }
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : isIos() ? 'iPhone / iPad' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${os} · ${br}`;
}

const keyBytes = (b64u) => Uint8Array.from(atob(b64u.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const sameKey = (sub, b64u) => {
  const k = sub?.options?.applicationServerKey;
  if (!k) return true; // older browsers don't expose it — assume it matches
  const a = new Uint8Array(k); const b = keyBytes(b64u);
  return a.length === b.length && a.every((x, i) => x === b[i]);
};
const save = (sub) => api.post('/push/subscribe', { ...sub.toJSON(), label: deviceLabel() });

// Ask permission, subscribe this browser and register it for the signed-in account.
export async function enablePush(publicKey) {
  const reg = await registration();
  if (!reg) throw new Error('Alerts need the installed app or a supported browser.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for this site — allow them in your browser\'s site settings.' : 'Permission was not given.');
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, publicKey)) { await sub.unsubscribe(); sub = null; }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await save(sub);
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// After sign-in: if this browser already has alerts on, attach them to whoever is signed in now
// (and pick up a fresh sign-in after "sign out of all devices").
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const sub = await currentSubscription();
  if (!sub) return;
  const { publicKey } = await api.get('/push').catch(() => ({}));
  if (publicKey && !sameKey(sub, publicKey)) { await sub.unsubscribe().catch(() => {}); return; }
  await save(sub).catch(() => {});
}

// Sign-out: this browser stops getting the account's alerts (the server drops it at the next push).
export function forgetPush() { currentSubscription().then((s) => s?.unsubscribe()).catch(() => {}); }
