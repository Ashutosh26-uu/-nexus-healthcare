// Reading Hinglish aloud. An English voice says "bukhar" as "bokhar", so a Hinglish reply is spoken by a Hindi
// voice instead — after writing its Hindi words in Devanagari (बुखार), which Hindi voices pronounce correctly.
// English words in the reply (doctor, test, BP, paracetamol…) stay in Latin letters; Hindi voices read those
// in English. Only for speech — the text on screen is never changed.

// Words common in Hinglish and rare in English (same idea as server/hinglish.js).
const MARKERS = new Set(('mujhe mujhko mera meri mere hai hae hain hoon hu hun kya kyu kyun kaise kaisa kab kitna kitne kitni nahi nahin nhi '
  + 'aur se ko ka ki ke mein mai tha thi raha rahi rahe karu karun karna karo kare karein kar bhi bahut bohot dino '
  + 'dard bukhar bukhaar khansi khasi sardi zukam jukam sar dawa dawai davai goli ilaj bimar bimari ulti dast chakkar '
  + 'kamzori thakan saans sans sujan khujli jalan abhi kal aaj haan ji aap tum apna apni apne chahiye sakta sakti sakte lagta '
  + 'lagti hua hui hue gaya gayi gaye wala wali wale kuch sab theek thik accha acha batao bataye bataiye kijiye karta karti '
  + 'hota hoti hote dikha dikhaye dikhayein unko usko bacche bachche baccha beti maa khana pani paani aaram lein dein piyein '
  + 'ek koi tumhe tumko hum humko hamara hamari yeh ye woh wo kaun kon zyada jyada agar lekin magar toh phir thoda jaldi pata '
  + 'samajh madad zaroor zarur turant raat subah shaam din dawaiyan aapko aapka aapki aapke rahein jaayein khaayein').split(' '));

// English words that also show up in Hinglish replies — never transliterated.
const ENGLISH = new Set(('a an the and or of in on at for with by from is are was were be been am i you he she it we they my your his her our their '
  + 'this that these those what when where who why how which do does did done have has had not no yes can could will would should may might must '
  + 'please thank thanks ok okay hello hi sir madam doctor doctors dr clinic hospital test tests report reports lab blood sugar bp ors ecg x ray '
  + 'tablet tablets syrup injection paracetamol ibuprofen antibiotic antibiotics infection viral virus fever cough cold pain headache emergency '
  + 'ambulance call consult video audio chat app book booking online saathi sehatra health passport medicine medicines temperature thermometer '
  + 'oxygen pulse diabetes thyroid allergy allergies check checkup care plan sos kiosk e clinic number email phone mobile time day days week weeks '
  + 'month months year years hour hours minute minutes ai mistakes advice general guidance diagnosis normal level levels high low safe').split(' '));

