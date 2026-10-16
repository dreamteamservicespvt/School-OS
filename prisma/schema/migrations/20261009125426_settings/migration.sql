-- AlterTable
ALTER TABLE "school_access" ADD COLUMN     "exceptions" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "user_login" ADD COLUMN     "notification_prefs" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "two_step_reset_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "school_document" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issued_on" DATE,
    "expires_on" DATE,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by_id" UUID,
    "visible_to" TEXT[] DEFAULT ARRAY['school-admin', 'principal']::TEXT[],
    "versions" JSONB NOT NULL DEFAULT '[]',
    "reminder_sent_for" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "school_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_gateway_account" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'test',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "public_key" TEXT,
    "secrets_enc" TEXT NOT NULL,
    "secrets_last4" TEXT,
    "webhook_secret_enc" TEXT,
    "last_test_at" TIMESTAMP(3),
    "last_test_ok" BOOLEAN,
    "last_test_note" TEXT,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "payment_gateway_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_channel" (
    "school_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT,
    "is_on" BOOLEAN NOT NULL DEFAULT false,
    "environment" TEXT NOT NULL DEFAULT 'test',
    "config" JSONB NOT NULL DEFAULT '{}',
    "secrets_enc" TEXT,
    "secrets_last4" TEXT,
    "low_credit_alert" INTEGER NOT NULL DEFAULT 100,
    "last_test_at" TIMESTAMP(3),
    "last_test_ok" BOOLEAN,
    "last_test_note" TEXT,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_channel_pkey" PRIMARY KEY ("school_id","channel")
);

-- CreateTable
CREATE TABLE "credit_ledger_entry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "message_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_design" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "base" TEXT NOT NULL DEFAULT 'classic',
    "options" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_design_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signatory" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_file_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "signatory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "record_type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "choices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" TEXT NOT NULL DEFAULT 'everyone',
    "show_when" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "custom_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_text" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "consent_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "text" JSONB NOT NULL,
    "asked_on_admission" BOOLEAN NOT NULL DEFAULT true,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_text_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_rule" (
    "school_id" UUID NOT NULL,
    "record_type" TEXT NOT NULL,
    "keep_months" INTEGER,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_rule_pkey" PRIMARY KEY ("school_id","record_type")
);

-- CreateTable
CREATE TABLE "deletion_request" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "person_type" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "person_name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'all',
    "reason" TEXT NOT NULL,
    "asked_by" TEXT NOT NULL,
    "proof_file_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "approval_id" UUID,
    "completed_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deletion_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_export" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preparing',
    "file_id" UUID,
    "requested_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMP(3),

    CONSTRAINT "data_export_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration" (
    "school_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not-connected',
    "config" JSONB NOT NULL DEFAULT '{}',
    "secrets_enc" TEXT,
    "last_check_at" TIMESTAMP(3),
    "last_error" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_pkey" PRIMARY KEY ("school_id","key")
);

-- CreateIndex
CREATE INDEX "school_document_school_id_expires_on_idx" ON "school_document"("school_id", "expires_on");

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_account_school_id_display_name_key" ON "payment_gateway_account"("school_id", "display_name");

-- CreateIndex
CREATE INDEX "credit_ledger_entry_school_id_channel_created_at_idx" ON "credit_ledger_entry"("school_id", "channel", "created_at");

-- CreateIndex
CREATE INDEX "document_design_school_id_doc_type_is_current_idx" ON "document_design"("school_id", "doc_type", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_school_id_record_type_key_key" ON "custom_field"("school_id", "record_type", "key");

-- CreateIndex
CREATE UNIQUE INDEX "consent_text_school_id_consent_type_version_key" ON "consent_text"("school_id", "consent_type", "version");


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "school_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_document" FORCE ROW LEVEL SECURITY;
CREATE POLICY "school_document_same_school" ON "school_document" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "payment_gateway_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_gateway_account" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_gateway_account_same_school" ON "payment_gateway_account" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "messaging_channel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messaging_channel" FORCE ROW LEVEL SECURITY;
CREATE POLICY "messaging_channel_same_school" ON "messaging_channel" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "credit_ledger_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_ledger_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "credit_ledger_entry_same_school" ON "credit_ledger_entry" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "document_design" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_design" FORCE ROW LEVEL SECURITY;
CREATE POLICY "document_design_same_school" ON "document_design" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "signatory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "signatory" FORCE ROW LEVEL SECURITY;
CREATE POLICY "signatory_same_school" ON "signatory" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "custom_field" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_field" FORCE ROW LEVEL SECURITY;
CREATE POLICY "custom_field_same_school" ON "custom_field" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "consent_text" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_text" FORCE ROW LEVEL SECURITY;
CREATE POLICY "consent_text_same_school" ON "consent_text" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "retention_rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "retention_rule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "retention_rule_same_school" ON "retention_rule" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "deletion_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deletion_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY "deletion_request_same_school" ON "deletion_request" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "data_export" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_export" FORCE ROW LEVEL SECURITY;
CREATE POLICY "data_export_same_school" ON "data_export" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "integration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration" FORCE ROW LEVEL SECURITY;
CREATE POLICY "integration_same_school" ON "integration" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
