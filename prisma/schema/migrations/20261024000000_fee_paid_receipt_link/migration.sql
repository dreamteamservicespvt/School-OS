-- The "Fee received" WhatsApp message carries the receipt (HANDOFF 3a).
--
-- The ready "Fee received" WhatsApp template now ends with the line
-- "Open your receipt: {receipt_link}". School OS fills the blank with a link to
-- the parent copy of that payment's receipt (src/app/r/[key]). On an approved
-- WhatsApp template that line becomes an "Open receipt" button
-- (src/lib/messaging/blanks.ts, whatsappParts).
--
-- Schools made before this keep the templates they were given. Where such a
-- template still has the ready words exactly as School OS wrote them, and was
-- never sent to WhatsApp for approval, it gets a new version with the new
-- words; the old version stays on record and messages already sent keep
-- theirs. A template the school changed, or one WhatsApp already knows, is
-- left alone; the school can add the blank in Message Templates. The SMS
-- template is not changed: its words are registered on the DLT portal.
-- Running this again changes nothing more. Row-level security is lifted for
-- this change only, and put back straight after.
ALTER TABLE "template" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "template_version" NO FORCE ROW LEVEL SECURITY;

WITH old AS (
  SELECT tv."id", tv."school_id", tv."template_id", tv."language", tv."subject", tv."whatsapp_status",
         (SELECT MAX(x."version") FROM "template_version" x WHERE x."template_id" = tv."template_id" AND x."language" = tv."language") + 1 AS "next"
    FROM "template_version" tv
    JOIN "template" t ON t."id" = tv."template_id"
   WHERE t."key" = 'fee-paid'
     AND t."channel" = 'whatsapp'
     AND t."archived_at" IS NULL
     AND tv."is_current"
     AND tv."language" = 'en'
     AND COALESCE(tv."whatsapp_status", 'NOT_SUBMITTED') = 'NOT_SUBMITTED'
     AND tv."body" = 'Dear {guardian_name}, we have received {paid_amount} for {student_name} on {payment_date}. Receipt number {receipt_number}. Thank you. - {school_name}'
), retired AS (
  UPDATE "template_version" tv SET "is_current" = false FROM old WHERE tv."id" = old."id" RETURNING tv."id"
)
INSERT INTO "template_version" ("id", "school_id", "template_id", "language", "version", "is_current", "subject", "body", "variables", "whatsapp_status", "created_at")
SELECT gen_random_uuid(), old."school_id", old."template_id", old."language", old."next", true, old."subject",
       E'Dear {guardian_name}, {school_name} has received {paid_amount} for {student_name} on {payment_date}. Your receipt number is {receipt_number}. Thank you for your payment.\nOpen your receipt: {receipt_link}',
       ARRAY['guardian_name', 'school_name', 'paid_amount', 'student_name', 'payment_date', 'receipt_number', 'receipt_link'], old."whatsapp_status", now()
  FROM old;

ALTER TABLE "template" FORCE ROW LEVEL SECURITY;
ALTER TABLE "template_version" FORCE ROW LEVEL SECURITY;
