// School OS's ready WhatsApp templates as cards (docs/design/whatsapp-messages.md,
// approved 15 Nov 2026). Each body starts with a greeting, puts the key facts on
// their own lines with a small emoji label and the value in *bold*, and ends with
// one fixed sentence; the school's name moved to the footer (made at submission,
// ./card.ts). A link button's blank sits alone on the last line ("{parent_link}"),
// so the messages that fill it keep making each parent's own link; WhatsApp gets
// the words without that line and the link as the button.
//
// When a text here changes, add the old words to PAST_READY_WHATSAPP
// (./ready-history.ts), so schools still holding them can take the new ones.
// SMS and app texts are not here: they keep their words (5.4 of the design).
import { headerWithoutEmoji, type CardButton, type CardHeader, type LinkTarget, type WhatsappCard } from "./card";

type Words = Record<string, string>;
type ReadyButton = { type: "URL"; target: LinkTarget; blank: string; text: Words } | { type: "URL"; path: string; text: Words } | { type: "PHONE"; text: Words };
export type ReadyCard = { header?: Words; document?: "receipt"; buttons?: ReadyButton[]; category?: "MARKETING" };
export type ReadyWhatsapp = { key: string; name: string; category: string; texts: Words; card: ReadyCard };

const CALL: ReadyButton = { type: "PHONE", text: { en: "Call school", hi: "स्कूल को कॉल करें", te: "పాఠశాలకు కాల్ చేయండి" } };
const parentLink = (text: Words, blank = "parent_link"): ReadyButton => ({ type: "URL", target: "parent-link", blank, text });
const OPEN_PL = { en: "Open Parent Link", hi: "Parent Link खोलें", te: "Parent Link తెరవండి" };
const HOMEWORK = { en: "See homework", hi: "होमवर्क देखें", te: "హోంవర్క్ చూడండి" };
const FROM_SCHOOL = { en: "📢 Message from school", hi: "📢 स्कूल से संदेश", te: "📢 పాఠశాల నుండి సందేశం" };
const BIRTHDAY = { en: "🎂 Happy birthday!", hi: "🎂 जन्मदिन मुबारक!", te: "🎂 పుట్టినరోజు శుభాకాంక్షలు!" };

const lines = (...xs: string[]) => xs.join("\n");

