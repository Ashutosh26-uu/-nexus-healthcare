import { parseFreq } from './medTiming';

// Merge helpers — a template ADDS to what's on the prescription, it never wipes what the doctor already wrote.
export const mergeList = (a = [], b = []) => [...a, ...b.filter((x) => !a.some((y) => y.toLowerCase() === x.toLowerCase()))];
export const mergeText = (a = '', b = '') => (!b || a.toLowerCase().includes(b.toLowerCase()) ? a : a.trim() ? `${a.trim()} ${b}` : b);
const FOODS = ['before food', 'after food', 'with food', 'empty stomach'];
// Template / favourite line → the fields a prescription row needs (each form adds its own key/stock fields).
// Medicines already on the prescription are skipped, so applying twice never doubles a drug.
export function rowsFrom(items = [], existing = []) {
  const have = new Set(existing.map((d) => String(d).toLowerCase()));
  return items.filter((i) => i.drug && !have.has(i.drug.toLowerCase())).map((i) => {
    const freq = i.note ? `${i.freq} · ${i.note}` : i.freq || '';
    return { drug: i.drug, dose: i.dose || '1 tablet', freq, days: i.days || '', timing: parseFreq(freq), food: i.food || FOODS.find((f) => freq.toLowerCase().includes(f)) || 'after food' };
  });
}
