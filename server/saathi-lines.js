// Saathi's own fixed lines, written by hand in the languages people most often write to it in — so the
// disclaimer, footer and safety lines come in the same language as the question even with no translation
// service configured. 'hi-Latn' is Hinglish (Hindi in English letters). Hindi itself lives in i18n/seed/hi.json.
// Keys are the line names used in chat.js; TIP_<word> are the self-care tips. A line missing here falls back to
// the translation engine, and an optional line (a tip) is left out rather than shown in another language.

module.exports = {
  'hi-Latn': {
    AI_NOTE: '⚠️ **Saathi ek AI hai aur galti kar sakta hai.** Is salah par amal karne se pehle doctor se zaroor poochhein.',
    ANSWER_FOOTER: 'Agar aap pareshan hain ya aaram nahi mil raha, toh **doctor book karein** — emergency mein **108** par call karein.',
    OFF_TOPIC_REPLY: 'Maaf kijiye, main ismein madad nahi kar sakta. Main sirf sehat se jude sawaalon mein aur Sehatra use karne mein madad kar sakta hoon — jaise doctor dhoondhna, aapka Health Passport, dawaiyan ya lab test.',
    IDENTITY_REPLY: 'Main **Saathi** hoon — mujhe Sehatra ki team ne aapki sehat mein madad ke liye banaya hai. Main ye nahi bata sakta ki mujhe kaise banaya gaya hai ya Sehatra ke peechhe kaun si technology hai — lekin lakshan samajhne, doctor dhoondhne, aapke Health Passport ya dawaiyon mein madad karke mujhe khushi hogi. Bataiye, kis cheez mein madad chahiye?',
    NEED_MORE: 'Thoda aur bataiye — mareez ki umar kya hai, ye kab se ho raha hai, aur koi aur lakshan (bukhar, ulti, rash, dard, kamzori)? Isse main behtar jawab de paunga.',
    EMERGENCY_REPLY: 'Ye emergency ho sakti hai. **Abhi turant 108 (ambulance) par call karein**, ya sabse paas ke emergency department jaiye. Agar aap Sehatra E-Clinic par hain, toh operator ko turant bataiye — wo call karne aur sabse paas ka hospital dikhane mein madad karenge.\n\nAgar aapke mann mein khud ko nuksaan pahunchane ke khayal aa rahe hain, toh **Tele-MANAS 14416** par call karein — ye free hai aur 24 ghante khula hai.',
    DIFF_INTRO: 'Aapne jo bataya hai, uske hisaab se doctor aam taur par in cheezon par vichaar karte hain:',
    DIFF_OUTRO: 'Ye **diagnosis nahi hai** — sirf aapko dekh kar doctor hi bata sakte hain. **Aaj hi doctor ko dikhaiye** agar aap bahut bimar mehsoos kar rahe hain, takleef badh rahi hai ya 2–3 din se zyada ho gaye hain, ya uljhan, saans lene mein dikkat, gardan mein akdan, khoon aana ya rash dikhe. Booking ke liye **Find a doctor** dabaiye — emergency mein **108** par call karein.',
    TIP_TITLE: '**Abhi aap kya kar sakte hain:**',
    ALLERGY_NOTE: '⚠️ Yaad dila doon: aapke Health Passport mein {0} se allergy likhi hai. Doctor ya chemist ko ye zaroor bataiye.',
    TIP_fever: 'Bukhar mein: aaram karein, khoob paani aur taral cheezein piyein (ORS achha hai), aur label ke hisaab se **paracetamol** le sakte hain. Doctor ko dikhaiye agar bukhar **102°F** se upar ho, **2 din** se zyada rahe, ya saath mein rash, masoodon se khoon, tez sir dard ya uljhan ho (ye dengue ke lakshan ho sakte hain).',
    TIP_cough: 'Zyadatar khansi-zukam ek hafte mein theek ho jaate hain. Garam taral cheezein, bhaap, garam paani mein shahad (1 saal se chhote bachche ko nahi) aur aaram se fayda hota hai. Doctor ko dikhaiye agar saans phool rahi ho, khansi **2 hafte** se zyada ho, khoon aa raha ho, ya tez bukhar ho.',
    TIP_diabetes: 'Diabetes aur BP mein niyamit rehna sabse zaroori hai: dawa roz ek hi samay par lein, 30 minute chaliye, cheeni aur namak kam kijiye, aur reading regular check kijiye. Ghar ki readings **Health tracker** mein likh sakte hain. Agar sugar **300** se upar ya BP **180/120** se upar ho, toh aaj hi doctor ko dikhaiye.',
    TIP_headache: 'Aam sir dard aksar aaram, paani aur label ke hisaab se paracetamol se theek ho jaata hai. Turant madad lijiye agar ye **zindagi ka sabse tez sir dard** ho, ya saath mein gardan akadna, bukhar, ek taraf kamzori ya uljhan ho.',
    TIP_diarrhoea: 'Peete rahiye — **har patle dast ke baad ORS** sabse zaroori hai. Halka khana jaise khichdi ya kela khaiye. Doctor ko dikhaiye agar dast mein khoon ho, tez bukhar ho, paani ki kami ke lakshan hon (bahut kam peshab, chakkar), ya mareez chhota bachcha ya buzurg ho.',
    TIP_dengue: 'Dengue aur malaria se bachne ke liye: har hafte jama paani khaali kijiye, machchardani aur repellent use kijiye, aur poori baanh ke kapde pahniye. Tez bukhar ke saath badan dard, aankhon ke peechhe dard ya rash ho toh test karaiye. Dengue ka shak ho toh **ibuprofen/aspirin na lein** — paracetamol zyada surakshit hai.',
  },

  bn: {
    AI_NOTE: '⚠️ **সাথী একটি AI, এটি ভুল করতে পারে।** এই পরামর্শ মানার আগে অবশ্যই একজন ডাক্তারের সঙ্গে কথা বলুন।',
    ANSWER_FOOTER: 'চিন্তা হলে বা ভালো না হলে **ডাক্তার বুক করুন** — জরুরি অবস্থায় **108**-এ ফোন করুন।',
    OFF_TOPIC_REPLY: 'দুঃখিত, এ বিষয়ে আমি সাহায্য করতে পারব না। আমি শুধু স্বাস্থ্য-সংক্রান্ত প্রশ্নে আর Sehatra ব্যবহারে সাহায্য করতে পারি — যেমন ডাক্তার খোঁজা, আপনার Health Passport, ওষুধ বা ল্যাব টেস্ট।',
    IDENTITY_REPLY: 'আমি **সাথী** — Sehatra-র টিম আমাকে আপনার স্বাস্থ্যের জন্য সাহায্য করতে তৈরি করেছে। আমি কীভাবে তৈরি বা Sehatra-র পেছনের প্রযুক্তি নিয়ে কিছু বলতে পারব না — তবে উপসর্গ বোঝা, ডাক্তার খোঁজা, Health Passport বা ওষুধ নিয়ে সাহায্য করতে পারলে খুশি হব। কী নিয়ে সাহায্য চান?',
    NEED_MORE: 'আরেকটু বলবেন — রোগীর বয়স কত, কতদিন ধরে হচ্ছে, আর অন্য কোনো উপসর্গ (জ্বর, বমি, র‍্যাশ, ব্যথা, দুর্বলতা) আছে কি? তাহলে আরও ভালো উত্তর দিতে পারব।',
    EMERGENCY_REPLY: 'এটি জরুরি অবস্থা হতে পারে। **এখনই 108 (অ্যাম্বুলেন্স)-এ ফোন করুন**, অথবা কাছের জরুরি বিভাগে যান। Sehatra E-Clinic-এ থাকলে এখনই অপারেটরকে জানান — তিনি ফোন করতে ও কাছের হাসপাতাল দেখাতে সাহায্য করবেন।\n\nনিজের ক্ষতি করার চিন্তা এলে **Tele-MANAS 14416**-এ ফোন করুন — বিনামূল্যে, ২৪ ঘণ্টা খোলা।',
    DIFF_INTRO: 'আপনি যা বলেছেন, তাতে একজন ডাক্তার সাধারণত এগুলো বিবেচনা করেন:',
    DIFF_OUTRO: 'এটি **রোগ নির্ণয় নয়** — পরীক্ষা করে শুধু ডাক্তারই বলতে পারবেন। খুব অসুস্থ লাগলে, অবস্থা খারাপ হলে বা ২–৩ দিনের বেশি থাকলে, অথবা বিভ্রান্তি, শ্বাসকষ্ট, ঘাড় শক্ত, রক্তপাত বা র‍্যাশ দেখলে **আজই ডাক্তার দেখান**। বুক করতে **Find a doctor**-এ চাপুন — জরুরি অবস্থায় **108**-এ ফোন করুন।',
    TIP_TITLE: '**এখন আপনি যা করতে পারেন:**',
  },

  ta: {
    AI_NOTE: '⚠️ **சாத்தி ஒரு AI, தவறு செய்யலாம்.** இந்த ஆலோசனையைப் பின்பற்றும் முன் மருத்துவரை அணுகவும்.',
    ANSWER_FOOTER: 'கவலையாக இருந்தால் அல்லது சரியாகவில்லை என்றால் **மருத்துவரை முன்பதிவு செய்யுங்கள்** — அவசரத்தில் **108**-ஐ அழையுங்கள்.',
    OFF_TOPIC_REPLY: 'மன்னிக்கவும், இதில் என்னால் உதவ முடியாது. உடல்நலக் கேள்விகளுக்கும் Sehatra-வைப் பயன்படுத்துவதற்கும் மட்டுமே உதவுவேன் — மருத்துவரைத் தேடுவது, உங்கள் Health Passport, மருந்துகள் அல்லது லேப் பரிசோதனைகள் போன்றவை.',
    IDENTITY_REPLY: 'நான் **சாத்தி** — உங்கள் உடல்நலத்துக்கு உதவ Sehatra குழு என்னை உருவாக்கியது. நான் எப்படி உருவாக்கப்பட்டேன் அல்லது Sehatra-வின் பின்னால் உள்ள தொழில்நுட்பம் பற்றி சொல்ல முடியாது — ஆனால் அறிகுறிகளைப் புரிந்துகொள்ள, மருத்துவரைத் தேட, Health Passport அல்லது மருந்துகளில் உதவ மகிழ்ச்சி. எதில் உதவி வேண்டும்?',
    NEED_MORE: 'இன்னும் கொஞ்சம் சொல்லுங்கள் — நோயாளியின் வயது, எவ்வளவு நாளாக இருக்கிறது, வேறு அறிகுறிகள் (காய்ச்சல், வாந்தி, தடிப்பு, வலி, பலவீனம்) உள்ளதா? அப்போது சிறந்த பதில் தர முடியும்.',
    EMERGENCY_REPLY: 'இது அவசர நிலையாக இருக்கலாம். **உடனே 108 (ஆம்புலன்ஸ்)-ஐ அழையுங்கள்**, அல்லது அருகிலுள்ள அவசரப் பிரிவுக்குச் செல்லுங்கள். Sehatra E-Clinic-இல் இருந்தால் உடனே ஆபரேட்டரிடம் சொல்லுங்கள் — அழைக்கவும் அருகிலுள்ள மருத்துவமனையைக் காட்டவும் உதவுவார்.\n\nஉங்களைத் தாங்களே காயப்படுத்தும் எண்ணம் வந்தால் **Tele-MANAS 14416**-ஐ அழையுங்கள் — இலவசம், 24 மணி நேரமும்.',
    DIFF_INTRO: 'நீங்கள் சொன்னதை வைத்து, ஒரு மருத்துவர் பொதுவாகக் கருதும் சில காரணங்கள்:',
    DIFF_OUTRO: 'இது **நோயறிதல் அல்ல** — பரிசோதித்து மருத்துவர் மட்டுமே சொல்ல முடியும். மிகவும் உடல்நலமில்லாமல் இருந்தால், மோசமானால் அல்லது 2–3 நாளுக்கு மேல் இருந்தால், அல்லது குழப்பம், மூச்சுத் திணறல், கழுத்து விறைப்பு, இரத்தப்போக்கு அல்லது தடிப்பு இருந்தால் **இன்றே மருத்துவரைப் பாருங்கள்**. முன்பதிவுக்கு **Find a doctor**-ஐத் தட்டுங்கள் — அவசரத்தில் **108**-ஐ அழையுங்கள்.',
    TIP_TITLE: '**இப்போது நீங்கள் செய்யக்கூடியவை:**',
  },

  te: {
    AI_NOTE: '⚠️ **సాథీ ఒక AI, తప్పులు చేయవచ్చు.** ఈ సలహా పాటించే ముందు డాక్టర్‌ను సంప్రదించండి.',
    ANSWER_FOOTER: 'ఆందోళనగా ఉన్నా లేదా తగ్గకపోయినా **డాక్టర్‌ను బుక్ చేయండి** — అత్యవసరంలో **108**కి కాల్ చేయండి.',
    OFF_TOPIC_REPLY: 'క్షమించండి, దీనిలో నేను సహాయం చేయలేను. ఆరోగ్య ప్రశ్నలకు, Sehatra వాడటానికి మాత్రమే సహాయం చేస్తాను — డాక్టర్‌ను వెతకడం, మీ Health Passport, మందులు లేదా ల్యాబ్ టెస్టులు వంటివి.',
    IDENTITY_REPLY: 'నేను **సాథీ** — మీ ఆరోగ్యానికి సహాయం చేయడానికి Sehatra బృందం నన్ను తయారు చేసింది. నన్ను ఎలా తయారు చేశారో లేదా Sehatra వెనుక ఉన్న సాంకేతికత గురించి చెప్పలేను — కానీ లక్షణాలు అర్థం చేసుకోవడం, డాక్టర్‌ను వెతకడం, Health Passport లేదా మందుల్లో సహాయం చేయడం నాకు సంతోషం. దేనిలో సహాయం కావాలి?',
    NEED_MORE: 'ఇంకొంచెం చెప్పండి — రోగి వయసు, ఎన్ని రోజులుగా ఉంది, ఇతర లక్షణాలు (జ్వరం, వాంతులు, దద్దుర్లు, నొప్పి, నీరసం) ఉన్నాయా? అప్పుడు మంచి సమాధానం ఇవ్వగలను.',
    EMERGENCY_REPLY: 'ఇది అత్యవసర పరిస్థితి కావచ్చు. **వెంటనే 108 (అంబులెన్స్)కి కాల్ చేయండి**, లేదా దగ్గరలోని అత్యవసర విభాగానికి వెళ్ళండి. Sehatra E-Clinic లో ఉంటే వెంటనే ఆపరేటర్‌కు చెప్పండి — కాల్ చేయడానికి, దగ్గరి ఆసుపత్రిని చూపించడానికి సహాయం చేస్తారు.\n\nమిమ్మల్ని మీరు హాని చేసుకోవాలనే ఆలోచనలు వస్తే **Tele-MANAS 14416**కి కాల్ చేయండి — ఉచితం, 24 గంటలూ.',
    DIFF_INTRO: 'మీరు చెప్పినదాన్ని బట్టి, డాక్టర్ సాధారణంగా పరిగణించే కొన్ని కారణాలు:',
    DIFF_OUTRO: 'ఇది **రోగనిర్ధారణ కాదు** — పరీక్షించి డాక్టర్ మాత్రమే చెప్పగలరు. చాలా అనారోగ్యంగా ఉంటే, ఎక్కువైతే లేదా 2–3 రోజులకు మించి ఉంటే, లేదా అయోమయం, ఊపిరి ఇబ్బంది, మెడ బిగుసుకుపోవడం, రక్తస్రావం లేదా దద్దుర్లు కనిపిస్తే **ఈరోజే డాక్టర్‌ను చూడండి**. బుక్ చేయడానికి **Find a doctor** నొక్కండి — అత్యవసరంలో **108**కి కాల్ చేయండి.',
    TIP_TITLE: '**ఇప్పుడు మీరు చేయగలిగేవి:**',
  },

  mr: {
    AI_NOTE: '⚠️ **साथी एक AI आहे आणि चुका करू शकतो.** हा सल्ला पाळण्यापूर्वी डॉक्टरांचा सल्ला नक्की घ्या.',
    ANSWER_FOOTER: 'काळजी वाटत असेल किंवा बरे वाटत नसेल तर **डॉक्टर बुक करा** — आणीबाणीत **108** वर कॉल करा.',
    OFF_TOPIC_REPLY: 'माफ करा, यात मी मदत करू शकत नाही. मी फक्त आरोग्याच्या प्रश्नांमध्ये आणि Sehatra वापरण्यात मदत करू शकतो — जसे डॉक्टर शोधणे, तुमचा Health Passport, औषधे किंवा लॅब टेस्ट.',
    IDENTITY_REPLY: 'मी **साथी** — तुमच्या आरोग्यासाठी मदत करायला Sehatra टीमने मला बनवले आहे. मला कसे बनवले किंवा Sehatra मागचे तंत्रज्ञान याबद्दल मी सांगू शकत नाही — पण लक्षणे समजून घेणे, डॉक्टर शोधणे, Health Passport किंवा औषधांमध्ये मदत करायला आनंद होईल. कशात मदत हवी आहे?',
    NEED_MORE: 'आणखी थोडे सांगा — रुग्णाचे वय, किती दिवसांपासून होत आहे, आणि इतर लक्षणे (ताप, उलटी, पुरळ, वेदना, अशक्तपणा) आहेत का? मग मी अधिक चांगले उत्तर देऊ शकेन.',
    EMERGENCY_REPLY: 'ही आणीबाणी असू शकते. **आत्ताच 108 (रुग्णवाहिका) वर कॉल करा**, किंवा जवळच्या आपत्कालीन विभागात जा. तुम्ही Sehatra E-Clinic मध्ये असाल तर लगेच ऑपरेटरला सांगा — ते कॉल करायला आणि जवळचे रुग्णालय दाखवायला मदत करतील.\n\nस्वतःला इजा करण्याचे विचार येत असतील तर **Tele-MANAS 14416** वर कॉल करा — मोफत, 24 तास सुरू.',
    DIFF_INTRO: 'तुम्ही सांगितलेल्यावरून, डॉक्टर सहसा या गोष्टींचा विचार करतात:',
    DIFF_OUTRO: 'हे **निदान नाही** — तपासूनच डॉक्टर सांगू शकतात. खूप आजारी वाटत असेल, त्रास वाढत असेल किंवा 2–3 दिवसांपेक्षा जास्त असेल, किंवा गोंधळ, श्वास घेण्यास त्रास, मान आखडणे, रक्तस्राव किंवा पुरळ दिसल्यास **आजच डॉक्टरांना दाखवा**. बुकिंगसाठी **Find a doctor** दाबा — आणीबाणीत **108** वर कॉल करा.',
    TIP_TITLE: '**आत्ता तुम्ही काय करू शकता:**',
  },

  gu: {
    AI_NOTE: '⚠️ **સાથી એક AI છે અને ભૂલ કરી શકે છે.** આ સલાહ અનુસરતા પહેલાં ડૉક્ટરની સલાહ ચોક્કસ લો.',
    ANSWER_FOOTER: 'ચિંતા હોય કે સારું ન થતું હોય તો **ડૉક્ટર બુક કરો** — ઇમરજન્સીમાં **108** પર કૉલ કરો.',
    OFF_TOPIC_REPLY: 'માફ કરશો, આમાં હું મદદ કરી શકતો નથી. હું ફક્ત સ્વાસ્થ્યના પ્રશ્નોમાં અને Sehatra વાપરવામાં મદદ કરી શકું છું — જેમ કે ડૉક્ટર શોધવા, તમારો Health Passport, દવાઓ કે લેબ ટેસ્ટ.',
    IDENTITY_REPLY: 'હું **સાથી** છું — તમારા સ્વાસ્થ્યમાં મદદ કરવા Sehatraની ટીમે મને બનાવ્યો છે. મને કેવી રીતે બનાવ્યો કે Sehatra પાછળની ટેકનોલોજી વિશે હું કહી શકતો નથી — પણ લક્ષણો સમજવામાં, ડૉક્ટર શોધવામાં, Health Passport કે દવાઓમાં મદદ કરીને મને આનંદ થશે. શેમાં મદદ જોઈએ?',
    NEED_MORE: 'થોડું વધુ જણાવો — દર્દીની ઉંમર, કેટલા દિવસથી છે, અને બીજા કોઈ લક્ષણો (તાવ, ઉલટી, ફોલ્લીઓ, દુખાવો, નબળાઈ) છે? તો હું વધુ સારો જવાબ આપી શકીશ.',
    EMERGENCY_REPLY: 'આ ઇમરજન્સી હોઈ શકે છે. **હમણાં જ 108 (એમ્બ્યુલન્સ) પર કૉલ કરો**, અથવા નજીકના ઇમરજન્સી વિભાગમાં જાઓ. Sehatra E-Clinic પર હો તો તરત ઑપરેટરને કહો — તેઓ કૉલ કરવામાં અને નજીકની હોસ્પિટલ બતાવવામાં મદદ કરશે.\n\nપોતાને નુકસાન પહોંચાડવાના વિચાર આવે તો **Tele-MANAS 14416** પર કૉલ કરો — મફત, 24 કલાક ચાલુ.',
    DIFF_INTRO: 'તમે જે કહ્યું તે મુજબ, ડૉક્ટર સામાન્ય રીતે આ બાબતો ધ્યાનમાં લે છે:',
    DIFF_OUTRO: 'આ **નિદાન નથી** — તપાસીને ફક્ત ડૉક્ટર જ કહી શકે. ખૂબ બીમાર લાગે, તકલીફ વધે કે 2–3 દિવસથી વધુ રહે, અથવા મૂંઝવણ, શ્વાસમાં તકલીફ, ગરદન અકડાવી, લોહી નીકળવું કે ફોલ્લીઓ દેખાય તો **આજે જ ડૉક્ટરને બતાવો**. બુક કરવા **Find a doctor** દબાવો — ઇમરજન્સીમાં **108** પર કૉલ કરો.',
    TIP_TITLE: '**હમણાં તમે શું કરી શકો:**',
  },

  kn: {
    AI_NOTE: '⚠️ **ಸಾಥಿ ಒಂದು AI, ತಪ್ಪು ಮಾಡಬಹುದು.** ಈ ಸಲಹೆ ಪಾಲಿಸುವ ಮೊದಲು ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ.',
    ANSWER_FOOTER: 'ಚಿಂತೆಯಾಗಿದ್ದರೆ ಅಥವಾ ಕಡಿಮೆಯಾಗದಿದ್ದರೆ **ವೈದ್ಯರನ್ನು ಬುಕ್ ಮಾಡಿ** — ತುರ್ತು ಸಂದರ್ಭದಲ್ಲಿ **108**ಗೆ ಕರೆ ಮಾಡಿ.',
    OFF_TOPIC_REPLY: 'ಕ್ಷಮಿಸಿ, ಇದರಲ್ಲಿ ನಾನು ಸಹಾಯ ಮಾಡಲಾರೆ. ಆರೋಗ್ಯ ಪ್ರಶ್ನೆಗಳಿಗೆ ಮತ್ತು Sehatra ಬಳಸಲು ಮಾತ್ರ ಸಹಾಯ ಮಾಡುತ್ತೇನೆ — ವೈದ್ಯರನ್ನು ಹುಡುಕುವುದು, ನಿಮ್ಮ Health Passport, ಔಷಧಿಗಳು ಅಥವಾ ಲ್ಯಾಬ್ ಪರೀಕ್ಷೆಗಳು.',
    IDENTITY_REPLY: 'ನಾನು **ಸಾಥಿ** — ನಿಮ್ಮ ಆರೋಗ್ಯಕ್ಕೆ ಸಹಾಯ ಮಾಡಲು Sehatra ತಂಡ ನನ್ನನ್ನು ರೂಪಿಸಿದೆ. ನನ್ನನ್ನು ಹೇಗೆ ರೂಪಿಸಲಾಗಿದೆ ಅಥವಾ Sehatra ಹಿಂದಿನ ತಂತ್ರಜ್ಞಾನದ ಬಗ್ಗೆ ಹೇಳಲಾರೆ — ಆದರೆ ಲಕ್ಷಣಗಳನ್ನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು, ವೈದ್ಯರನ್ನು ಹುಡುಕಲು, Health Passport ಅಥವಾ ಔಷಧಿಗಳಲ್ಲಿ ಸಹಾಯ ಮಾಡಲು ಸಂತೋಷ. ಯಾವುದರಲ್ಲಿ ಸಹಾಯ ಬೇಕು?',
    NEED_MORE: 'ಇನ್ನೂ ಸ್ವಲ್ಪ ತಿಳಿಸಿ — ರೋಗಿಯ ವಯಸ್ಸು, ಎಷ್ಟು ದಿನಗಳಿಂದ ಇದೆ, ಬೇರೆ ಲಕ್ಷಣಗಳು (ಜ್ವರ, ವಾಂತಿ, ದದ್ದು, ನೋವು, ಸುಸ್ತು) ಇವೆಯೇ? ಆಗ ಉತ್ತಮ ಉತ್ತರ ನೀಡಬಲ್ಲೆ.',
    EMERGENCY_REPLY: 'ಇದು ತುರ್ತು ಪರಿಸ್ಥಿತಿ ಆಗಿರಬಹುದು. **ಈಗಲೇ 108 (ಆಂಬುಲೆನ್ಸ್)ಗೆ ಕರೆ ಮಾಡಿ**, ಅಥವಾ ಹತ್ತಿರದ ತುರ್ತು ವಿಭಾಗಕ್ಕೆ ಹೋಗಿ. Sehatra E-Clinic ನಲ್ಲಿದ್ದರೆ ತಕ್ಷಣ ಆಪರೇಟರ್‌ಗೆ ತಿಳಿಸಿ — ಕರೆ ಮಾಡಲು ಮತ್ತು ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆ ತೋರಿಸಲು ಸಹಾಯ ಮಾಡುತ್ತಾರೆ.\n\nನಿಮಗೆ ನೀವೇ ಹಾನಿ ಮಾಡಿಕೊಳ್ಳುವ ಯೋಚನೆಗಳು ಬಂದರೆ **Tele-MANAS 14416**ಗೆ ಕರೆ ಮಾಡಿ — ಉಚಿತ, 24 ಗಂಟೆ.',
    DIFF_INTRO: 'ನೀವು ಹೇಳಿದ್ದನ್ನು ನೋಡಿದರೆ, ವೈದ್ಯರು ಸಾಮಾನ್ಯವಾಗಿ ಪರಿಗಣಿಸುವ ಕೆಲವು ಕಾರಣಗಳು:',
    DIFF_OUTRO: 'ಇದು **ರೋಗನಿರ್ಣಯವಲ್ಲ** — ಪರೀಕ್ಷಿಸಿ ವೈದ್ಯರು ಮಾತ್ರ ಹೇಳಬಲ್ಲರು. ತುಂಬಾ ಅಸ್ವಸ್ಥರಾಗಿದ್ದರೆ, ಹೆಚ್ಚಾದರೆ ಅಥವಾ 2–3 ದಿನಕ್ಕಿಂತ ಹೆಚ್ಚು ಇದ್ದರೆ, ಅಥವಾ ಗೊಂದಲ, ಉಸಿರಾಟದ ತೊಂದರೆ, ಕುತ್ತಿಗೆ ಬಿಗಿತ, ರಕ್ತಸ್ರಾವ ಅಥವಾ ದದ್ದು ಕಂಡರೆ **ಇಂದೇ ವೈದ್ಯರನ್ನು ಕಾಣಿ**. ಬುಕ್ ಮಾಡಲು **Find a doctor** ಒತ್ತಿ — ತುರ್ತು ಸಂದರ್ಭದಲ್ಲಿ **108**ಗೆ ಕರೆ ಮಾಡಿ.',
    TIP_TITLE: '**ಈಗ ನೀವು ಮಾಡಬಹುದಾದದ್ದು:**',
  },

  ml: {
    AI_NOTE: '⚠️ **സാഥി ഒരു AI ആണ്, തെറ്റുകൾ വരാം.** ഈ ഉപദേശം പാലിക്കുന്നതിന് മുമ്പ് ഡോക്ടറെ സമീപിക്കുക.',
    ANSWER_FOOTER: 'ആശങ്കയുണ്ടെങ്കിലോ കുറയുന്നില്ലെങ്കിലോ **ഡോക്ടറെ ബുക്ക് ചെയ്യുക** — അടിയന്തരാവസ്ഥയിൽ **108**-ൽ വിളിക്കുക.',
    OFF_TOPIC_REPLY: 'ക്ഷമിക്കണം, ഇതിൽ എനിക്ക് സഹായിക്കാനാവില്ല. ആരോഗ്യ ചോദ്യങ്ങൾക്കും Sehatra ഉപയോഗിക്കുന്നതിനും മാത്രമേ ഞാൻ സഹായിക്കൂ — ഡോക്ടറെ കണ്ടെത്തൽ, നിങ്ങളുടെ Health Passport, മരുന്നുകൾ അല്ലെങ്കിൽ ലാബ് ടെസ്റ്റുകൾ പോലെ.',
    IDENTITY_REPLY: 'ഞാൻ **സാഥി** — നിങ്ങളുടെ ആരോഗ്യത്തിന് സഹായിക്കാൻ Sehatra ടീം എന്നെ ഉണ്ടാക്കി. എന്നെ എങ്ങനെ ഉണ്ടാക്കി എന്നോ Sehatra-യുടെ പിന്നിലെ സാങ്കേതികവിദ്യയെക്കുറിച്ചോ പറയാനാവില്ല — പക്ഷേ ലക്ഷണങ്ങൾ മനസ്സിലാക്കാനും ഡോക്ടറെ കണ്ടെത്താനും Health Passport, മരുന്നുകൾ എന്നിവയിലും സഹായിക്കാൻ സന്തോഷം. എന്തിലാണ് സഹായം വേണ്ടത്?',
    NEED_MORE: 'കുറച്ചുകൂടി പറയൂ — രോഗിയുടെ പ്രായം, എത്ര ദിവസമായി, മറ്റ് ലക്ഷണങ്ങൾ (പനി, ഛർദ്ദി, തിണർപ്പ്, വേദന, ക്ഷീണം) ഉണ്ടോ? അപ്പോൾ നല്ല മറുപടി നൽകാം.',
    EMERGENCY_REPLY: 'ഇത് അടിയന്തരാവസ്ഥ ആയിരിക്കാം. **ഉടൻ 108 (ആംബുലൻസ്)-ൽ വിളിക്കുക**, അല്ലെങ്കിൽ അടുത്തുള്ള അത്യാഹിത വിഭാഗത്തിലേക്ക് പോകുക. Sehatra E-Clinic-ൽ ആണെങ്കിൽ ഉടൻ ഓപ്പറേറ്ററോട് പറയുക — വിളിക്കാനും അടുത്തുള്ള ആശുപത്രി കാണിക്കാനും സഹായിക്കും.\n\nസ്വയം ഉപദ്രവിക്കാനുള്ള ചിന്തകൾ വന്നാൽ **Tele-MANAS 14416**-ൽ വിളിക്കുക — സൗജന്യം, 24 മണിക്കൂറും.',
    DIFF_INTRO: 'നിങ്ങൾ പറഞ്ഞതനുസരിച്ച്, ഒരു ഡോക്ടർ സാധാരണ പരിഗണിക്കുന്ന ചില കാരണങ്ങൾ:',
    DIFF_OUTRO: 'ഇത് **രോഗനിർണയം അല്ല** — പരിശോധിച്ച് ഡോക്ടർക്ക് മാത്രമേ പറയാനാകൂ. വളരെ അസുഖം തോന്നുന്നുവെങ്കിൽ, കൂടുന്നുവെങ്കിൽ, 2–3 ദിവസത്തിൽ കൂടുതൽ നീണ്ടാൽ, അല്ലെങ്കിൽ ആശയക്കുഴപ്പം, ശ്വാസതടസ്സം, കഴുത്ത് മുറുക്കം, രക്തസ്രാവം, തിണർപ്പ് എന്നിവ കണ്ടാൽ **ഇന്നുതന്നെ ഡോക്ടറെ കാണുക**. ബുക്ക് ചെയ്യാൻ **Find a doctor** അമർത്തുക — അടിയന്തരാവസ്ഥയിൽ **108**-ൽ വിളിക്കുക.',
    TIP_TITLE: '**ഇപ്പോൾ നിങ്ങൾക്ക് ചെയ്യാവുന്നത്:**',
  },

  pa: {
    AI_NOTE: '⚠️ **ਸਾਥੀ ਇੱਕ AI ਹੈ ਅਤੇ ਗ਼ਲਤੀ ਕਰ ਸਕਦਾ ਹੈ।** ਇਸ ਸਲਾਹ ਤੇ ਅਮਲ ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ ਡਾਕਟਰ ਦੀ ਸਲਾਹ ਜ਼ਰੂਰ ਲਓ।',
    ANSWER_FOOTER: 'ਜੇ ਚਿੰਤਾ ਹੈ ਜਾਂ ਠੀਕ ਨਹੀਂ ਹੋ ਰਿਹਾ ਤਾਂ **ਡਾਕਟਰ ਬੁੱਕ ਕਰੋ** — ਐਮਰਜੈਂਸੀ ਵਿੱਚ **108** ਤੇ ਕਾਲ ਕਰੋ।',
    OFF_TOPIC_REPLY: 'ਮਾਫ਼ ਕਰਨਾ, ਮੈਂ ਇਸ ਵਿੱਚ ਮਦਦ ਨਹੀਂ ਕਰ ਸਕਦਾ। ਮੈਂ ਸਿਰਫ਼ ਸਿਹਤ ਦੇ ਸਵਾਲਾਂ ਵਿੱਚ ਅਤੇ Sehatra ਵਰਤਣ ਵਿੱਚ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ — ਜਿਵੇਂ ਡਾਕਟਰ ਲੱਭਣਾ, ਤੁਹਾਡਾ Health Passport, ਦਵਾਈਆਂ ਜਾਂ ਲੈਬ ਟੈਸਟ।',
    IDENTITY_REPLY: 'ਮੈਂ **ਸਾਥੀ** ਹਾਂ — ਤੁਹਾਡੀ ਸਿਹਤ ਵਿੱਚ ਮਦਦ ਲਈ Sehatra ਦੀ ਟੀਮ ਨੇ ਮੈਨੂੰ ਬਣਾਇਆ ਹੈ। ਮੈਨੂੰ ਕਿਵੇਂ ਬਣਾਇਆ ਗਿਆ ਜਾਂ Sehatra ਪਿੱਛੇ ਕਿਹੜੀ ਤਕਨੀਕ ਹੈ, ਇਹ ਮੈਂ ਨਹੀਂ ਦੱਸ ਸਕਦਾ — ਪਰ ਲੱਛਣ ਸਮਝਣ, ਡਾਕਟਰ ਲੱਭਣ, Health Passport ਜਾਂ ਦਵਾਈਆਂ ਵਿੱਚ ਮਦਦ ਕਰਕੇ ਮੈਨੂੰ ਖ਼ੁਸ਼ੀ ਹੋਵੇਗੀ। ਦੱਸੋ, ਕਿਸ ਚੀਜ਼ ਵਿੱਚ ਮਦਦ ਚਾਹੀਦੀ ਹੈ?',
    NEED_MORE: 'ਥੋੜ੍ਹਾ ਹੋਰ ਦੱਸੋ — ਮਰੀਜ਼ ਦੀ ਉਮਰ, ਕਦੋਂ ਤੋਂ ਹੋ ਰਿਹਾ ਹੈ, ਅਤੇ ਹੋਰ ਕੋਈ ਲੱਛਣ (ਬੁਖ਼ਾਰ, ਉਲਟੀ, ਧੱਫੜ, ਦਰਦ, ਕਮਜ਼ੋਰੀ)? ਫਿਰ ਮੈਂ ਬਿਹਤਰ ਜਵਾਬ ਦੇ ਸਕਾਂਗਾ।',
    EMERGENCY_REPLY: 'ਇਹ ਐਮਰਜੈਂਸੀ ਹੋ ਸਕਦੀ ਹੈ। **ਹੁਣੇ 108 (ਐਂਬੂਲੈਂਸ) ਤੇ ਕਾਲ ਕਰੋ**, ਜਾਂ ਨੇੜਲੇ ਐਮਰਜੈਂਸੀ ਵਿਭਾਗ ਵਿੱਚ ਜਾਓ। ਜੇ ਤੁਸੀਂ Sehatra E-Clinic ਤੇ ਹੋ ਤਾਂ ਤੁਰੰਤ ਆਪਰੇਟਰ ਨੂੰ ਦੱਸੋ — ਉਹ ਕਾਲ ਕਰਨ ਅਤੇ ਨੇੜਲਾ ਹਸਪਤਾਲ ਦਿਖਾਉਣ ਵਿੱਚ ਮਦਦ ਕਰਨਗੇ।\n\nਜੇ ਆਪਣੇ ਆਪ ਨੂੰ ਨੁਕਸਾਨ ਪਹੁੰਚਾਉਣ ਦੇ ਖ਼ਿਆਲ ਆ ਰਹੇ ਹਨ ਤਾਂ **Tele-MANAS 14416** ਤੇ ਕਾਲ ਕਰੋ — ਮੁਫ਼ਤ, 24 ਘੰਟੇ ਖੁੱਲ੍ਹਾ।',
    DIFF_INTRO: 'ਤੁਸੀਂ ਜੋ ਦੱਸਿਆ ਹੈ, ਉਸ ਮੁਤਾਬਕ ਡਾਕਟਰ ਆਮ ਤੌਰ ਤੇ ਇਹਨਾਂ ਗੱਲਾਂ ਤੇ ਵਿਚਾਰ ਕਰਦੇ ਹਨ:',
    DIFF_OUTRO: 'ਇਹ **ਨਿਦਾਨ ਨਹੀਂ ਹੈ** — ਜਾਂਚ ਕਰਕੇ ਸਿਰਫ਼ ਡਾਕਟਰ ਹੀ ਦੱਸ ਸਕਦੇ ਹਨ। ਜੇ ਬਹੁਤ ਬਿਮਾਰ ਮਹਿਸੂਸ ਹੋਵੇ, ਤਕਲੀਫ਼ ਵਧੇ ਜਾਂ 2–3 ਦਿਨਾਂ ਤੋਂ ਵੱਧ ਰਹੇ, ਜਾਂ ਉਲਝਣ, ਸਾਹ ਲੈਣ ਵਿੱਚ ਤਕਲੀਫ਼, ਗਰਦਨ ਆਕੜਨਾ, ਖ਼ੂਨ ਵਗਣਾ ਜਾਂ ਧੱਫੜ ਦਿਸਣ ਤਾਂ **ਅੱਜ ਹੀ ਡਾਕਟਰ ਨੂੰ ਦਿਖਾਓ**। ਬੁੱਕ ਕਰਨ ਲਈ **Find a doctor** ਦਬਾਓ — ਐਮਰਜੈਂਸੀ ਵਿੱਚ **108** ਤੇ ਕਾਲ ਕਰੋ।',
    TIP_TITLE: '**ਹੁਣੇ ਤੁਸੀਂ ਕੀ ਕਰ ਸਕਦੇ ਹੋ:**',
  },

  ur: {
    AI_NOTE: '⚠️ **ساتھی ایک AI ہے اور غلطی کر سکتا ہے۔** اس مشورے پر عمل کرنے سے پہلے ڈاکٹر سے ضرور مشورہ کریں۔',
    ANSWER_FOOTER: 'اگر آپ پریشان ہیں یا آرام نہیں آ رہا تو **ڈاکٹر بُک کریں** — ایمرجنسی میں **108** پر کال کریں۔',
    OFF_TOPIC_REPLY: 'معاف کیجیے، میں اس میں مدد نہیں کر سکتا۔ میں صرف صحت سے متعلق سوالات اور Sehatra استعمال کرنے میں مدد کر سکتا ہوں — جیسے ڈاکٹر ڈھونڈنا، آپ کا Health Passport، دوائیں یا لیب ٹیسٹ۔',
    IDENTITY_REPLY: 'میں **ساتھی** ہوں — Sehatra کی ٹیم نے مجھے آپ کی صحت میں مدد کے لیے بنایا ہے۔ میں یہ نہیں بتا سکتا کہ مجھے کیسے بنایا گیا یا Sehatra کے پیچھے کون سی ٹیکنالوجی ہے — لیکن علامات سمجھنے، ڈاکٹر ڈھونڈنے، Health Passport یا دواؤں میں مدد کر کے مجھے خوشی ہوگی۔ بتائیے، کس چیز میں مدد چاہیے؟',
    NEED_MORE: 'تھوڑا اور بتائیے — مریض کی عمر کیا ہے، یہ کب سے ہو رہا ہے، اور کوئی اور علامات (بخار، الٹی، دانے، درد، کمزوری)؟ اس سے میں بہتر جواب دے سکوں گا۔',
    EMERGENCY_REPLY: 'یہ ایمرجنسی ہو سکتی ہے۔ **ابھی فوراً 108 (ایمبولینس) پر کال کریں**، یا قریبی ایمرجنسی شعبے میں جائیں۔ اگر آپ Sehatra E-Clinic پر ہیں تو فوراً آپریٹر کو بتائیں — وہ کال کرنے اور قریبی ہسپتال دکھانے میں مدد کریں گے۔\n\nاگر آپ کے ذہن میں خود کو نقصان پہنچانے کے خیالات آ رہے ہیں تو **Tele-MANAS 14416** پر کال کریں — مفت، 24 گھنٹے کھلا۔',
    DIFF_INTRO: 'آپ نے جو بتایا اس کے مطابق، ڈاکٹر عام طور پر ان چیزوں پر غور کرتے ہیں:',
    DIFF_OUTRO: 'یہ **تشخیص نہیں ہے** — معائنہ کر کے صرف ڈاکٹر ہی بتا سکتے ہیں۔ اگر بہت بیمار محسوس ہو، تکلیف بڑھے یا 2–3 دن سے زیادہ رہے، یا الجھن، سانس لینے میں دقت، گردن اکڑنا، خون آنا یا دانے نظر آئیں تو **آج ہی ڈاکٹر کو دکھائیں**۔ بُک کرنے کے لیے **Find a doctor** دبائیں — ایمرجنسی میں **108** پر کال کریں۔',
    TIP_TITLE: '**ابھی آپ کیا کر سکتے ہیں:**',
  },

  es: {
    AI_NOTE: '⚠️ **Saathi es una IA y puede equivocarse.** Consulta a un médico antes de seguir este consejo.',
    ANSWER_FOOTER: 'Si te preocupa o no mejora, **reserva un médico** — en una emergencia llama al **108**.',
    OFF_TOPIC_REPLY: 'Lo siento, no puedo ayudar con eso. Solo puedo ayudarte con preguntas de salud y con el uso de Sehatra — como encontrar un médico, tu Health Passport, medicamentos o pruebas de laboratorio.',
    IDENTITY_REPLY: 'Soy **Saathi**, creado por el equipo de Sehatra para ayudarte con tu salud. No puedo contar cómo estoy hecho ni la tecnología detrás de Sehatra — pero con gusto te ayudo con síntomas, a encontrar un médico, tu Health Passport o tus medicamentos. ¿En qué te ayudo?',
    NEED_MORE: '¿Puedes contarme un poco más — la edad de la persona, desde cuándo ocurre y si hay otros síntomas (fiebre, vómitos, sarpullido, dolor, debilidad)? Así te daré una mejor respuesta.',
    EMERGENCY_REPLY: 'Esto podría ser una emergencia. **Llama al 108 (ambulancia) ahora mismo**, o ve al servicio de urgencias más cercano. Si estás en una E-Clinic de Sehatra, avisa al operador de inmediato — te ayudará a llamar y te mostrará el hospital más cercano.\n\nSi tienes pensamientos de hacerte daño, llama a **Tele-MANAS al 14416** — es gratis y está disponible las 24 horas.',
    DIFF_INTRO: 'Según lo que describes, estas son algunas cosas que un médico suele considerar:',
    DIFF_OUTRO: 'Esto **no es un diagnóstico** — solo un médico que te examine puede decirlo. **Ve a un médico hoy** si te sientes muy mal, empeora o dura más de 2–3 días, o notas confusión, dificultad para respirar, rigidez de cuello, sangrado o sarpullido. Pulsa **Find a doctor** para reservar — en una emergencia llama al **108**.',
    TIP_TITLE: '**Lo que puedes hacer ahora:**',
  },
};
