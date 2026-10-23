import { useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { useDictation } from '../../components/speech';
import { cx } from '../../components/ui';
import { parseFreq } from './medTiming';

// Speak-to-prescribe: each spoken line becomes one medicine row, in English or Hinglish —
// "Paracetamol 500, one tablet, twice a day after food, 5 days" or
// "Azithromycin 500 ek goli roz khane se pehle teen din". The doctor checks every row before signing.

const NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6, saat: 7, aath: 8, nau: 9, das: 10, pandrah: 15, bees: 20, tees: 30,
  half: 0.5, aadha: 0.5, aadhi: 0.5,
};
const num = (w) => (w == null ? null : /^\d+(\.\d+)?$/.test(w) ? Number(w) : NUM[w.toLowerCase()] ?? null);
const NUMW = `(\\d+(?:\\.\\d+)?|${Object.keys(NUM).join('|')})`;

const FREQS = [
  { re: /\b(sos|if needed|when needed|as needed|zarurat|jarurat|zaroorat)\b/, freq: 'When needed (SOS)' },
  { re: /\b(four times|4 times|qid|char baar|chaar baar)\b/, pattern: '1-1-1-1' },
  { re: /\b(thrice|three times|3 times|tds|tid|teen baar|1 1 1|one one one)\b/, pattern: '1-1-1' },
  { re: /\b(twice|two times|2 times|bd|bid|do baar|subah shaam|morning and (?:evening|night)|1 0 1|one zero one)\b/, pattern: '1-0-1' },
  { re: /\b(at night|bedtime|bed time|hs|raat ko|raat mein|sone se pehle|0 0 1)\b/, pattern: '0-0-1', when: 'at bedtime' },
  { re: /\b(once|od|daily|ek baar|roz|rozana|every day|morning|subah|1 0 0)\b/, pattern: '1-0-0' },
];
const FOODS = [
  { re: /\b(after food|after meals?|khane ke baad|khana khane ke baad)\b/, food: 'after food' },
  { re: /\b(before food|before meals?|empty stomach|khali pet|khane se pehle)\b/, food: 'before food' },
  { re: /\b(with food|with meals?|khane ke saath)\b/, food: 'with food' },
];
const FORMS = { tablet: 'tablet', tablets: 'tablet', tab: 'tablet', tabs: 'tablet', goli: 'tablet', golia: 'tablet', capsule: 'capsule', capsules: 'capsule', cap: 'capsule',
  spoon: 'teaspoon', spoons: 'teaspoon', teaspoon: 'teaspoon', chammach: 'teaspoon', ml: 'ml', puff: 'puff', puffs: 'puff', drop: 'drop', drops: 'drop', boond: 'drop', sachet: 'sachet', sachets: 'sachet' };

export function parseSpokenMed(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const s = ` ${raw.toLowerCase().replace(/[,.;]/g, ' ').replace(/\s+/g, ' ')} `;

  // Days: "5 days", "paanch din", "a week", "do hafte", "one month".
  let days = null;
  const dm = s.match(new RegExp(`\\b${NUMW}\\s*(days?|din)\\b`));
  if (dm) days = num(dm[1]);
  else if (/\b(a|one|ek)\s*(week|hafta|hafte)\b/.test(s)) days = 7;
  else { const wm = s.match(new RegExp(`\\b${NUMW}\\s*(weeks?|hafte|hafta)\\b`)); if (wm) days = num(wm[1]) * 7; }
  if (!days && /\b(a|one|ek)\s*(month|mahina|mahine)\b/.test(s)) days = 30;

  // Dose: "1 tablet", "ek goli", "half tablet", "2 puffs", "5 ml".
  let dose = null;
  const dz = s.match(new RegExp(`\\b${NUMW}\\s*(${Object.keys(FORMS).join('|')})\\b`));
  if (dz) {
    const form = FORMS[dz[2]];
    // "500 capsule" is the strength, not 500 capsules — a count above 10 means one of that form.
    const n = form !== 'ml' && num(dz[1]) > 10 ? 1 : num(dz[1]);
    dose = form === 'ml' ? `${n} ml` : `${n === 0.5 ? 'half' : n} ${form}${n > 1 ? 's' : ''}`;
  } else {
    const form = Object.keys(FORMS).find((w) => new RegExp(`\\b${w}\\b`).test(s));
    if (form && FORMS[form] !== 'ml') dose = `1 ${FORMS[form]}`;
  }

  // When and how.
  const f = FREQS.find((x) => x.re.test(s));
  const food = FOODS.find((x) => x.re.test(s))?.food || (f?.pattern === '0-0-1' ? null : 'after food');
  const freq = f ? (f.freq || `${f.pattern} ${f.when || food || ''}`.trim()) : '';

  // Drug name: the words before the first number or instruction, plus its strength ("Paracetamol 500mg").
  const stop = new RegExp(`\\b(${NUMW.slice(1, -1)}|${Object.keys(FORMS).join('|')}|twice|thrice|once|daily|sos|bd|tds|od|din|days?|after|before|with|khane|subah|raat|roz|for|at)\\b`);
  const words = raw.replace(/[,.;]/g, ' ').split(/\s+/).filter(Boolean);
  const name = [];
  for (const w of words) { if (stop.test(` ${w.toLowerCase()} `) && name.length) break; if (stop.test(` ${w.toLowerCase()} `)) continue; name.push(w); }
  if (!name.length) return null;
  let drug = name.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const strength = s.match(/\b(\d+(?:\.\d+)?)\s*(mg|milligrams?|mcg|micrograms?|g|grams?|ml)\b/) || s.match(new RegExp(`^\\s*${name.join(' ').toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d{2,4})\\b`));
  if (strength) {
    const unit = (strength[2] || 'mg').replace(/^milligrams?$/, 'mg').replace(/^micrograms?$/, 'mcg').replace(/^grams?$/, 'g');
    drug = `${drug} ${strength[1]}${unit}`;
  }
  return { drug, dose: dose || '1 tablet', freq: freq || '1-0-1 after food', days: days || '', timing: parseFreq(freq || '1-0-1'), food: food || 'after food' };
}

export default function SpeakMeds({ onAdd }) {
  const [last, setLast] = useState('');
  const mic = useDictation({
    lang: 'en-IN',
    onPhrase: (t) => {
      const row = parseSpokenMed(t);
      if (row) { onAdd(row); setLast(`Added: ${row.drug} · ${row.dose} · ${row.freq}${row.days ? ` · ${row.days} days` : ''}`); } else setLast(`Couldn't find a medicine name in “${t}” — try again.`);
    },
  });
  if (!mic.supported) return null;
  return (
    <div className="dr-speakmeds">
      <button type="button" className={cx('voice-btn', mic.listening && 'on')} onClick={mic.toggle} aria-pressed={mic.listening}>
        {mic.listening ? <Square size={14} /> : <Mic size={15} />}
        <span>{mic.listening ? 'Listening — one medicine per sentence. Tap to stop' : 'Speak medicines'}</span>
      </button>
      {mic.listening && <span className="tiny voice-live">{mic.interim ? `“${mic.interim}”` : 'e.g. “Paracetamol 500, one tablet, twice a day after food, 5 days”'}</span>}
      {!mic.listening && last && <span className="tiny muted">{last}</span>}
      {mic.error && <span className="tiny voice-err">{mic.error}</span>}
    </div>
  );
}
