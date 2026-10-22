-- Fee reminders say how to pay (gap list G11).
--
-- The ready "Fee reminder" templates now carry the {how_to_pay} blank, which
-- School OS fills for each parent: their own Parent Link with its Pay button,
-- a payment link that works for 7 days, or "Please pay at the school office."
-- when online payment is off (src/lib/fees/reminder-pay.ts).
--
-- Schools made before this keep the templates they were given. Where such a
-- template still has the ready words exactly as School OS wrote them, and was
-- never sent to WhatsApp for approval nor given a DLT template ID, it gets a
-- new version with the new words; the old version stays on record and
-- messages already sent keep theirs. A template the school changed, or one
-- WhatsApp or the DLT portal already knows, is left alone: Fee Settings then
-- says that its words have no way to pay. Running this again changes nothing
-- more. Row-level security is lifted for this change only, and put back
-- straight after.
ALTER TABLE "template" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "template_version" NO FORCE ROW LEVEL SECURITY;

WITH old AS (
  SELECT tv."id", tv."school_id", tv."template_id", tv."language", tv."subject", tv."whatsapp_status",
         CASE
           WHEN t."channel" = 'whatsapp' AND tv."language" = 'en'
             THEN E'Dear {guardian_name}, a fee of {due_amount} for {student_name} ({class}) is due on {due_date}.\n{how_to_pay}\nPlease ignore if already paid. - {school_name}'
           WHEN t."channel" = 'whatsapp' AND tv."language" = 'te'
             THEN E'ప్రియమైన {guardian_name}, {student_name} ({class}) ఫీజు {due_amount} {due_date} లోపు చెల్లించాలి.\n{how_to_pay}\n- {school_name}'
           ELSE 'Dear Parent, fee of {due_amount} for {student_name} is due on {due_date}. {how_to_pay} - {school_name}'
         END AS "body",
         CASE
           WHEN t."channel" = 'whatsapp' AND tv."language" = 'en' THEN ARRAY['guardian_name', 'due_amount', 'student_name', 'class', 'due_date', 'how_to_pay', 'school_name']
           WHEN t."channel" = 'whatsapp' AND tv."language" = 'te' THEN ARRAY['guardian_name', 'student_name', 'class', 'due_amount', 'due_date', 'how_to_pay', 'school_name']
           ELSE ARRAY['due_amount', 'student_name', 'due_date', 'how_to_pay', 'school_name']
         END AS "variables",
         (SELECT MAX(x."version") FROM "template_version" x WHERE x."template_id" = tv."template_id" AND x."language" = tv."language") + 1 AS "next"
    FROM "template_version" tv
    JOIN "template" t ON t."id" = tv."template_id"
   WHERE t."key" = 'fee-due'
     AND t."archived_at" IS NULL
     AND tv."is_current"
     AND tv."dlt_template_id" IS NULL
     AND COALESCE(tv."whatsapp_status", 'NOT_SUBMITTED') = 'NOT_SUBMITTED'
     AND (
       (t."channel" = 'whatsapp' AND tv."language" = 'en' AND tv."body" IN (
         'Dear {guardian_name}, a fee of {due_amount} for {student_name} ({class}) is due on {due_date}. The details are on your Parent Link. Please ignore if already paid. - {school_name}',
         'Dear {guardian_name}, a fee of {due_amount} for {student_name} ({class}) is due on {due_date}. You can pay on your Parent Link. Please ignore if already paid. - {school_name}'))
       OR (t."channel" = 'whatsapp' AND tv."language" = 'te' AND tv."body" IN (
         'ప్రియమైన {guardian_name}, {student_name} ({class}) ఫీజు {due_amount} {due_date} లోపు చెల్లించాలి. వివరాలు మీ Parent Link లో ఉన్నాయి. - {school_name}',
         'ప్రియమైన {guardian_name}, {student_name} ({class}) ఫీజు {due_amount} {due_date} లోపు చెల్లించాలి. మీ Parent Link లో చెల్లించవచ్చు. - {school_name}'))
       OR (t."channel" = 'sms' AND tv."language" = 'en' AND tv."body" =
         'Dear Parent, fee of {due_amount} for {student_name} is due on {due_date}. Please ignore if paid. - {school_name}')
     )
), retired AS (
  UPDATE "template_version" tv SET "is_current" = false FROM old WHERE tv."id" = old."id" RETURNING tv."id"
)
INSERT INTO "template_version" ("id", "school_id", "template_id", "language", "version", "is_current", "subject", "body", "variables", "whatsapp_status", "created_at")
SELECT gen_random_uuid(), old."school_id", old."template_id", old."language", old."next", true, old."subject", old."body", old."variables", old."whatsapp_status", now()
  FROM old;

ALTER TABLE "template" FORCE ROW LEVEL SECURITY;
ALTER TABLE "template_version" FORCE ROW LEVEL SECURITY;
