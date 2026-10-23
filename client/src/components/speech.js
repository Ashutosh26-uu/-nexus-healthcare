// Talking Saathi: speech in (dictation) and speech out (read aloud). Both use the browser's own speech
// services — nothing extra is installed or paid for, and the buttons hide where the browser lacks them.
import { useEffect, useRef, useState } from 'react';

const INDIAN = new Set(['hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as', 'ur']);
// Speech language from an app language code (hi → hi-IN, ta → ta-IN …). English is Indian English: it
// understands Hinglish, Indian names and medicine names far better than the phone's default en-US.
export const speechLang = (code) => (!code || code === 'en' ? 'en-IN' : INDIAN.has(code) ? `${code}-IN` : code);

// What went wrong, in words a patient can act on. null = nothing to tell (silence, or we stopped it).
export function micErrorText(code) {
  if (code === 'no-speech' || code === 'aborted') return null;
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'The microphone is blocked. Allow it for this site (tap the lock icon next to the address), then try again.';
  if (code === 'audio-capture') return 'No microphone found — or another app is using it. Close that app and try again.';
  if (code === 'network') return 'Speech needs an internet connection. Check your connection, or type instead.';
  if (code === 'language-not-supported') return "Your phone can't recognise speech in this language yet. Try English or Hindi, or type instead.";
  return 'The microphone stopped. Tap it to try again.';
}

export const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

/**
 * The words in a recognition result list, said once. Android Chrome repeats the growing sentence as new
 * results ("kafi", "kafi din", "kafi din se"…) instead of updating one, so plain joining wrote every
 * version. A result that extends the previous one replaces it; an older, shorter copy is skipped.
 * `finalOnly` leaves out words the browser may still change.
 */
