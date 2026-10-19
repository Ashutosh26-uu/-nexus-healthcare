// What the QR codes Nexus prints and shows contain, and how any scanner in the app reads them back.
// Codes are web links where they can be: then any phone camera opens them, no app needed.
const origin = () => (typeof window !== 'undefined' ? window.location.origin : '');

export const passportUrl = (patientId) => `${origin()}/s/p/${encodeURIComponent(patientId)}`;
export const verifyUrl = (kind, id, sig) => (sig ? `${origin()}/v/${kind}/${encodeURIComponent(id)}.${sig}` : null);

const PATIENT_ID = /^OC-\d{4}-\d{4}$/i;

// Any scanned text → { type, … }. Accepts links from any Nexus host (cards printed before a move still work)
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
    if (parts[0] === 'v' && ['rx', 'lab'].includes(parts[1]) && parts[2]) return { type: 'verify', kind: parts[1], token: parts[2], path: `/v/${parts[1]}/${parts[2]}` };
  } catch { /* not a link */ }
  const old = text.match(/^nexus:(rx|lab):(.+)$/i);
  if (old) return { type: 'document', kind: old[1].toLowerCase(), id: old[2] };
  return { type: 'unknown', raw: text };
}
