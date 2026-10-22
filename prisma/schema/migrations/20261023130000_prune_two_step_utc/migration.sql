-- Clearing old two-step sign-in codes reads the clock in UTC (TEACHING-06),
-- like every other database function: created_at is kept as UTC in a
-- "timestamp" column, so on a database set to Asia/Kolkata the old
-- now() - 30 days cleared codes five and a half hours early.
-- Replaces the function from 20261023100000_retention_runs; nothing else changes.
CREATE OR REPLACE FUNCTION prune_two_step_challenges() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  DELETE FROM two_step_challenge WHERE created_at < (now() AT TIME ZONE 'UTC') - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION prune_two_step_challenges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prune_two_step_challenges() TO school_os_app;
