-- purge_school(): a RESTRICT foreign key reports 23001 (restrict_violation), not
-- 23503 (foreign_key_violation). Both now mean "try this table again on the next pass",
-- so the order tables are listed in no longer matters.

CREATE OR REPLACE FUNCTION purge_school(target uuid) RETURNS bigint
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
      EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
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
    EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
      NULL;
    END;
  END LOOP;

  RETURN total;
END $$;
