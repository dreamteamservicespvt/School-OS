-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SchoolStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "UserLoginStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "RoleKind" AS ENUM ('READY', 'TEMPLATE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AccessScope" AS ENUM ('WHOLE_SCHOOL', 'CAMPUS', 'CHOSEN_CLASSES', 'OWN');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('WAITING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ESCALATED');

-- CreateTable
CREATE TABLE "school_group" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "school_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SchoolStatus" NOT NULL DEFAULT 'TRIAL',
    "school_type" TEXT,
    "trial_ends_on" DATE,
    "logo_url" TEXT,
    "address" TEXT,
    "board" TEXT,
    "affiliation_number" TEXT,
    "languages" TEXT[] DEFAULT ARRAY['en']::TEXT[],
    "time_zone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "group_id" UUID,
    "gstin" TEXT,
    "sms_dlt_entity_id" TEXT,
    "sms_sender_header" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "school_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campus" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_login" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "password_hash" TEXT,
    "status" "UserLoginStatus" NOT NULL DEFAULT 'INVITED',
    "invite_token_hash" TEXT,
    "invite_expires_at" TIMESTAMP(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_sign_in_at" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "user_login_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "user_login_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "school_id" UUID,
    "campus_id" UUID,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "kind" "RoleKind" NOT NULL DEFAULT 'CUSTOM',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "requires_two_step" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_access" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campus_id" UUID,
    "user_login_id" UUID NOT NULL,
    "scope" "AccessScope" NOT NULL DEFAULT 'WHOLE_SCHOOL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "school_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_access_role" (
    "school_id" UUID NOT NULL,
    "school_access_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "school_access_role_pkey" PRIMARY KEY ("school_access_id","role_id")
);

-- CreateTable
CREATE TABLE "school_module" (
    "school_id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "is_on" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_module_pkey" PRIMARY KEY ("school_id","module_key")
);

