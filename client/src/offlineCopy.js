// "Offline copy" (opt-in, patient app): the emergency card, current medicines, latest prescriptions and upcoming
// visits saved on this phone, so they open with no internet. Off by default; the service worker still never
// caches /api health data — this is a small, explicit copy the person asked for, and every sign-out deletes it.
const KEY = 'oc_offline_copy';
const OPT = 'oc_offline_opt';
const MAX_PROFILES = 4;

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

export const offlineEnabled = () => read(OPT) === true;
export function setOfflineEnabled(on) {
  write(OPT, Boolean(on));
  if (!on) { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
}
export function clearOfflineCopy() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(OPT); } catch { /* ignore */ }
}

// Called with the patient home payload whenever it loads; keeps one entry per profile (self + family).
export function saveOfflineCopy(home) {
  if (!offlineEnabled() || !home?.patient?.id) return;
  const p = home.patient;
  const entry = {
    savedAt: new Date().toISOString(),
    patient: {
      id: p.id, name: p.name, age: p.age ?? null, gender: p.gender, bloodGroup: p.bloodGroup,
      allergies: p.allergies || [], conditions: p.conditions || [], currentMeds: p.currentMeds || [],
      emergencyContacts: (p.emergencyContacts || []).slice(0, 3).map((c) => ({ name: c.name, relation: c.relation, phone: c.phone })),
    },
    upcoming: (home.upcoming || []).slice(0, 5).map((c) => ({ id: c.id, doctorName: c.doctorName, scheduledAt: c.scheduledAt, status: c.status, visitType: c.visitType, bookingNo: c.bookingNo })),
    prescriptions: (home.prescriptions || []).slice(0, 5).map((r) => ({
      id: r.id, doctorName: r.doctorName || r.doctor?.name || '', createdAt: r.createdAt,
      items: (r.items || []).map((it) => ({ drug: it.drug, dose: it.dose, freq: it.freq, days: it.days, food: it.food })),
    })),
  };
  const all = read(KEY) || { profiles: {} };
  all.profiles[p.id] = entry;
  const ids = Object.keys(all.profiles).sort((a, b) => String(all.profiles[b].savedAt).localeCompare(all.profiles[a].savedAt));
  for (const id of ids.slice(MAX_PROFILES)) delete all.profiles[id];
  write(KEY, all);
}

export function readOfflineCopy() {
  const all = read(KEY);
  const list = all?.profiles ? Object.values(all.profiles) : [];
  return list.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}
