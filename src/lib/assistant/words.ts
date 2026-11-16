// The assistant's fixed words, in each conversation language. Used for what
// the code says itself: switches, limits, errors, the confirmation card, the
// panel, and the plain fallback sentences when the model is not used. The
// model's own replies are written in the same language (prompt.ts).
// Numbers, ₹ amounts, dates and names are filled in exactly as given.
// No database and no server code: the panel uses it too.
import { fill, type Vars } from "../i18n/t";
import type { AssistantLang } from "./language";

const W = {
  off: ["The assistant is off for this school.", "ఈ స్కూల్‌కి అసిస్టెంట్ ఆఫ్‌లో ఉంది.", "इस स्कूल के लिए असिस्टेंट बंद है।"],
  paused: ["The assistant is paused right now. Search still works.", "అసిస్టెంట్ ఇప్పుడు ఆగి ఉంది. Search పని చేస్తుంది.", "असिस्टेंट अभी रुका हुआ है। Search काम करता है।"],
  role: ["Your role does not use the assistant in this school.", "ఈ స్కూల్‌లో మీ రోల్‌కి అసిస్టెంట్ లేదు.", "इस स्कूल में आपकी भूमिका के लिए असिस्टेंट नहीं है।"],
  limit: ["Today's assistant limit is used. Search still works; try again tomorrow.", "ఈ రోజు అసిస్టెంట్ పరిమితి అయిపోయింది. Search పని చేస్తుంది; రేపు మళ్ళీ ప్రయత్నించండి.", "आज की असिस्टेंट सीमा पूरी हो गई। Search काम करता है; कल फिर कोशिश करें।"],
  aiDown: ["The AI service is not working right now. Try one of these questions, or use Search.", "AI సేవ ఇప్పుడు పని చేయడం లేదు. వీటిలో ఒక ప్రశ్న ఎంచుకోండి, లేదా Search వాడండి.", "AI सेवा अभी काम नहीं कर रही। इनमें से कोई सवाल चुनें, या Search इस्तेमाल करें।"],
  notUnderstood: ["Sorry, I did not get that. You can ask one of these.", "Sorry అండి, నాకు అర్థం కాలేదు. ఇలా అడిగి చూడండి.", "माफ़ कीजिए, मैं समझ नहीं पाया। आप इनमें से कुछ पूछ सकते हैं।"],
  tooMany: ["Too many messages in a minute. Wait a moment, please.", "ఒక్క నిమిషంలో చాలా సందేశాలు వచ్చాయి. కొంచెం ఆగండి.", "एक मिनट में बहुत सारे संदेश। थोड़ा रुकिए।"],
  empty: ["Type or say your question first.", "ముందు మీ ప్రశ్న టైప్ చేయండి లేదా చెప్పండి.", "पहले अपना सवाल लिखिए या बोलिए।"],
  nothingFound: ["I could not find this in the records you can see.", "మీరు చూడగలిగే రికార్డుల్లో ఇది కనిపించలేదు.", "आप जो रिकॉर्ड देख सकते हैं, उनमें यह नहीं मिला।"],
  cantDo: ["I cannot do that from here. Open the screen to do it yourself.", "ఇది నేను ఇక్కడ నుంచి చేయలేను. ఆ స్క్రీన్ తెరిచి మీరే చేయండి.", "यह मैं यहाँ से नहीं कर सकता। वह स्क्रीन खोलकर खुद कीजिए।"],
  notYourRole: ["That is not part of your role, so I cannot show it.", "ఇది మీ role లో లేదు, అందుకే చూపించలేను.", "यह आपकी भूमिका में नहीं है, इसलिए नहीं दिखा सकता।"],
  hello: ["Hello! Nice to see you. Ask me about attendance, fees, homework, the calendar or approvals.", "నమస్తే అండి! Attendance, fees, homework, calendar, approvals గురించి ఏదైనా అడగండి.", "नमस्ते! हाज़िरी, फ़ीस, होमवर्क, कैलेंडर या मंज़ूरियों के बारे में पूछिए।"],
  thanks: ["You're welcome! Ask me anytime.", "Welcome అండి! ఎప్పుడైనా అడగండి.", "आपका स्वागत है! कभी भी पूछिए।"],
  enquiryHelp: ["Sure. Open the enquiry form below and fill in the child's and parent's details; it takes a minute.", "తప్పకుండా. కింద enquiry form ఓపెన్ చేసి child, parent details నింపండి; ఒక్క నిమిషం పడుతుంది.", "ज़रूर। नीचे पूछताछ फ़ॉर्म खोलकर बच्चे और माता-पिता की जानकारी भरिए; एक मिनट लगेगा।"],
  linkEnquiryForm: ["Open the enquiry form", "Enquiry form ఓపెన్ చేయండి", "पूछताछ फ़ॉर्म खोलें"],
  sayMore: ["Could you say a little more? For example, which class or which day.", "కొంచెం వివరంగా చెప్పగలరా? ఉదాహరణకు, ఏ తరగతి లేదా ఏ రోజు.", "थोड़ा और बताइए? जैसे कौन सी कक्षा या कौन सा दिन।"],
  error: ["Something went wrong. Nothing was changed.", "ఏదో తప్పు జరిగింది. ఏమీ మారలేదు.", "कुछ गड़बड़ हो गई। कुछ नहीं बदला।"],
  fromRecords: ["From your school's records", "మీ స్కూల్ రికార్డుల నుంచి", "आपके स्कूल के रिकॉर्ड से"],
  suggestion: ["Suggestion: written by the AI assistant from these records", "సూచన: ఈ రికార్డుల నుంచి AI అసిస్టెంట్ రాసింది", "सुझाव: इन रिकॉर्ड से AI असिस्टेंट ने लिखा"],
  open: ["Open", "తెరవండి", "खोलें"],
  linkStudents: ["Open Student Management", "Student Management తెరవండి", "Student Management खोलें"],
  linkProfile: ["Open the Student Profile", "Student Profile తెరవండి", "Student Profile खोलें"],
  linkSubmissions: ["Open Submissions", "Submissions తెరవండి", "Submissions खोलें"],
  linkCalendar: ["Open the School Calendar", "School Calendar తెరవండి", "School Calendar खोलें"],
  linkApprovals: ["Open Approvals", "Approvals తెరవండి", "Approvals खोलें"],
  linkEnquiries: ["Open Enquiries", "Enquiries తెరవండి", "Enquiries खोलें"],

  // The confirmation card (plan Layer 3).
  cardTitle: ["Add this enquiry?", "ఈ ఎంక్వైరీ జోడించాలా?", "यह पूछताछ जोड़ें?"],
  cardYes: ["Yes, add the enquiry", "అవును, ఎంక్వైరీ జోడించండి", "हाँ, पूछताछ जोड़ें"],
  cardNo: ["No", "వద్దు", "नहीं"],
  cardAlso: ["The enquiry gets an owner, who is told. You can change any of it later on the enquiry.", "ఎంక్వైరీకి ఒక బాధ్యులు కేటాయించబడతారు, వారికి తెలియజేయబడుతుంది. తర్వాత ఎంక్వైరీలో ఏదైనా మార్చవచ్చు.", "पूछताछ एक ज़िम्मेदार व्यक्ति को दी जाएगी और उन्हें बताया जाएगा। बाद में पूछताछ में कुछ भी बदल सकते हैं।"],
  fieldChild: ["Child's name", "పిల్లల పేరు", "बच्चे का नाम"],
  fieldParent: ["Parent's name", "తల్లిదండ్రుల పేరు", "माता-पिता का नाम"],
  fieldPhone: ["Phone", "ఫోన్", "फ़ोन"],
  fieldClass: ["Class wanted", "కావలసిన తరగతి", "कक्षा"],
  fieldSource: ["Heard of the school from", "స్కూల్ గురించి ఎలా తెలిసింది", "स्कूल के बारे में कहाँ से सुना"],
  fieldFollowUp: ["Next follow-up", "తదుపరి ఫాలో-అప్", "अगला फ़ॉलो-अप"],
  missing: ["Still needed: {fields}. Tell me, or open the full form.", "ఇంకా కావాలి: {fields}. నాకు చెప్పండి, లేదా పూర్తి ఫారం తెరవండి.", "अभी चाहिए: {fields}। मुझे बताइए, या पूरा फ़ॉर्म खोलिए।"],
  added: ["Done. Enquiry added for {name}.", "అయిపోయింది. {name} కోసం ఎంక్వైరీ జోడించబడింది.", "हो गया। {name} के लिए पूछताछ जोड़ दी गई।"],
  cancelled: ["Okay, nothing was added.", "సరే, ఏమీ జోడించలేదు.", "ठीक है, कुछ नहीं जोड़ा गया।"],
  expired: ["This card is no longer open. Ask me again.", "ఈ కార్డ్ ఇప్పుడు తెరిచి లేదు. మళ్ళీ అడగండి.", "यह कार्ड अब खुला नहीं है। फिर से पूछिए।"],
  openForm: ["Open the full form", "పూర్తి ఫారం తెరవండి", "पूरा फ़ॉर्म खोलें"],
  duplicate: ["An enquiry with this phone already exists. Open the full form to check it.", "ఈ ఫోన్‌తో ఇప్పటికే ఒక ఎంక్వైరీ ఉంది. పూర్తి ఫారం తెరిచి చూడండి.", "इस फ़ोन से पहले से एक पूछताछ है। पूरा फ़ॉर्म खोलकर देखिए।"],

  // The panel.
  title: ["School assistant", "స్కూల్ అసిస్టెంట్", "स्कूल असिस्टेंट"],
  schoolTitle: ["{school} assistant", "{school} అసిస్టెంట్", "{school} असिस्टेंट"],
  greet: ["Hi! I'm your school assistant", "హాయ్! నేను మీ school assistant ని", "नमस्ते! मैं आपका स्कूल असिस्टेंट हूँ"],
  greetLead: ["How can I help you today?", "ఈ రోజు మీకు ఎలా సహాయం చేయగలను?", "आज मैं आपकी कैसे मदद करूँ?"],
  typeInstead: ["Type a question", "ప్రశ్న టైప్ చేయండి", "सवाल लिखिए"],
  ask: ["Ask", "అడగండి", "पूछिए"],
  tapHello: ["Tap the assistant to say hello", "హలో చెప్పడానికి అసిస్టెంట్‌ను నొక్కండి", "नमस्ते कहने के लिए असिस्टेंट को छुएँ"],
  stReady: ["Ready to help", "సహాయానికి సిద్ధం", "मदद के लिए तैयार"],
  stSpeaking: ["Telling you", "చెబుతున్నాను", "बता रहा हूँ"],
  stDone: ["All set!", "అయిపోయింది!", "हो गया!"],
  stSorry: ["Can't do that", "అది చేయలేను", "यह नहीं कर सकता"],
  stHappy: ["Happy to help!", "సంతోషంగా!", "ख़ुशी से!"],
  stSurprised: ["Oh!", "ఓహ్!", "अरे!"],
  picker: ["Which language will you speak?", "మీరు ఏ భాషలో మాట్లాడతారు?", "आप किस भाषा में बोलेंगे?"],
  placeholder: ["Ask about attendance, fees, homework…", "Attendance, fees, homework గురించి అడగండి…", "हाज़िरी, फ़ीस, होमवर्क के बारे में पूछिए…"],
  send: ["Send", "పంపండి", "भेजें"],
  speak: ["Speak", "మాట్లాడండి", "बोलिए"],
  stop: ["Stop", "ఆపండి", "रोकें"],
  close: ["Close", "మూసివేయండి", "बंद करें"],
  listening: ["Listening…", "వింటున్నాను…", "सुन रहा हूँ…"],
  thinking: ["Looking at the records…", "రికార్డులు చూస్తున్నాను…", "रिकॉर्ड देख रहा हूँ…"],
  heard: ["Heard", "విన్నది", "सुना"],
  speakReplies: ["Speak replies aloud", "జవాబులు వినిపించు", "जवाब बोलकर सुनाएँ"],
  noVoice: ["This device has no voice for this language, so replies are shown as text.", "ఈ పరికరంలో ఈ భాషకు గొంతు లేదు, అందుకే జవాబులు అక్షరాల్లో చూపిస్తాము.", "इस डिवाइस में इस भाषा की आवाज़ नहीं है, इसलिए जवाब लिखकर दिखाए जाएँगे।"],
  noMic: ["Voice input does not work in this browser. Please type.", "ఈ బ్రౌజర్‌లో మాట్లాడి అడగడం పని చేయదు. టైప్ చేయండి.", "इस ब्राउज़र में बोलकर पूछना काम नहीं करता। कृपया लिखिए।"],

  // Plain sentences for the new tools, used when the model is not (AI off, failed, or a number it made up).
  studentOne: ["{name}, {cls}. Attendance this year: {pct} ({present} of {days} school days present).", "{name}, {cls}. ఈ సంవత్సరం హాజరు: {pct} ({days} బడి రోజుల్లో {present} రోజులు హాజరు).", "{name}, {cls}। इस साल हाज़िरी: {pct} ({days} स्कूल दिनों में से {present} दिन हाज़िर)।"],
  studentNoAttendance: ["{name}, {cls}. Attendance is not part of your role, so it is not shown.", "{name}, {cls}. హాజరు మీ రోల్‌లో లేదు, అందుకే చూపించడం లేదు.", "{name}, {cls}। हाज़िरी आपकी भूमिका में नहीं है, इसलिए नहीं दिखाई गई।"],
  studentNone: ["No student by that name in the records you can see.", "మీరు చూడగలిగే రికార్డుల్లో ఆ పేరుతో విద్యార్థి లేరు.", "आपके देखे जा सकने वाले रिकॉर्ड में इस नाम का कोई छात्र नहीं है।"],
  studentMany: ["{n} students match: {list}. Which one?", "{n} మంది విద్యార్థులు సరిపోతున్నారు: {list}. ఎవరు?", "{n} छात्र मिले: {list}। कौन सा?"],
  homework: ["Homework due from {from} to {to}: {n} still have hand-ins missing, {k} in all.", "{from} నుంచి {to} వరకు due ఉన్న {n} homework లో ఇంకా {k} submissions రావాలి.", "{from} से {to} तक {n} होमवर्क में अभी जमा बाकी है: कुल {k}।"],
  homeworkNone: ["Every homework due from {from} to {to} is handed in.", "{from} నుంచి {to} వరకు due ఉన్న homework అంతా submit అయ్యింది.", "{from} से {to} तक का सारा होमवर्क जमा हो गया है।"],
  upcoming: ["{n} on the School Calendar from {from} to {to}: {list}.", "{from} నుంచి {to} వరకు School Calendar లో {n} ఉన్నాయి: {list}.", "{from} से {to} तक स्कूल कैलेंडर में {n}: {list}।"],
  upcomingNone: ["Nothing on the School Calendar from {from} to {to}.", "{from} నుంచి {to} వరకు School Calendar లో ఏమీ లేదు.", "{from} से {to} तक स्कूल कैलेंडर में कुछ नहीं है।"],
  approvals: ["{n} requests are waiting for your decision.", "మీ decision కోసం {n} requests waiting లో ఉన్నాయి.", "{n} अनुरोध आपके फ़ैसले का इंतज़ार कर रहे हैं।"],
  approvalsNone: ["Nothing is waiting for your decision. All clear!", "మీ decision కోసం ఏదీ waiting లో లేదు. అంతా clear!", "आपके फ़ैसले के लिए कुछ भी बाकी नहीं है।"],
} as const satisfies Record<string, readonly [string, string, string]>;

export type WordKey = keyof typeof W;
const AT: Record<AssistantLang, 0 | 1 | 2> = { en: 0, te: 1, hi: 2 };

/** The assistant's own words in the conversation language, blanks filled exactly. */
export function words(lang: AssistantLang, key: WordKey, vars?: Vars): string {
  return fill(W[key][AT[lang]], vars);
}

/** Every key, for the test that each language has every sentence and the same blanks. */
export const WORD_KEYS = Object.keys(W) as WordKey[];
export const rawWords = (key: WordKey) => W[key];
