// "Saathi" — the patient help assistant behind the website chat bubble.
// Streams from Claude when ANTHROPIC_API_KEY is set (with no personal health data — see genericContext);
// otherwise falls back to a built-in rule-based assistant so the POC works fully offline.
const Anthropic = require('@anthropic-ai/sdk');
const i18n = require('./i18n');

const EMERGENCY_WORDS = ['सीने में दर्द', 'छाती में दर्द', 'सांस नहीं', 'साँस नहीं', 'बेहोश', 'दौरा', 'खून की उल्टी', 'आत्महत्या', 'सांप ने काटा', 'ज़हर', 'dolor de pecho', 'no puedo respirar', 'douleur thoracique', 'ألم في الصدر', 'سینے میں درد', 'chest pain', 'can\'t breathe', 'cannot breathe', 'breathless', 'unconscious', 'seizure', 'fits', 'stroke', 'heavy bleeding', 'vomiting blood', 'suicide', 'kill myself', 'snake bite', 'poison', 'face drooping', 'slurred'];

const EMERGENCY_REPLY =
  "This sounds like it could be an emergency. **Please call 108 (ambulance) right now**, or go to the nearest emergency department. If you're at a Nexus Healthcare E-Clinic, tell the operator immediately — they will help you call and show you the nearest hospital.\n\nIf you have thoughts of harming yourself, please call **Tele-MANAS at 14416** — it's free and open 24/7.";

const SYSTEM_PROMPT = `You are Saathi, the friendly help assistant on the Nexus Healthcare website — a health network that started in India and serves people worldwide that connects patients (including villages, via E-Clinic kiosks) with verified doctors, a Universal Health Passport, and medicines.

How to talk:
- Warm, plain, short. Most answers 2–5 sentences. Use simple words in whatever language the person uses — any language in the world, including Indian languages written in Latin script (Hinglish, Tanglish).
- You are not a doctor. Never state a diagnosis as certain. You can explain what symptoms commonly mean, give general self-care tips, and say when to see a doctor.
- Red flags (chest pain, breathlessness, stroke signs, heavy bleeding, unconsciousness, seizures, poisoning, suicidal thoughts): tell them to call 108 immediately (Tele-MANAS 14416 for mental-health crises). Don't continue chatting about it first.
- Never recommend prescription-only medicine doses. Over-the-counter basics (ORS, paracetamol at label dose) are fine with a "check with a doctor if it persists" note.
- Use markdown sparingly (bold for key actions, short lists).

What you know about the platform (use it to guide people):
- Sign up with mobile OTP, link ABHA/Aadhaar, create a Health Passport (ID like OC-XXXX-XXXX) with a QR emergency card.
- "Check symptoms" runs AI triage → one of 4 levels: Emergency, See a doctor now, Routine, Self-care. A doctor always reviews it.
- Consult: instant queue or scheduled slot; video, audio or chat. Typical fee ₹150–₹500; kiosk consults in pilot districts are free.
- E-prescriptions go to the phone and chosen pharmacy; order delivery or pick up; track live.
- Consent Manager: patients approve/deny who sees records and for how long; every access is in their audit log. Emergency "break-glass" access is time-limited and logged.
- Family profiles for children and elderly parents.
- E-Clinic kiosks at PHCs, railway stations and villages; a trained operator helps; works in 10+ Indian languages.
- Support line: 1800-200-4455 (toll-free, 8am–10pm). Data stays in India, DPDP Act compliant.`;

// Privacy: nothing from the person's record — no name, passport id, allergies, conditions, medicines,
// prescriptions or visits — is ever sent to the external model. It gets only generic app context plus what
// the person typed themselves. (The offline fallback below may still use the record: it never leaves the server.)
function genericContext(ctx) {
  const signedIn = ctx?.user ? `The person is signed in to the app (as a ${ctx.user.role === 'caregiver' ? 'caregiver' : 'patient or staff member'}).` : 'The person is not signed in.';
  return `\n\n${signedIn} You cannot see their health record, appointments or prescriptions. For anything about their own record (allergies, medicines, next visit), tell them where to find it in the app (Home, Medicines, Records) and to mention allergies to the doctor or pharmacist.`;
}

