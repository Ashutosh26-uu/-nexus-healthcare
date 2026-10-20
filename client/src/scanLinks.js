// What the QR codes Sehatra prints and shows contain, and how any scanner in the app reads them back.
// Codes are web links where they can be: then any phone camera opens them, no app needed.
const origin = () => (typeof window !== 'undefined' ? window.location.origin : '');

// The `?k=<sig>` lets an E-Clinic kiosk open the record straight from a scan (the patient is holding the card);
// a phone camera just lands on /s/p/<id> and ignores it. A typed passport number has no signature, so it needs
// the emailed code instead. sig comes from the server (patient.cardSig).
export const passportUrl = (patientId, sig) => `${origin()}/s/p/${encodeURIComponent(patientId)}${sig ? `?k=${encodeURIComponent(sig)}` : ''}`;
export const verifyUrl = (kind, id, sig) => (sig ? `${origin()}/v/${kind}/${encodeURIComponent(id)}.${sig}` : null);
// A visit pass (NEXUS-VISIT:<consult>:<6-digit code>) as a link: reception's scanner reads it, and a phone camera
// opens a page that checks the patient in (signed-in staff) or explains what the pass is (anyone else).
export const visitUrl = (payload) => {
  const m = /^NEXUS-VISIT:([\w-]+):(\d{6})$/.exec(String(payload || ''));
  return m ? `${origin()}/s/v/${encodeURIComponent(m[1])}/${m[2]}` : payload;
};

const PATIENT_ID = /^OC-\d{4}-\d{4}$/i;

// Any scanned text → { type, … }. Accepts links from any Sehatra host (cards printed before a move still work)
// and the older bare formats.
export function parseScan(raw) {
  const text = String(raw || '').trim();
  if (/^NEXUS-VISIT:/i.test(text)) return { type: 'visit', payload: text };
  const cap = text.match(/^NEXUS-CAPSULE:([^:]+):([A-Z0-9]+)$/i);
  if (cap) return { type: 'capsule', id: cap[1], key: cap[2].toUpperCase() };
  if (PATIENT_ID.test(text)) return { type: 'patient', id: text.toUpperCase() };
  try {
    const u = new URL(text);
    const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 's' && parts[1] === 'p' && PATIENT_ID.test(parts[2] || '')) return { type: 'patient', id: parts[2].toUpperCase() };
    if (parts[0] === 's' && parts[1] === 'v' && /^[\w-]+$/.test(parts[2] || '') && /^\d{6}$/.test(parts[3] || '')) return { type: 'visit', payload: `NEXUS-VISIT:${parts[2]}:${parts[3]}` };
    if (parts[0] === 'v' && ['rx', 'lab'].includes(parts[1]) && parts[2]) return { type: 'verify', kind: parts[1], token: parts[2], path: `/v/${parts[1]}/${parts[2]}` };
  } catch { /* not a link */ }
  const old = text.match(/^nexus:(rx|lab):(.+)$/i);
  if (old) return { type: 'document', kind: old[1].toLowerCase(), id: old[2] };
  return { type: 'unknown', raw: text };
}
