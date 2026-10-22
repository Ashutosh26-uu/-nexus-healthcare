// "Saathi" — the patient help assistant behind the website chat bubble.
// Health questions go to DxGPT when DXGPT_API_KEY is set (see dxgpt.js); questions about using the app get the
// built-in answers below. Claude is used instead when ANTHROPIC_API_KEY is set. Neither ever receives the
// person's record — only what they typed. Anything failing falls back to the built-in assistant.
const Anthropic = require('@anthropic-ai/sdk');
const dxgpt = require('./dxgpt');
const corti = require('./corti');
const i18n = require('./i18n');
const LINES = require('./saathi-lines');
const { isHinglish, romanize } = require('./hinglish');

// The real support contact, only if the operator configured one (SUPPORT_PHONE / SUPPORT_EMAIL) — never a
// made-up helpline. Read once at start-up: the help texts below are fixed strings (they get translated).
const SUPPORT_PHONE = String(process.env.SUPPORT_PHONE || '').trim().slice(0, 30);
const SUPPORT_EMAIL = String(process.env.SUPPORT_EMAIL || '').trim().slice(0, 120);
const SUPPORT_HOURS = String(process.env.SUPPORT_HOURS || '').trim().slice(0, 60);
const SUPPORT = SUPPORT_PHONE
  ? `call our team at **${SUPPORT_PHONE}**${SUPPORT_HOURS ? ` (${SUPPORT_HOURS})` : ''}${SUPPORT_EMAIL ? ` or email ${SUPPORT_EMAIL}` : ''}`
  : SUPPORT_EMAIL ? `email our team at **${SUPPORT_EMAIL}**` : 'contact the Sehatra team';

const EMERGENCY_WORDS = ['सीने में दर्द', 'छाती में दर्द', 'सांस नहीं', 'साँस नहीं', 'बेहोश', 'दौरा', 'खून की उल्टी', 'आत्महत्या', 'सांप ने काटा', 'ज़हर', 'seene me dard', 'seene mein dard', 'sine me dard', 'chhati me dard', 'chati me dard', 'saans nahi', 'sans nahi', 'saans nahin', 'behosh', 'khoon ki ulti', 'khun ki ulti', 'atmahatya', 'khudkushi', 'saanp ne kata', 'sanp ne kata', 'zeher kha', 'jahar kha', 'dolor de pecho', 'no puedo respirar', 'douleur thoracique', 'ألم في الصدر', 'سینے میں درد', 'chest pain', 'can\'t breathe', 'cannot breathe', 'breathless', 'unconscious', 'seizure', 'fits', 'stroke', 'heavy bleeding', 'vomiting blood', 'suicide', 'kill myself', 'snake bite', 'poison', 'face drooping', 'slurred'];

const EMERGENCY_REPLY =
  "This sounds like it could be an emergency. **Please call 108 (ambulance) right now**, or go to the nearest emergency department. If you're at a Sehatra E-Clinic, tell the operator immediately — they will help you call and show you the nearest hospital.\n\nIf you have thoughts of harming yourself, please call **Tele-MANAS at 14416** — it's free and open 24/7.";

