-- A person's own School Access rows, and the roles on them, are readable in
-- every school only BEFORE a school is chosen (sign-in, the School switcher:
-- withUser() in src/lib/db.ts, where app.school_id is empty).
--
-- Until now these "own" policies also applied inside a chosen school, so a
-- person who works in two schools saw, in school A, their own roles and access
-- rows from school B too (QA PLATFORM-ROLES-01): "Principal" twice in Settings,
-- another school's role offered in role pickers, and the AI assistant check
-- counting a role held only in the other school.
--
-- Inside a school, only that school's rows are visible again (the *_same_school
-- and school_access_read school_id policies). No data changes; sign-in and the
-- School switcher read the same rows as before.

DROP POLICY school_access_read ON "school_access";
CREATE POLICY school_access_read ON "school_access" FOR SELECT
  USING (school_id = app_school_id() OR (app_school_id() IS NULL AND user_login_id = app_user_id()));

DROP POLICY school_access_role_own ON "school_access_role";
CREATE POLICY school_access_role_own ON "school_access_role" FOR SELECT
  USING (app_school_id() IS NULL AND school_access_id IN (SELECT id FROM "school_access" WHERE user_login_id = app_user_id()));

DROP POLICY role_own ON "role";
CREATE POLICY role_own ON "role" FOR SELECT
  USING (app_school_id() IS NULL AND id IN (
    SELECT r.role_id FROM "school_access_role" r
    JOIN "school_access" a ON a.id = r.school_access_id
    WHERE a.user_login_id = app_user_id()
  ));
