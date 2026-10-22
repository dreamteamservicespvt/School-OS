-- Parent Link and staff invite messages are sent by School OS, not emergency broadcasts (QA LABEL-01).
--
-- A guardian's Parent Link message and the invite to a new School OS login went out
-- marked as an emergency broadcast, so that they reach people who opted out of
-- messages. Message History then said "Emergency broadcast. Sent also to parents who
-- opted out." on them and named the staff member who pressed Send as the sender, and
-- the Audit Log said "sent-emergency-broadcast".
--
-- From now on such a message has Message Type "parent-link" or "staff-invite": it still
-- reaches people who opted out (it is their own link), but it is not an emergency
-- broadcast, is not counted as one, and nobody is its sender ("School OS (Parent Link)",
-- "School OS (staff invite)"). The Audit Log says "system-message-sent", with the person
-- who asked for it (src/lib/messaging/system-message.ts).
--
-- Messages saved before this update are found by the personal link they carry: each
-- recipient's text keeps a placeholder for it (never the link itself). They get the same
-- Message Type, lose the emergency mark and the sender, and each gets one Audit Log line
-- ("system-message-relabelled") that keeps what it was before. Earlier Audit Log lines
-- are history and stay as they are. Nothing else changes, and running this again changes
-- nothing more. Row-level security is lifted for this change only, and put back straight
-- after.
ALTER TABLE "message" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "message_recipient" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_entry" NO FORCE ROW LEVEL SECURITY;

WITH links AS (
  SELECT r."message_id" AS "id",
         CASE WHEN bool_or(r."text" LIKE '%⟦parent-link:%') THEN 'parent-link' ELSE 'staff-invite' END AS "kind"
    FROM "message_recipient" r
   WHERE r."text" LIKE '%⟦parent-link:%' OR r."text" LIKE '%⟦invite:%'
   GROUP BY r."message_id"
), found AS (
  SELECT m."id", m."school_id", m."message_type", m."is_emergency", m."sent_by_id", l."kind"
    FROM "message" m
    JOIN links l ON l."id" = m."id"
   WHERE m."message_type" NOT IN ('parent-link', 'staff-invite', 'one-time-code')
), changed AS (
  UPDATE "message" m
     SET "message_type" = f."kind",
         "is_emergency" = false,
         "sent_by_id" = NULL
    FROM found f
   WHERE m."id" = f."id"
  RETURNING f."id", f."school_id", f."message_type", f."is_emergency", f."sent_by_id", f."kind"
)
INSERT INTO "audit_log_entry" ("id", "school_id", "user_login_id", "actor_note", "action", "record_type", "record_id", "before", "after", "at")
SELECT gen_random_uuid(), c."school_id", NULL,
       'School OS update: Parent Link and invite messages are sent by School OS, not emergency broadcasts',
       'system-message-relabelled', 'Message', c."id"::text,
       jsonb_build_object('type', c."message_type", 'emergency', c."is_emergency", 'sentBy', c."sent_by_id"),
       jsonb_build_object('type', c."kind", 'emergency', false, 'sentBy', CASE WHEN c."kind" = 'parent-link' THEN 'School OS (Parent Link)' ELSE 'School OS (staff invite)' END),
       now() AT TIME ZONE 'UTC'
  FROM changed c;

ALTER TABLE "message" FORCE ROW LEVEL SECURITY;
ALTER TABLE "message_recipient" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_entry" FORCE ROW LEVEL SECURITY;