const SYSTEM_PROMPT = `You are Saathi, the friendly help assistant on the Sehatra website — a health network that started in India and serves people worldwide that connects patients (including villages, via E-Clinic kiosks) with verified doctors, a Universal Health Passport, and medicines.

How to talk:
- Warm, plain, short. Most answers 2–5 sentences. Use simple words in whatever language the person uses — any language in the world, including Indian languages written in Latin script (Hinglish, Tanglish).
- You are not a doctor. Never state a diagnosis as certain. You can explain what symptoms commonly mean, give general self-care tips, and say when to see a doctor.
- Red flags (chest pain, breathlessness, stroke signs, heavy bleeding, unconsciousness, seizures, poisoning, suicidal thoughts): tell them to call 108 immediately (Tele-MANAS 14416 for mental-health crises). Don't continue chatting about it first.
- Never recommend prescription-only medicine doses. Over-the-counter basics (ORS, paracetamol at label dose) are fine with a "check with a doctor if it persists" note.
- Use markdown sparingly (bold for key actions, short lists).

What you know about the platform (use it to guide people):
- Sign up with an email one-time code, optionally verify Aadhaar, create a Health Passport (ID like OC-XXXX-XXXX) with a QR emergency card.
- "Check symptoms" runs a rule-based triage → one of 4 levels: Emergency, See a doctor now, Routine, Self-care. It is guidance, not a diagnosis.
- Consult: book a verified doctor for a video consult or a clinic visit. Each doctor sets their own fee, shown before booking. Never quote typical fees, wait times or numbers of doctors.
- E-prescriptions appear in the app and can be sent to a chosen chemist; pick up or order delivery where the chemist offers it.
- Consent Manager: patients approve/deny who sees records and for how long; every access is in their access log. Emergency "break-glass" access is time-limited and logged.
- Family profiles for children and elderly parents; a Health tracker for home BP, sugar, weight, oxygen and temperature readings; a child vaccination schedule.
- Sehatra E-Clinics are assisted kiosks with a trained operator; don't claim where they are or how many there are.
- Support: ${SUPPORT}. Never invent a phone number, email, address, price, statistic or certification.
- If asked what AI, model, company or technology powers you, or who made you: you are Saathi, made by the Sehatra team, and you can't share how you are built. Never name any AI company, product, model, server, database or programming language.
- Only health and using Sehatra. If the message is about anything else (studies, coding, maths, sport, films, news, politics, money, jokes, stories, general knowledge…), reply with exactly [[OFF_TOPIC]] and nothing else.`;

// Privacy: nothing from the person's record — no name, passport id, allergies, conditions, medicines,
// prescriptions or visits — is ever sent to the external model. It gets only generic app context plus what
// the person typed themselves. (The offline fallback below may still use the record: it never leaves the server.)
function genericContext(ctx) {
  const signedIn = ctx?.user ? `The person is signed in to the app (as a ${ctx.user.role === 'caregiver' ? 'caregiver' : 'patient or staff member'}).` : 'The person is not signed in.';
  return `\n\n${signedIn} You cannot see their health record, appointments or prescriptions. For anything about their own record (allergies, medicines, next visit), tell them where to find it in the app (Home, Medicines, Records) and to mention allergies to the doctor or pharmacist.`;
}

