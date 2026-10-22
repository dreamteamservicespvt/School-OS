-- Session rules a School Admin sets in Settings, Users & Permissions (gap list
-- G45): time without use before a sign-in ends, on computers and on phones, and
-- the longest one sign-in lasts. A school with no row keeps what every school
-- had before (7 days without use on any device, no longest sign-in), so no
-- existing login changes until the school saves its own rules.
CREATE TABLE "password_policy" (
    "school_id" UUID NOT NULL,
    "idle_minutes_computer" INTEGER NOT NULL DEFAULT 10080,
    "idle_minutes_phone" INTEGER NOT NULL DEFAULT 10080,
    "max_session_minutes" INTEGER,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_policy_pkey" PRIMARY KEY ("school_id")
);

-- Safe bounds: 5 minutes to 7 days without use; a longest sign-in of 1 hour to 90 days.
ALTER TABLE "password_policy" ADD CONSTRAINT "password_policy_idle_bounds"
  CHECK ("idle_minutes_computer" BETWEEN 5 AND 10080 AND "idle_minutes_phone" BETWEEN 5 AND 10080);
ALTER TABLE "password_policy" ADD CONSTRAINT "password_policy_max_bounds"
  CHECK ("max_session_minutes" IS NULL OR "max_session_minutes" BETWEEN 60 AND 129600);

-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "password_policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_policy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "password_policy_same_school" ON "password_policy" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
CREATE POLICY "password_policy_purge" ON "password_policy" FOR DELETE USING (current_user = 'school_os_owner' AND school_id::text = current_setting('app.school_purge', true));
