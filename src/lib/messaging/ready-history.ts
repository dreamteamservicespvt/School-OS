// The words School OS gave its ready WhatsApp templates before (from the history of
// READY_TEMPLATES in ./templates.ts), by "<key>|<language>". Most end with
// "- {school_name}", which WhatsApp (Meta) refuses, so a school that still has one
// of these, never approved by WhatsApp, can take today's ready words with one click
// (Message Templates, "Make ready for WhatsApp"; src/lib/communication/whatsapp-ready.ts).
// Only words exactly as School OS wrote them count: a text the school changed is the
// school's own and is never replaced. When a ready WhatsApp text changes, add its old
// words here (tests/communication/whatsapp-make-ready.test.ts checks every entry).
export const PAST_READY_WHATSAPP: Readonly<Record<string, readonly string[]>> = {
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