export const READY_WHATSAPP: ReadyWhatsapp[] = [
  { key: "absence", name: "Absent today", category: "attendance",
    card: { header: { en: "🔔 Absent today", hi: "🔔 आज अनुपस्थित", te: "🔔 ఈరోజు గైర్హాజరు" }, buttons: [CALL] },
    texts: {
      en: lines("Dear {guardian_name}, your child is marked absent at school today.", "", "👤 *{student_name}* of {class}", "📅 Date: *{date}*", "", "If you did not expect this, please call the school. We hope all is well."),
      hi: lines("नमस्ते {guardian_name} जी, आज आपका बच्चा स्कूल में अनुपस्थित है।", "", "👤 *{student_name}*, कक्षा {class}", "📅 तारीख़: *{date}*", "", "अगर आपको इसकी जानकारी नहीं थी, तो कृपया स्कूल को फ़ोन करें। आशा है सब ठीक है।"),
      te: lines("నమస్కారం {guardian_name} గారు, మీ బిడ్డ ఈరోజు పాఠశాలకు రాలేదు.", "", "👤 *{student_name}*, తరగతి {class}", "📅 తేదీ: *{date}*", "", "ఇది మీకు తెలియకపోతే, దయచేసి పాఠశాలకు కాల్ చేయండి. అంతా క్షేమమేనని ఆశిస్తున్నాము."),
    } },
  { key: "late", name: "Arrived late", category: "attendance",
    card: { header: { en: "⏰ Arrived late", hi: "⏰ देर से पहुँचे", te: "⏰ ఆలస్యంగా వచ్చారు" }, buttons: [CALL] },
    texts: {
      en: lines("Dear {guardian_name}, your child reached school late today.", "", "👤 *{student_name}* of {class}", "📅 Date: *{date}*", "", "Please help your child be on time tomorrow. Thank you."),
      hi: lines("नमस्ते {guardian_name} जी, आज आपके बच्चे को स्कूल पहुँचने में देर हुई।", "", "👤 *{student_name}*, कक्षा {class}", "📅 तारीख़: *{date}*", "", "कृपया ध्यान दें कि कल बच्चा समय पर स्कूल पहुँचे। धन्यवाद।"),
      te: lines("నమస్కారం {guardian_name} గారు, ఈరోజు మీ బిడ్డ పాఠశాలకు ఆలస్యంగా వచ్చారు.", "", "👤 *{student_name}*, తరగతి {class}", "📅 తేదీ: *{date}*", "", "రేపటి నుండి సమయానికి వచ్చేలా చూడండి. ధన్యవాదాలు."),
    } },
  // How to pay stays a line of its own ({how_to_pay}, src/lib/fees/reminder-pay.ts): "Please pay at the school
  // office." when online payment is off, the parent's own Parent Link to pay, or a 7-day payment link when Parent
  // Link is off. A "Pay fee" button would promise online payment a school may not have (lead, 15 Nov).
  { key: "fee-due", name: "Fee reminder", category: "fees",
    card: { header: { en: "💳 Fee reminder", hi: "💳 फ़ीस रिमाइंडर", te: "💳 ఫీజు రిమైండర్" }, buttons: [CALL] },
    texts: {
      en: lines("Dear {guardian_name}, this is a friendly reminder about a school fee.", "", "👤 *{student_name}* of {class}", "💰 Amount due: *{due_amount}*", "📅 Due by: *{due_date}*", "", "How to pay: {how_to_pay}", "", "If you have already paid, please ignore this message. Thank you."),
      hi: lines("नमस्ते {guardian_name} जी, स्कूल फ़ीस जमा करने की याद दिला रहे हैं।", "", "👤 *{student_name}*, कक्षा {class}", "💰 बकाया राशि: *{due_amount}*", "📅 अंतिम तारीख़: *{due_date}*", "", "भुगतान कैसे करें: {how_to_pay}", "", "अगर आप भुगतान कर चुके हैं, तो कृपया इस संदेश को अनदेखा करें। धन्यवाद।"),
      te: lines("నమస్కారం {guardian_name} గారు, స్కూల్ ఫీజు గురించి చిన్న గుర్తు.", "", "👤 *{student_name}*, తరగతి {class}", "💰 చెల్లించాల్సిన మొత్తం: *{due_amount}*", "📅 చివరి తేదీ: *{due_date}*", "", "ఎలా చెల్లించాలి: {how_to_pay}", "", "ఇప్పటికే చెల్లించి ఉంటే, ఈ సందేశాన్ని పట్టించుకోవద్దు. ధన్యవాదాలు."),
    } },
  // The receipt PDF is the card's header (a document); "Paid by" and "Still due" come from the receipt's own figures.
  { key: "fee-paid", name: "Fee received", category: "fees",
    card: { header: { en: "✅ Fee received", hi: "✅ फ़ीस प्राप्त हुई", te: "✅ ఫీజు అందింది" }, document: "receipt", buttons: [{ type: "URL", target: "receipt", blank: "receipt_link", text: { en: "Open receipt", hi: "रसीद देखें", te: "రసీదు చూడండి" } }] },
    texts: {
      en: lines("Dear {guardian_name}, thank you. We have received your payment.", "", "👤 *{student_name}* of {class}", "💰 Amount: *{paid_amount}*", "💳 Paid by: *{payment_mode}*", "📅 Paid on: *{payment_date}*", "🧾 Receipt no.: *{receipt_number}*", "⏳ Still due: *{balance_due}*", "", "Please keep this message for your records.", "{receipt_link}"),
      hi: lines("नमस्ते {guardian_name} जी, धन्यवाद। हमें आपका भुगतान मिल गया है।", "", "👤 *{student_name}*, कक्षा {class}", "💰 राशि: *{paid_amount}*", "💳 भुगतान का तरीका: *{payment_mode}*", "📅 भुगतान की तारीख़: *{payment_date}*", "🧾 रसीद नंबर: *{receipt_number}*", "⏳ बाकी राशि: *{balance_due}*", "", "कृपया यह संदेश अपने रिकॉर्ड के लिए रखें।", "{receipt_link}"),
      te: lines("నమస్కారం {guardian_name} గారు, ధన్యవాదాలు. మీ చెల్లింపు మాకు అందింది.", "", "👤 *{student_name}*, తరగతి {class}", "💰 మొత్తం: *{paid_amount}*", "💳 చెల్లింపు విధానం: *{payment_mode}*", "📅 చెల్లించిన తేదీ: *{payment_date}*", "🧾 రసీదు నంబర్: *{receipt_number}*", "⏳ ఇంకా చెల్లించాల్సింది: *{balance_due}*", "", "దయచేసి ఈ సందేశాన్ని మీ రికార్డుల కోసం ఉంచుకోండి.", "{receipt_link}"),
    } },
  { key: "exam-reminder", name: "Exam reminder", category: "exam",
    card: { header: { en: "✏️ Exams start soon", hi: "✏️ परीक्षा जल्द", te: "✏️ పరీక్షలు త్వరలో" }, buttons: [parentLink({ en: "See timetable", hi: "टाइम टेबल देखें", te: "టైమ్ టేబుల్ చూడండి" })] },
    texts: {
      en: lines("Dear {guardian_name}, exams are coming up for your child.", "", "👤 *{student_name}* of {class}", "📝 Exam: *{exam_name}*", "📅 Starts on: *{date}*", "", "The full timetable is on your Parent Link. All the best!", "{parent_link}"),
      hi: lines("नमस्ते {guardian_name} जी, आपके बच्चे की परीक्षाएँ जल्द शुरू हो रही हैं।", "", "👤 *{student_name}*, कक्षा {class}", "📝 परीक्षा: *{exam_name}*", "📅 शुरू: *{date}*", "", "पूरा टाइम टेबल आपके Parent Link पर है। शुभकामनाएँ!", "{parent_link}"),
      te: lines("నమస్కారం {guardian_name} గారు, మీ బిడ్డ పరీక్షలు త్వరలో మొదలవుతున్నాయి.", "", "👤 *{student_name}*, తరగతి {class}", "📝 పరీక్ష: *{exam_name}*", "📅 మొదలు: *{date}*", "", "పూర్తి టైమ్ టేబుల్ మీ Parent Link లో ఉంది. శుభాకాంక్షలు!", "{parent_link}"),
    } },
  { key: "result", name: "Results published", category: "exam",
    card: { header: { en: "📊 Results are out", hi: "📊 परिणाम आ गए", te: "📊 ఫలితాలు వచ్చాయి" }, buttons: [parentLink({ en: "See results", hi: "परिणाम देखें", te: "ఫలితాలు చూడండి" })] },
    texts: {
      en: lines("Dear {guardian_name}, the exam results are ready.", "", "👤 *{student_name}* of {class}", "📝 Exam: *{exam_name}*", "", "Open your Parent Link to see the full report card.", "{parent_link}"),
      hi: lines("नमस्ते {guardian_name} जी, परीक्षा के परिणाम तैयार हैं।", "", "👤 *{student_name}*, कक्षा {class}", "📝 परीक्षा: *{exam_name}*", "", "पूरा रिपोर्ट कार्ड देखने के लिए अपना Parent Link खोलें।", "{parent_link}"),
      te: lines("నమస్కారం {guardian_name} గారు, పరీక్ష ఫలితాలు సిద్ధంగా ఉన్నాయి.", "", "👤 *{student_name}*, తరగతి {class}", "📝 పరీక్ష: *{exam_name}*", "", "పూర్తి రిపోర్ట్ కార్డ్ కోసం మీ Parent Link తెరవండి.", "{parent_link}"),
    } },
  { key: "ptm", name: "PTM reminder", category: "events",
    card: { header: { en: "📅 Parent-teacher meeting", hi: "📅 अभिभावक-शिक्षक बैठक", te: "📅 తల్లిదండ్రుల సమావేశం" }, buttons: [parentLink(OPEN_PL)] },
    texts: {
      en: lines("Dear {guardian_name}, you are warmly invited to the parent-teacher meeting of *{class}*.", "", "📅 Date: *{date}*", "", "Come and hear how your child is doing. We look forward to meeting you.", "{parent_link}"),
      hi: lines("नमस्ते {guardian_name} जी, *{class}* की अभिभावक-शिक्षक बैठक में आपका स्वागत है।", "", "📅 तारीख़: *{date}*", "", "आइए, जानिए आपका बच्चा कैसा कर रहा है। आपसे मिलने का इंतज़ार रहेगा।", "{parent_link}"),
      te: lines("నమస్కారం {guardian_name} గారు, *{class}* తల్లిదండ్రులు-ఉపాధ్యాయుల సమావేశానికి మిమ్మల్ని ఆహ్వానిస్తున్నాము.", "", "📅 తేదీ: *{date}*", "", "మీ బిడ్డ చదువు ఎలా ఉందో తెలుసుకోవడానికి తప్పకుండా రండి.", "{parent_link}"),
    } },
  // Bus messages: one blank per fact (src/lib/transport/messages.ts fills them).
  { key: "bus-pickup", name: "Picked up by the bus", category: "transport",
    card: { header: { en: "🚌 On the bus", hi: "🚌 बस में बैठ गए", te: "🚌 బస్సు ఎక్కారు" }, buttons: [CALL] },
    texts: {
      en: lines("Dear {guardian_name}, your child is on the school bus.", "", "👤 *{student_name}*", "🚌 Bus: *{bus}*", "⏰ Boarded at: *{time}*", "", "Sent automatically by the school transport team."),
      hi: lines("नमस्ते {guardian_name} जी, आपका बच्चा स्कूल बस में है।", "", "👤 *{student_name}*", "🚌 बस: *{bus}*", "⏰ बैठने का समय: *{time}*", "", "यह संदेश स्कूल परिवहन टीम ने अपने-आप भेजा है।"),
      te: lines("నమస్కారం {guardian_name} గారు, మీ బిడ్డ స్కూల్ బస్సు ఎక్కారు.", "", "👤 *{student_name}*", "🚌 బస్సు: *{bus}*", "⏰ ఎక్కిన సమయం: *{time}*", "", "ఈ సందేశం స్కూల్ రవాణా విభాగం నుండి ఆటోమేటిక్‌గా వచ్చింది."),
    } },
  { key: "bus-drop", name: "Dropped by the bus", category: "transport",
    card: { header: { en: "🚌 Off the bus safely", hi: "🚌 बस से उतर गए", te: "🚌 బస్సు దిగారు" }, buttons: [CALL] },
    texts: {
      en: lines("Dear {guardian_name}, your child got off the school bus safely.", "", "👤 *{student_name}*", "📍 At: *{place}*", "⏰ Time: *{time}*", "", "Sent automatically by the school transport team."),
      hi: lines("नमस्ते {guardian_name} जी, आपका बच्चा स्कूल बस से सुरक्षित उतर गया है।", "", "👤 *{student_name}*", "📍 जगह: *{place}*", "⏰ समय: *{time}*", "", "यह संदेश स्कूल परिवहन टीम ने अपने-आप भेजा है।"),
      te: lines("నమస్కారం {guardian_name} గారు, మీ బిడ్డ స్కూల్ బస్సు నుండి క్షేమంగా దిగారు.", "", "👤 *{student_name}*", "📍 చోటు: *{place}*", "⏰ సమయం: *{time}*", "", "ఈ సందేశం స్కూల్ రవాణా విభాగం నుండి ఆటోమేటిక్‌గా వచ్చింది."),
    } },
  { key: "bus-arriving", name: "Bus arriving", category: "transport",
    card: { header: { en: "🚌 Bus arriving soon", hi: "🚌 बस आने वाली है", te: "🚌 బస్సు దగ్గరలో ఉంది" }, buttons: [CALL] },
    texts: {
      en: lines("Dear {guardian_name}, the school bus will reach your stop soon.", "", "🚌 Bus: *{bus}*, route {route}", "📍 Stop: *{stop}*", "⏰ In about *{minutes}* minutes", "", "Please be at the stop on time."),
      hi: lines("नमस्ते {guardian_name} जी, स्कूल बस जल्द ही आपके स्टॉप पर पहुँचेगी।", "", "🚌 बस: *{bus}*, रूट {route}", "📍 स्टॉप: *{stop}*", "⏰ लगभग *{minutes}* मिनट में", "", "कृपया समय पर स्टॉप पर पहुँचें।"),
      te: lines("నమస్కారం {guardian_name} గారు, స్కూల్ బస్సు త్వరలో మీ స్టాప్‌కు చేరుకుంటుంది.", "", "🚌 బస్సు: *{bus}*, రూట్ {route}", "📍 స్టాప్: *{stop}*", "⏰ సుమారు *{minutes}* నిమిషాల్లో", "", "దయచేసి సమయానికి స్టాప్ వద్ద ఉండండి."),
    } },
  { key: "homework-set", name: "Homework set", category: "homework",
    card: { header: { en: "📚 New homework", hi: "📚 नया होमवर्क", te: "📚 కొత్త హోంవర్క్" }, buttons: [parentLink(HOMEWORK)] },
    texts: {
      en: lines("Dear {guardian_name}, new homework has been set for *{class}*.", "", "📖 Homework: {message}", "", "Please help your child finish it on time.", "{parent_link}"),
      hi: lines("नमस्ते {guardian_name} जी, *{class}* के लिए नया होमवर्क दिया गया है।", "", "📖 होमवर्क: {message}", "", "कृपया बच्चे को इसे समय पर पूरा करने में मदद करें।", "{parent_link}"),
      te: lines("నమస్కారం {guardian_name} గారు, *{class}* కి కొత్త హోంవర్క్ ఇచ్చారు.", "", "📖 హోంవర్క్: {message}", "", "సమయానికి పూర్తి చేయడానికి మీ బిడ్డకు సహాయం చేయండి.", "{parent_link}"),
    } },
  { key: "homework-pending", name: "Homework pending", category: "homework",
    card: { header: { en: "📚 Homework pending", hi: "📚 होमवर्क बाकी", te: "📚 హోంవర్క్ పెండింగ్" }, buttons: [parentLink(HOMEWORK)] },
    texts: {
      en: lines("Dear {guardian_name}, some homework is not submitted yet.", "", "👤 *{student_name}*", "📅 Was due on: *{date}*", "", "Please help your child finish it soon. Thank you.", "{parent_link}"),
      hi: lines("नमस्ते {guardian_name} जी, एक होमवर्क अभी तक जमा नहीं हुआ है।", "", "👤 *{student_name}*", "📅 जमा करने की तारीख़: *{date}*", "", "कृपया बच्चे को इसे जल्द पूरा करने में मदद करें। धन्यवाद।", "{parent_link}"),
      te: lines("నమస్కారం {guardian_name} గారు, ఒక హోంవర్క్ ఇంకా సమర్పించలేదు.", "", "👤 *{student_name}*", "📅 ఇవ్వాల్సిన తేదీ: *{date}*", "", "త్వరగా పూర్తి చేయడానికి మీ బిడ్డకు సహాయం చేయండి. ధన్యవాదాలు.", "{parent_link}"),
    } },
  // Wishes are not a transaction: Meta classes them as Marketing, so they are sent for approval as Marketing.
  { key: "birthday-student", name: "Birthday wishes (student)", category: "general",
    card: { header: BIRTHDAY, category: "MARKETING" },
    texts: {
      en: lines("Dear {student_name}, wishing you a very happy birthday! 🎉", "", "May this year bring you lots of learning, fun and good health.", "", "With love from all your teachers."),
      hi: lines("प्रिय {student_name}, जन्मदिन की बहुत-बहुत शुभकामनाएँ! 🎉", "", "यह साल आपके लिए ढेर सारी सीख, खुशियाँ और अच्छी सेहत लेकर आए।", "", "आपके सभी शिक्षकों की ओर से ढेर सारा प्यार।"),
      te: lines("ప్రియమైన {student_name}, పుట్టినరోజు శుభాకాంక్షలు! 🎉", "", "ఈ సంవత్సరం మీకు చదువు, ఆనందం, మంచి ఆరోగ్యం నిండుగా ఉండాలని కోరుకుంటున్నాము.", "", "మీ ఉపాధ్యాయులందరి తరఫున ప్రేమతో."),
    } },
  { key: "birthday-staff", name: "Birthday wishes (staff)", category: "staff",
    card: { header: BIRTHDAY, category: "MARKETING" },
    texts: {
      en: lines("Dear {staff_name}, wishing you a very happy birthday! 🎉", "", "Thank you for all you do for our students. Have a lovely day and a great year ahead."),
      hi: lines("प्रिय {staff_name} जी, जन्मदिन की हार्दिक शुभकामनाएँ! 🎉", "", "विद्यार्थियों के लिए आप जो कुछ करते हैं, उसके लिए धन्यवाद। आपका दिन और आने वाला साल शानदार हो।"),
      te: lines("ప్రియమైన {staff_name} గారు, పుట్టినరోజు శుభాకాంక్షలు! 🎉", "", "విద్యార్థుల కోసం మీరు చేస్తున్న అన్నిటికీ ధన్యవాదాలు. ఈ రోజు, ఈ సంవత్సరం మీకు ఆనందంగా గడవాలి."),
    } },
  // New on WhatsApp (it was in the app only); the button opens the staff member's own slips.
  { key: "salary-slip", name: "Salary slip ready", category: "staff",
    card: { header: { en: "💼 Salary slip ready", hi: "💼 वेतन पर्ची तैयार", te: "💼 జీతం స్లిప్ సిద్ధం" }, buttons: [{ type: "URL", path: "/salary-management/slips?mine=1", text: { en: "See salary slip", hi: "वेतन पर्ची देखें", te: "జీతం స్లిప్ చూడండి" } }] },
    texts: {
      en: lines("Dear {staff_name}, your salary slip for *{month}* is ready.", "", "Tap the button below to see and download it in School OS."),
      hi: lines("नमस्ते {staff_name} जी, *{month}* की आपकी वेतन पर्ची तैयार है।", "", "देखने और डाउनलोड करने के लिए नीचे दिया बटन दबाएँ।"),
      te: lines("నమస్కారం {staff_name} గారు, *{month}* నెల మీ జీతం స్లిప్ సిద్ధంగా ఉంది.", "", "చూడటానికి, డౌన్‌లోడ్ చేయడానికి కింది బటన్ నొక్కండి."),
    } },
  { key: "admission-welcome", name: "Admission welcome", category: "admission",
    card: { header: { en: "🎉 Welcome to school", hi: "🎉 स्कूल में स्वागत है", te: "🎉 పాఠశాలకు స్వాగతం" }, buttons: [CALL] },
    texts: {
      en: lines("Dear {guardian_name}, welcome! We are happy to confirm your child's admission.", "", "👤 *{student_name}* of {class}", "🆔 Admission no.: *{admission_no}*", "", "Please keep this number safe. We look forward to a wonderful year together."),
      hi: lines("नमस्ते {guardian_name} जी, स्वागत है! आपके बच्चे का दाख़िला पक्का हो गया है।", "", "👤 *{student_name}*, कक्षा {class}", "🆔 दाख़िला नंबर: *{admission_no}*", "", "कृपया यह नंबर संभालकर रखें। साथ मिलकर एक शानदार साल की प्रतीक्षा है।"),
      te: lines("నమస్కారం {guardian_name} గారు, స్వాగతం! మీ బిడ్డ అడ్మిషన్ ఖరారైంది.", "", "👤 *{student_name}*, తరగతి {class}", "🆔 అడ్మిషన్ నంబర్: *{admission_no}*", "", "ఈ నంబర్‌ను జాగ్రత్తగా ఉంచుకోండి. కలిసి ఒక చక్కని సంవత్సరం కోసం ఎదురుచూస్తున్నాము."),
    } },
  // The long link leaves the words: it is the button.
  { key: "parent-link", name: "Parent Link", category: "parent-link",
    card: { header: { en: "🔑 Your Parent Link", hi: "🔑 आपका Parent Link", te: "🔑 మీ Parent Link" }, buttons: [parentLink(OPEN_PL, "link")] },
    texts: {
      en: lines("Dear {guardian_name}, here is your own Parent Link from the school.", "", "See fees, attendance, homework and notices for your children, all in one place.", "", "🔒 This link is only for you. Please do not share it.", "{link}"),
      hi: lines("नमस्ते {guardian_name} जी, स्कूल की ओर से यह आपका अपना Parent Link है।", "", "अपने बच्चों की फ़ीस, हाज़िरी, होमवर्क और सूचनाएँ एक ही जगह देखें।", "", "🔒 यह लिंक सिर्फ़ आपके लिए है। कृपया इसे किसी से साझा न करें।", "{link}"),
      te: lines("నమస్కారం {guardian_name} గారు, పాఠశాల నుండి ఇది మీ సొంత Parent Link.", "", "మీ పిల్లల ఫీజు, హాజరు, హోంవర్క్, నోటీసులు అన్నీ ఒకే చోట చూడండి.", "", "🔒 ఈ లింక్ మీకు మాత్రమే. దయచేసి ఎవరితోనూ పంచుకోవద్దు.", "{link}"),
    } },
  // No "I agree" button on purpose: consent is given on the Parent Link, after reading, where it is recorded.
  { key: "consent-request", name: "Consent request", category: "parent-link",
    card: { header: { en: "✍️ Consent needed", hi: "✍️ आपकी सहमति चाहिए", te: "✍️ మీ అనుమతి కావాలి" }, buttons: [parentLink({ en: "Read and answer", hi: "पढ़ें और जवाब दें", te: "చదివి సమాధానం ఇవ్వండి" })] },
    texts: {
      en: lines("Dear {guardian_name}, the school needs your consent for the item below.", "", "📄 *{title}*", "", "Please read the details on your Parent Link and give your answer there.", "{parent_link}"),
      hi: lines("नमस्ते {guardian_name} जी, स्कूल को नीचे दिए विषय पर आपकी सहमति चाहिए।", "", "📄 *{title}*", "", "कृपया अपने Parent Link पर पूरी जानकारी पढ़कर अपना जवाब दें।", "{parent_link}"),
      te: lines("నమస్కారం {guardian_name} గారు, కింది విషయానికి పాఠశాలకు మీ అనుమతి కావాలి.", "", "📄 *{title}*", "", "దయచేసి మీ Parent Link లో వివరాలు చదివి మీ సమాధానం ఇవ్వండి.", "{parent_link}"),
    } },
  { key: "query-number", name: "Query received", category: "queries",
    card: { header: { en: "🎫 Query received", hi: "🎫 सवाल दर्ज हुआ", te: "🎫 మీ ప్రశ్న అందింది" } },
    texts: {
      en: lines("Dear {guardian_name}, thank you for writing to us. We have noted your query.", "", "🎫 Ticket no.: *{ticket_number}*", "📝 About: {message}", "", "We will get back to you soon."),
      hi: lines("नमस्ते {guardian_name} जी, हमसे संपर्क करने के लिए धन्यवाद। आपका सवाल दर्ज कर लिया गया है।", "", "🎫 टिकट नंबर: *{ticket_number}*", "📝 विषय: {message}", "", "हम जल्द ही आपसे संपर्क करेंगे।"),
      te: lines("నమస్కారం {guardian_name} గారు, మమ్మల్ని సంప్రదించినందుకు ధన్యవాదాలు. మీ ప్రశ్నను నమోదు చేశాము.", "", "🎫 టికెట్ నంబర్: *{ticket_number}*", "📝 విషయం: {message}", "", "త్వరలో మీకు సమాధానం ఇస్తాము."),
    } },
  // The three answer buttons are phase 2 (a tap cannot be received yet): until then the parent replies with a number.
  { key: "query-rating", name: "Query rating request", category: "queries",
    card: { header: { en: "⭐ How did we do?", hi: "⭐ हमारी मदद कैसी रही", te: "⭐ మా సహాయం ఎలా ఉంది" } },
    texts: {
      en: lines("Dear {guardian_name}, your query is now closed.", "", "🎫 Ticket no.: *{ticket_number}*", "", "How happy are you with our help? Please reply with a number from 1 (not happy) to 5 (very happy)."),
      hi: lines("नमस्ते {guardian_name} जी, आपका सवाल अब बंद कर दिया गया है।", "", "🎫 टिकट नंबर: *{ticket_number}*", "", "हमारी मदद से आप कितने खुश हैं? कृपया 1 (खुश नहीं) से 5 (बहुत खुश) तक कोई एक नंबर लिखकर भेजें।"),
      te: lines("నమస్కారం {guardian_name} గారు, మీ ప్రశ్న ఇప్పుడు పరిష్కరించబడింది.", "", "🎫 టికెట్ నంబర్: *{ticket_number}*", "", "మా సహాయంతో మీరు ఎంత సంతోషంగా ఉన్నారు? దయచేసి 1 (సంతోషంగా లేదు) నుండి 5 (చాలా సంతోషం) వరకు ఒక నంబర్ పంపండి."),
    } },
  // No "password", "sign in", "account" or link in the words: Meta rejected those as not Utility twice (live tests 15 Nov 2026).
  // The invite link is only the button (its secret is the end of the address).
  { key: "staff-invite", name: "Staff invite", category: "staff",
    card: { header: { en: "👋 Welcome to School OS", hi: "👋 School OS में स्वागत", te: "👋 School OS కు స్వాగతం" }, buttons: [{ type: "URL", target: "invite", blank: "link", text: { en: "Open School OS", hi: "School OS खोलें", te: "School OS తెరవండి" } }] },
    texts: {
      en: lines("Dear {staff_name}, the school has added you to School OS, the app it uses for its daily work.", "", "Tap the button below to start.", "", "🔒 The button works once, for 7 days. Please do not share this message.", "{link}"),
      hi: lines("नमस्ते {staff_name} जी, स्कूल ने आपको School OS में जोड़ा है, जिसे स्कूल अपने रोज़ के काम के लिए इस्तेमाल करता है।", "", "शुरू करने के लिए नीचे दिया बटन दबाएँ।", "", "🔒 यह बटन सिर्फ़ एक बार, 7 दिनों तक चलेगा। कृपया यह संदेश किसी से साझा न करें।", "{link}"),
      te: lines("నమస్కారం {staff_name} గారు, పాఠశాల రోజువారీ పనుల కోసం ఉపయోగించే School OS లో మిమ్మల్ని చేర్చారు.", "", "మొదలుపెట్టడానికి కింది బటన్ నొక్కండి.", "", "🔒 ఈ బటన్ ఒక్కసారి మాత్రమే, 7 రోజుల వరకు పనిచేస్తుంది. దయచేసి ఈ సందేశాన్ని ఎవరితోనూ పంచుకోవద్దు.", "{link}"),
    } },
  { key: "staff-message", name: "Message to staff", category: "staff",
    card: { header: FROM_SCHOOL },
    texts: {
      en: lines("Dear {staff_name}, here is a message from the school office.", "", "💬 {message}", "", "Please contact the office if you have any questions."),
      hi: lines("नमस्ते {staff_name} जी, स्कूल ऑफ़िस की ओर से एक संदेश है।", "", "💬 {message}", "", "कोई सवाल हो तो कृपया ऑफ़िस से संपर्क करें।"),
      te: lines("నమస్కారం {staff_name} గారు, స్కూల్ ఆఫీసు నుండి ఒక సందేశం.", "", "💬 {message}", "", "ఏవైనా సందేహాలు ఉంటే దయచేసి ఆఫీసును సంప్రదించండి."),
    } },
  { key: "behaviour-note", name: "Behaviour note", category: "general",
    card: { header: { en: "📋 Note from school", hi: "📋 शिक्षक की टिप्पणी", te: "📋 ఉపాధ్యాయుల గమనిక" }, buttons: [CALL] },
    texts: {
      en: lines("Dear {guardian_name}, the class teacher would like to share a note about your child.", "", "👤 *{student_name}* of {class}", "📝 Note: *{title}*", "📅 Date: *{date}*", "", "To talk about it, please call the school. Thank you."),
      hi: lines("नमस्ते {guardian_name} जी, कक्षा शिक्षक आपके बच्चे के बारे में एक बात साझा करना चाहते हैं।", "", "👤 *{student_name}*, कक्षा {class}", "📝 टिप्पणी: *{title}*", "📅 तारीख़: *{date}*", "", "इस बारे में बात करने के लिए कृपया स्कूल को फ़ोन करें। धन्यवाद।"),
      te: lines("నమస్కారం {guardian_name} గారు, క్లాస్ టీచర్ మీ బిడ్డ గురించి ఒక విషయం మీతో పంచుకోవాలనుకుంటున్నారు.", "", "👤 *{student_name}*, తరగతి {class}", "📝 గమనిక: *{title}*", "📅 తేదీ: *{date}*", "", "దీని గురించి మాట్లాడాలంటే దయచేసి పాఠశాలకు కాల్ చేయండి. ధన్యవాదాలు."),
    } },
  { key: "notice", name: "New notice", category: "general",
    card: { header: { en: "📢 New notice", hi: "📢 नई सूचना", te: "📢 కొత్త నోటీసు" }, buttons: [parentLink({ en: "Read the notice", hi: "सूचना पढ़ें", te: "నోటీసు చదవండి" })] },
    texts: {
      en: lines("Dear Parent, there is a new notice from the school.", "", "📌 *{title}*", "Details: {message}", "", "You can read the full notice on your Parent Link.", "{parent_link}"),
      hi: lines("नमस्ते, स्कूल की ओर से एक नई सूचना है।", "", "📌 *{title}*", "विवरण: {message}", "", "पूरी सूचना आप अपने Parent Link पर पढ़ सकते हैं।", "{parent_link}"),
      te: lines("నమస్కారం, పాఠశాల నుండి కొత్త నోటీసు వచ్చింది.", "", "📌 *{title}*", "వివరాలు: {message}", "", "పూర్తి నోటీసు మీ Parent Link లో చదవవచ్చు.", "{parent_link}"),
    } },
  // The carrier of typed messages to parents. Meta reviews these words, not what is typed into {message}: never offers.
  { key: "general", name: "General announcement", category: "general",
    card: { header: FROM_SCHOOL, buttons: [CALL] },
    texts: {
      en: lines("Dear {guardian_name}, here is a message from the school.", "", "💬 {message}", "", "Please call the school office if you have any questions."),
      hi: lines("नमस्ते {guardian_name} जी, स्कूल की ओर से एक संदेश है।", "", "💬 {message}", "", "कोई सवाल हो तो कृपया स्कूल ऑफ़िस को फ़ोन करें।"),
      te: lines("నమస్కారం {guardian_name} గారు, పాఠశాల నుండి ఒక సందేశం.", "", "💬 {message}", "", "ఏవైనా సందేహాలు ఉంటే దయచేసి స్కూల్ ఆఫీసుకు కాల్ చేయండి."),
    } },
  // Front Office messages to visitors (src/lib/front-office/notify.ts). They went as plain text, which WhatsApp
  // drops outside a 24-hour reply window (live test 15 Nov 2026). The desk's own sentence fills {message}.
  { key: "appointment-confirmed", name: "Appointment confirmation", category: "front-office",
    card: { header: { en: "📅 Appointment confirmed" }, buttons: [CALL] },
    texts: { en: lines("Dear {visitor_name}, your appointment at the school is confirmed.", "", "📅 {message}", "", "Please show this message at the front desk when you arrive.") } },
  { key: "appointment-reminder", name: "Appointment reminder", category: "front-office",
    card: { header: { en: "⏰ Appointment reminder" }, buttons: [CALL] },
    texts: { en: lines("Dear {visitor_name}, this is a reminder of your appointment at the school.", "", "📅 {message}", "", "Please show this message at the front desk when you arrive.") } },
  { key: "appointment-cancelled", name: "Appointment cancelled", category: "front-office",
    card: { header: { en: "❌ Appointment cancelled" }, buttons: [CALL] },
    texts: { en: lines("Dear {visitor_name}, your appointment at the school has been cancelled.", "", "📅 {message}", "", "Please call the school to choose a new time.") } },
  { key: "visitor-pass", name: "Visitor pass", category: "front-office",
    card: { header: { en: "🎫 Visitor pass" } },
    texts: { en: lines("Dear {visitor_name}, here is your visitor pass for the school.", "", "🎫 {message}", "", "Please show this message at the gate.") } },
  { key: "walk-in-number", name: "Walk-in request number", category: "front-office",
    card: { header: { en: "🎫 Request received" } },
    texts: { en: lines("Dear {visitor_name}, thank you for visiting the school. We have noted your request.", "", "🎫 {message}", "", "We will get back to you soon.") } },
  { key: "gate-pass", name: "Pickup gate pass", category: "front-office",
    card: { header: { en: "🚸 Pickup gate pass" } },
    texts: { en: lines("Dear {visitor_name}, here is the gate pass for your child.", "", "🎫 {message}", "", "Please show this message at the gate.") } },
  // The WhatsApp test from Settings (src/lib/messaging/channel-admin.ts): a template always arrives, plain text only within 24 hours.
  { key: "connection-test", name: "WhatsApp connection test", category: "general",
    card: { header: { en: "✅ WhatsApp is working" } },
    texts: { en: lines("Hello {staff_name}, this is a test message from School OS for your school.", "", "If you can read this, WhatsApp messages from the school are reaching phones.", "", "No reply is needed.") } },
];

/** The ready card of a key in a language (English words where that language has none), or null. */
export function readyCard(key: string | null, language: string): WhatsappCard | null {
  const t = key ? READY_WHATSAPP.find((x) => x.key === key) : null;
  if (!t) return null;
  const say = (w: Words) => w[language] ?? w.en;
  // Headers carry no emoji: WhatsApp refuses them (live test 16 Nov). The emoji in the header words below is dropped.
  const head = (w: Words) => headerWithoutEmoji(say(w));
  const c = t.card;
  const header: CardHeader | null = c.document ? { type: "document", source: c.document, ...(c.header ? { text: head(c.header) } : {}) } : c.header ? { type: "text", text: head(c.header) } : null;
  const buttons: CardButton[] = (c.buttons ?? []).map((b) => (b.type === "PHONE" ? { type: "PHONE", text: say(b.text) } : "target" in b ? { type: "URL", text: say(b.text), target: b.target, blank: b.blank } : { type: "URL", text: say(b.text), path: b.path }));
  return { header, buttons, ...(c.category ? { category: c.category } : {}) };
}
