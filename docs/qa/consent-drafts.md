# Consent texts in Hindi and Telugu: drafts for the owner (decision 10)

Written 15 November 2026 for the owner to read on Monday.

These are the Hindi and Telugu versions of the four built-in parent consent texts in School OS
(`src/lib/data-security/consent.ts`, `READY_TEXTS`). Each one is stored next to its English
text with `status: "draft-needs-owner-approval"`.

**While a text is a draft:**
- the School Admin sees it in Settings > Data Backup & Security > Consent, under each consent
  type, marked "Draft translation: waiting for approval", with the English beside it;
- it is NOT put into the school's consent form and NOT shown to parents. Parents keep seeing the
  English text with the line "This form is not in your language yet. For questions, call the school."

**How the drafts were written:** everyday Hindi and Telugu, the same meaning as the English,
nothing added and nothing left out. `{school}` is kept exactly as in the English (School OS puts
the school's name there). APAAR, WhatsApp and SMS stay in English letters because that is how
parents see them. The Hindi uses "सकता/सकती" so it fits a father or a mother.

**To approve:** tell Claude which texts and languages are approved (or what to change). Claude
changes `status` to `"approved"` for those, and then:
1. a school that has not set up that consent text yet gets the approved translation filled in
   its form next to the English, and saves it as usual (a new version, kept in the audit log);
2. parents see it in their language only after the school saves it (the parent page already shows
   a school's own Hindi or Telugu text when the school has one).

Please check each line below: is it easy for a parent to read, and does it say exactly what the
English says?

## Use of the child's data (DPDP Act 2023) (`data-processing`)

### English (in use now)

**Use of my child's data**

I agree that {school} may keep and use my child's details (name, date of birth, class, attendance, marks, fees, health notes I give, and my contact details) to run the school: admission, teaching, exams, fees, transport, safety and messages to me. The details are kept safely in India, are seen only by school staff who need them, and are never sold or used for advertising. I can ask to see, correct or remove them, and I can withdraw this consent at any time by telling the school office.

### Hindi: draft translation, waiting for approval

**मेरे बच्चे की जानकारी का इस्तेमाल**

मेरी सहमति है कि {school} मेरे बच्चे की जानकारी (नाम, जन्म तिथि, कक्षा, हाज़िरी, अंक, फ़ीस, सेहत के बारे में मेरी दी हुई जानकारी, और मेरे संपर्क की जानकारी) स्कूल चलाने के लिए रख सकता है और इस्तेमाल कर सकता है: दाख़िला, पढ़ाई, परीक्षा, फ़ीस, ट्रांसपोर्ट, सुरक्षा और मुझे संदेश भेजना। यह जानकारी भारत में सुरक्षित रखी जाती है, इसे स्कूल के केवल वही कर्मचारी देखते हैं जिन्हें इसकी ज़रूरत है, और इसे न कभी बेचा जाता है, न विज्ञापन के लिए इस्तेमाल किया जाता है। मैं यह जानकारी देखने, ठीक करवाने या हटवाने के लिए कह सकता/सकती हूँ, और स्कूल ऑफ़िस को बताकर यह सहमति कभी भी वापस ले सकता/सकती हूँ।

### Telugu: draft translation, waiting for approval

**నా పిల్లల వివరాల వాడకం**

నా పిల్లల వివరాలను (పేరు, పుట్టిన తేదీ, తరగతి, హాజరు, మార్కులు, ఫీజులు, నేను ఇచ్చే ఆరోగ్య వివరాలు, నా కాంటాక్ట్ వివరాలు) {school} ఉంచుకుని, స్కూల్ నడపడానికి వాడుకోవచ్చని నేను అంగీకరిస్తున్నాను: అడ్మిషన్, పాఠాలు, పరీక్షలు, ఫీజులు, ట్రాన్స్‌పోర్ట్, భద్రత, నాకు మెసేజ్‌లు పంపడం. ఈ వివరాలను భారతదేశంలో భద్రంగా ఉంచుతారు, అవసరమైన స్కూల్ సిబ్బంది మాత్రమే వాటిని చూస్తారు, వాటిని ఎప్పుడూ అమ్మరు, ప్రకటనల కోసం వాడరు. వాటిని చూపించమని, సరిచేయమని లేదా తీసివేయమని నేను అడగవచ్చు; స్కూల్ ఆఫీసుకు చెప్పి ఈ అంగీకారాన్ని ఎప్పుడైనా వెనక్కి తీసుకోవచ్చు.

Owner's answer: [ ] Hindi approved  [ ] Telugu approved  Changes: ...

## Photos in the gallery and on social media (`photo`)

### English (in use now)

**Photos of my child**

I agree that {school} may show photos and videos in which my child appears in the school gallery, in notices to parents and on the school's social media pages. I can withdraw this consent at any time; after that my child's photos will not be shared.

### Hindi: draft translation, waiting for approval

**मेरे बच्चे की फ़ोटो**

मेरी सहमति है कि {school} ऐसी फ़ोटो और वीडियो, जिनमें मेरा बच्चा दिखता है, स्कूल की गैलरी में, अभिभावकों को भेजे जाने वाले नोटिस में और स्कूल के सोशल मीडिया पेजों पर दिखा सकता है। मैं यह सहमति कभी भी वापस ले सकता/सकती हूँ; उसके बाद मेरे बच्चे की फ़ोटो शेयर नहीं की जाएँगी।

### Telugu: draft translation, waiting for approval

**నా పిల్లల ఫోటోలు**

నా పిల్లలు కనిపించే ఫోటోలు, వీడియోలను {school} స్కూల్ గ్యాలరీలో, తల్లిదండ్రులకు పంపే నోటీసుల్లో, స్కూల్ సోషల్ మీడియా పేజీల్లో చూపించవచ్చని నేను అంగీకరిస్తున్నాను. ఈ అంగీకారాన్ని నేను ఎప్పుడైనా వెనక్కి తీసుకోవచ్చు; ఆ తర్వాత నా పిల్లల ఫోటోలను షేర్ చేయరు.

Owner's answer: [ ] Hindi approved  [ ] Telugu approved  Changes: ...

## APAAR ID (`apaar`)

### English (in use now)

**APAAR ID**

As the parent or guardian of my child, who is a minor, I agree that {school} may create or link my child's APAAR ID (Automated Permanent Academic Account Registry) and share the details the government asks for, only for that purpose.

### Hindi: draft translation, waiting for approval

**APAAR ID**

अपने नाबालिग बच्चे के माता-पिता या अभिभावक के रूप में, मेरी सहमति है कि {school} मेरे बच्चे की APAAR ID (Automated Permanent Academic Account Registry) बना या लिंक कर सकता है, और सरकार जो जानकारी माँगती है, वह केवल इसी काम के लिए साझा कर सकता है।

### Telugu: draft translation, waiting for approval

**APAAR ID**

మైనర్ అయిన నా పిల్లల తల్లిదండ్రులు లేదా సంరక్షకులుగా, {school} నా పిల్లల APAAR ID (Automated Permanent Academic Account Registry) తయారు చేయడానికి లేదా లింక్ చేయడానికి, ప్రభుత్వం అడిగే వివరాలను ఆ పని కోసం మాత్రమే పంచుకోవడానికి నేను అంగీకరిస్తున్నాను.

Owner's answer: [ ] Hindi approved  [ ] Telugu approved  Changes: ...

## Messages on WhatsApp and SMS (`message-opt-in`)

### English (in use now)

**Messages on WhatsApp and SMS**

I agree to receive school messages about my child (attendance, fees, notices and results) on WhatsApp and SMS at the number I have given.

### Hindi: draft translation, waiting for approval

**WhatsApp और SMS पर संदेश**

मेरी सहमति है कि मेरे दिए हुए नंबर पर मुझे WhatsApp और SMS से मेरे बच्चे के बारे में स्कूल के संदेश (हाज़िरी, फ़ीस, नोटिस और रिज़ल्ट) मिलें।

### Telugu: draft translation, waiting for approval

**WhatsApp, SMS లో మెసేజ్‌లు**

నేను ఇచ్చిన నంబర్‌కు WhatsApp, SMS లో నా పిల్లల గురించి స్కూల్ మెసేజ్‌లు (హాజరు, ఫీజులు, నోటీసులు, ఫలితాలు) రావడానికి నేను అంగీకరిస్తున్నాను.

Owner's answer: [ ] Hindi approved  [ ] Telugu approved  Changes: ...
