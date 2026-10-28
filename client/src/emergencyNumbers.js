// Ambulance / emergency numbers by country, for SOS when the patient is travelling. Only well-established
// public numbers; anywhere else 112, which most mobile networks route to local emergency services.
// The patient picks the country they're in (Care abroad); it's remembered on this phone only.
const KEY = 'oc_abroad_country';

export const EMERGENCY = {
  IN: { name: 'India', number: '108', note: 'Ambulance (112 also works)' },
  US: { name: 'United States', number: '911' },
  CA: { name: 'Canada', number: '911' },
  GB: { name: 'United Kingdom', number: '999', note: '112 also works' },
  AE: { name: 'United Arab Emirates', number: '998', note: 'Ambulance (police 999)' },
  SA: { name: 'Saudi Arabia', number: '997', note: 'Ambulance' },
  QA: { name: 'Qatar', number: '999' },
  KW: { name: 'Kuwait', number: '112' },
  OM: { name: 'Oman', number: '9999' },
  BH: { name: 'Bahrain', number: '999' },
  SG: { name: 'Singapore', number: '995', note: 'Ambulance' },
  MY: { name: 'Malaysia', number: '999' },
  TH: { name: 'Thailand', number: '1669', note: 'Medical emergency' },
  AU: { name: 'Australia', number: '000' },
  NZ: { name: 'New Zealand', number: '111' },
  NP: { name: 'Nepal', number: '102', note: 'Ambulance' },
  LK: { name: 'Sri Lanka', number: '1990', note: 'Suwa Seriya ambulance' },
  BD: { name: 'Bangladesh', number: '999' },
  JP: { name: 'Japan', number: '119', note: 'Ambulance' },
  KR: { name: 'South Korea', number: '119', note: 'Ambulance' },
  CN: { name: 'China', number: '120', note: 'Ambulance' },
  DE: { name: 'Germany', number: '112' },
  FR: { name: 'France', number: '112', note: '15 for medical help' },
  IT: { name: 'Italy', number: '112' },
  ES: { name: 'Spain', number: '112' },
  NL: { name: 'Netherlands', number: '112' },
  IE: { name: 'Ireland', number: '112', note: '999 also works' },
  CH: { name: 'Switzerland', number: '144', note: 'Ambulance (112 also works)' },
  TR: { name: 'Türkiye', number: '112' },
  RU: { name: 'Russia', number: '112', note: '103 for ambulance' },
  OTHER: { name: 'Another country', number: '112', note: 'Works on most mobile networks — also ask locally' },
};

export function abroadCountry() {
  try { const c = localStorage.getItem(KEY); return c && EMERGENCY[c] ? c : null; } catch { return null; }
}
export function setAbroadCountry(code) {
  try { if (!code || code === 'IN') localStorage.removeItem(KEY); else localStorage.setItem(KEY, code); } catch { /* storage blocked */ }
}
// The number SOS dials: the country the patient said they're in, else India's ambulance.
export function emergencyNumber() {
  const c = abroadCountry();
  return c ? EMERGENCY[c] : { ...EMERGENCY.IN, code: 'IN' };
}
