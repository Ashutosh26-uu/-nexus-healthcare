import { createContext, useContext } from 'react';

export const KioskCtx = createContext(null);
export const useKiosk = () => useContext(KioskCtx);

export const FLOW_KEY = 'oc_kiosk_flow';
export const initialFlow = () => ({ step: 0, patient: null, vitals: null, triage: null, symptoms: null, consultId: null, booking: null, payment: null, startedAt: Date.now() });

export function loadFlow() {
  try {
    const raw = sessionStorage.getItem(FLOW_KEY);
    if (raw) return { ...initialFlow(), ...JSON.parse(raw) };
  } catch { /* storage blocked — start fresh */ }
  return initialFlow();
}

export function saveFlow(flow) {
  try { sessionStorage.setItem(FLOW_KEY, JSON.stringify(flow)); } catch { /* ignore */ }
}

/* Speech synthesis helper — speaks in the chosen language when the device has a voice for it. */
export function voiceFor(speechLang) {
  try {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    const base = speechLang.split('-')[0];
    return voices.find((v) => v.lang === speechLang) || voices.find((v) => v.lang?.toLowerCase().startsWith(base));
  } catch {
    return null;
  }
}

export function speak(text, speechLang) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || !text) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang;
    const v = voiceFor(speechLang);
    if (v) u.voice = v;
    u.rate = 0.95;
    synth.speak(u);
  } catch { /* speech not available */ }
}

export function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}
