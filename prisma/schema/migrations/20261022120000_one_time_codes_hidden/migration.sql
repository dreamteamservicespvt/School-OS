-- One-time codes are never kept in Message History (QA SEC-01).
--
-- Two-step sign-in codes, codes confirming a new mobile number, Parent Link codes,
-- admission consent codes and pickup codes went through Communication like any other
-- message: the code was saved in plain text on the Message Recipient (its text and its
-- blanks), so anyone who could open Message History could read a code that still
-- worked. The message was also marked as an emergency broadcast (to reach people who
-- opted out), with the person signing in as its sender.
--
-- From now on the text and blanks keep "••••••" instead of the code, and the code
-- rides on the recipient encrypted (sealed_code) only until the delivery job hands it
-- to the provider, which then clears it (src/lib/messaging/one-time-code.ts). Such a
-- message has Message Type "one-time-code": it still reaches people who opted out, but
-- it is not an emergency broadcast and nobody is its sender ("School OS").
--
-- Code messages saved before this update get the same treatment here: the code in
-- their text and blanks is replaced by "••••••", the emergency mark and the sender are
-- taken off, and each gets an Audit Log line. Nothing else changes, and running this
-- again changes nothing more. Row-level security is lifted for this change only, and
-- put back straight after.
ALTER TABLE "message_recipient" ADD COLUMN "sealed_code" TEXT;

ALTER TABLE "message" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "message_recipient" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_entry" NO FORCE ROW LEVEL SECURITY;

WITH codes AS (
  UPDATE "message"
     SET "message_type" = 'one-time-code',
         "is_emergency" = false,
         "sent_by_id" = NULL,
         "body" = regexp_replace(regexp_replace("body", '\m\d{6}\M', '••••••', 'g'), '\mCode \d{4}\M', 'Code ••••••', 'g')
   WHERE "message_type" <> 'one-time-code'
     AND (("source_type" = 'User Login' AND ("trigger" LIKE 'Sign-in code%' OR "trigger" LIKE 'Confirmation code (%'))
          OR "source_type" = 'Parent Link Code'
          OR "trigger" = 'Admission consent code'
          OR "trigger" = 'Pickup code')
  RETURNING "id", "school_id", "trigger"
)
INSERT INTO "audit_log_entry" ("id", "school_id", "user_login_id", "actor_note", "action", "record_type", "record_id", "before", "after", "at")
SELECT gen_random_uuid(), c."school_id", NULL,
       'School OS update: one-time codes are no longer kept in Message History',
       'one-time-code-hidden', 'Message', c."id"::text,
       jsonb_build_object('why', c."trigger", 'code', 'kept in the message text'),
       jsonb_build_object('why', c."trigger", 'code', 'hidden'),
       now() AT TIME ZONE 'UTC'
FROM codes c;

UPDATE "message_recipient" r
   SET "text" = regexp_replace(regexp_replace(r."text", '\m\d{6}\M', '••••••', 'g'), '\mCode \d{4}\M', 'Code ••••••', 'g'),
       "values" = CASE WHEN r."values" ? 'code' THEN jsonb_set(r."values", '{code}', '"••••••"') ELSE r."values" END,
       "sealed_code" = NULL
  FROM "message" m
 WHERE m."id" = r."message_id"
   AND m."message_type" = 'one-time-code'
   AND (r."text" ~ '\m\d{6}\M' OR r."text" ~ '\mCode \d{4}\M' OR (r."values" ? 'code' AND r."values"->>'code' <> '••••••'));

ALTER TABLE "message" FORCE ROW LEVEL SECURITY;
ALTER TABLE "message_recipient" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_entry" FORCE ROW LEVEL SECURITY;
