// The words School OS gave its ready WhatsApp templates before (from the history of
// READY_TEMPLATES in ./templates.ts), by "<key>|<language>". Most end with
// "- {school_name}", which WhatsApp (Meta) refuses, so a school that still has one
// of these, never approved by WhatsApp, can take today's ready words with one click
// (Message Templates, "Make ready for WhatsApp"; src/lib/communication/whatsapp-ready.ts).
// Only words exactly as School OS wrote them count: a text the school changed is the
// school's own and is never replaced. When a ready WhatsApp text changes, add its old
// words here (tests/communication/whatsapp-make-ready.test.ts checks every entry).
const EARLIER: Readonly<Record<string, readonly string[]>> = {
  "absence|en": [
    "Dear {guardian_name}, {student_name} ({class}) is absent from school today, {date}. If this is not expected, please call the school on {school_phone}. - {school_name}",
  ],
  "absence|hi": [
    "प्रिय {guardian_name}, {student_name} ({class}) आज {date} को स्कूल में अनुपस्थित है। कृपया {school_phone} पर स्कूल से संपर्क करें। - {school_name}",
  ],
  "absence|te": [
    "ప్రియమైన {guardian_name}, {student_name} ({class}) ఈరోజు {date} పాఠశాలకు హాజరు కాలేదు. దయచేసి {school_phone} కు కాల్ చేయండి. - {school_name}",
  ],
  "late|en": [
    "Dear {guardian_name}, {student_name} ({class}) reached school late today, {date}. - {school_name}",
  ],
  "fee-due|en": [
    "Dear {guardian_name}, a fee of {due_amount} for {student_name} ({class}) is due on {due_date}.\n{how_to_pay}\nPlease ignore if already paid. - {school_name}",
    "Dear {guardian_name}, a fee of {due_amount} for {student_name} ({class}) is due on {due_date}. The details are on your Parent Link. Please ignore if already paid. - {school_name}",
    "Dear {guardian_name}, a fee of {due_amount} for {student_name} ({class}) is due on {due_date}. You can pay on your Parent Link. Please ignore if already paid. - {school_name}",
  ],
  "fee-due|te": [
    "ప్రియమైన {guardian_name}, {student_name} ({class}) ఫీజు {due_amount} {due_date} లోపు చెల్లించాలి.\n{how_to_pay}\n- {school_name}",
    "ప్రియమైన {guardian_name}, {student_name} ({class}) ఫీజు {due_amount} {due_date} లోపు చెల్లించాలి. వివరాలు మీ Parent Link లో ఉన్నాయి. - {school_name}",
    "ప్రియమైన {guardian_name}, {student_name} ({class}) ఫీజు {due_amount} {due_date} లోపు చెల్లించాలి. మీ Parent Link లో చెల్లించవచ్చు. - {school_name}",
  ],
  "fee-paid|en": [
    "Dear {guardian_name}, we have received {paid_amount} for {student_name} on {payment_date}. Receipt number {receipt_number}. Thank you. - {school_name}\nOpen your receipt: {receipt_link}",
    "Dear {guardian_name}, we have received {paid_amount} for {student_name} on {payment_date}. Receipt number {receipt_number}. Thank you. - {school_name}",
  ],
  "exam-reminder|en": [
    "Dear {guardian_name}, {exam_name} for {student_name} ({class}) starts on {date}. The datesheet is on your Parent Link. - {school_name}",
    // Before {parent_link} (owner's phone test 15 Nov 2026: "on your Parent Link" came with no link).
    "Dear {guardian_name}, {exam_name} for {student_name} of {class} starts on {date}. The datesheet is on your Parent Link; please check it. All the best from the {school_name} team!",
  ],
  "result|en": [
    "Dear {guardian_name}, the results of {exam_name} for {student_name} are ready. See the report card on your Parent Link. - {school_name}",
    "Dear {guardian_name}, the results of {exam_name} for {student_name} are ready. See the report card on your Parent Link. Thank you, {school_name} team.",
  ],
  "ptm|en": [
    "Dear {guardian_name}, the parent-teacher meeting for {class} is on {date}. Please attend. - {school_name}",
  ],
  "bus-pickup|en": [
    "Dear {guardian_name}, {message} - {school_name}",
  ],
  "bus-drop|en": [
    "Dear {guardian_name}, {message} - {school_name}",
  ],
  "bus-arriving|en": [
    "Dear {guardian_name}, {message} - {school_name}",
  ],
  "homework-set|en": [
    "Dear {guardian_name}, new homework for {class}: {message} - {school_name}",
  ],
  "homework-pending|en": [
    "Dear {guardian_name}, {student_name} has not yet submitted homework due on {date}. - {school_name}",
  ],
  "birthday-student|te": [
    "పుట్టినరోజు శుభాకాంక్షలు, {student_name}! {school_name} తరఫున మీకు శుభాకాంక్షలు.",
  ],
  "admission-welcome|en": [
    "Dear {guardian_name}, welcome to {school_name}! {student_name} is admitted to {class} with admission number {admission_no}.",
  ],
  // WhatsApp rejected these two on the live test school (15 Nov 2026).
  "parent-link|hi": [
    "प्रिय {guardian_name}, यह {school_name} से आपका निजी Parent Link है: {link} कृपया इसे किसी के साथ साझा न करें।",
  ],
  "staff-invite|en": [
    "Dear {staff_name}, you are invited to School OS at {school_name}. Open this link to choose your password: {link} It works once, for 7 days. Please do not share it.",
  ],
  "parent-link-code|en": [
    "{code} is your one-time code for Parent Link of {school_name}. It works for 10 minutes. Do not share it with anyone.",
  ],
  "consent-request|en": [
    "Dear {guardian_name}, {school_name} asks for your consent: {title}. Please open your Parent Link to read it and agree. - {school_name}",
    "Dear {guardian_name}, {school_name} asks for your consent: {title}. Please open your Parent Link to read it and agree. Thank you.",
  ],
  "query-number|en": [
    "Dear {guardian_name}, we have noted your {message}. Your ticket number is {ticket_number}. We will get back to you soon. - {school_name}",
  ],
  "query-rating|en": [
    "Dear {guardian_name}, your ticket {ticket_number} is closed. How happy are you with our help? Reply with a number from 1 (not happy) to 5 (very happy). - {school_name}",
  ],
  "staff-message|en": [
    "Dear {staff_name}, {message} - {school_name}",
  ],
  "behaviour-note|en": [
    "Dear {guardian_name}, this is to let you know about {student_name} ({class}): {title} on {date}. Please contact the class teacher if you would like to know more. - {school_name}",
  ],
  "notice|en": [
    "{school_name}: {title}. {message}",
    "Dear Parent, there is a new notice from {school_name}: {title}.\nDetails: {message}\nYou can also read this notice on your Parent Link.",
  ],
  "general|en": [
    "Dear {guardian_name}, {message} - {school_name}",
  ],
};