// ---------- Offline fallback ----------
const NO_MATCH = "I'm not completely sure about that one. I can help with booking doctors, your Health Passport, medicines, consent and privacy, kiosks, or general health questions. If it's about symptoms, try **Check symptoms** in your dashboard — or call our team at **1800-200-4455**.";
const ALLERGY_NOTE = '⚠️ Just a reminder: your Health Passport lists an allergy to {0}. Always mention it to the doctor or pharmacist.';
const FAQ = [
  { k: ['book', 'appointment', 'consult', 'see a doctor', 'doctor'], a: "You can talk to a doctor in two ways:\n\n- **Instant queue** — go to *Consult → Join now*. Most waits are under 10 minutes.\n- **Book a slot** — pick a doctor and a time that suits you.\n\nTip: run **Check symptoms** first — it helps us match you with the right doctor and shares notes so you don't repeat yourself." },
  { k: ['passport', 'health id', 'abha', 'aadhaar', 'register', 'sign up', 'signup', 'account'], a: "Your **Health Passport** is one secure ID for all your records. To create one: tap **Get started**, enter your mobile number, verify the OTP, and add basics like blood group and allergies. You can link your ABHA number too. You'll get a QR health card for emergencies." },
  { k: ['otp', 'login', 'log in', 'password', 'sign in'], a: "Patients can sign in with their **mobile number and a one-time code (OTP)** — no password to remember. Staff (doctors, pharmacies, hospitals) sign in with email and password. If the OTP doesn't arrive in a minute, tap *Resend*." },
  { k: ['consent', 'privacy', 'who can see', 'data', 'share my'], a: "You're in control. In **Consent Manager** you can see every request to view your records, approve or deny it, and choose how long access lasts. Every view is written to your **access log**. Officials only ever see anonymous totals, never your name." },
  { k: ['medicine', 'pharmacy', 'delivery', 'order', 'prescription'], a: "After a consult your e-prescription appears under **Medicines**. From there you can see which nearby pharmacies have it in stock, and choose **home delivery** or **pick up**. If no nearby store has it, our supply network finds it in another district and sends it over." },
  { k: ['kiosk', 'e-clinic', 'eclinic', 'village', 'no smartphone'], a: "E-Clinic kiosks are at PHCs, railway stations and villages. A trained health worker helps you check BP, sugar, oxygen and temperature, then connects you to a doctor on video. Your prescription is printed right there. No smartphone needed." },
  { k: ['fee', 'cost', 'price', 'charge', 'free', 'pay'], a: "Consults usually cost **₹150–₹500** depending on the doctor. Kiosk consults in our pilot districts are **free**. You can pay by UPI, card, or cash at a kiosk." },
  { k: ['language', 'hindi', 'tamil', 'bengali', 'bhasha'], a: "Nexus Healthcare works in 10+ Indian languages including Hindi, Bengali, Tamil, Telugu, Marathi and Awadhi. Doctors see your notes auto-translated into their language, so you can speak comfortably. Change it anytime in **Settings**." },
  { k: ['family', 'child', 'mother', 'father', 'parent', 'elderly'], a: "Add family members under **Family** — children, parents, grandparents. Switch profiles with one tap to book consults or see their records. Each person still has their own Health Passport." },
  { k: ['emergency card', 'qr', 'blood group'], a: "Your **Emergency card** shows blood group, allergies and emergency contacts with a QR code. Any verified doctor can scan it in an emergency, even offline — and you'll be notified every time it's opened." },
  { k: ['fever', 'temperature', 'bukhar'], a: "For a fever: rest, drink plenty of fluids (ORS is good), and you can take **paracetamol** as per the label. See a doctor if it's above **102°F**, lasts more than **2 days**, or comes with rash, bleeding gums, severe headache or confusion — especially now, as dengue is rising in some districts." },
  { k: ['cough', 'cold', 'throat', 'khansi', 'zukam'], a: "Most coughs and colds settle in a week. Warm fluids, steam, honey with warm water (not for babies under 1), and rest help. See a doctor if you're breathless, the cough has lasted over **2 weeks**, you're coughing blood, or there's a high fever." },
  { k: ['diabetes', 'sugar', 'bp', 'blood pressure', 'hypertension'], a: "For diabetes and BP, consistency matters most: take medicines at the same time daily, walk 30 minutes, cut sugar and salt, and check readings regularly. You can log readings at any E-Clinic. If sugar is above **300** or BP above **180/120**, see a doctor today." },
  { k: ['headache', 'sir dard'], a: "Common headaches often ease with rest, water, and paracetamol at label dose. Please seek help urgently if it's the **worst headache of your life**, comes with a stiff neck, fever, weakness on one side, or confusion." },
  { k: ['diarrhoea', 'diarrhea', 'loose motion', 'vomit', 'dast'], a: "Keep drinking — **ORS after every loose stool** is the most important thing. Eat light food like khichdi or banana. See a doctor if there's blood, high fever, signs of dehydration (very little urine, dizziness), or if it's a small child or elderly person." },
  { k: ['dengue', 'malaria', 'mosquito'], a: "To protect against dengue and malaria: empty standing water weekly, use nets and repellents, and wear full sleeves. Get tested if you have high fever with body ache, pain behind the eyes, or rash. **Avoid ibuprofen/aspirin** for suspected dengue — paracetamol is safer." },
  { k: ['hello', 'hi', 'namaste', 'hey'], a: "Namaste! 🙏 I'm **Saathi**, Nexus Healthcare's help assistant. I can help you book a doctor, understand your Health Passport, find medicines, or answer general health questions. What can I do for you?" },
  { k: ['thank', 'dhanyavad', 'shukriya'], a: "You're welcome! Take care, and I'm here whenever you need me. 💚" },
  { k: ['contact', 'support', 'help line', 'helpline', 'phone number', 'call'], a: "You can reach our support team at **1800-200-4455** (toll-free, 8am–10pm), or email care@nexushealthcare.in. For emergencies always call **108**." },
];

