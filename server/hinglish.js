// Hinglish = Hindi written in English letters ("mujhe bukhar hai"). Saathi answers people in the language they
// wrote in, so a Hinglish question needs a Hinglish answer — but the medical engine answers it in Devanagari.
// This file spots Hinglish and turns Devanagari Hindi into the everyday Roman spelling people type.

// Words that are common in Hinglish and rare in English. Two different ones mark a message as Hinglish.
const MARKERS = new Set(('mujhe mujhko mera meri mere hai hae hain hoon hu hun kya kyu kyun kaise kaisa kab kitna kitne kitni nahi nahin nhi '
  + 'aur se ko ka ki ke mein mai tha thi raha rahi rahe karu karun karna karo kare karein kar bhi bahut bohot din dino '
  + 'dard bukhar bukhaar khansi khasi sardi zukam jukam pet sir sar dawa dawai davai goli ilaj bimar bimari ulti dast chakkar '
  + 'kamzori thakan saans sans sujan khujli jalan abhi kal aaj haan ji aap tum apna apni apne chahiye sakta sakti sakte lagta '
  + 'lagti lag hua hui hue gaya gayi gaye wala wali wale kuch sab theek thik accha acha batao bataye bataiye kijiye karta karti '
  + 'hota hoti hote dikha dikhaye unko usko bacche bachche baccha beta beti maa papa ghar khana pani paani '
  + 'ek koi tum tumhe tumko tumhara tumhari hum humko hamara hamari yeh ye woh wo kaun kon kisne kisko banaya banai sunao suna '
  + 'bolo bol kaha kahan kyon kyunki lekin magar agar toh phir fir zara thoda jaldi pata samajh madad chahta chahti').split(' '));
const ENGLISH_TOO = new Set(['me', 'main', 'to', 'so', 'he', 'is', 'in', 'a', 'i']);