export function looksHinglish(text) {
  const s = String(text || '');
  if (/[^ -ɏ\s\d.,!?'"()\-:;/%°@#&*+₹…—–]/.test(s.replace(/[\p{Extended_Pictographic}️‍]/gu, ''))) return false;
  const words = new Set((s.toLowerCase().match(/[a-z]+/g) || []));
  let hits = 0;
  for (const w of words) if (MARKERS.has(w)) hits += 1;
  return hits >= 2 || (hits === 1 && words.size <= 4);
}

// Spellings people use that simple letter rules get wrong.
const FIXED = {
  hai: 'है', hain: 'हैं', hae: 'है', main: 'मैं', mein: 'में', nahi: 'नहीं', nahin: 'नहीं', aur: 'और', ki: 'की', ke: 'के', ka: 'का', ko: 'को', se: 'से',
  toh: 'तो', to: 'तो', sakte: 'सकते', sakta: 'सकता', sakti: 'सकती', salah: 'सलाह', galti: 'गलती', karta: 'करता', karti: 'करती', karte: 'करते',
  rahe: 'रहे', raha: 'रहा', rahi: 'रही', liye: 'लिए', isliye: 'इसलिए', pehle: 'पहले', baad: 'बाद', saath: 'साथ', jaise: 'जैसे', wala: 'वाला', wali: 'वाली', kya: 'क्या', yeh: 'यह', ye: 'ये', woh: 'वो', wo: 'वो', hoon: 'हूँ', hu: 'हूँ', aap: 'आप', aapko: 'आपको', aapka: 'आपका', aapki: 'आपकी', aapke: 'आपके',
  bukhar: 'बुखार', bukhaar: 'बुखार', dard: 'दर्द', dawa: 'दवा', dawai: 'दवाई', dawaiyan: 'दवाइयाँ', paani: 'पानी', pani: 'पानी', aaram: 'आराम',
  zyada: 'ज़्यादा', jyada: 'ज़्यादा', theek: 'ठीक', thik: 'ठीक', bahut: 'बहुत', khansi: 'खांसी', sardi: 'सर्दी', zukam: 'ज़ुकाम', ulti: 'उल्टी', dast: 'दस्त',
  chakkar: 'चक्कर', saans: 'सांस', turant: 'तुरंत', zaroor: 'ज़रूर', zarur: 'ज़रूर', lein: 'लें', dein: 'दें', karein: 'करें', rahein: 'रहें', piyein: 'पिएं',
  jaayein: 'जाएं', khaayein: 'खाएं', dikhaayein: 'दिखाएं', dikhayein: 'दिखाएं', chahiye: 'चाहिए', kijiye: 'कीजिए', agar: 'अगर', lekin: 'लेकिन', din: 'दिन',
  raat: 'रात', ghar: 'घर', apna: 'अपना', apni: 'अपनी', apne: 'अपने', kuch: 'कुछ', sab: 'सब', bhi: 'भी', abhi: 'अभी', mujhe: 'मुझे', mera: 'मेरा', meri: 'मेरी',
};

const CONS = [['chh', 'छ'], ['kh', 'ख'], ['gh', 'घ'], ['ch', 'च'], ['jh', 'झ'], ['th', 'थ'], ['dh', 'ध'], ['ph', 'फ'], ['bh', 'भ'], ['sh', 'श'],
  ['k', 'क'], ['g', 'ग'], ['c', 'क'], ['j', 'ज'], ['t', 'त'], ['d', 'द'], ['n', 'न'], ['p', 'प'], ['f', 'फ़'], ['b', 'ब'], ['m', 'म'], ['y', 'य'],
  ['r', 'र'], ['l', 'ल'], ['v', 'व'], ['w', 'व'], ['s', 'स'], ['h', 'ह'], ['z', 'ज़'], ['q', 'क'], ['x', 'क्स']];
const VOW = [['aa', 'आ', 'ा'], ['ai', 'ऐ', 'ै'], ['au', 'औ', 'ौ'], ['ee', 'ई', 'ी'], ['ii', 'ई', 'ी'], ['oo', 'ऊ', 'ू'], ['uu', 'ऊ', 'ू'],
  ['a', 'अ', ''], ['i', 'इ', 'ि'], ['u', 'उ', 'ु'], ['e', 'ए', 'े'], ['o', 'ओ', 'ो']];

function translit(word) {
  let out = '';
  let afterCons = false;
  for (let i = 0; i < word.length;) {
    const rest = word.slice(i);
    // A nasal ending: "...ein", "...ain", "...oon" → vowel sign + bindu.
    const nasal = afterCons && /^(ei|ai|oo|aa|e)n$/.exec(rest);
    if (nasal) { out += { ei: 'ें', ai: 'ैं', oo: 'ूं', aa: 'ां', e: 'ें' }[nasal[1]]; break; }
    const v = VOW.find(([r]) => rest.startsWith(r));
    if (v) { out += afterCons ? v[2] : v[1]; afterCons = false; i += v[0].length; continue; }
    const c = CONS.find(([r]) => rest.startsWith(r));
    if (c) { if (afterCons) out += '्'; out += c[1]; afterCons = true; i += c[0].length; continue; }
    out += word[i]; afterCons = false; i += 1;
  }
  return out;
}

// Hinglish → mixed text a Hindi voice reads well.
export function hinglishForSpeech(text) {
  return String(text || '').replace(/[A-Za-z]+/g, (w) => {
    const lw = w.toLowerCase();
    if (FIXED[lw]) return FIXED[lw];
    if (ENGLISH.has(lw) || (w.length > 1 && w === w.toUpperCase())) return w; // English word or acronym (BP, ORS)
    return MARKERS.has(lw) || /^[a-z]+$/.test(lw) ? translit(lw) : w;
  });
}
