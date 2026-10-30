-- The ready WhatsApp texts in words Meta accepts (HANDOFF 3a2).
--
-- Meta refused most ready WhatsApp texts: they ended with "- {school_name}"
-- ("Variables can't be at the start or end"; a full stop after the blank is
-- not enough), some put two blanks side by side ("{student_name} ({class})"),
-- and the short ones had too many blanks for their length. The ready texts in
-- src/lib/messaging/templates.ts are reworded so each passes whatsappProblems()
-- in src/lib/messaging/blanks.ts (tests/communication/whatsapp-ready.test.ts).
--
-- Schools made before this keep the templates they were given. Where such a
-- WhatsApp template still has the ready words exactly as School OS wrote them,
-- and was never sent to WhatsApp for approval, it gets a new version with the
-- new words; the old version stays on record and messages already sent keep
-- theirs. A template the school changed, or one WhatsApp already knows, is
-- left alone; Message Templates now says what to change before sending it for
-- approval. SMS texts are not changed: their words are registered on the DLT
-- portal. Running this again changes nothing more. Row-level security is
-- lifted for this change only, and put back straight after.
ALTER TABLE "template" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "template_version" NO FORCE ROW LEVEL SECURITY;

WITH words ("key", "language", "old_body", "new_body", "variables") AS (VALUES
  ('absence', 'en',
   E'Dear {guardian_name}, {student_name} ({class}) is absent from school today, {date}. If this is not expected, please call the school on {school_phone}. - {school_name}',
   E'Dear {guardian_name}, {student_name} of {class} is absent from school today, {date}. If this is not expected, please call {school_name} on {school_phone}. We hope all is well.',
   ARRAY['guardian_name', 'student_name', 'class', 'date', 'school_name', 'school_phone']::text[]),
  ('absence', 'hi',
   E'प्रिय {guardian_name}, {student_name} ({class}) आज {date} को स्कूल में अनुपस्थित है। कृपया {school_phone} पर स्कूल से संपर्क करें। - {school_name}',
   E'प्रिय {guardian_name}, आज {date} को {student_name} स्कूल नहीं आए। अगर आपको इसकी जानकारी नहीं है, तो कृपया {school_name} को {school_phone} पर फ़ोन करें। धन्यवाद।',
   ARRAY['guardian_name', 'date', 'student_name', 'school_name', 'school_phone']::text[]),
  ('absence', 'te',
   E'ప్రియమైన {guardian_name}, {student_name} ({class}) ఈరోజు {date} పాఠశాలకు హాజరు కాలేదు. దయచేసి {school_phone} కు కాల్ చేయండి. - {school_name}',
   E'ప్రియమైన {guardian_name}, ఈరోజు {date} న {student_name} పాఠశాలకు హాజరు కాలేదు. ఇది మీకు తెలియకపోతే, దయచేసి {school_name} కు {school_phone} నంబరులో కాల్ చేయండి. ధన్యవాదాలు.',
   ARRAY['guardian_name', 'date', 'student_name', 'school_name', 'school_phone']::text[]),
  ('late', 'en',
   E'Dear {guardian_name}, {student_name} ({class}) reached school late today, {date}. - {school_name}',
   E'Dear {guardian_name}, {student_name} of {class} reached school late today, {date}. Please help your child be on time tomorrow. Thank you, {school_name} team.',
   ARRAY['guardian_name', 'student_name', 'class', 'date', 'school_name']::text[]),
  ('fee-due', 'en',
   E'Dear {guardian_name}, a fee of {due_amount} for {student_name} ({class}) is due on {due_date}.\n{how_to_pay}\nPlease ignore if already paid. - {school_name}',
   E'Dear {guardian_name}, a fee of {due_amount} for {student_name} of {class} is due on {due_date}. Here is how to pay:\n{how_to_pay}\nPlease ignore this message if you have already paid. Thank you, {school_name} office.',
   ARRAY['guardian_name', 'due_amount', 'student_name', 'class', 'due_date', 'how_to_pay', 'school_name']::text[]),
  ('fee-due', 'te',
   E'ప్రియమైన {guardian_name}, {student_name} ({class}) ఫీజు {due_amount} {due_date} లోపు చెల్లించాలి.\n{how_to_pay}\n- {school_name}',
   E'ప్రియమైన {guardian_name}, {student_name} యొక్క ఫీజు {due_amount} ను {due_date} లోపు చెల్లించాలి. ఎలా చెల్లించాలో ఇక్కడ ఉంది:\n{how_to_pay}\nఇప్పటికే చెల్లించి ఉంటే, ఈ సందేశాన్ని పట్టించుకోవద్దు. ధన్యవాదాలు, {school_name} కార్యాలయం.',
   ARRAY['guardian_name', 'student_name', 'due_amount', 'due_date', 'how_to_pay', 'school_name']::text[]),
  ('exam-reminder', 'en',
   E'Dear {guardian_name}, {exam_name} for {student_name} ({class}) starts on {date}. The datesheet is on your Parent Link. - {school_name}',
   E'Dear {guardian_name}, {exam_name} for {student_name} of {class} starts on {date}. The datesheet is on your Parent Link; please check it. All the best from the {school_name} team!',
   ARRAY['guardian_name', 'exam_name', 'student_name', 'class', 'date', 'school_name']::text[]),
  ('result', 'en',
   E'Dear {guardian_name}, the results of {exam_name} for {student_name} are ready. See the report card on your Parent Link. - {school_name}',
   E'Dear {guardian_name}, the results of {exam_name} for {student_name} are ready. See the report card on your Parent Link. Thank you, {school_name} team.',
   ARRAY['guardian_name', 'exam_name', 'student_name', 'school_name']::text[]),
  ('ptm', 'en',
   E'Dear {guardian_name}, the parent-teacher meeting for {class} is on {date}. Please attend. - {school_name}',
   E'Dear {guardian_name}, the parent-teacher meeting for {class} is on {date}. Please attend to hear how your child is doing. Thank you, {school_name} team.',
   ARRAY['guardian_name', 'class', 'date', 'school_name']::text[]),
  ('bus-pickup', 'en',
   E'Dear {guardian_name}, {message} - {school_name}',
   E'Dear {guardian_name}, here is a bus update from {school_name}:\n{message}\nThis message was sent automatically by the school transport team.',
   ARRAY['guardian_name', 'school_name', 'message']::text[]),
  ('bus-drop', 'en',
   E'Dear {guardian_name}, {message} - {school_name}',
   E'Dear {guardian_name}, here is a bus update from {school_name}:\n{message}\nThis message was sent automatically by the school transport team.',
   ARRAY['guardian_name', 'school_name', 'message']::text[]),
  ('bus-arriving', 'en',
   E'Dear {guardian_name}, {message} - {school_name}',
   E'Dear {guardian_name}, here is a bus update from {school_name}:\n{message}\nThis message was sent automatically by the school transport team.',
   ARRAY['guardian_name', 'school_name', 'message']::text[]),
  ('homework-set', 'en',
   E'Dear {guardian_name}, new homework for {class}: {message} - {school_name}',
   E'Dear {guardian_name}, new homework has been set for {class}:\n{message}\nPlease help your child finish it on time. Thank you, {school_name} team.',
   ARRAY['guardian_name', 'class', 'message', 'school_name']::text[]),
  ('homework-pending', 'en',
   E'Dear {guardian_name}, {student_name} has not yet submitted homework due on {date}. - {school_name}',
   E'Dear {guardian_name}, {student_name} has not yet submitted the homework due on {date}. Please help your child finish it soon. Thank you, {school_name} team.',
   ARRAY['guardian_name', 'student_name', 'date', 'school_name']::text[]),
  ('birthday-student', 'te',
   E'పుట్టినరోజు శుభాకాంక్షలు, {student_name}! {school_name} తరఫున మీకు శుభాకాంక్షలు.',
   E'ప్రియమైన {student_name}, పుట్టినరోజు శుభాకాంక్షలు! {school_name} తరఫున మీకు హృదయపూర్వక శుభాకాంక్షలు. ఈ సంవత్సరం మీకు ఆనందంగా గడవాలని కోరుకుంటున్నాము.',
   ARRAY['student_name', 'school_name']::text[]),
  ('admission-welcome', 'en',
   E'Dear {guardian_name}, welcome to {school_name}! {student_name} is admitted to {class} with admission number {admission_no}.',
   E'Dear {guardian_name}, welcome to {school_name}! We are happy to tell you that {student_name} is admitted to {class}. The admission number is {admission_no}; please keep it for your records.',
   ARRAY['guardian_name', 'school_name', 'student_name', 'class', 'admission_no']::text[]),
  ('parent-link-code', 'en',
   E'{code} is your one-time code for Parent Link of {school_name}. It works for 10 minutes. Do not share it with anyone.',
   E'Your one-time code for Parent Link of {school_name} is {code}. It works for 10 minutes. Do not share it with anyone.',
   ARRAY['school_name', 'code']::text[]),
  ('consent-request', 'en',
   E'Dear {guardian_name}, {school_name} asks for your consent: {title}. Please open your Parent Link to read it and agree. - {school_name}',
   E'Dear {guardian_name}, {school_name} asks for your consent: {title}. Please open your Parent Link to read it and agree. Thank you.',
   ARRAY['guardian_name', 'school_name', 'title']::text[]),
  ('query-number', 'en',
   E'Dear {guardian_name}, we have noted your {message}. Your ticket number is {ticket_number}. We will get back to you soon. - {school_name}',
   E'Dear {guardian_name}, we have noted your {message}. Your ticket number is {ticket_number}. We will get back to you soon. Thank you, {school_name} team.',
   ARRAY['guardian_name', 'message', 'ticket_number', 'school_name']::text[]),
  ('query-rating', 'en',
   E'Dear {guardian_name}, your ticket {ticket_number} is closed. How happy are you with our help? Reply with a number from 1 (not happy) to 5 (very happy). - {school_name}',
   E'Dear {guardian_name}, your ticket {ticket_number} is closed. How happy are you with our help? Reply with a number from 1 (not happy) to 5 (very happy). Thank you, {school_name} team.',
   ARRAY['guardian_name', 'ticket_number', 'school_name']::text[]),
  ('staff-message', 'en',
   E'Dear {staff_name}, {message} - {school_name}',
   E'Dear {staff_name}, here is a message from {school_name}:\n{message}\nPlease contact the school office if you have any questions.',
   ARRAY['staff_name', 'school_name', 'message']::text[]),
  ('behaviour-note', 'en',
   E'Dear {guardian_name}, this is to let you know about {student_name} ({class}): {title} on {date}. Please contact the class teacher if you would like to know more. - {school_name}',
   E'Dear {guardian_name}, this is to let you know about {student_name} of {class}: {title} on {date}. Please contact the class teacher if you would like to know more. Thank you, {school_name} team.',
   ARRAY['guardian_name', 'student_name', 'class', 'title', 'date', 'school_name']::text[]),
  ('notice', 'en',
   E'{school_name}: {title}. {message}',
   E'Dear Parent, there is a new notice from {school_name}: {title}.\nDetails: {message}\nYou can also read this notice on your Parent Link.',
   ARRAY['school_name', 'title', 'message']::text[]),
  ('general', 'en',
   E'Dear {guardian_name}, {message} - {school_name}',
   E'Dear {guardian_name}, here is a message from {school_name}:\n{message}\nPlease contact the school office if you have any questions.',
   ARRAY['guardian_name', 'school_name', 'message']::text[])
), old AS (
  SELECT tv."id", tv."school_id", tv."template_id", tv."language", tv."subject", tv."whatsapp_status", w."new_body", w."variables",
         (SELECT MAX(x."version") FROM "template_version" x WHERE x."template_id" = tv."template_id" AND x."language" = tv."language") + 1 AS "next"
    FROM "template_version" tv
    JOIN "template" t ON t."id" = tv."template_id"
    JOIN words w ON w."key" = t."key" AND w."language" = tv."language" AND w."old_body" = tv."body"
   WHERE t."channel" = 'whatsapp'
     AND t."archived_at" IS NULL
     AND tv."is_current"
     AND COALESCE(tv."whatsapp_status", 'NOT_SUBMITTED') = 'NOT_SUBMITTED'
), retired AS (
  UPDATE "template_version" tv SET "is_current" = false FROM old WHERE tv."id" = old."id" RETURNING tv."id"
)
INSERT INTO "template_version" ("id", "school_id", "template_id", "language", "version", "is_current", "subject", "body", "variables", "whatsapp_status", "created_at")
SELECT gen_random_uuid(), old."school_id", old."template_id", old."language", old."next", true, old."subject", old."new_body", old."variables", old."whatsapp_status", now()
  FROM old;

ALTER TABLE "template" FORCE ROW LEVEL SECURITY;
ALTER TABLE "template_version" FORCE ROW LEVEL SECURITY;