// ---------- Offline fallback ----------
const NO_MATCH = `I'm not completely sure about that one. I can help with booking doctors, your Health Passport, medicines, consent and privacy, kiosks, or general health questions. If it's about symptoms, try **Check symptoms** in your dashboard — or ${SUPPORT}.`;
const ALLERGY_NOTE = '⚠️ Just a reminder: your Health Passport lists an allergy to {0}. Always mention it to the doctor or pharmacist.';
const FAQ = [
  { k: ['cancel', 'reschedule', 'postpone', 'change my appointment', 'change the time', 'refund'], a: "To cancel or move a visit, open **Follow-ups** (or the visit from **Home**) and tap **Reschedule** or **Cancel**. If you paid online and cancel in time, the refund goes back to the same payment method. If the doctor is running late, you'll see it on the visit card." },
  { k: ['lab test', 'blood test', 'cbc', 'test price', 'pathology', 'x-ray', 'ultrasound'], a: "Open **Lab tests** to compare prices, report times and home sample collection at verified labs near you — prices are shown before you book. You pay a small advance online and the rest at the lab, and the report appears in the app as soon as the lab uploads it." },
  { k: ['book', 'appointment', 'consult', 'see a doctor', 'find a doctor'], a: "To talk to a doctor, open **Find a doctor**, pick a verified doctor and choose a **video consult** or a **clinic visit** at a time that suits you. Doctors who are available right now are shown first.\n\nTip: run **Check symptoms** first — it helps match you with the right kind of doctor and shares your notes so you don't repeat yourself." },
  { k: ['passport', 'health id', 'abha', 'aadhaar', 'register', 'sign up', 'signup', 'account'], a: "Your **Health Passport** is one secure ID for all your records. To create one: tap **Get started**, enter your email, type the one-time code we send there, and add basics like blood group and allergies. You can add your ABHA number too, and verify your Aadhaar if you want to. You'll get a QR health card for emergencies." },
  { k: ['otp', 'login', 'log in', 'password', 'sign in'], a: "Sign in with your **email and a one-time code** sent to your inbox, or with your password if you set one. If the code doesn't arrive in a minute, check your spam folder and tap *Resend*. Forgot your password? Use *Forgot password* to get a reset code by email." },
  { k: ['consent', 'privacy', 'who can see', 'data', 'share my'], a: "You're in control. In **Consent Manager** you can see every request to view your records, approve or deny it, and choose how long access lasts. Every view is written to your **access log**. Officials only ever see anonymous totals, never your name." },
  { k: ['medicine', 'pharmacy', 'delivery', 'order', 'prescription'], a: "After a consult your e-prescription appears under **Medicines**. From there you can see which nearby chemists on Sehatra have it in stock, and choose **pick up** or **home delivery** where the chemist offers it. If no single chemist nearby has everything, you can send an open request to chemists near you — the first to accept takes the order." },
  { k: ['kiosk', 'e-clinic', 'eclinic', 'village', 'no smartphone'], a: "Sehatra E-Clinics are assisted kiosks: a trained operator helps you register, records your BP, sugar, oxygen and temperature, and connects you to a doctor on video — no smartphone needed. If there's one near you, it shows up when you book." },
  { k: ['fee', 'cost', 'price', 'charge', 'free', 'pay'], a: "Each doctor sets their own fee, and you see it before you book. Video consults are paid online; for a clinic visit you pay a small booking amount online and the doctor's fee at the clinic. Medicine and lab test prices are shown before you order." },
  { k: ['language', 'hindi', 'tamil', 'bengali', 'bhasha'], a: "You can use Sehatra in many languages, including Hindi, Bengali, Tamil, Telugu and Marathi — change it anytime in **Settings**. Each doctor lists the languages they speak, so you can pick one who speaks yours." },
  { k: ['family', 'add a member', 'add my', 'switch profile', 'family profile'], a: "Add family members under **Family** — children, parents, grandparents. Switch profiles with one tap to book consults or see their records. Each person still has their own Health Passport." },
  { k: ['emergency card', 'qr', 'blood group'], a: "Your **Emergency card** shows blood group, allergies and emergency contacts with a QR code. Any verified doctor can scan it in an emergency, even offline — and you'll be notified every time it's opened." },
  { tip: true, k: ['fever', 'temperature', 'bukhar', 'बुखार'], a: "For a fever: rest, drink plenty of fluids (ORS is good), and you can take **paracetamol** as per the label. See a doctor if it's above **102°F**, lasts more than **2 days**, or comes with rash, bleeding gums, severe headache or confusion (these can be signs of dengue)." },
  { tip: true, k: ['cough', 'cold', 'throat', 'khansi', 'zukam', 'खांसी', 'जुकाम'], a: "Most coughs and colds settle in a week. Warm fluids, steam, honey with warm water (not for babies under 1), and rest help. See a doctor if you're breathless, the cough has lasted over **2 weeks**, you're coughing blood, or there's a high fever." },
  { tip: true, k: ['diabetes', 'sugar', 'bp', 'blood pressure', 'hypertension'], a: "For diabetes and BP, consistency matters most: take medicines at the same time daily, walk 30 minutes, cut sugar and salt, and check readings regularly. You can log home readings in the **Health tracker**. If sugar is above **300** or BP above **180/120**, see a doctor today." },
  { tip: true, k: ['headache', 'sir dard', 'sar dard', 'sardard', 'सिर दर्द', 'सर दर्द'], a: "Common headaches often ease with rest, water, and paracetamol at label dose. Please seek help urgently if it's the **worst headache of your life**, comes with a stiff neck, fever, weakness on one side, or confusion." },
  { tip: true, k: ['diarrhoea', 'diarrhea', 'loose motion', 'vomit', 'dast', 'दस्त', 'उल्टी'], a: "Keep drinking — **ORS after every loose stool** is the most important thing. Eat light food like khichdi or banana. See a doctor if there's blood, high fever, signs of dehydration (very little urine, dizziness), or if it's a small child or elderly person." },
  { tip: true, k: ['dengue', 'malaria', 'mosquito'], a: "To protect against dengue and malaria: empty standing water weekly, use nets and repellents, and wear full sleeves. Get tested if you have high fever with body ache, pain behind the eyes, or rash. **Avoid ibuprofen/aspirin** for suspected dengue — paracetamol is safer." },
  { k: ['hello', 'namaste', 'hey', 'good morning'], a: "Namaste! 🙏 I'm **Saathi**, Sehatra's help assistant. I can help you book a doctor, understand your Health Passport, find medicines, or answer general health questions. What can I do for you?" },
  { k: ['thank', 'dhanyavad', 'shukriya'], a: "You're welcome! Take care, and I'm here whenever you need me. 💚" },
  { k: ['contact', 'support', 'help line', 'helpline', 'phone number', 'call'], a: `For help with your account or a booking, ${SUPPORT}. For emergencies always call **108**.` },
];

