// "Easy mode" — bigger text, bigger buttons, stronger contrast, and a "Listen" button that reads the page aloud.
// For elders, people with weak eyesight, and anyone who finds reading on a phone hard. Kept on this device only.
import { useCallback, useEffect, useState } from 'react';

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
  }, []);
  return [on, toggle];
}