// The plain texts School OS gave its ready WhatsApp templates until the cards (15 Nov 2026).
const BEFORE_CARDS: Readonly<Record<string, readonly string[]>> = {
  "absence|en": [
    "Dear {guardian_name}, {student_name} of {class} is absent from school today, {date}. If this is not expected, please call {school_name} on {school_phone}. We hope all is well.",
  ],
  "absence|hi": [
    "प्रिय {guardian_name}, आज {date} को {student_name} स्कूल नहीं आए। अगर आपको इसकी जानकारी नहीं है, तो कृपया {school_name} को {school_phone} पर फ़ोन करें। धन्यवाद।",
  ],
  "absence|te": [
    "ప్రియమైన {guardian_name}, ఈరోజు {date} న {student_name} పాఠశాలకు హాజరు కాలేదు. ఇది మీకు తెలియకపోతే, దయచేసి {school_name} కు {school_phone} నంబరులో కాల్ చేయండి. ధన్యవాదాలు.",
  ],
  "late|en": [
    "Dear {guardian_name}, {student_name} of {class} reached school late today, {date}. Please help your child be on time tomorrow. Thank you, {school_name} team.",
  ],
  "fee-due|en": [
    "Dear {guardian_name}, a fee of {due_amount} for {student_name} of {class} is due on {due_date}. Here is how to pay:\n{how_to_pay}\nPlease ignore this message if you have already paid. Thank you, {school_name} office.",
  ],
  "fee-due|te": [
    "ప్రియమైన {guardian_name}, {student_name} యొక్క ఫీజు {due_amount} ను {due_date} లోపు చెల్లించాలి. ఎలా చెల్లించాలో ఇక్కడ ఉంది:\n{how_to_pay}\nఇప్పటికే చెల్లించి ఉంటే, ఈ సందేశాన్ని పట్టించుకోవద్దు. ధన్యవాదాలు, {school_name} కార్యాలయం.",
  ],
  "fee-paid|en": [
    "Dear {guardian_name}, {school_name} has received {paid_amount} for {student_name} on {payment_date}. Your receipt number is {receipt_number}. Thank you for your payment.\nOpen your receipt: {receipt_link}",
  ],
  "exam-reminder|en": [
    "Dear {guardian_name}, {exam_name} for {student_name} of {class} starts on {date}. Please see the datesheet on your Parent Link: {parent_link} All the best from the {school_name} team!",
  ],
  "exam-reminder|hi": [
    "प्रिय {guardian_name}, {class} के {student_name} की {exam_name} परीक्षा {date} को शुरू होगी। कृपया डेटशीट अपने Parent Link पर देखें: {parent_link} आपको {school_name} टीम की ओर से शुभकामनाएँ!",
  ],
  "exam-reminder|te": [
    "ప్రియమైన {guardian_name}, {class} లోని {student_name} కు {exam_name} పరీక్షలు {date} న ప్రారంభమవుతాయి. దయచేసి డేట్‌షీట్‌ను మీ Parent Link లో చూడండి: {parent_link} మీకు {school_name} బృందం తరఫున శుభాకాంక్షలు!",
  ],
  "result|en": [
    "Dear {guardian_name}, the results of {exam_name} for {student_name} are ready. See the report card on your Parent Link: {parent_link} Thank you, {school_name} team.",
  ],
  "result|hi": [
    "प्रिय {guardian_name}, {student_name} के {exam_name} के परिणाम आ गए हैं। रिपोर्ट कार्ड अपने Parent Link पर देखें: {parent_link} धन्यवाद, {school_name} टीम।",
  ],
  "result|te": [
    "ప్రియమైన {guardian_name}, {student_name} యొక్క {exam_name} ఫలితాలు వచ్చాయి. రిపోర్ట్ కార్డును మీ Parent Link లో చూడండి: {parent_link} ధన్యవాదాలు, {school_name} బృందం.",
  ],
  "ptm|en": [
    "Dear {guardian_name}, the parent-teacher meeting for {class} is on {date}. Please attend to hear how your child is doing. Thank you, {school_name} team.",
  ],
  "bus-pickup|en": [
    "Dear {guardian_name}, here is a bus update from {school_name}:\n{message}\nThis message was sent automatically by the school transport team.",
  ],
  "bus-drop|en": [
    "Dear {guardian_name}, here is a bus update from {school_name}:\n{message}\nThis message was sent automatically by the school transport team.",
  ],
  "bus-arriving|en": [
    "Dear {guardian_name}, here is a bus update from {school_name}:\n{message}\nThis message was sent automatically by the school transport team.",
  ],
  "homework-set|en": [
    "Dear {guardian_name}, new homework has been set for {class}:\n{message}\nPlease help your child finish it on time. Thank you, {school_name} team.",
  ],
  "homework-pending|en": [
    "Dear {guardian_name}, {student_name} has not yet submitted the homework due on {date}. Please help your child finish it soon. Thank you, {school_name} team.",
  ],
  "birthday-student|en": [
    "Happy birthday, {student_name}! Everyone at {school_name} wishes you a wonderful year ahead.",
  ],
  "birthday-student|te": [
    "ప్రియమైన {student_name}, పుట్టినరోజు శుభాకాంక్షలు! {school_name} తరఫున మీకు హృదయపూర్వక శుభాకాంక్షలు. ఈ సంవత్సరం మీకు ఆనందంగా గడవాలని కోరుకుంటున్నాము.",
  ],
  "birthday-staff|en": [
    "Happy birthday, {staff_name}! Thank you for all you do for {school_name}. Have a lovely day.",
  ],
  "admission-welcome|en": [
    "Dear {guardian_name}, welcome to {school_name}! We are happy to tell you that {student_name} is admitted to {class}. The admission number is {admission_no}; please keep it for your records.",
  ],
  "parent-link|en": [
    "Dear {guardian_name}, this is your personal Parent Link from {school_name}. See fees, attendance and notices for your children: {link} Please do not share it.",
  ],
  "parent-link|te": [
    "ప్రియమైన {guardian_name}, ఇది {school_name} నుండి మీ వ్యక్తిగత Parent Link: {link} దయచేసి ఎవరితోనూ పంచుకోవద్దు.",
  ],
  "parent-link|hi": [
    "प्रिय {guardian_name}, यह {school_name} से आपका निजी Parent Link है। इसमें अपने बच्चों की फीस, उपस्थिति और सूचनाएँ देखें: {link} कृपया इसे किसी के साथ साझा न करें।",
  ],
  "consent-request|en": [
    "Dear {guardian_name}, {school_name} asks for your consent: {title}. Please open your Parent Link to read it and agree: {parent_link} Thank you.",
  ],
  "consent-request|hi": [
    "प्रिय {guardian_name}, {school_name} आपकी सहमति माँग रहा है: {title}। कृपया इसे पढ़ने और सहमति देने के लिए अपना Parent Link खोलें: {parent_link} धन्यवाद।",
  ],
  "consent-request|te": [
    "ప్రియమైన {guardian_name}, {school_name} మీ అనుమతి కోరుతోంది: {title}. దయచేసి చదివి అంగీకరించడానికి మీ Parent Link తెరవండి: {parent_link} ధన్యవాదాలు.",
  ],
  "query-number|en": [
    "Dear {guardian_name}, we have noted your {message}. Your ticket number is {ticket_number}. We will get back to you soon. Thank you, {school_name} team.",
  ],
  "query-rating|en": [
    "Dear {guardian_name}, your ticket {ticket_number} is closed. How happy are you with our help? Reply with a number from 1 (not happy) to 5 (very happy). Thank you, {school_name} team.",
  ],
  "staff-invite|en": [
    "Dear {staff_name}, your School OS account at {school_name} is ready. Open it with this link: {link} The link works once, for 7 days. Please do not share it.",
  ],
  "staff-message|en": [
    "Dear {staff_name}, here is a message from {school_name}:\n{message}\nPlease contact the school office if you have any questions.",
  ],
  "behaviour-note|en": [
    "Dear {guardian_name}, this is to let you know about {student_name} of {class}: {title} on {date}. Please contact the class teacher if you would like to know more. Thank you, {school_name} team.",
  ],
  "notice|en": [
    "Dear Parent, there is a new notice from {school_name}: {title}.\nDetails: {message}\nYou can also read this notice on your Parent Link: {parent_link} Thank you.",
  ],
  "notice|hi": [
    "प्रिय अभिभावक, {school_name} की ओर से नई सूचना: {title}।\nविवरण: {message}\nआप यह सूचना अपने Parent Link पर भी पढ़ सकते हैं: {parent_link} धन्यवाद।",
  ],
  "notice|te": [
    "ప్రియమైన తల్లిదండ్రులకు, {school_name} నుండి కొత్త నోటీసు: {title}.\nవివరాలు: {message}\nఈ నోటీసును మీ Parent Link లో కూడా చదవవచ్చు: {parent_link} ధన్యవాదాలు.",
  ],
  "general|en": [
    "Dear {guardian_name}, here is a message from {school_name}:\n{message}\nPlease contact the school office if you have any questions.",
  ],
};

export const PAST_READY_WHATSAPP: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  [...new Set([...Object.keys(EARLIER), ...Object.keys(BEFORE_CARDS)])].map((k) => [k, [...(EARLIER[k] ?? []), ...(BEFORE_CARDS[k] ?? [])]]),
);