function fallbackAnswer(message, ctx) {
  const text = message.toLowerCase();
  let best = null;
  let bestHits = 0;
  for (const item of FAQ) {
    const hits = item.k.filter((k) => (k.length <= 3 ? new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(text) : text.includes(k))).length;
    if (hits > bestHits) { best = item; bestHits = hits; }
  }
  const answer = best ? best.a : NO_MATCH;

  const p = ctx?.patient;
  if (p && /next|upcoming|appointment|when/.test(text) && ctx.upcoming?.length) {
    const c = ctx.upcoming[0];
    return `Your next consult is with **${c.doctorName}** on **${new Date(c.scheduledAt).toLocaleString('en-IN', { timeZone: process.env.APP_TZ || 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}**. You'll get a reminder about an hour before. You can find it on *Home → Upcoming*.`;
  }
  // The allergy reminder is returned separately so the fixed FAQ text can still be served translated and
  // only the catalog string (never the allergy itself) goes to a translation provider.
  const allergies = (p?.allergies || []).filter(Boolean);
  if (p && allergies.length && /medicine|tablet|take|ibuprofen|amoxicillin|penicillin|painkiller/.test(text)) return { text: answer, allergy: allergies.join(', ') };
  return answer;
}

// ---------- Routing: app help (built-in answers) vs health questions (DxGPT) ----------
const APP_WORDS = /(book|booking|appointment|cancel|reschedul|postpone|refund|passport|abha|aadhaar|sign ?up|register|account|log ?in|otp|password|consent|privacy|who can see|prescription|order|deliver|pharmacy|chemist|kiosk|e-?clinic|fee|price|cost|charge|pay|language|family|profile|emergency card|qr code|contact|support|helpline|lab test|\bapp\b|website)/i;
const GREETING = /^\s*(hi+|hello|hey|namaste|namaskar|thanks?|thank you|dhanyavad|shukriya|ok|okay|good (morning|evening|night))[\s!.]*$/i;
const isAppQuestion = (t) => GREETING.test(t) || APP_WORDS.test(t) || t.trim().length < 10;

const DIFF_INTRO = 'From what you have described, these are some things a doctor would usually consider:';
const DIFF_OUTRO = 'This is **not a diagnosis** — only a doctor who examines you can tell. **See a doctor today** if you feel very unwell, it gets worse or lasts more than 2–3 days, or you notice confusion, trouble breathing, a stiff neck, bleeding or a rash. Tap **Find a doctor** to book — in an emergency call **108**.';
// Plain text only: the chat bubble renders **bold** but not _italics_ (underscores would show as-is).
const ANSWER_FOOTER = "If you're worried or it isn't getting better, **book a doctor** — in an emergency call **108**.";
// Ends every AI-written reply, like other AI assistants do.
const AI_NOTE = '⚠️ **Saathi is an AI and can make mistakes.** Please consult a doctor before following this advice.';
// The language to write our own lines in: the language the answer came back in (DxGPT detects it), or
// Hindi when the person typed in Devanagari, else the app language. Romanised Hindi ("hi-Latn") keeps the
// app language, since our translations are in the native script.
// Saathi answers in the language the question was written in — not the app's language. The script decides
// first (Tamil letters → Tamil), then Hindi typed in English letters → Hinglish ('hi-Latn'), then what the
// medical engine detected (e.g. Spanish). Plain English stays English; text with no letters uses the app language.
const SCRIPTS = [
  [/[\u0980-\u09FF]/, 'bn'], [/[\u0A00-\u0A7F]/, 'pa'], [/[\u0A80-\u0AFF]/, 'gu'], [/[\u0B00-\u0B7F]/, 'or'],
  [/[\u0B80-\u0BFF]/, 'ta'], [/[\u0C00-\u0C7F]/, 'te'], [/[\u0C80-\u0CFF]/, 'kn'], [/[\u0D00-\u0D7F]/, 'ml'],
  [/[\u0600-\u06FF]/, 'ur'],
];
function replyLang(detected, message, appLang) {
  const det = String(detected || '').split('-')[0].toLowerCase();
  const latn = /latn/i.test(String(detected));
  if (/[\u0900-\u097F]/.test(message)) {
    // Devanagari: Hindi, unless Marathi/Nepali was detected or is the app language.
    if (['mr', 'ne'].includes(det)) return det;
    return ['mr', 'ne'].includes(appLang) ? appLang : 'hi';
  }
  for (const [re, code] of SCRIPTS) {
    if (!re.test(message)) continue;
    if (code === 'bn' && (det === 'as' || appLang === 'as')) return 'as';
    if (code === 'ur' && ['ar', 'fa'].includes(det || appLang)) return det || appLang;
    return i18n.langInfo(code) ? code : appLang;
  }
  if ((latn && det === 'hi') || isHinglish(message)) return 'hi-Latn';
  if (det && det !== 'en' && !latn && i18n.langInfo(det)) return det;
  if (/[a-z]/i.test(message)) return 'en';
  return appLang;
}