-- CreateTable
CREATE TABLE "school_feature" (
    "school_id" UUID NOT NULL,
    "feature_key" TEXT NOT NULL,
    "is_on" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_feature_pkey" PRIMARY KEY ("school_id","feature_key")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_login_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "group_key" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "read_at" TIMESTAMP(3),
    "done_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "amount_paise" BIGINT,
    "reason" TEXT,
    "asked_by_id" UUID NOT NULL,
    "current_approver_id" UUID,
    "current_approver_role" TEXT,
    "step" INTEGER NOT NULL DEFAULT 1,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'WAITING',
    "decided_by_id" UUID,
    "decision_reason" TEXT,
    "decided_at" TIMESTAMP(3),
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log_entry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_login_id" UUID,
    "actor_note" TEXT,
    "action" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "device" TEXT,
    "ip_address" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_code_key" ON "school"("code");

-- CreateIndex
CREATE INDEX "campus_school_id_idx" ON "campus"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_login_username_key" ON "user_login"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_login_invite_token_hash_key" ON "user_login"("invite_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_user_login_id_idx" ON "session"("user_login_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_school_id_name_key" ON "role"("school_id", "name");

-- CreateIndex
CREATE INDEX "school_access_user_login_id_idx" ON "school_access"("user_login_id");

-- CreateIndex
CREATE INDEX "school_access_school_id_idx" ON "school_access"("school_id");

-- CreateIndex
CREATE INDEX "notification_school_id_user_login_id_read_at_idx" ON "notification"("school_id", "user_login_id", "read_at");

-- CreateIndex
CREATE INDEX "approval_school_id_status_idx" ON "approval"("school_id", "status");

-- CreateIndex
CREATE INDEX "audit_log_entry_school_id_record_type_record_id_idx" ON "audit_log_entry"("school_id", "record_type", "record_id");

-- CreateIndex
CREATE INDEX "audit_log_entry_school_id_at_idx" ON "audit_log_entry"("school_id", "at");

-- AddForeignKey
ALTER TABLE "school" ADD CONSTRAINT "school_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "school_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campus" ADD CONSTRAINT "campus_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_login_id_fkey" FOREIGN KEY ("user_login_id") REFERENCES "user_login"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_access" ADD CONSTRAINT "school_access_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_access" ADD CONSTRAINT "school_access_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_access" ADD CONSTRAINT "school_access_user_login_id_fkey" FOREIGN KEY ("user_login_id") REFERENCES "user_login"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_access_role" ADD CONSTRAINT "school_access_role_school_access_id_fkey" FOREIGN KEY ("school_access_id") REFERENCES "school_access"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_access_role" ADD CONSTRAINT "school_access_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_module" ADD CONSTRAINT "school_module_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_feature" ADD CONSTRAINT "school_feature_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_login_id_fkey" FOREIGN KEY ("user_login_id") REFERENCES "user_login"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval" ADD CONSTRAINT "approval_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_entry" ADD CONSTRAINT "audit_log_entry_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Each school's data stays its own (08-platform-security.md §1).
--
-- The app connects as school_os_app. Before touching school data it sets
-- app.school_id (and app.user_id) for the current transaction; see
-- src/lib/db.ts. Row-level security then hides every other school's rows,
-- and refuses to write a row into another school, even if the app code has
-- a bug. FORCE makes the rules apply to the table owner as well.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app_school_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.school_id', true), '')::uuid
$$;

CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- School Access: a person sees their own access rows (to list their schools),
-- and, inside a school, that school's access rows.
ALTER TABLE "school_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_access" FORCE ROW LEVEL SECURITY;
CREATE POLICY school_access_read ON "school_access" FOR SELECT
  USING (school_id = app_school_id() OR user_login_id = app_user_id());
CREATE POLICY school_access_write ON "school_access" FOR INSERT
  WITH CHECK (school_id = app_school_id());
CREATE POLICY school_access_update ON "school_access" FOR UPDATE
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());

-- School: the current school, plus the schools the person has access to
-- (for the School switcher).
ALTER TABLE "school" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school" FORCE ROW LEVEL SECURITY;
CREATE POLICY school_read ON "school" FOR SELECT
  USING (
    id = app_school_id()
    OR EXISTS (
      SELECT 1 FROM "school_access" a
      WHERE a.school_id = "school".id AND a.user_login_id = app_user_id() AND a.archived_at IS NULL
    )
  );
CREATE POLICY school_write ON "school" FOR INSERT WITH CHECK (id = app_school_id());
CREATE POLICY school_update ON "school" FOR UPDATE
  USING (id = app_school_id()) WITH CHECK (id = app_school_id());

-- Group: only the group of a school the person can see.
ALTER TABLE "school_group" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_group" FORCE ROW LEVEL SECURITY;
CREATE POLICY school_group_read ON "school_group" FOR SELECT
  USING (id IN (SELECT group_id FROM "school" WHERE group_id IS NOT NULL));

-- Every other school record: only the current school's rows.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'campus', 'role', 'school_access_role', 'school_module', 'school_feature',
    'notification', 'approval', 'audit_log_entry'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id())',
      t || '_same_school', t
    );
  END LOOP;
END $$;

-- Roles of a person's own access rows are readable before a school is chosen,
-- so the menu can be worked out at sign-in.
CREATE POLICY school_access_role_own ON "school_access_role" FOR SELECT
  USING (school_access_id IN (SELECT id FROM "school_access" WHERE user_login_id = app_user_id()));
CREATE POLICY role_own ON "role" FOR SELECT
  USING (id IN (
    SELECT r.role_id FROM "school_access_role" r
    JOIN "school_access" a ON a.id = r.school_access_id
    WHERE a.user_login_id = app_user_id()
  ));

-- ---------------------------------------------------------------------------
-- Audit Log Entries can never be changed or deleted (04-data-model.md, rule 23).
-- ---------------------------------------------------------------------------
CREATE FUNCTION audit_log_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit Log Entries can never be changed or deleted';
END $$;

CREATE TRIGGER audit_log_no_update_or_delete
  BEFORE UPDATE OR DELETE ON "audit_log_entry"
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "audit_log_entry"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_is_append_only();

-- ---------------------------------------------------------------------------
-- What the running app may do. Records are archived, never deleted, so the
-- app gets no DELETE permission anywhere.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO school_os_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO school_os_app;
REVOKE UPDATE ON "audit_log_entry" FROM school_os_app;
REVOKE ALL ON "_prisma_migrations" FROM school_os_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO school_os_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO school_os_app;
