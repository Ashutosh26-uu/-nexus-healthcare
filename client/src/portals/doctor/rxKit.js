import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { freqText, parseFreq } from './medTiming';
import { buildIndex, defaultsFor } from './rxShorthand';

// Data + storage helpers behind the prescribing speed tools (components live in RxQuick.jsx).
export const lc = (s) => String(s || '').toLowerCase().trim();
const fromSaved = (m) => ({ dose: m.dose, freq: freqText(m) + (m.note ? ` · ${m.note}` : ''), days: m.days, food: m.food });

/** The doctor's prescribing kit (one request): match index + smart-default context + diagnoses + templates. */
export function useRxKit() {
  const [raw, setRaw] = useState(null);
  useEffect(() => {
    let alive = true;
    api.get('/doctor/rx-kit').then((k) => alive && setRaw(k)).catch(() => alive && setRaw({ drugs: [], aliases: [], saved: [], lastUse: [], diagnoses: [], templates: [] }));
    return () => { alive = false; };
  }, []);
  return useMemo(() => {
    if (!raw) return null;
    const counts = new Map(raw.lastUse.map((l) => [lc(l.drug), l.count]));
    const saved = new Map(raw.saved.map((m) => [lc([m.name, m.strength].filter(Boolean).join(' ')), fromSaved(m)]));
    const seen = new Set();
    const entries = [];
    const add = (e) => { const k = lc(e.name) + (e.alias ? `|${lc(e.alias)}` : ''); if (seen.has(k)) return; seen.add(k); entries.push({ ...e, count: counts.get(lc(e.name)) || 0, saved: saved.has(lc(e.name)) }); };
    raw.saved.forEach((m) => add({ name: [m.name, m.strength].filter(Boolean).join(' ') }));
    raw.drugs.forEach((name) => add({ name }));
    raw.lastUse.forEach((l) => add({ name: l.drug })); // drugs the doctor wrote that aren't in the master list
    raw.aliases.forEach((a) => add(a));
    return { ...raw, index: buildIndex(entries), ctx: { lastUse: new Map(raw.lastUse.map((l) => [lc(l.drug), l])), saved } };
  }, [raw]);
}

/**
 * Starting dose/timing/duration for a drug picked any way: the doctor's last use → their saved medicine → catalog.
 * `savedMed` is the /api/drugs "My list" defaults, used only until the kit has loaded.
 */
export function startValues(kit, name, savedMed) {
  const v = !kit && savedMed ? { ...fromSaved(savedMed), source: 'saved' } : defaultsFor(name, kit?.ctx);
  return { dose: v.dose, freq: v.freq, days: v.days, food: v.food || 'after food', timing: parseFreq(v.freq) };
}

/** Nearby stock for a line added without the search box (shorthand / repeat): exact-name match only. */
export const stockFor = (name) => api.get(`/drugs?q=${encodeURIComponent(name)}`)
  .then((r) => { const d = r.find((x) => lc(x.name) === lc(name)); return d ? { stock: d.nearbyStock, tier: d.nearestTier } : null; })
  .catch(() => null);

/* ---------- drafts: never lose a half-written prescription ---------- */
// Only the prescription itself (medicines, diagnosis, advice, dos/don'ts, tests, follow-up) — keyed by consult or
// walk-in patient id, no names. Dropped after 24 h so a shared clinic computer doesn't keep them around.
const DRAFT = 'oc_rxdraft:';
const DAY = 86400000;
function sweepDrafts() {
  try {
    for (let k = localStorage.length - 1; k >= 0; k -= 1) {
      const key = localStorage.key(k);
      if (!key?.startsWith(DRAFT)) continue;
      let v = null; try { v = JSON.parse(localStorage.getItem(key)); } catch { /* corrupt → drop */ }
      if (!v?.at || Date.now() - v.at > DAY) localStorage.removeItem(key);
    }
  } catch { /* storage blocked */ }
}
export function readDraft(key) {
  sweepDrafts();
  try { const v = JSON.parse(localStorage.getItem(DRAFT + key)); return v?.data || null; } catch { return null; }
}
export const clearDraft = (key) => { try { localStorage.removeItem(DRAFT + key); } catch { /* storage blocked */ } };
const isEmpty = (d) => !d.rows.length && !d.diagnosis.trim() && !d.advice.trim() && !d.dos.length && !d.donts.length && !d.tests.length;
/** Saves `data` 500 ms after the last change while `enabled`; an empty prescription removes the draft. */
export function useDraftAutosave(key, data, enabled) {
  const json = JSON.stringify(data);
  useEffect(() => {
    if (!enabled) return undefined;
    const t = setTimeout(() => {
      try {
        const d = JSON.parse(json);
        if (isEmpty(d)) localStorage.removeItem(DRAFT + key); else localStorage.setItem(DRAFT + key, JSON.stringify({ at: Date.now(), data: d }));
      } catch { /* storage full/blocked */ }
    }, 500);
    return () => clearTimeout(t);
  }, [key, json, enabled]);
}

/* ---------- "Open next patient automatically" (per device) ---------- */
const AUTO_KEY = 'oc_rx_autonext';
export const readAutoNext = () => { try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; } };
export const writeAutoNext = (on) => { try { localStorage.setItem(AUTO_KEY, on ? '1' : '0'); } catch { /* storage blocked */ } };