// The built-in self-care advice for this symptom, if there is one (ORS for loose motions, fluids for fever…).
function selfCareTip(message) {
  // "no fever", "without vomiting", "bukhar nahi" are not symptoms — drop them before matching.
  const text = message.toLowerCase()
    .replace(/\b(no|not|without|never|denies)\s+(any\s+)?[a-z]+(\s+[a-z]+)?/g, ' ')
    .replace(/[a-zऀ-ॿ]+\s+(nahi|nahin|nahi hai|नहीं)/g, ' ');
  let best = null; let bestHits = 0;
  for (const f of FAQ) {
    if (!f.tip) continue;
    const hits = f.k.filter((k) => text.includes(k)).length;
    if (hits > bestHits) { best = f; bestHits = hits; }
  }
  return best ? best.a : null;
}
const TIP_TITLE = '**What you can do now:**';
const NEED_MORE = 'Could you tell me a little more — the age of the person, how long it has been going on, and any other symptoms (fever, vomiting, rash, pain, weakness)? That helps me give a better answer.';

// "Which AI are you?" — Saathi answers that itself (no provider is asked) and never names a vendor.
const IDENTITY_Q = /(which|what|kaun\s*s[aei]|kon\s*s[aei]|konsa|kaunsa|kis)\s+(ai|a\.i\.?|model|llm|engine|technology|tech|api|chatbot|bot)\b|who\s+(made|built|created|developed|trained|owns)\s+you|kisne\s+banaya|aap(ko)?\s+kisne|powered\s+by|are\s+you\s+(chat\s*gpt|gpt|gemini|claude|openai|llama|a\s+bot|human|real)|which\s+company\s+(made|built)|what\s+are\s+you\b/i;
// Questions about how Saathi or Sehatra is built (stack, servers, code, prompt, who made it) get the same answer.
const TECH_Q = /\b(tech(nology)?\s*stack|source\s*code|(your|ur|saathi'?s?|sehatra'?s?)\s+(code|prompt|system\s*prompt|instructions|api|backend|database|server|algorithm|model|training\s*data)|which\s+(database|server|cloud|hosting|framework|programming\s*language|language\s+(are\s+you|is\s+it)\s+(written|coded|built))|how\s+(are|were)\s+you\s+(made|built|trained|coded|programmed|developed)|who\s+(is|are)\s+your\s+(creator|developer|maker|owner|founder)|(app|website|site)\s+(kaise|kisne|kis\s*ne)\s+bana|kaise\s+ban[ae]\s+(ho|hai)|kisne\s+bana(ya|i|ye)|kaun\s+bana(ya|ta)|kon\s+bana(ya|ta)|react|node\.?js|express\.?js|postgres|zoho|catalyst|aws|azure|firebase|prompt\s*injection|ignore\s+(all\s+)?(previous|above)\s+instructions)\b|किसने\s*बनाया|कैसे\s*बना|कौन\s*सा\s*(एआई|AI|मॉडल)|तकनीक|टेक्नोलॉजी/i;
const IDENTITY_REPLY = "I'm **Saathi**, made by the Sehatra team to help you with your health. I can't share how I'm built or the technology behind Sehatra — but I'm happy to help with symptoms, finding a doctor, your Health Passport or medicines. What would you like help with?";