function fallbackAnswer(message, ctx) {
  const text = message.toLowerCase();
  let best = null;
  let bestHits = 0;
  for (const item of FAQ) {
    const hits = item.k.filter((k) => text.includes(k)).length;
    if (hits > bestHits) { best = item; bestHits = hits; }
  }
  const answer = best ? best.a : NO_MATCH;

  const p = ctx?.patient;
  if (p && /next|upcoming|appointment|when/.test(text) && ctx.upcoming?.length) {
    const c = ctx.upcoming[0];
    return `Your next consult is with **${c.doctorName}** on **${new Date(c.scheduledAt).toLocaleString('en-IN', { weekday: 'long', hour: 'numeric', minute: '2-digit' })}**. You'll get a reminder 15 minutes before. You can join from *Home → Upcoming*.`;
  }
  // The allergy reminder is returned separately so the fixed FAQ text can still be served translated and
  // only the catalog string (never the allergy itself) goes to a translation provider.
  const allergies = (p?.allergies || []).filter(Boolean);
  if (p && allergies.length && /medicine|tablet|take|ibuprofen|amoxicillin|penicillin|painkiller/.test(text)) return { text: answer, allergy: allergies.join(', ') };
  return answer;
}

// Fixed help texts may be translated by the i18n engine (they contain no personal data).
i18n.registerServerStrings([EMERGENCY_REPLY, ...FAQ.map((f) => f.a), NO_MATCH, ALLERGY_NOTE]);

async function localise(text, lang) {
  try { return await i18n.translateServerText(lang, text); } catch { return text; }
}

async function streamFallback(res, text) {
  const tokens = text.match(/\S+\s*/g) || [text];
  for (const t of tokens) {
    res.write(`data: ${JSON.stringify({ delta: t })}\n\n`);
    await new Promise((r) => setTimeout(r, 18 + Math.random() * 30));
  }
}

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

async function fallbackText(message, ctx, lang) {
  const a = fallbackAnswer(message, ctx);
  if (typeof a === 'string') return localise(a, lang);
  const note = (await localise(ALLERGY_NOTE, lang)).replace('{0}', `**${a.allergy}**`);
  return `${await localise(a.text, lang)}

${note}`;
}

async function handleChat(req, res, ctx) {
  const { messages = [] } = req.body || {};
  const lang = i18n.langInfo(req.body?.lang) ? req.body.lang : 'en';
  const langName = i18n.langInfo(lang)?.name || 'English';
  const history = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12);
  const last = history[history.length - 1];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  if (!last || last.role !== 'user') {
    res.write(`data: ${JSON.stringify({ error: 'No message' })}\n\n`);
    return res.end();
  }

  const lower = last.content.toLowerCase();
  if (EMERGENCY_WORDS.some((w) => lower.includes(w))) {
    res.write(`data: ${JSON.stringify({ emergency: true })}\n\n`);
    await streamFallback(res, await localise(EMERGENCY_REPLY, lang));
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const anthropic = getClient();
  if (!anthropic) {
    await streamFallback(res, await fallbackText(last.content, ctx, lang));
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  // Anthropic requires the first message to be from the user.
  while (history.length && history[0].role !== 'user') history.shift();

  try {
    const stream = anthropic.beta.messages.stream({
      model: process.env.CHAT_MODEL || 'claude-opus-5-5',
      max_tokens: 2048,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: `${SYSTEM_PROMPT}${genericContext(ctx)}

The person has chosen ${langName} for the app. Reply in ${langName} unless they clearly write in another language — then reply in the language they wrote in. Keep medical terms understandable for that language's speakers.`,
      messages: history,
    });
    // res, not req: since Node 16 req emits 'close' once its body has been read (express.json already did),
    // so the request's 'close' either aborted every answer at once or never fired on a real disconnect.
    res.on('close', () => { if (!res.writableEnded) stream.abort(); });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`);
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      res.write(`data: ${JSON.stringify({ delta: "\n\nI can't help with that one, but our support team can: **1800-200-4455**." })}\n\n`);
    }
  } catch (err) {
    console.error('[chat] Claude error, using fallback:', err.message);
    await streamFallback(res, await fallbackText(last.content, ctx, lang));
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

module.exports = { handleChat, aiEnabled: () => Boolean(process.env.ANTHROPIC_API_KEY) };
