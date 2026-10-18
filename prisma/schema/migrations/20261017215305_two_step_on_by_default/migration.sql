-- Sign-in security defaults (gap list G03; 08-platform-security.md §2, 00-global.md §5).

-- Signed-in devices: the browser's own device id (only its hash), so a sign-in from a
-- new device is told apart even when two browsers report the same name; and whether
-- the sign-in was with a one-time code instead of the password.
ALTER TABLE "session" ADD COLUMN     "device_key" TEXT,
ADD COLUMN     "signed_in_with_code" BOOLEAN NOT NULL DEFAULT false;

-- Two-step login is on by default for the roles that need it (School Admin, Principal,
-- Accountant). New schools get it from Add School (src/lib/schools.ts). Schools that
-- already exist and never chose get it switched on here; a school whose School Admin
-- switched it off keeps it off.
--
-- Nobody is locked out by this: a person in one of these roles whom no code can reach
-- (no email or mobile number, or neither email nor SMS set up) still signs in with the
-- password and is shown how to add a mobile number or email (src/lib/auth/sign-in.ts).
--
-- Row-level security is lifted for this one copy only, and put back straight after.
ALTER TABLE "school" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "school_feature" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_entry" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "notification" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "school_access" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "school_access_role" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "role" NO FORCE ROW LEVEL SECURITY;

WITH switched AS (
  INSERT INTO "school_feature" ("school_id", "feature_key", "is_on", "updated_at")
  SELECT s."id", 'two-step-login', true, now() FROM "school" s
  ON CONFLICT ("school_id", "feature_key") DO NOTHING
  RETURNING "school_id"
),
logged AS (
  INSERT INTO "audit_log_entry" ("id", "school_id", "user_login_id", "actor_note", "action", "record_type", "record_id", "before", "after", "at")
  SELECT gen_random_uuid(), w."school_id", NULL, 'School OS update: two-step login on by default for sensitive roles',
         'feature-switched', 'School Feature', NULL,
         '{"feature": "two-step-login", "isOn": false}'::jsonb, '{"feature": "two-step-login", "isOn": true}'::jsonb, now()
  FROM switched w
  RETURNING "school_id"
)
-- Each School Admin is told, with the way to switch it off on the same page.
INSERT INTO "notification" ("id", "school_id", "user_login_id", "type", "text", "link", "created_at", "updated_at")
SELECT DISTINCT ON (a."school_id", a."user_login_id")
       gen_random_uuid(), a."school_id", a."user_login_id", 'security',
       'Two-step login is now on for School Admin, Principal and Accountant: after the password, a one-time code to their email or mobile. Anyone the code cannot reach still signs in with the password and is asked to add a mobile number or email.',
       '/settings/data-security', now(), now()
FROM logged l
JOIN "school_access" a ON a."school_id" = l."school_id" AND a."archived_at" IS NULL
JOIN "school_access_role" sar ON sar."school_access_id" = a."id"
JOIN "role" r ON r."id" = sar."role_id" AND r."key" = 'school-admin' AND r."archived_at" IS NULL;

ALTER TABLE "school" FORCE ROW LEVEL SECURITY;
ALTER TABLE "school_feature" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_entry" FORCE ROW LEVEL SECURITY;
ALTER TABLE "notification" FORCE ROW LEVEL SECURITY;
ALTER TABLE "school_access" FORCE ROW LEVEL SECURITY;
ALTER TABLE "school_access_role" FORCE ROW LEVEL SECURITY;
ALTER TABLE "role" FORCE ROW LEVEL SECURITY;