// Saathi talks only about health and using Sehatra. Anything else gets a short, polite no — checked here for
// the obvious cases (no API call spent), and by the medical engine ("non_medical") for the rest.
const OFF_TOPIC_MARK = '[[OFF_TOPIC]]';
const OFF_TOPIC_REPLY = "Sorry, I can't help with that. I can only help with health questions and with using Sehatra — like finding a doctor, your Health Passport, medicines or lab tests.";
const OFF_TOPIC = /\b(cod(e|ing)|program(me|ming)?\b|python|javascript|java\b|html|css\b|sql\b|algorithm|homework|assignment|essay|poem|poetry|shayari|story|stories|kahani|kavita|joke|chutkula|song|lyrics|gaana|movie|film|web\s*series|netflix|bollywood|actor|actress|celebrit|cricket|football|ipl|world\s*cup|match\s+score|election|chunav|politic|rajneeti|prime\s+minister|president|bitcoin|crypto|share\s*market|stock\s*market|sensex|nifty|mutual\s*fund|invest(ing|ment)?|weather|mausam|capital\s+of|history\s+of|recipe|biryani|translate|maths?\b|equation|solve\s+(this|the)|physics|pubg|free\s*fire|video\s*game|girlfriend|boyfriend|love\s*letter|horoscope|rashifal|astrology|kundli|news\b|samachar|general\s+knowledge|\bgk\b|tell\s+me\s+about\s+yourself)/i;
const OFF_TOPIC_HI = /कहानी|चुटकुला|क्रिकेट|फ़िल्म|फिल्म|गाना|चुनाव|शायरी|मौसम|राजनीति|कविता|समाचार|राशिफल/;
// A health word anywhere keeps it a health question ("can I play cricket with knee pain?").
const HEALTH_HINT = /\b(health|sehat|swasth|doctor|dr\b|medic|tablet|dawa|dawai|goli|pain|dard|ache|fever|bukhar|cough|khansi|cold|zukam|sugar|diabet|bp\b|blood|pressure|heart|pregnan|period|injur|chot|sick|ill\b|illness|disease|bimar|ilaj|treat|symptom|vaccin|teeka|diet|weight|sleep|neend|stress|anxi|depress|tension|hospital|clinic|allerg|vomit|ulti|loose\s*motion|dast|rash|infect|skin|eye|aankh|tooth|teeth|daant|stomach|pet\s*(me|mein|dard)|headache|sir\s*dard|exercise|yoga|nutrition|calorie|protein|vitamin|injury|fracture|wound|burn|breath|saans|chest|cancer|thyroid|asthma|covid|kidney|liver|lung)|दर्द|बुखार|दवा|बीमार|इलाज|स्वास्थ्य|डॉक्टर|सेहत|खांसी|उल्टी|चोट/i;
const isOffTopic = (t) => (OFF_TOPIC.test(t) || OFF_TOPIC_HI.test(t)) && !HEALTH_HINT.test(t);
// Provider outputs never name a vendor or model, whatever the person asked.
const VENDOR_NAMES = /\b(DxGPT|Dx29|Foundation\s?29|Corti(\s?AI)?|MedGemma[\w.-]*|Med-PaLM[\w.-]*|Meditron|OpenAI|Chat\s?GPT|GPT-?\d[\w.-]*|Anthropic|Claude|Gemini|Llama[\w.-]*|Mistral)\b/gi;
// Providers sometimes write maths in LaTeX — "\(38^\circ\text{C}\)" — which the chat bubble shows as code.
// Turn the common bits into plain text: 38°C, ≥, ×, ½…
function plainMath(t) {
  return String(t || '')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
    .replace(/\\(?:text|mathrm|textbf|mathbf)\{([^{}]*)\}/g, '$1')
    .replace(/\^\s*\{?\\circ\}?/g, '°')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2')
    .replace(/\\(?:geq|ge)\b/g, '≥').replace(/\\(?:leq|le)\b/g, '≤')
    .replace(/\\times\b/g, '×').replace(/\\pm\b/g, '±').replace(/\\approx\b/g, '≈').replace(/\\to\b|\\rightarrow\b/g, '→')
    .replace(/\\%/g, '%').replace(/\\,|\\ /g, ' ')
    .replace(/\$([^$\n]{1,40})\$/g, '$1');
}
const brandSafe = (t) => plainMath(t).replace(VENDOR_NAMES, 'Saathi');