function isHinglish(text) {
  const s = String(text || '');
  if (/[^\u0000-ɏ\s\d.,!?'"()\-:;/%°@#&*+]/.test(s.replace(/[\p{Extended_Pictographic}️‍]/gu, ''))) return false; // another script
  const words = new Set((s.toLowerCase().match(/[a-z]+/g) || []).filter((w) => !ENGLISH_TOO.has(w)));
  let hits = 0;
  for (const w of words) if (MARKERS.has(w)) hits += 1;
  return hits >= 2 || (hits === 1 && words.size <= 4);
}

// Whole words people already spell a set way (and English loan words written in Devanagari).
const WORDS = {
  'में': 'mein', 'मैं': 'main', 'है': 'hai', 'हैं': 'hain', 'नहीं': 'nahi', 'यह': 'yeh', 'ये': 'ye', 'वह': 'woh', 'वो': 'woh', 'और': 'aur',
  'से': 'se', 'तो': 'toh', 'क्या': 'kya', 'कि': 'ki', 'भी': 'bhi', 'ही': 'hi', 'आप': 'aap', 'आपको': 'aapko', 'आपका': 'aapka', 'आपकी': 'aapki',
  'आपके': 'aapke', 'हूँ': 'hoon', 'हूं': 'hoon', 'हो': 'ho', 'एक': 'ek', 'या': 'ya', 'पर': 'par', 'जब': 'jab', 'तक': 'tak', 'कुछ': 'kuch',
  'बहुत': 'bahut', 'ज़्यादा': 'zyada', 'ज्यादा': 'zyada', 'पानी': 'paani', 'लें': 'lein', 'दें': 'dein', 'करें': 'karein', 'पिएँ': 'piyein',
  'पिएं': 'piyein', 'रहें': 'rahein', 'जाएँ': 'jaayein', 'जाएं': 'jaayein', 'खाएँ': 'khaayein', 'खाएं': 'khaayein', 'दिखाएँ': 'dikhaayein',
  'दिखाएं': 'dikhaayein', 'अगर': 'agar', 'यदि': 'agar', 'लेकिन': 'lekin', 'मगर': 'magar', 'क्योंकि': 'kyunki', 'इसलिए': 'isliye', 'अपने': 'apne',
  'अपना': 'apna', 'अपनी': 'apni', 'साथ': 'saath', 'बाद': 'baad', 'पहले': 'pehle', 'ठीक': 'theek', 'घर': 'ghar', 'दिन': 'din', 'रात': 'raat',
  'दवा': 'dawa', 'दवाएँ': 'dawaiyan', 'दवाएं': 'dawaiyan', 'दवाई': 'dawai', 'बुखार': 'bukhar', 'दर्द': 'dard', 'आराम': 'aaram', 'तुरंत': 'turant',
  'डॉक्टर': 'doctor', 'अस्पताल': 'hospital', 'पैरासिटामोल': 'paracetamol', 'इबुप्रोफेन': 'ibuprofen', 'एस्पिरिन': 'aspirin', 'डेंगू': 'dengue',
  'मलेरिया': 'malaria', 'एंटीबायोटिक': 'antibiotic', 'एंटीबायोटिक्स': 'antibiotics', 'इन्फेक्शन': 'infection', 'संक्रमण': 'infection',
  'वायरल': 'viral', 'टेस्ट': 'test', 'ब्लड': 'blood', 'शुगर': 'sugar', 'बीपी': 'BP', 'डायबिटीज़': 'diabetes', 'डायबिटीज': 'diabetes',
  'टैबलेट': 'tablet', 'सिरप': 'syrup', 'इंजेक्शन': 'injection', 'तापमान': 'temperature', 'थर्मामीटर': 'thermometer', 'ऑक्सीजन': 'oxygen',
  'साथी': 'Saathi', 'लेबल': 'label', 'अल्सर': 'ulcer', 'किडनी': 'kidney', 'लिवर': 'liver', 'बीमारी': 'bimari', 'स्किन': 'skin', 'एलर्जी': 'allergy',
  'ओआरएस': 'ORS', 'क्लिनिक': 'clinic', 'इमरजेंसी': 'emergency', 'एम्बुलेंस': 'ambulance', 'वायरस': 'virus', 'बैक्टीरिया': 'bacteria', 'हेल्थ': 'Health', 'पासपोर्ट': 'Passport', 'लैब': 'lab', 'वीडियो': 'video', 'कंसल्ट': 'consult',
};

const CONS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n', 'ट': 't', 'ठ': 'th', 'ड': 'd',
  'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y',
  'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z', 'ड़': 'd', 'ढ़': 'dh', 'फ़': 'f', 'य़': 'y',
};
const NUKTA_OF = { 'क': 'क़', 'ख': 'ख़', 'ग': 'ग़', 'ज': 'ज़', 'ड': 'ड़', 'ढ': 'ढ़', 'फ': 'फ़', 'य': 'य़' };
const SIGNS = { 'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॅ': 'e', 'ॉ': 'o' };
const VOWELS = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o', 'ऍ': 'e' };
const INHERENT = 'a*'; // an inherent vowel that may still be dropped

// One Devanagari word → Roman, with Hindi's usual dropping of the silent "a" (कमरा → kamra, not kamaraa).
function word(w) {
  if (WORDS[w]) return WORDS[w];
  const units = []; // { c: consonant, v: vowel, nasal }
  const chars = [...w.normalize('NFC')];
  for (let i = 0; i < chars.length; i += 1) {
    let ch = chars[i];
    if (chars[i + 1] === '़' && NUKTA_OF[ch]) { ch = NUKTA_OF[ch]; i += 1; }
    if (CONS[ch]) { units.push({ c: CONS[ch], v: INHERENT, n: '' }); continue; }
    const last = units[units.length - 1];
    if (SIGNS[ch] && last) { last.v = SIGNS[ch]; continue; }
    if (ch === '्' && last) { last.v = ''; continue; }
    if ((ch === 'ं' || ch === 'ँ') && last) { last.n = 'n'; if (last.v === INHERENT) last.v = 'a'; continue; }
    if (ch === 'ः' && last) { last.n = 'h'; continue; }
    if (VOWELS[ch]) { units.push({ c: '', v: VOWELS[ch], n: '' }); continue; }
    if (ch === '़') continue;
    units.push({ c: ch, v: '', n: '', raw: true });
  }
  // Drop the final inherent "a" (except one-letter words), then a medial one between two vowelled letters.
  const lastU = units[units.length - 1];
  if (units.length > 1 && lastU && lastU.v === INHERENT) lastU.v = '';
  for (let i = units.length - 2; i >= 1; i -= 1) {
    const u = units[i];
    // …unless dropping it would glue two letters into a different sound (स+ह → "sh", क+ह → "kh").
    if (/^h/.test(units[i + 1].c) && /[sckgjtdpb]$/.test(u.c)) continue;
    if (u.v === INHERENT && !u.n && units[i - 1].v && units[i + 1].c && units[i + 1].v) u.v = '';
  }
  let out = '';
  units.forEach((u, i) => {
    let v = u.v === INHERENT ? 'a' : u.v;
    const final = i === units.length - 1;
    // Everyday spelling: long vowels shortened (bukhar, dawa), as people type them.
    if (v === 'aa' && u.c) v = 'a'; // "aa" kept only as a word's first sound (aaram, aaj)
    if (v === 'ee' && final) v = 'i';
    if (v === 'oo' && final) v = 'u';
    let n = u.n;
    if (n === 'n' && /^[pbm]/.test(units[i + 1]?.c || '')) n = 'm';
    if (n === 'n' && v === 'e' && final) { v = 'ei'; } // करें → karein
    out += u.c + v + n;
  });
  return out;
}

/** Devanagari → Hinglish. Other text (numbers, English, markdown) is left as it is. */
function romanize(text) {
  return String(text || '')
    .replace(/[ऀ-ॣ॰-ॿ]+/g, (w) => word(w))
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/\s*[।॥]/g, '.')
    .replace(/(^|[.!?]\s+|\n\s*(?:[-*]\s+|\d+\.\s+)?|\*\*)([a-z])/g, (m, p, c) => p + c.toUpperCase());
}

module.exports = { isHinglish, romanize };
