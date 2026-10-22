// Talking Saathi: speech in (dictation) and speech out (read aloud). Both use the browser's own speech
// services — nothing extra is installed or paid for, and the buttons hide where the browser lacks them.

const INDIAN = new Set(['hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as', 'ur']);
// Speech language from an app language code (hi → hi-IN, ta → ta-IN …).
export const speechLang = (code) => (!code || code === 'en' ? (typeof navigator !== 'undefined' && navigator.language) || 'en-IN' : INDIAN.has(code) ? `${code}-IN` : code);

export const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
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
  let failed = false;
  r.onresult = (e) => {
    let interim = '';
    finalText = '';
    for (let i = 0; i < e.results.length; i += 1) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    onInterim?.((finalText + interim).trim());
  };
  r.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    failed = true;
    onError?.(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Allow the microphone for this site to talk to Saathi.' : "Couldn't hear that — tap the mic to try again.");
  };
  r.onend = () => { if (!failed) onEnd?.(finalText.trim()); };
  r.start();
  return { stop: () => r.stop(), abort: () => { failed = true; r.abort(); } };
}