async function healthReply(message, ctx, lang, seed) {
  let r;
  try {
    r = await dxgpt.answer(message, seed); // walks through every DxGPT key until one has quota
  } catch (e) {
    // Every DxGPT key used up (or DxGPT down) → Corti answers the same question. Silent to the person — same
    // wording, same safety footer. Only their own typed words go, never the record and never our earlier
    // replies (they can include the allergy reminder). If Corti fails too, the caller uses a built-in answer.
    if (!corti.configured()) throw e;
    console.warn(`[chat] DxGPT unavailable (${e.message}) — trying Corti`);
    const langName = i18n.langInfo(lang)?.name || 'English';
    const text = await corti.complete([
      { role: 'system', content: `${SYSTEM_PROMPT}${genericContext(ctx)}\n\nThe app language is ${langName}. Reply in exactly the language and script the person writes in — Hindi typed in English letters (Hinglish) gets a Hinglish reply in English letters, Tamil script gets Tamil script, and so on.` },
      { role: 'user', content: message },
    ]);
    r = text.includes(OFF_TOPIC_MARK) ? { kind: 'off-topic', lang: '' } : { kind: 'answer', text: brandSafe(text), lang: '' };
  }
  // Not a health question → the polite no, without the health footer or AI note.
  if (r.kind === 'off-topic') return localise(OFF_TOPIC_REPLY, replyLang(r.lang, message, lang));
  // Our own lines (intro, tips, footer, AI note) go in the same language as the answer itself.
  const L = replyLang(r.lang, message, lang);
  const t = (s) => localise(s, L);
  // The engine answers Hinglish questions in Devanagari — write it in English letters, as it was asked.
  const own = (s) => (L === 'hi-Latn' ? romanize(brandSafe(s)) : brandSafe(s));
  const tipLine = async (tip) => {
    const text = tip && await localiseOptional(tip, L);
    return text ? `\n\n${await t(TIP_TITLE)} ${text}` : '';
  };
  let out;
  if (r.kind === 'need-more') {
    out = `${await t(NEED_MORE)}${await tipLine(selfCareTip(message))}\n\n${await t(ANSWER_FOOTER)}`;
  } else if (r.kind === 'differential') {
    const list = r.items.map((x, i) => `${i + 1}. **${own(x.name)}** — ${own(x.about)}`).join('\n');
    out = `${await t(DIFF_INTRO)}\n\n${list}${await tipLine(selfCareTip(message))}\n\n${await t(DIFF_OUTRO)}`;
  } else {
    out = `${own(r.text)}\n\n${await t(ANSWER_FOOTER)}`;
  }
  // Same allergy reminder as the built-in answers — read from the record on our server, never sent to DxGPT.
  const allergies = (ctx?.patient?.allergies || []).filter(Boolean);
  if (allergies.length && /medicine|tablet|take|dose|ibuprofen|amoxicillin|penicillin|painkiller|antibiotic|dawa|dawai|goli/i.test(message)) {
    out += `\n\n${(await t(ALLERGY_NOTE)).replace('{0}', `**${allergies.join(', ')}**`)}`;
  }
  out += `\n\n${await t(AI_NOTE)}`; // every AI-written reply ends with the AI disclaimer
  return out;
}

// Fixed help texts may be translated by the i18n engine (they contain no personal data).
i18n.registerServerStrings([EMERGENCY_REPLY, ...FAQ.map((f) => f.a), NO_MATCH, ALLERGY_NOTE, DIFF_INTRO, DIFF_OUTRO, ANSWER_FOOTER, AI_NOTE, TIP_TITLE, NEED_MORE, IDENTITY_REPLY, OFF_TOPIC_REPLY]);

// Every fixed line by name, so its hand-written version in saathi-lines.js can be found.
const LINE_NAMES = new Map([
  [AI_NOTE, 'AI_NOTE'], [ANSWER_FOOTER, 'ANSWER_FOOTER'], [OFF_TOPIC_REPLY, 'OFF_TOPIC_REPLY'], [IDENTITY_REPLY, 'IDENTITY_REPLY'],
  [NEED_MORE, 'NEED_MORE'], [EMERGENCY_REPLY, 'EMERGENCY_REPLY'], [DIFF_INTRO, 'DIFF_INTRO'], [DIFF_OUTRO, 'DIFF_OUTRO'],
  [TIP_TITLE, 'TIP_TITLE'], [ALLERGY_NOTE, 'ALLERGY_NOTE'],
  ...FAQ.filter((f) => f.tip).map((f) => [f.a, `TIP_${f.k[0]}`]),
]);

