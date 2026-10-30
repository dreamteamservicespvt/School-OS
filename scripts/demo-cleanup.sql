-- Demo data cleanup before a client demo (local demo database only, never a live school).
-- Round 1 of the self-test (2026-10-30) created a homework and a notice whose titles start
-- with "Self-test: ". The records are realistic otherwise, so only the words are removed,
-- everywhere they were copied (notifications, messages, approval summaries).
-- The Audit Log keeps its history untouched (it cannot be changed, by design).
--
-- Run as the database owner (MIGRATION_DATABASE_URL):
--   psql -v ON_ERROR_STOP=1 -f scripts/demo-cleanup.sql "$MIGRATION_DATABASE_URL"
-- Row-level security stays on: each school's rows are changed with that school's id set.
BEGIN;
DO $$
DECLARE s record;
BEGIN
  -- The school table is behind row-level security too, so the ids are this local demo database's two schools
  -- (Sunrise, Green Valley). A fresh seed makes new ids: replace them first.
  FOR s IN SELECT unnest(ARRAY['2f2c0764-dd19-4441-829d-93e0adb03a4b','05988a85-ee8e-46a5-a574-5bac9b74f4e5']::uuid[]) AS id LOOP
    PERFORM set_config('app.school_id', s.id::text, true);
    UPDATE homework SET title = regexp_replace(title, '^Self-test:\s*', '') WHERE title ~ '^Self-test:';
    UPDATE notice SET title = regexp_replace(title, '^Self-test:\s*', '') WHERE title ~ '^Self-test:';
    UPDATE approval SET summary = replace(summary, 'Self-test: ', '') WHERE summary LIKE '%Self-test: %';
    UPDATE notification SET text = replace(text, 'Self-test: ', '') WHERE text LIKE '%Self-test: %';
    UPDATE message_recipient SET text = replace(text, 'Self-test: ', ''),
      "values" = replace("values"::text, 'Self-test: ', '')::jsonb
      WHERE text LIKE '%Self-test: %' OR "values"::text LIKE '%Self-test: %';
  END LOOP;
END $$;
COMMIT;
