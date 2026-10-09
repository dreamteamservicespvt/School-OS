-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SCHEDULED', 'QUEUED', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "NoticeStatus" AS ENUM ('DRAFT', 'WAITING_APPROVAL', 'SCHEDULED', 'PUBLISHED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NoticePriority" AS ENUM ('NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "QueryStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ParentLinkStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "template" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "key" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_version" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dlt_template_id" TEXT,
    "whatsapp_name" TEXT,
    "whatsapp_status" TEXT,
    "whatsapp_note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "channels" TEXT[],
    "template_id" UUID,
    "audience_label" TEXT NOT NULL,
    "audience" JSONB NOT NULL DEFAULT '{}',
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "skipped" JSONB NOT NULL DEFAULT '[]',
    "credit_cost" INTEGER NOT NULL DEFAULT 0,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "is_emergency" BOOLEAN NOT NULL DEFAULT false,
    "message_type" TEXT NOT NULL DEFAULT 'general',
    "sms_backup" BOOLEAN NOT NULL DEFAULT false,
    "backup_template_id" UUID,
    "sent_by_id" UUID,
    "rule_key" TEXT,
    "trigger" TEXT,
    "source_type" TEXT,
    "source_id" TEXT,
    "attachment_file_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "resend_of_id" UUID,
    "idempotency_key" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_recipient" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "recipient_type" TEXT NOT NULL,
    "guardian_id" UUID,
    "student_id" UUID,
    "staff_id" UUID,
    "user_login_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "channel" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "template_version_id" UUID,
    "values" JSONB NOT NULL DEFAULT '{}',
    "text" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "fail_reason" TEXT,
    "provider_message_id" TEXT,
    "provider" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "is_backup" BOOLEAN NOT NULL DEFAULT false,
    "backup_of_id" UUID,
    "backup_reason" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "locked_at" TIMESTAMP(3),
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),

    CONSTRAINT "message_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipient_group" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rule" JSONB NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "recipient_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automatic_message_rule" (
    "school_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "is_on" BOOLEAN NOT NULL DEFAULT true,
    "template_id" UUID,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "send_to" TEXT NOT NULL DEFAULT 'primary',
    "timing" JSONB NOT NULL DEFAULT '{}',
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automatic_message_rule_pkey" PRIMARY KEY ("school_id","key")
);

-- CreateTable
CREATE TABLE "automation_log" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "rule_key" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "event_label" TEXT NOT NULL,
    "recipient_key" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "note" TEXT,
    "message_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opt_out_record" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "how" TEXT NOT NULL,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opt_out_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_settings" (
    "school_id" UUID NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_settings_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "notice" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachment_file_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "audience" JSONB NOT NULL,
    "audience_label" TEXT NOT NULL,
    "priority" "NoticePriority" NOT NULL DEFAULT 'NORMAL',
    "channels" TEXT[],
    "status" "NoticeStatus" NOT NULL DEFAULT 'DRAFT',
    "publish_at" TIMESTAMP(3),
    "expires_on" DATE,
    "ask_ack" BOOLEAN NOT NULL DEFAULT false,
    "approval_id" UUID,
    "published_at" TIMESTAMP(3),
    "staff_count" INTEGER NOT NULL DEFAULT 0,
    "guardian_count" INTEGER NOT NULL DEFAULT 0,
    "message_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_acknowledgement" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "notice_id" UUID NOT NULL,
    "user_login_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),

    CONSTRAINT "notice_acknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_guardian_view" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "notice_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "via" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_guardian_view_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_topic" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "default_owner_id" UUID,
    "default_department_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "query_topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "from_type" TEXT NOT NULL,
    "guardian_id" UUID,
    "student_id" UUID,
    "staff_id" UUID,
    "from_name" TEXT NOT NULL,
    "from_phone" TEXT,
    "about_student_id" UUID,
    "type" TEXT NOT NULL,
    "topic_id" UUID,
    "details" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "owner_id" UUID,
    "department_id" UUID,
    "came_by" TEXT NOT NULL DEFAULT 'phone',
    "status" "QueryStatus" NOT NULL DEFAULT 'OPEN',
    "due_by" TIMESTAMP(3),
    "escalated_at" TIMESTAMP(3),
    "resolution" TEXT,
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "rating" INTEGER,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "query_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_note" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "query_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "message_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_link" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_hint" TEXT NOT NULL,
    "status" "ParentLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_opened_at" TIMESTAMP(3),
    "last_sent_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" UUID,
    "revoke_reason" TEXT,
    "replaced_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_link_device" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "parent_link_id" UUID NOT NULL,
    "key_hash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ip_address" TEXT,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "parent_link_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_link_code" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "parent_link_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "key_hash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "message_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_link_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_record" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "consent_type" TEXT NOT NULL,
    "consent_text_id" UUID NOT NULL,
    "text_version" INTEGER NOT NULL,
    "given_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "how" TEXT NOT NULL,
    "parent_link_id" UUID,
    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_how" TEXT,
    "created_by_id" UUID,

    CONSTRAINT "consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_request" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "consent_type" TEXT NOT NULL,
    "consent_text_id" UUID NOT NULL,
    "audience_label" TEXT NOT NULL,
    "guardian_ids" UUID[],
    "reply_by" DATE NOT NULL,
    "message_id" UUID,
    "last_reminder_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "template_school_id_channel_category_idx" ON "template"("school_id", "channel", "category");