export function joinResults(results, { finalOnly = false } = {}) {
  const parts = [];
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  for (let i = 0; i < results.length; i += 1) {
    if (finalOnly && !results[i].isFinal) continue;
    const t = String(results[i][0]?.transcript || '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const last = parts[parts.length - 1];
    if (last && norm(t).startsWith(norm(last))) parts[parts.length - 1] = t;
    else if (last && norm(last).startsWith(norm(t))) continue;
    else parts.push(t);
  }
  return parts.join(' ');
}
const synth = typeof window !== 'undefined' && 'speechSynthesis' in window && window.SpeechSynthesisUtterance ? window.speechSynthesis : null;
export const listenSupported = () => !!Recognition;
export const speakSupported = () => !!synth;

// The reply's own script decides the voice — Saathi often answers in the language the person typed in,
// which can differ from the app language.
const SCRIPTS = [
  [/[ऀ-ॿ]/, 'hi'], [/[ঀ-৿]/, 'bn'], [/[਀-੿]/, 'pa'], [/[઀-૿]/, 'gu'],
  [/[଀-୿]/, 'or'], [/[஀-௿]/, 'ta'], [/[ఀ-౿]/, 'te'], [/[ಀ-೿]/, 'kn'],
  [/[ഀ-ൿ]/, 'ml'], [/[؀-ۿ]/, 'ur'],
];
export function voiceLangFor(text, appLang) {
  for (const [re, code] of SCRIPTS) {
    if (!re.test(text)) continue;
    // Devanagari is shared by Hindi, Marathi and Nepali; Bengali script by Assamese — keep the app language then.
    if (code === 'hi' && ['mr', 'ne'].includes(appLang)) return speechLang(appLang);
    if (code === 'bn' && appLang === 'as') return speechLang('as');
    return speechLang(code);
  }
  return !appLang || appLang === 'en' || INDIAN.has(appLang) ? 'en-IN' : speechLang(appLang);
}

// Markdown, emoji and links read badly aloud — strip them and turn each line into a sentence.
export function cleanForSpeech(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l
      .replace(/https?:\/\/\S+/g, '')
      .replace(/^\s*(?:[-•*]|\d+\.)\s+/, '')
      .replace(/\*+/g, '')
      .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .map((l) => (/[.!?।॥:;]$/.test(l) ? l : `${l}.`))
    .join(' ');
}

// Chrome stops a long utterance after ~15 seconds, so speak in sentence-sized pieces.
function chunks(text) {
  const out = [];
  let cur = '';
  for (const s of text.split(/(?<=[.!?।॥])\s+/)) {
    if (cur && (cur + s).length > 220) { out.push(cur); cur = ''; }
    cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

const norm = (l) => String(l || '').replace('_', '-').toLowerCase();
function pickVoice(tag) {
  const voices = synth.getVoices();
  const want = norm(tag);
  const base = want.split('-')[0];
  const exact = voices.filter((v) => norm(v.lang) === want);
  const near = voices.filter((v) => norm(v.lang).split('-')[0] === base);
  // An on-device voice keeps the text on the phone; an online one is the fallback.
  const pool = exact.length ? exact : near;
  return { voice: pool.find((v) => v.localService) || pool[0] || null, known: voices.length > 0 };
}

// Voices load asynchronously on first use in Chrome.
if (synth) { synth.getVoices(); synth.addEventListener?.('voiceschanged', () => synth.getVoices()); }

let token = 0;
let live = []; // Chrome drops onend for utterances it garbage-collects — keep a reference until they finish.

export function stopSpeaking() {
  token += 1;
  live = [];
  synth?.cancel();
}

/** Speak text in `tag` (e.g. 'hi-IN'). Returns false when this device has no voice for that language. */
export function speak(text, tag, { onEnd } = {}) {
  if (!synth) return false;
  stopSpeaking();
  const words = cleanForSpeech(text);
  if (!words) return false;
  const { voice, known } = pickVoice(tag);
  if (!voice && known) return false; // reading Hindi with an English voice is gibberish — say so instead
  const mine = ++token;
  const parts = chunks(words);
  live = parts.map((p, i) => {
    const u = new window.SpeechSynthesisUtterance(p);
    u.lang = voice?.lang || tag;
    if (voice) u.voice = voice;
    u.rate = 0.97;
    if (i === parts.length - 1) {
      const done = () => { if (mine === token) { live = []; onEnd?.(); } };
      u.onend = done;
      u.onerror = done;
    }
    return u;
  });
  live.forEach((u) => synth.speak(u));
  return true;
}

/**
 * Listen for one spoken message. Calls onInterim with the words so far, then onEnd(finalText)
 * once the person pauses ('' when nothing was heard), or onError(message).
 */
export function listenOnce({ lang, onInterim, onEnd, onError }) {
  const r = new Recognition();
  r.lang = lang;
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let finalText = '';
  let heard = '';
  let failed = false;
  r.onresult = (e) => {
    finalText = joinResults(e.results, { finalOnly: true }) || finalText;
    heard = joinResults(e.results) || heard;
    onInterim?.(heard);
  };
  r.onerror = (e) => {
    const msg = micErrorText(e.error);
    if (!msg) return;
    failed = true;
    onError?.(msg);
  };
  // Tapping "done" mid-sentence can end the session before the phone marks the words final — keep them anyway.
  r.onend = () => { if (!failed) onEnd?.((finalText || heard).trim()); };
  r.start();
  return { stop: () => r.stop(), abort: () => { failed = true; r.abort(); } };
}

/**
 * Dictation that keeps going until stopped — the one mic engine behind every "Speak" button.
 * Phones end recognition at each pause, so every phrase is its own short session: its words show live
 * (`interim`), the finished phrase goes to onPhrase once, and the next session starts quietly. Two silent
 * sessions in a row stop it (no endless beeping), with a note saying why.
 */
export function useDictation({ lang, onPhrase }) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const rec = useRef(null);
  const wantOn = useRef(false);
  const quiet = useRef(0);
  const timer = useRef(null);
  const phraseRef = useRef(onPhrase);
  phraseRef.current = onPhrase;
  const langRef = useRef(lang);
  langRef.current = lang;

  const end = (why = '') => {
    wantOn.current = false;
    clearTimeout(timer.current);
    setListening(false);
    setInterim('');
    if (why) setNote(why);
  };

  const session = () => {
    const r = new Recognition();
    r.lang = langRef.current;
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;
    let finalText = '';
    let heard = '';
    r.onresult = (e) => {
      finalText = joinResults(e.results, { finalOnly: true }) || finalText;
      heard = joinResults(e.results) || heard;
      setInterim(heard);
    };
    r.onerror = (e) => {
      const msg = micErrorText(e.error);
      if (msg) { setError(msg); end(); }
    };
    r.onend = () => {
      const said = (finalText || heard).trim();
      setInterim('');
      if (said) { quiet.current = 0; phraseRef.current?.(said); } else quiet.current += 1;
      if (!wantOn.current) { setListening(false); return; }
      if (quiet.current >= 2) { end("Stopped listening — I didn't hear anything. Tap the mic to speak again."); return; }
      // A short gap: Android throws if a new session starts the instant the last one ends.
      timer.current = setTimeout(() => {
        if (!wantOn.current) return;
        try { session(); } catch { end('The microphone stopped. Tap it to try again.'); }
      }, 250);
    };
    rec.current = r;
    r.start();
  };

  const start = () => {
    if (!Recognition || wantOn.current) return;
    setError(''); setNote(''); setInterim('');
    quiet.current = 0;
    wantOn.current = true;
    try { session(); setListening(true); } catch { end('The microphone could not start. Tap it to try again.'); }
  };
  // Stop keeps what was being said: the session ends normally and delivers its phrase.
  const stop = () => { wantOn.current = false; clearTimeout(timer.current); try { rec.current?.stop(); } catch { /* already ended */ } setListening(false); };

  useEffect(() => () => { wantOn.current = false; clearTimeout(timer.current); try { rec.current?.abort(); } catch { /* ignore */ } }, []);

  return { supported: Boolean(Recognition), listening, interim, error, note, start, stop, toggle: () => (wantOn.current ? stop() : start()) };
}
