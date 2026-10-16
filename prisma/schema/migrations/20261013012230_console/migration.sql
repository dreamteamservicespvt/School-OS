-- CreateEnum
CREATE TYPE "ConsoleRole" AS ENUM ('OWNER', 'ONBOARDING', 'SUPPORT');

-- CreateEnum
CREATE TYPE "ConsoleUserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "SchoolInviteKind" AS ENUM ('INVITE', 'RESET');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PAID', 'DUE', 'GRACE', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PlatformInvoiceStatus" AS ENUM ('WAITING', 'UNPAID', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "school" ADD COLUMN     "billing_notice" JSONB,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateTable
CREATE TABLE "super_admin_user" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "role" "ConsoleRole" NOT NULL,
    "status" "ConsoleUserStatus" NOT NULL DEFAULT 'INVITED',
    "password_hash" TEXT,
    "invite_token_hash" TEXT,
    "invite_expires_at" TIMESTAMP(3),
    "invited_by_id" UUID,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_sign_in_at" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "disabled_at" TIMESTAMP(3),
    "disabled_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "super_admin_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "console_session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,

    CONSTRAINT "console_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "console_code" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "challenge_hash" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "sent_to" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "console_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "console_device" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "console_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "console_school" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "board" TEXT,
    "school_type" TEXT,
    "phone" TEXT,
    "phone_digits" TEXT,
    "email" TEXT,
    "address" TEXT,
    "approx_students" INTEGER,
    "group_id" UUID,
    "group_name" TEXT,
    "status" "SchoolStatus" NOT NULL DEFAULT 'TRIAL',
    "status_since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "keep_until" DATE,
    "trial_ends_on" DATE,
    "started_as" "SchoolStatus" NOT NULL DEFAULT 'TRIAL',
    "added_by_id" UUID,
    "added_by_name" TEXT,
    "first_admin_sign_in_at" TIMESTAMP(3),
    "active_students" INTEGER NOT NULL DEFAULT 0,
    "staff_logins" INTEGER NOT NULL DEFAULT 0,
    "last_activity_at" TIMESTAMP(3),
    "messages_this_month" INTEGER NOT NULL DEFAULT 0,
    "credits_whatsapp" INTEGER NOT NULL DEFAULT 0,
    "credits_sms" INTEGER NOT NULL DEFAULT 0,
    "modules_on" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "campuses" INTEGER NOT NULL DEFAULT 1,
    "setup_done" INTEGER NOT NULL DEFAULT 0,
    "setup_total" INTEGER NOT NULL DEFAULT 10,
    "setup_steps" JSONB NOT NULL DEFAULT '[]',
    "setup_changed_at" TIMESTAMP(3),
    "messages_stuck" INTEGER NOT NULL DEFAULT 0,
    "messages_failed" INTEGER NOT NULL DEFAULT 0,
    "jobs_failed" INTEGER NOT NULL DEFAULT 0,
    "channel_stats" JSONB NOT NULL DEFAULT '{}',
    "admin_name" TEXT,
    "admin_phone" TEXT,
    "admin_signed_in" BOOLEAN NOT NULL DEFAULT false,
    "measured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "console_school_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_invite" (
    "id" UUID NOT NULL,
    "for_school_id" UUID NOT NULL,
    "user_login_id" UUID NOT NULL,
    "kind" "SchoolInviteKind" NOT NULL DEFAULT 'INVITE',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "role_key" TEXT NOT NULL,
    "channels" TEXT[],
    "token_hash" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "opened_at" TIMESTAMP(3),
    "code_hash" TEXT,
    "code_sent_at" TIMESTAMP(3),
    "code_attempts" INTEGER NOT NULL DEFAULT 0,
    "code_ok_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "replaced_at" TIMESTAMP(3),
    "sent_by_id" UUID,
    "sent_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_status_change" (
    "id" UUID NOT NULL,
    "for_school_id" UUID NOT NULL,
    "from_status" "SchoolStatus",
    "to_status" "SchoolStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "by_id" UUID,
    "by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_status_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_note" (
    "id" UUID NOT NULL,
    "for_school_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "by_id" UUID,
    "by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "school_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_add_on" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT NOT NULL,
    "price_paise" BIGINT NOT NULL,
    "min_students" INTEGER NOT NULL DEFAULT 0,
    "price_above_1000_paise" BIGINT,
    "credits_per_student" INTEGER NOT NULL DEFAULT 0,
    "storage_gb" INTEGER,
    "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "valid_from" DATE NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" UUID NOT NULL,
    "for_school_id" UUID NOT NULL,
    "plan_key" TEXT NOT NULL,
    "hostel" BOOLEAN NOT NULL DEFAULT false,
    "buses" INTEGER NOT NULL DEFAULT 0,
    "students_paid_for" INTEGER NOT NULL,
    "price_per_student_paise" BIGINT NOT NULL,
    "discount_percent" INTEGER NOT NULL DEFAULT 0,
    "discount_reason" TEXT,
    "founding_number" INTEGER,
    "price_locked_until" DATE,
    "start_on" DATE NOT NULL,
    "renew_on" DATE NOT NULL,
    "pay_in" TEXT NOT NULL DEFAULT 'YEARLY',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'DUE',
    "next_plan_key" TEXT,
    "next_hostel" BOOLEAN,
    "six_month_checked_at" TIMESTAMP(3),
    "reminders_sent" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_invoice" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "for_school_id" UUID NOT NULL,
    "subscription_id" UUID,
    "kind" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "subtotal_paise" BIGINT NOT NULL,
    "discount_paise" BIGINT NOT NULL DEFAULT 0,
    "gst_paise" BIGINT NOT NULL,
    "total_paise" BIGINT NOT NULL,
    "students" INTEGER,
    "period_from" DATE,
    "period_to" DATE,
    "issued_on" DATE NOT NULL,
    "due_on" DATE NOT NULL,
    "status" "PlatformInvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "sent_at" TIMESTAMP(3),
    "razorpay_link_id" TEXT,
    "razorpay_link_url" TEXT,
    "paid_at" TIMESTAMP(3),
    "paid_via" TEXT,
    "paid_ref" TEXT,
    "marked_paid_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "cancelled_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "console_sequence" (
    "key" TEXT NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "console_sequence_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "console_activity_entry" (
    "id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "actor_name" TEXT NOT NULL,
    "actor_role" TEXT,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "for_school_id" UUID,
    "school_name" TEXT,
    "from_value" TEXT,
    "to_value" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,

    CONSTRAINT "console_activity_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "console_message" (
    "id" UUID NOT NULL,
    "for_school_id" UUID,
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "fail_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "console_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "console_notification" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "link" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'info',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "console_notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "super_admin_user_phone_key" ON "super_admin_user"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "super_admin_user_invite_token_hash_key" ON "super_admin_user"("invite_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "console_session_token_hash_key" ON "console_session"("token_hash");

-- CreateIndex
CREATE INDEX "console_session_user_id_idx" ON "console_session"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "console_code_challenge_hash_key" ON "console_code"("challenge_hash");

-- CreateIndex
CREATE INDEX "console_code_user_id_created_at_idx" ON "console_code"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "console_device_token_hash_key" ON "console_device"("token_hash");

-- CreateIndex
CREATE INDEX "console_device_user_id_idx" ON "console_device"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "console_school_code_key" ON "console_school"("code");

-- CreateIndex
CREATE INDEX "console_school_status_idx" ON "console_school"("status");

-- CreateIndex
CREATE INDEX "console_school_phone_digits_idx" ON "console_school"("phone_digits");

-- CreateIndex
CREATE UNIQUE INDEX "school_invite_token_hash_key" ON "school_invite"("token_hash");

-- CreateIndex
CREATE INDEX "school_invite_for_school_id_created_at_idx" ON "school_invite"("for_school_id", "created_at");

-- CreateIndex
CREATE INDEX "school_invite_user_login_id_idx" ON "school_invite"("user_login_id");

-- CreateIndex
CREATE INDEX "school_status_change_for_school_id_created_at_idx" ON "school_status_change"("for_school_id", "created_at");

-- CreateIndex
CREATE INDEX "school_note_for_school_id_created_at_idx" ON "school_note"("for_school_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "plan_key_valid_from_key" ON "plan"("key", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_for_school_id_key" ON "subscription"("for_school_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_founding_number_key" ON "subscription"("founding_number");

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoice_number_key" ON "platform_invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoice_razorpay_link_id_key" ON "platform_invoice"("razorpay_link_id");

-- CreateIndex
CREATE INDEX "platform_invoice_for_school_id_issued_on_idx" ON "platform_invoice"("for_school_id", "issued_on");

-- CreateIndex
CREATE INDEX "platform_invoice_status_idx" ON "platform_invoice"("status");

-- CreateIndex
CREATE INDEX "console_activity_entry_at_idx" ON "console_activity_entry"("at");

-- CreateIndex
CREATE INDEX "console_activity_entry_for_school_id_at_idx" ON "console_activity_entry"("for_school_id", "at");

-- CreateIndex
CREATE INDEX "console_message_for_school_id_created_at_idx" ON "console_message"("for_school_id", "created_at");

-- CreateIndex
CREATE INDEX "console_notification_user_id_read_at_idx" ON "console_notification"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "console_session" ADD CONSTRAINT "console_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "super_admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "console_code" ADD CONSTRAINT "console_code_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "super_admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "console_device" ADD CONSTRAINT "console_device_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "super_admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- The console's own records (07-super-admin.md §8, §10) are kept outside every
-- school's data. They are visible only while app.console is on, which only
-- withConsole() and withConsoleSchool() in src/lib/db.ts set. Inside a school
-- (withSchool) they do not exist; inside the console, school records do not
-- exist except the one school withConsoleSchool() names.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_in_console() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.console', true), '') = 'on'
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'super_admin_user', 'console_session', 'console_code', 'console_device',
    'console_school', 'school_invite', 'school_status_change', 'school_note',
    'plan', 'subscription', 'platform_invoice', 'console_sequence',
    'console_activity_entry', 'console_message', 'console_notification'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (app_in_console()) WITH CHECK (app_in_console())', t || '_console_only', t);
  END LOOP;
END $$;

-- Groups hold only a name; the console makes them and links schools to them.
CREATE POLICY school_group_console ON "school_group"
  USING (app_in_console()) WITH CHECK (app_in_console());

-- The Activity Log can never be changed or deleted (07-super-admin.md §3.7).
CREATE FUNCTION console_activity_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Console Activity Entries can never be changed or deleted';
END $$;
CREATE TRIGGER console_activity_no_update_or_delete
  BEFORE UPDATE OR DELETE ON "console_activity_entry"
  FOR EACH ROW EXECUTE FUNCTION console_activity_is_append_only();
CREATE TRIGGER console_activity_no_truncate
  BEFORE TRUNCATE ON "console_activity_entry"
  FOR EACH STATEMENT EXECUTE FUNCTION console_activity_is_append_only();
REVOKE UPDATE ON "console_activity_entry" FROM school_os_app;

-- The price list from school-os/pricing/pricing.md (9 October 2026), in paise.
SELECT set_config('app.console', 'on', false);
INSERT INTO "plan" (id, key, name, is_add_on, unit, price_paise, min_students, price_above_1000_paise, credits_per_student, storage_gb, modules, valid_from) VALUES
  (gen_random_uuid(), 'essential', 'Essential', false, 'per-student', 12000, 100, 6000, 60, 25, ARRAY[]::text[], DATE '2026-04-01'),
  (gen_random_uuid(), 'complete', 'Complete', false, 'per-student', 20000, 100, 10000, 100, 50, ARRAY[]::text[], DATE '2026-04-01'),
  (gen_random_uuid(), 'hostel', 'Hostel', true, 'per-school', 1000000, 0, NULL, 0, NULL, ARRAY['hostel']::text[], DATE '2026-04-01'),
  (gen_random_uuid(), 'transport', 'Transport', true, 'per-bus', 150000, 0, NULL, 0, NULL, ARRAY['transport']::text[], DATE '2026-04-01');

-- Every school that already exists gets its console card, so nothing is lost.
SELECT set_config('app.job_claim', 'on', false);
INSERT INTO "console_school" (id, code, name, board, school_type, phone, phone_digits, email, address, group_id, status, status_since, trial_ends_on, started_as, created_at, updated_at)
SELECT s.id, s.code, s.name, s.board, s.school_type, s.phone,
       nullif(right(regexp_replace(coalesce(s.phone, ''), '\D', '', 'g'), 10), ''),
       s.email, s.address, s.group_id, s.status, s.updated_at, s.trial_ends_on, s.status, s.created_at, CURRENT_TIMESTAMP
FROM "school" s;
SELECT set_config('app.job_claim', 'off', false);
SELECT set_config('app.console', 'off', false);