-- CreateIndex
CREATE INDEX "template_school_id_key_idx" ON "template"("school_id", "key");

-- CreateIndex
CREATE INDEX "template_version_school_id_template_id_is_current_idx" ON "template_version"("school_id", "template_id", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "template_version_template_id_language_version_key" ON "template_version"("template_id", "language", "version");

-- CreateIndex
CREATE INDEX "message_school_id_created_at_idx" ON "message"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "message_school_id_source_type_source_id_idx" ON "message"("school_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "message_school_id_status_scheduled_at_idx" ON "message"("school_id", "status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "message_school_id_idempotency_key_key" ON "message"("school_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "message_recipient_backup_of_id_key" ON "message_recipient"("backup_of_id");

-- CreateIndex
CREATE INDEX "message_recipient_school_id_message_id_status_idx" ON "message_recipient"("school_id", "message_id", "status");

-- CreateIndex
CREATE INDEX "message_recipient_school_id_guardian_id_idx" ON "message_recipient"("school_id", "guardian_id");

-- CreateIndex
CREATE INDEX "message_recipient_school_id_staff_id_idx" ON "message_recipient"("school_id", "staff_id");

-- CreateIndex
CREATE INDEX "message_recipient_school_id_user_login_id_channel_idx" ON "message_recipient"("school_id", "user_login_id", "channel");

-- CreateIndex
CREATE INDEX "message_recipient_school_id_provider_message_id_idx" ON "message_recipient"("school_id", "provider_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipient_group_school_id_name_key" ON "recipient_group"("school_id", "name");

-- CreateIndex
CREATE INDEX "automation_log_school_id_created_at_idx" ON "automation_log"("school_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "automation_log_school_id_rule_key_event_key_recipient_key_key" ON "automation_log"("school_id", "rule_key", "event_key", "recipient_key");

-- CreateIndex
CREATE INDEX "opt_out_record_school_id_guardian_id_idx" ON "opt_out_record"("school_id", "guardian_id");

-- CreateIndex
CREATE INDEX "notice_school_id_status_publish_at_idx" ON "notice"("school_id", "status", "publish_at");

-- CreateIndex
CREATE UNIQUE INDEX "notice_acknowledgement_notice_id_user_login_id_key" ON "notice_acknowledgement"("notice_id", "user_login_id");

-- CreateIndex
CREATE UNIQUE INDEX "notice_guardian_view_notice_id_guardian_id_key" ON "notice_guardian_view"("notice_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "query_topic_school_id_name_key" ON "query_topic"("school_id", "name");

-- CreateIndex
CREATE INDEX "query_school_id_status_idx" ON "query"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "query_school_id_number_key" ON "query"("school_id", "number");

-- CreateIndex
CREATE INDEX "query_note_school_id_query_id_idx" ON "query_note"("school_id", "query_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_link_token_hash_key" ON "parent_link"("token_hash");

-- CreateIndex
CREATE INDEX "parent_link_school_id_guardian_id_idx" ON "parent_link"("school_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_link_device_key_hash_key" ON "parent_link_device"("key_hash");

-- CreateIndex
CREATE INDEX "parent_link_device_school_id_parent_link_id_idx" ON "parent_link_device"("school_id", "parent_link_id");

-- CreateIndex
CREATE INDEX "parent_link_code_school_id_parent_link_id_created_at_idx" ON "parent_link_code"("school_id", "parent_link_id", "created_at");

-- CreateIndex
CREATE INDEX "consent_record_school_id_guardian_id_consent_type_idx" ON "consent_record"("school_id", "guardian_id", "consent_type");

-- CreateIndex
CREATE INDEX "consent_record_school_id_student_id_consent_type_idx" ON "consent_record"("school_id", "student_id", "consent_type");

-- CreateIndex
CREATE INDEX "consent_request_school_id_consent_type_idx" ON "consent_request"("school_id", "consent_type");

-- AddForeignKey
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipient" ADD CONSTRAINT "message_recipient_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_acknowledgement" ADD CONSTRAINT "notice_acknowledgement_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_guardian_view" ADD CONSTRAINT "notice_guardian_view_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_note" ADD CONSTRAINT "query_note_query_id_fkey" FOREIGN KEY ("query_id") REFERENCES "query"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_link_device" ADD CONSTRAINT "parent_link_device_parent_link_id_fkey" FOREIGN KEY ("parent_link_id") REFERENCES "parent_link"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_link_code" ADD CONSTRAINT "parent_link_code_parent_link_id_fkey" FOREIGN KEY ("parent_link_id") REFERENCES "parent_link"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "template" FORCE ROW LEVEL SECURITY;
CREATE POLICY "template_same_school" ON "template" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "template_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "template_version" FORCE ROW LEVEL SECURITY;
CREATE POLICY "template_version_same_school" ON "template_version" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message" FORCE ROW LEVEL SECURITY;
CREATE POLICY "message_same_school" ON "message" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "message_recipient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_recipient" FORCE ROW LEVEL SECURITY;
CREATE POLICY "message_recipient_same_school" ON "message_recipient" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "recipient_group" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipient_group" FORCE ROW LEVEL SECURITY;
CREATE POLICY "recipient_group_same_school" ON "recipient_group" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "automatic_message_rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automatic_message_rule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "automatic_message_rule_same_school" ON "automatic_message_rule" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "automation_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY "automation_log_same_school" ON "automation_log" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "opt_out_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "opt_out_record" FORCE ROW LEVEL SECURITY;
CREATE POLICY "opt_out_record_same_school" ON "opt_out_record" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "message_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "message_settings_same_school" ON "message_settings" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "notice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notice_same_school" ON "notice" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "notice_acknowledgement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notice_acknowledgement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notice_acknowledgement_same_school" ON "notice_acknowledgement" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "notice_guardian_view" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notice_guardian_view" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notice_guardian_view_same_school" ON "notice_guardian_view" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "query_topic" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "query_topic" FORCE ROW LEVEL SECURITY;
CREATE POLICY "query_topic_same_school" ON "query_topic" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "query" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "query" FORCE ROW LEVEL SECURITY;
CREATE POLICY "query_same_school" ON "query" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "query_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "query_note" FORCE ROW LEVEL SECURITY;
CREATE POLICY "query_note_same_school" ON "query_note" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "parent_link" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parent_link" FORCE ROW LEVEL SECURITY;
CREATE POLICY "parent_link_same_school" ON "parent_link" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "parent_link_device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parent_link_device" FORCE ROW LEVEL SECURITY;
CREATE POLICY "parent_link_device_same_school" ON "parent_link_device" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "parent_link_code" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parent_link_code" FORCE ROW LEVEL SECURITY;
CREATE POLICY "parent_link_code_same_school" ON "parent_link_code" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "consent_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_record" FORCE ROW LEVEL SECURITY;
CREATE POLICY "consent_record_same_school" ON "consent_record" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "consent_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY "consent_request_same_school" ON "consent_request" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());

-- One active Parent Link per guardian (rule 31); revoked ones stay for history.
CREATE UNIQUE INDEX "parent_link_one_active_per_guardian" ON "parent_link"("guardian_id") WHERE status = 'ACTIVE';

-- The guardian's page has no login and no school chosen. It may only find
-- which school a link belongs to, by the token's hash, through this function;
-- everything after that runs inside withSchool() for that one school.
CREATE POLICY "parent_link_lookup" ON "parent_link" FOR SELECT
  USING (current_user = 'school_os_owner' AND current_setting('app.link_lookup', true) = 'on');

CREATE FUNCTION find_parent_link(hash text) RETURNS TABLE(link_id uuid, link_school_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.link_lookup', 'on', true);
  RETURN QUERY SELECT p.id, p.school_id FROM parent_link p WHERE p.token_hash = hash LIMIT 1;
  PERFORM set_config('app.link_lookup', 'off', true);
END $$;

REVOKE ALL ON FUNCTION find_parent_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_parent_link(text) TO school_os_app;
