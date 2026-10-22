-- One rule for "is this a school day" (gap list G32, browser finding TEACHING-01).
--
-- On the School Calendar, "Allow attendance on this date" on an event, exam day, PTM
-- or admission test now means: make this date a school day, even on a Sunday, a day
-- off or in a holiday (for the classes the entry is for). Only a person switching it
-- on does that; entries made by the datesheet, an event's page, a PTM or an admission
-- test never open or close a day (src/lib/calendar/school-days.ts).
--
-- The add form used to start with it ON for these types, so an ordinary event on a
-- Sunday or inside a vacation opened Take Attendance for the whole school, counted the
-- day in every % and sent absence messages. The form now starts with it off. Entries
-- typed before this update kept the old default: they are switched off here, once,
-- each with an Audit Log line. On an ordinary school day this changes nothing (the day
-- stays a school day). Holidays and vacations, and their "allow attendance", are not
-- touched. A school that really opens such a date switches it on again for that entry.
--
-- Row-level security is lifted for this one change only, and put back straight after.
ALTER TABLE "calendar_entry" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_entry" NO FORCE ROW LEVEL SECURITY;

WITH switched AS (
  UPDATE "calendar_entry"
  SET "attendance_on" = false, "updated_at" = now()
  WHERE "source" IS NULL AND "type" NOT IN ('holiday', 'vacation') AND "attendance_on" = true
  RETURNING "id", "school_id", "type", "title", "start_date", "end_date"
)
INSERT INTO "audit_log_entry" ("id", "school_id", "user_login_id", "actor_note", "action", "record_type", "record_id", "before", "after", "at")
SELECT gen_random_uuid(), s."school_id", NULL,
       'School OS update: "Allow attendance" on an event now makes the date a school day only when someone switches it on',
       'attendance-switched-off', 'Calendar Entry', s."id"::text,
       jsonb_build_object('type', s."type", 'title', s."title", 'from', to_char(s."start_date", 'DD-MM-YYYY'), 'to', to_char(s."end_date", 'DD-MM-YYYY'), 'attendance', 'on'),
       jsonb_build_object('type', s."type", 'title', s."title", 'from', to_char(s."start_date", 'DD-MM-YYYY'), 'to', to_char(s."end_date", 'DD-MM-YYYY'), 'attendance', 'off'),
       now()
FROM switched s;

ALTER TABLE "calendar_entry" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_entry" FORCE ROW LEVEL SECURITY;
