// Telemedicine Practice Guidelines (Board of Governors / NMC, 2020) — the parts the software can enforce.
// - Prohibited list: in a teleconsultation an RMP may not prescribe medicines in Schedule X of the Drugs and
//   Cosmetics Rules, or any narcotic / psychotropic substance under the NDPS Act, 1985. Matched on the generic
//   names below (brand names are mapped to generics in the composer); the prescription has to wait for an
//   in-person visit.
// - Consent: a teleconsultation the patient starts (booking, kiosk visit they asked for) is implied consent;
//   it is recorded on the consult with who, how and when.
// - Mode: video / audio / chat is printed on the prescription, so the chemist and the patient can see it.
const PROHIBITED = [
  // opioids / narcotic analgesics
  'morphine', 'codeine', 'fentanyl', 'tramadol', 'tapentadol', 'pethidine', 'meperidine', 'methadone', 'buprenorphine', 'pentazocine', 'oxycodone', 'hydrocodone', 'hydromorphone', 'dextropropoxyphene', 'nalbuphine',
  // benzodiazepines and other psychotropics
  'alprazolam', 'diazepam', 'lorazepam', 'clonazepam', 'nitrazepam', 'chlordiazepoxide', 'clobazam', 'midazolam', 'temazepam', 'flurazepam', 'zolpidem', 'zopiclone',
  // barbiturates, stimulants, anaesthetics of abuse
  'phenobarbital', 'phenobarbitone', 'butalbital', 'amobarbital', 'secobarbital', 'amphetamine', 'methamphetamine', 'methylphenidate', 'modafinil', 'ketamine', 'cocaine', 'cannabis', 'dronabinol', 'meprobamate',
];

const isRemote = (c) => Boolean(c) && c.visitType !== 'clinic' && c.mode !== 'in_person';

function prohibitedIn(items) {
  const hits = [];
  for (const it of items || []) {
    const name = String(it?.drug || '').toLowerCase();
    const word = PROHIBITED.find((p) => new RegExp(`\\b${p}\\b`).test(name));
    if (word) hits.push({ drug: it.drug, substance: word });
  }
  return hits;
}

// Warnings in the same shape as engines.checkPrescription, for the composer to show while typing.
function warnings(consult, items) {
  if (!isRemote(consult)) return [];
  return prohibitedIn(items).map((h) => ({
    type: 'telemedicine', severity: 'high',
    msg: `"${h.drug}" contains ${h.substance}, a narcotic / psychotropic (NDPS / Schedule X) medicine. The Telemedicine Practice Guidelines don't allow it in a teleconsultation — ask the patient to see a doctor in person for it.`,
  }));
}

// For POST /consults/:id/complete: an error message when a prohibited medicine is on a remote consult.
function blockReason(consult, items) {
  if (!isRemote(consult)) return null;
  const hits = prohibitedIn(items);
  if (!hits.length) return null;
  return `${hits.map((h) => h.drug).join(', ')} can't be prescribed in a teleconsultation (narcotic / psychotropic — Telemedicine Practice Guidelines). Remove ${hits.length > 1 ? 'them' : 'it'} and ask the patient to see a doctor in person.`;
}

const MODE_LABEL = { video: 'Teleconsultation · video', audio: 'Teleconsultation · audio call', chat: 'Teleconsultation · text chat', in_person: 'In-person visit' };
const modeOf = (c) => (!c ? 'In-person visit' : c.kioskId ? 'Teleconsultation · video, at a Sehatra E-Clinic with an operator' : MODE_LABEL[c.mode] || (isRemote(c) ? 'Teleconsultation' : 'In-person visit'));

// Consent on a consult the patient (or their caregiver / the kiosk on their behalf) asked for.
const impliedConsent = (by, via) => ({ type: 'implied', note: 'Patient-initiated teleconsultation', by, via, at: new Date().toISOString() });

module.exports = { PROHIBITED, isRemote, prohibitedIn, warnings, blockReason, modeOf, impliedConsent };
