// Doctor availability.
//
// Two kinds of doctor, two rules:
//  • E-Clinic partners (engagement === 'eclinic_partner') control it themselves — they flip a
//    switch when they arrive at / leave an Sehatra E-Clinic (`online` + `presenceClinicId`).
//  • Hospital and partner-clinic doctors follow the weekly hours they set (`slots`), automatically.
//    They get no switch — once their hours end they show as unavailable.
//
// Times are evaluated in the network's local time zone (IST by default).

const TZ = process.env.APP_TZ || 'Asia/Kolkata';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function defaultSlots() {
  const s = {};
  DAYS.forEach((d, i) => { s[d] = i < 5 ? [9, 10, 11, 12, 17, 18, 19] : i === 5 ? [9, 10, 11] : []; });
  return s;
}

// Building an Intl formatter is expensive (~0.1 ms) and this runs for every doctor in every list — cache one per zone.
const formatters = new Map();
const fmtFor = (tz) => {
  if (!formatters.has(tz)) formatters.set(tz, new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }));
  return formatters.get(tz);
};
function localNow(now = new Date(), tz = TZ) {
  const parts = Object.fromEntries(fmtFor(tz).formatToParts(now).map((p) => [p.type, p.value]));
  return { day: parts.weekday, dayIdx: DAYS.indexOf(parts.weekday), hour: Number(parts.hour), minute: Number(parts.minute) };
}

const hourLabel = (h) => `${((h + 11) % 12) + 1}${h % 24 < 12 ? ' AM' : ' PM'}`; // 24 (end of an 11 PM block) is midnight, "12 AM"

const isEClinicDoctor = (doc) => doc?.engagement === 'eclinic_partner';
const slotsOf = (doc) => (doc.slots && typeof doc.slots === 'object' && !Array.isArray(doc.slots) ? doc.slots : defaultSlots());

// Next slot start after "now", searching the coming 7 days.
function nextSlot(slots, now) {
  for (let off = 0; off < 8; off += 1) {
    const idx = (now.dayIdx + off) % 7;
    const hours = [...(slots[DAYS[idx]] || [])].sort((a, b) => a - b);
    const h = hours.find((x) => off > 0 || x > now.hour);
    if (h !== undefined) return { day: DAYS[idx], hour: h, label: `${off === 0 ? 'Today' : off === 1 ? 'Tomorrow' : DAYS[idx]} ${hourLabel(h)}` };
  }
  return null;
}

// End of the contiguous block of hours that contains the current hour.
function blockEnd(hours, h) {
  let end = h;
  while (hours.includes(end + 1)) end += 1;
  return end + 1;
}

function availabilityOf(doc, { facilities = [], now: at } = {}) {
  // Doctors abroad keep their hours in their own time zone (doc.tz, e.g. 'Asia/Dubai').
  const tz = doc.tz || TZ;
  const now = localNow(at, tz);
  const slots = slotsOf(doc);
  const today = slots[now.day] || [];
  const inSlot = today.includes(now.hour);
  const next = nextSlot(slots, now);
  // Any doctor — E-Clinic partner, hospital or clinic, affiliated or not — can mark themselves
  // "free for video consults" for a while whenever they have spare time. It expires on its own.
  const virtualUntil = doc.virtualUntil && new Date(doc.virtualUntil) > (at || new Date()) ? new Date(doc.virtualUntil) : null;
  const presenceOn = isEClinicDoctor(doc) && doc.online;
  if (virtualUntil && !presenceOn && !(!isEClinicDoctor(doc) && inSlot)) {
    const t = virtualUntil.toLocaleTimeString('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    return { mode: 'virtual', available: true, virtualUntil: virtualUntil.toISOString(), label: `Free for video consults until ${t}`, next: null };
  }
  if (isEClinicDoctor(doc)) {
    const clinic = doc.online && facilities.find((f) => f.id === doc.presenceClinicId);
    return {
      mode: 'presence',
      available: !!doc.online,
      at: clinic ? clinic.name : doc.online ? 'Video consults' : null,
      clinicId: clinic ? clinic.id : null,
      since: doc.online ? doc.presenceSince || null : null,
      label: doc.online ? (clinic ? `Available at ${clinic.name.replace('E-Clinic · ', '')}` : 'Available for video consults') : 'Not available right now',
      next: doc.online ? null : (next?.label || null),
    };
  }
  return {
    mode: 'schedule',
    available: inSlot,
    until: inSlot ? hourLabel(blockEnd(today, now.hour)) : null,
    label: inSlot ? `Available until ${hourLabel(blockEnd(today, now.hour))}` : 'Hours over — not available',
    next: inSlot ? null : (next?.label || null),
  };
}

// "9 AM – 1 PM, 5 PM – 8 PM" per weekday, for showing a doctor's timings to patients.
function timingsOf(doc) {
  const slots = slotsOf(doc);
  const out = {};
  DAYS.forEach((d) => {
    const hrs = [...(slots[d] || [])].sort((a, b) => a - b);
    const ranges = [];
    hrs.forEach((h) => { const last = ranges[ranges.length - 1]; if (last && last[1] === h) last[1] = h + 1; else ranges.push([h, h + 1]); });
    out[d] = ranges.map(([a, b]) => `${hourLabel(a)} – ${hourLabel(b)}`);
  });
  return out;
}

module.exports = { availabilityOf, isEClinicDoctor, defaultSlots, timingsOf, DAYS };