async function localise(text, lang) {
  const own = LINES[lang]?.[LINE_NAMES.get(text)];
  if (own) return own;
  try {
    // Hinglish: the Hindi version written in English letters (English if there's no Hindi one).
    if (lang === 'hi-Latn') return romanize(await i18n.translateServerText('hi', text));
    return await i18n.translateServerText(lang, text);
  } catch { return text; }
}
// An extra line (a self-care tip) is left out rather than shown in a different language from the answer.
async function localiseOptional(text, lang) {
  const out = await localise(text, lang);
  return out === text && lang !== 'en' ? null : out;
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
  const qLang = replyLang('', last.content, lang); // the question's own language
  if (EMERGENCY_WORDS.some((w) => lower.includes(w))) {
    res.write(`data: ${JSON.stringify({ emergency: true })}\n\n`);
    await streamFallback(res, await localise(EMERGENCY_REPLY, qLang));
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  if (IDENTITY_Q.test(last.content) || TECH_Q.test(last.content)) {
    await streamFallback(res, await localise(IDENTITY_REPLY, qLang));
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  if (isOffTopic(last.content)) {
    await streamFallback(res, await localise(OFF_TOPIC_REPLY, qLang));
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const anthropic = req.chatOffline ? null : getClient(); // over the daily AI budget → built-in answers
  if (!anthropic) {
    let text = null;
    // Health questions → DxGPT (only the typed message is sent); app questions → built-in answers.
    if (!req.chatOffline && (dxgpt.enabled() || corti.configured()) && !isAppQuestion(last.content)) {
      // The person's own last few messages, so a follow-up ("he is 4, since 6 hours") keeps its context.
      const typed = history.filter((m) => m.role === 'user').slice(-3).map((m) => m.content.trim()).join('\n');
      try { text = await healthReply(typed, ctx, lang, ctx?.user?.id || req.ip); } catch (e) { console.warn('[chat] DxGPT unavailable, using a built-in answer:', e.message); }
    }
    if (res.writableEnded || res.destroyed) return undefined; // the chat was closed while we waited
    if (!text) {
      text = await fallbackText(last.content, ctx, qLang);
      // A health question answered from the built-in tips still gets the same AI disclaimer at the end.
      if (!isAppQuestion(last.content)) text += `\n\n${await localise(AI_NOTE, qLang)}`;
    }
    await streamFallback(res, text);
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

The person has chosen ${langName} for the app, but always reply in exactly the language and script of their latest message — Hindi typed in English letters (Hinglish) gets Hinglish in English letters, Tamil script gets Tamil script, English gets English. Keep medical terms understandable for that language's speakers.`,
      messages: history,
    });
    // res, not req: since Node 16 req emits 'close' once its body has been read (express.json already did),
    // so the request's 'close' either aborted every answer at once or never fired on a real disconnect.
    res.on('close', () => { if (!res.writableEnded) stream.abort(); });
    // The start of the reply is held back until it can't be the off-topic marker, so the marker never shows.
    const write = (t) => res.write(`data: ${JSON.stringify({ delta: t })}\n\n`);
    let held = '';
    let passing = false;
    let offTopic = false;
    for await (const event of stream) {
      if (event.type !== 'content_block_delta' || event.delta.type !== 'text_delta') continue;
      if (passing) { write(event.delta.text); continue; }
      held += event.delta.text;
      const s = held.trimStart();
      if (s.startsWith(OFF_TOPIC_MARK)) { offTopic = true; break; }
      if (s.length < OFF_TOPIC_MARK.length && OFF_TOPIC_MARK.startsWith(s)) continue;
      passing = true;
      write(held);
    }
    if (offTopic || (!passing && held.includes(OFF_TOPIC_MARK))) {
      stream.abort();
      await streamFallback(res, await localise(OFF_TOPIC_REPLY, lang));
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    if (!passing && held) write(held);
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      res.write(`data: ${JSON.stringify({ delta: `\n\nI can't help with that one — please ${SUPPORT}.` })}\n\n`);
    }
  } catch (err) {
    console.error('[chat] Claude error, using fallback:', err.message);
    await streamFallback(res, await fallbackText(last.content, ctx, lang));
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

module.exports = { handleChat, aiEnabled: () => Boolean(process.env.ANTHROPIC_API_KEY) || dxgpt.enabled() || corti.configured(), isAppQuestion };
