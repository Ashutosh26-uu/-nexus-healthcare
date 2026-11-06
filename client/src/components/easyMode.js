// "Easy mode" — bigger text, bigger buttons, stronger contrast, and a "Listen" button that reads the page aloud.
// For elders, people with weak eyesight, and anyone who finds reading on a phone hard. Saved on this device and
// on the account, so a new phone opens the same way; a choice made on a device wins on that device.
import { useCallback, useEffect, useState } from 'react';
import { api, session } from '../api';

const KEY = 'oc_easy';
const EVT = 'oc:easy';
export const easyOn = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export function applyEasy(on = easyOn()) {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('easy', on);
}
export function useEasyMode() {
  const [on, setOn] = useState(easyOn);
  useEffect(() => {
    const sync = () => setOn(easyOn());
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, []);
  const toggle = useCallback(() => {
    const next = !easyOn();
    try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* storage blocked: still applies for now */ }
    applyEasy(next);
    window.dispatchEvent(new Event(EVT));
    if (session.token) api.put('/me/easy', { on: next }).catch(() => {});
  }, []);
  return [on, toggle];
}

// After sign-in: a device that has never chosen takes the account's setting.
export function syncEasyFromAccount(user) {
  let chosen = null;
  try { chosen = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (chosen !== null || !user?.easyMode) return;
  try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
  applyEasy(true);
  window.dispatchEvent(new Event(EVT));
}
