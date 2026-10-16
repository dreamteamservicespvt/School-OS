-- Delete an empty, closed school for good (07-super-admin.md §7: a closed
-- school is removed "with the Owner's approval"). Made for test schools.
--
-- What stays the same everywhere else:
-- - The running app still has no DELETE permission on any table.
-- - The Audit Log and the console Activity Log are never changed or deleted.
--   The school's Audit Log entries stay after the school is gone.
-- - A school with students, payments, Day Book entries or invoices can never
--   be deleted this way.
--
-- Only purge_school() below may delete. It runs as the owner role, only from
-- the Super Admin console, only for one Closed school, and the delete rules
-- below work only while it runs (app.school_purge, set by it alone, inside
-- its own transaction).

-- 1. The Audit Log keeps its entries when their school is deleted.
ALTER TABLE "audit_log_entry" DROP CONSTRAINT "audit_log_entry_school_id_fkey";

-- 2. Each school table lets the owner delete that one school's rows during a purge.
--    The Audit Log gets no such rule.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
     WHERE c.table_schema = 'public' AND c.column_name = 'school_id' AND tb.table_type = 'BASE TABLE'
       AND c.table_name <> 'audit_log_entry'
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (current_user = ''school_os_owner'' AND school_id::text = current_setting(''app.school_purge'', true))',
      t || '_purge', t);
  END LOOP;
END $$;

CREATE POLICY school_purge ON "school" FOR DELETE
  USING (current_user = 'school_os_owner' AND id::text = current_setting('app.school_purge', true));

-- 3. The delete itself. All or nothing: if any row of the school is left,
--    everything is undone and nothing is deleted.
CREATE FUNCTION purge_school(target uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t text;
  n bigint;
  total bigint := 0;
  pass int;
  pending text[];
  still text[];
  login uuid;
  logins uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT app_in_console() THEN
    RAISE EXCEPTION 'Only the Super Admin console can delete a school.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM console_school WHERE id = target AND status = 'CLOSED') THEN
    RAISE EXCEPTION 'Only a closed school can be deleted.';
  END IF;
  IF EXISTS (SELECT 1 FROM platform_invoice WHERE for_school_id = target) THEN
    RAISE EXCEPTION 'This school has invoices, which are never deleted.';
  END IF;

  PERFORM set_config('app.school_id', target::text, true);
  PERFORM set_config('app.school_purge', target::text, true);

  IF EXISTS (SELECT 1 FROM student WHERE school_id = target)
     OR EXISTS (SELECT 1 FROM payment WHERE school_id = target)
     OR EXISTS (SELECT 1 FROM day_book_entry WHERE school_id = target) THEN
    RAISE EXCEPTION 'This school has students, payments or Day Book entries, so it can never be deleted.';
  END IF;

  -- Logins that work only in this school go with it (checked one by one, as each person).
  FOR login IN SELECT DISTINCT user_login_id FROM school_access WHERE school_id = target LOOP
    PERFORM set_config('app.user_id', login::text, true);
    IF NOT EXISTS (SELECT 1 FROM school_access WHERE user_login_id = login AND school_id <> target) THEN
      logins := logins || login;
    END IF;
  END LOOP;
  PERFORM set_config('app.user_id', '', true);

  SELECT array_agg(c.table_name::text) INTO pending
    FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
   WHERE c.table_schema = 'public' AND c.column_name = 'school_id' AND tb.table_type = 'BASE TABLE'
     AND c.table_name <> 'audit_log_entry';

  -- Tables refer to each other: delete in passes until each is empty for this school.
  FOR pass IN 1..60 LOOP
    still := ARRAY[]::text[];
    FOREACH t IN ARRAY pending LOOP
      BEGIN
        EXECUTE format('DELETE FROM %I WHERE school_id = $1', t) USING target;
        GET DIAGNOSTICS n = ROW_COUNT;
        total := total + n;
        EXECUTE format('SELECT count(*) FROM %I WHERE school_id = $1', t) INTO n USING target;
        IF n > 0 THEN still := still || t; END IF;
      EXCEPTION WHEN foreign_key_violation THEN
        still := still || t;
      END;
    END LOOP;
    pending := still;
    EXIT WHEN cardinality(pending) = 0;
  END LOOP;
  IF cardinality(pending) > 0 THEN
    RAISE EXCEPTION 'The school could not be deleted completely (left: %). Nothing was deleted.', array_to_string(pending, ', ');
  END IF;

  -- The console's own records for the school. Its Activity Log lines stay.
  DELETE FROM school_invite WHERE for_school_id = target;
  DELETE FROM school_status_change WHERE for_school_id = target;
  DELETE FROM school_note WHERE for_school_id = target;
  DELETE FROM subscription WHERE for_school_id = target;
  DELETE FROM console_message WHERE for_school_id = target;
  DELETE FROM console_school WHERE id = target;
  DELETE FROM school WHERE id = target;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 OR EXISTS (SELECT 1 FROM console_school WHERE id = target) THEN
    RAISE EXCEPTION 'The school could not be deleted. Nothing was deleted.';
  END IF;
  PERFORM set_config('app.school_id', '', true);
  PERFORM set_config('app.school_purge', '', true);

  -- Then the logins that belonged only to this school. One still linked elsewhere is kept.
  FOREACH login IN ARRAY logins LOOP
    BEGIN
      DELETE FROM session WHERE user_login_id = login;
      DELETE FROM two_step_challenge WHERE user_login_id = login;
      DELETE FROM trusted_device WHERE user_login_id = login;
      DELETE FROM user_login WHERE id = login;
    EXCEPTION WHEN foreign_key_violation THEN
      NULL;
    END;
  END LOOP;

  RETURN total;
END $$;

REVOKE ALL ON FUNCTION purge_school(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_school(uuid) TO school_os_app;
