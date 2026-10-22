-- Delayed background jobs run when they are due, whatever time zone the
-- database or the server is in (TEACHING-06).
--
-- Times are kept as "timestamp without time zone" holding UTC (Prisma writes
-- them in UTC). now() is a moment: compared with such a column, or written
-- into one, it is read in the session's time zone. On a database set to
-- Asia/Kolkata a job due in 15 minutes was claimed at once (absence messages
-- went before the teacher's correction window), and in a zone behind UTC a
-- due job would wait hours. Every comparison and write below uses
-- now() AT TIME ZONE 'UTC', which is the same in every time zone.
--
-- claim_background_jobs() also takes an optional school and list of kinds, so
-- a caller can run only its own jobs. Called with one argument it works as
-- before, so a server still running the old code keeps working.

DROP FUNCTION claim_background_jobs(int);

CREATE FUNCTION claim_background_jobs(max_jobs int, only_school uuid DEFAULT NULL, only_kinds text[] DEFAULT NULL)
RETURNS TABLE(job_id uuid, job_school_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  utc_now timestamp := now() AT TIME ZONE 'UTC';
BEGIN
  PERFORM set_config('app.job_claim', 'on', true);
  RETURN QUERY
    UPDATE background_job b
       SET status = 'running', locked_at = utc_now, attempts = b.attempts + 1
     WHERE b.id IN (
       SELECT j.id FROM background_job j
        WHERE ((j.status = 'queued' AND j.run_after <= utc_now)
            OR (j.status = 'running' AND j.locked_at < utc_now - interval '15 minutes'))
          AND (only_school IS NULL OR j.school_id = only_school)
          AND (only_kinds IS NULL OR j.kind = ANY(only_kinds))
        ORDER BY j.run_after
        LIMIT max_jobs
        FOR UPDATE SKIP LOCKED)
    RETURNING b.id, b.school_id;
  PERFORM set_config('app.job_claim', 'off', true);
END $$;

REVOKE ALL ON FUNCTION claim_background_jobs(int, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_background_jobs(int, uuid, text[]) TO school_os_app;

-- A job running right now was locked with the session's local time: turn that
-- into UTC, so a job stuck from before this change is still picked up again
-- 15 minutes after it was locked (not hours later). Finished jobs keep no lock.
SELECT set_config('app.job_claim', 'on', false);
UPDATE background_job
   SET locked_at = (locked_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'UTC'
 WHERE status = 'running' AND locked_at IS NOT NULL;
SELECT set_config('app.job_claim', 'off', false);

-- Rate-limit windows are written in UTC too (src/lib/rate-limit.ts), and old
-- ones are cleared by the same clock.
CREATE OR REPLACE FUNCTION prune_rate_limits() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM rate_limit_bucket WHERE window_start < (now() AT TIME ZONE 'UTC') - interval '1 day';
$$;
REVOKE ALL ON FUNCTION prune_rate_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prune_rate_limits() TO school_os_app;
