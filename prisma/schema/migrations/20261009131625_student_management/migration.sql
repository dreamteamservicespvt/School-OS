-- CreateEnum
CREATE TYPE "CertificateType" AS ENUM ('TC', 'BONAFIDE', 'STUDY', 'CHARACTER', 'MIGRATION');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeavingType" AS ENUM ('TRANSFER', 'WITHDRAWAL', 'GRADUATION');

-- CreateEnum
CREATE TYPE "LeavingStatus" AS ENUM ('IN_PROGRESS', 'LEFT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClearanceStatus" AS ENUM ('CLEAR', 'PENDING', 'WAIVER_ASKED', 'WAIVED');

-- CreateEnum
CREATE TYPE "PromotionDecisionKind" AS ENUM ('PROMOTE', 'DETAIN', 'LEAVING');

-- CreateTable
CREATE TABLE "student_settings" (
    "school_id" UUID NOT NULL,
    "admission_prefix" TEXT NOT NULL DEFAULT '',
    "admission_use_year" BOOLEAN NOT NULL DEFAULT true,
    "admission_padding" INTEGER NOT NULL DEFAULT 4,
    "admission_restart_year" BOOLEAN NOT NULL DEFAULT false,
    "required_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "list_columns" TEXT[] DEFAULT ARRAY['photo', 'admissionNo', 'classSection', 'rollNo', 'guardian', 'phone', 'status']::TEXT[],
    "identifier_types" JSONB NOT NULL DEFAULT '[]',
    "required_documents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "leaving_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approval_certificates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "default_signatories" JSONB NOT NULL DEFAULT '{}',
    "incident_types" JSONB NOT NULL DEFAULT '[]',
    "points_on" BOOLEAN NOT NULL DEFAULT false,
    "counselling_roles" TEXT[] DEFAULT ARRAY['counsellor', 'principal']::TEXT[],
    "counselling_on" BOOLEAN NOT NULL DEFAULT false,
    "career_on" BOOLEAN NOT NULL DEFAULT false,
    "alumni_on" BOOLEAN NOT NULL DEFAULT false,
    "qr_on" BOOLEAN NOT NULL DEFAULT true,
    "rfid_on" BOOLEAN NOT NULL DEFAULT false,
    "migration_on" BOOLEAN NOT NULL DEFAULT false,
    "student_logins_on" BOOLEAN NOT NULL DEFAULT false,
    "id_card_valid_until" DATE,
    "id_cards_per_page" INTEGER NOT NULL DEFAULT 8,
    "id_card_fields" TEXT[] DEFAULT ARRAY['admissionNo', 'dateOfBirth', 'bloodGroup', 'guardianPhone', 'address']::TEXT[],
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_settings_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "promotion_policy" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "pass_required" BOOLEAN NOT NULL DEFAULT true,
    "min_attendance_pct" INTEGER,
    "fee_dues_allowed" BOOLEAN NOT NULL DEFAULT true,
    "exception_approver_role" TEXT NOT NULL DEFAULT 'principal',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_status_change" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "effective_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'profile',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_status_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_change" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrolment_id" UUID NOT NULL,
    "from_section_id" UUID NOT NULL,
    "to_section_id" UUID NOT NULL,
    "from_roll_no" INTEGER,
    "to_roll_no" INTEGER,
    "reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_at" TIMESTAMP(3),

    CONSTRAINT "section_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_previous_school" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "school_name" TEXT NOT NULL,
    "board" TEXT,
    "last_class" TEXT,
    "year" TEXT,
    "marks" TEXT,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_previous_school_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_identifier" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type_key" TEXT NOT NULL,
    "value_enc" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "student_identifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_emergency_contact" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "student_emergency_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_document" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID,
    "kind" TEXT NOT NULL,
    "file_id" UUID NOT NULL,
    "note" TEXT,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "student_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_note" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "visible_to_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "author_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "student_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_incident" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "type_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "action_taken" TEXT,
    "suspension_from" DATE,
    "suspension_to" DATE,
    "approved_by" TEXT,
    "photo_file_id" UUID,
    "parent_informed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reported_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "behaviour_incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_incident_student" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,

    CONSTRAINT "behaviour_incident_student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_point_entry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "incident_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_point_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counselling_case" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "counsellor_id" UUID,
    "reason" TEXT NOT NULL,
    "referred_by_id" UUID,
    "incident_id" UUID,
    "action_plan" TEXT,
    "outside_referral" TEXT,
    "next_session_on" DATE,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "opened_on" DATE NOT NULL,
    "closed_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "counselling_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counselling_session" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "confidential_enc" TEXT,
    "follow_up_on" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "counselling_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_record" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "college" TEXT,
    "course" TEXT,
    "status" TEXT,
    "deadline" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "career_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_batch" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "from_year_id" UUID NOT NULL,
    "from_section_id" UUID NOT NULL,
    "to_year_id" UUID NOT NULL,
    "to_class_id" UUID NOT NULL,
    "policy_id" UUID,
    "promoted" INTEGER NOT NULL DEFAULT 0,
    "detained" INTEGER NOT NULL DEFAULT 0,
    "leaving" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_at" TIMESTAMP(3),
    "undone_by_id" UUID,

    CONSTRAINT "promotion_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_decision" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "decision" "PromotionDecisionKind" NOT NULL,
    "suggested" "PromotionDecisionKind" NOT NULL,
    "reason" TEXT,
    "facts" JSONB NOT NULL DEFAULT '{}',
    "from_enrolment_id" UUID NOT NULL,
    "to_enrolment_id" UUID,
    "to_section_id" UUID,
    "previous_status" TEXT NOT NULL,
    "leaving_request_id" UUID,

    CONSTRAINT "promotion_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaving_request" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" "LeavingType" NOT NULL,
    "reason" TEXT NOT NULL,
    "last_date" DATE NOT NULL,
    "destination_school" TEXT,
    "document_file_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "LeavingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "previous_status" TEXT NOT NULL,
    "left_on" DATE,
    "cancel_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaving_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_clearance_check" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "leaving_request_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ClearanceStatus" NOT NULL,
    "detail" TEXT NOT NULL,
    "amount_paise" BIGINT,
    "action_href" TEXT,
    "action_label" TEXT,
    "waiver_reason" TEXT,
    "approval_id" UUID,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_clearance_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" "CertificateType" NOT NULL,
    "number" TEXT,
    "purpose" TEXT,
    "issue_date" DATE NOT NULL,
    "signatory_id" UUID,
    "status" "CertificateStatus" NOT NULL DEFAULT 'REQUESTED',
    "is_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicate_reason" TEXT,
    "original_id" UUID,
    "leaving_request_id" UUID,
    "approval_id" UUID,
    "approved_by_id" UUID,
    "verify_code" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "requested_by_id" UUID,
    "issued_by_id" UUID,
    "issued_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "id_card_print" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID,
    "batch_key" TEXT,
    "is_replacement" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "replaces_id" UUID,
    "replaced_at" TIMESTAMP(3),
    "valid_until" DATE,
    "printed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "id_card_print_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_rfid" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "rfid_no" TEXT NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_rfid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumni_record" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "graduation_year" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "career" TEXT,
    "higher_education" TEXT,
    "achievements" TEXT,
    "is_mentor" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "alumni_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumni_donation" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "alumni_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "purpose" TEXT NOT NULL,
    "receipt_ref" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alumni_donation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumni_mentorship" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "alumni_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "alumni_mentorship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_post" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "organisation" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "apply_by" DATE,
    "posted_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "job_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_update" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_at" TIMESTAMP(3),
    "undone_by_id" UUID,

    CONSTRAINT "bulk_update_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_merge" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kept_id" UUID NOT NULL,
    "merged_id" UUID NOT NULL,
    "moved" JSONB NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_merge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promotion_policy_school_id_academic_year_id_version_key" ON "promotion_policy"("school_id", "academic_year_id", "version");

-- CreateIndex
CREATE INDEX "student_status_change_school_id_student_id_idx" ON "student_status_change"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "section_change_school_id_student_id_idx" ON "section_change"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_previous_school_student_id_key" ON "student_previous_school"("student_id");

-- CreateIndex
CREATE INDEX "student_previous_school_school_id_idx" ON "student_previous_school"("school_id");

-- CreateIndex
CREATE INDEX "student_identifier_school_id_idx" ON "student_identifier"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_identifier_student_id_type_key_key" ON "student_identifier"("student_id", "type_key");

-- CreateIndex
CREATE INDEX "student_emergency_contact_school_id_student_id_idx" ON "student_emergency_contact"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "student_document_school_id_student_id_idx" ON "student_document"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "student_note_school_id_student_id_idx" ON "student_note"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "behaviour_incident_school_id_date_idx" ON "behaviour_incident"("school_id", "date");

-- CreateIndex
CREATE INDEX "behaviour_incident_student_school_id_student_id_idx" ON "behaviour_incident_student"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "behaviour_incident_student_incident_id_student_id_key" ON "behaviour_incident_student"("incident_id", "student_id");

-- CreateIndex
CREATE INDEX "behaviour_point_entry_school_id_student_id_idx" ON "behaviour_point_entry"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "counselling_case_school_id_student_id_idx" ON "counselling_case"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "counselling_case_school_id_counsellor_id_idx" ON "counselling_case"("school_id", "counsellor_id");

-- CreateIndex
CREATE INDEX "counselling_session_school_id_case_id_idx" ON "counselling_session"("school_id", "case_id");

-- CreateIndex
CREATE INDEX "career_record_school_id_student_id_idx" ON "career_record"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "promotion_batch_school_id_from_year_id_idx" ON "promotion_batch"("school_id", "from_year_id");

-- CreateIndex
CREATE INDEX "promotion_decision_school_id_student_id_idx" ON "promotion_decision"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_decision_batch_id_student_id_key" ON "promotion_decision"("batch_id", "student_id");

-- CreateIndex
CREATE INDEX "leaving_request_school_id_status_idx" ON "leaving_request"("school_id", "status");

-- CreateIndex
CREATE INDEX "leaving_request_school_id_student_id_idx" ON "leaving_request"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_clearance_check_leaving_request_id_name_key" ON "student_clearance_check"("leaving_request_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_verify_code_key" ON "certificate"("verify_code");

-- CreateIndex
CREATE INDEX "certificate_school_id_student_id_idx" ON "certificate"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "certificate_school_id_status_idx" ON "certificate"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_school_id_number_key" ON "certificate"("school_id", "number");

-- CreateIndex
CREATE INDEX "id_card_print_school_id_student_id_idx" ON "id_card_print"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "id_card_print_school_id_academic_year_id_section_id_idx" ON "id_card_print"("school_id", "academic_year_id", "section_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_rfid_student_id_key" ON "student_rfid"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_rfid_school_id_rfid_no_key" ON "student_rfid"("school_id", "rfid_no");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_record_student_id_key" ON "alumni_record"("student_id");

-- CreateIndex
CREATE INDEX "alumni_record_school_id_graduation_year_idx" ON "alumni_record"("school_id", "graduation_year");

-- CreateIndex
CREATE INDEX "alumni_donation_school_id_alumni_id_idx" ON "alumni_donation"("school_id", "alumni_id");

-- CreateIndex
CREATE INDEX "alumni_mentorship_school_id_student_id_idx" ON "alumni_mentorship"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_mentorship_alumni_id_student_id_key" ON "alumni_mentorship"("alumni_id", "student_id");

-- CreateIndex
CREATE INDEX "job_post_school_id_created_at_idx" ON "job_post"("school_id", "created_at");

-- CreateIndex

-- CreateIndex

-- CreateIndex
CREATE INDEX "bulk_update_school_id_created_at_idx" ON "bulk_update"("school_id", "created_at");

-- AddForeignKey
ALTER TABLE "behaviour_incident_student" ADD CONSTRAINT "behaviour_incident_student_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "behaviour_incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counselling_session" ADD CONSTRAINT "counselling_session_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "counselling_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_decision" ADD CONSTRAINT "promotion_decision_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "promotion_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_clearance_check" ADD CONSTRAINT "student_clearance_check_leaving_request_id_fkey" FOREIGN KEY ("leaving_request_id") REFERENCES "leaving_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_donation" ADD CONSTRAINT "alumni_donation_alumni_id_fkey" FOREIGN KEY ("alumni_id") REFERENCES "alumni_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_mentorship" ADD CONSTRAINT "alumni_mentorship_alumni_id_fkey" FOREIGN KEY ("alumni_id") REFERENCES "alumni_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "student_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_settings_same_school" ON "student_settings" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "promotion_policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promotion_policy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "promotion_policy_same_school" ON "promotion_policy" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "student_status_change" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_status_change" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_status_change_same_school" ON "student_status_change" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "section_change" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "section_change" FORCE ROW LEVEL SECURITY;
CREATE POLICY "section_change_same_school" ON "section_change" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "student_previous_school" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_previous_school" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_previous_school_same_school" ON "student_previous_school" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "student_identifier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_identifier" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_identifier_same_school" ON "student_identifier" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "student_emergency_contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_emergency_contact" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_emergency_contact_same_school" ON "student_emergency_contact" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "student_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_document" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_document_same_school" ON "student_document" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "student_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_note" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_note_same_school" ON "student_note" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "behaviour_incident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_incident" FORCE ROW LEVEL SECURITY;
CREATE POLICY "behaviour_incident_same_school" ON "behaviour_incident" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "behaviour_incident_student" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_incident_student" FORCE ROW LEVEL SECURITY;
CREATE POLICY "behaviour_incident_student_same_school" ON "behaviour_incident_student" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "behaviour_point_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_point_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "behaviour_point_entry_same_school" ON "behaviour_point_entry" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "counselling_case" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "counselling_case" FORCE ROW LEVEL SECURITY;
CREATE POLICY "counselling_case_same_school" ON "counselling_case" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "counselling_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "counselling_session" FORCE ROW LEVEL SECURITY;
CREATE POLICY "counselling_session_same_school" ON "counselling_session" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "career_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "career_record" FORCE ROW LEVEL SECURITY;
CREATE POLICY "career_record_same_school" ON "career_record" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "promotion_batch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promotion_batch" FORCE ROW LEVEL SECURITY;
CREATE POLICY "promotion_batch_same_school" ON "promotion_batch" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "promotion_decision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promotion_decision" FORCE ROW LEVEL SECURITY;
CREATE POLICY "promotion_decision_same_school" ON "promotion_decision" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "leaving_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leaving_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY "leaving_request_same_school" ON "leaving_request" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "student_clearance_check" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_clearance_check" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_clearance_check_same_school" ON "student_clearance_check" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "certificate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "certificate" FORCE ROW LEVEL SECURITY;
CREATE POLICY "certificate_same_school" ON "certificate" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "id_card_print" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "id_card_print" FORCE ROW LEVEL SECURITY;
CREATE POLICY "id_card_print_same_school" ON "id_card_print" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "student_rfid" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_rfid" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_rfid_same_school" ON "student_rfid" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "alumni_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alumni_record" FORCE ROW LEVEL SECURITY;
CREATE POLICY "alumni_record_same_school" ON "alumni_record" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "alumni_donation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alumni_donation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "alumni_donation_same_school" ON "alumni_donation" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "alumni_mentorship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alumni_mentorship" FORCE ROW LEVEL SECURITY;
CREATE POLICY "alumni_mentorship_same_school" ON "alumni_mentorship" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "job_post" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job_post" FORCE ROW LEVEL SECURITY;
CREATE POLICY "job_post_same_school" ON "job_post" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "bulk_update" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bulk_update" FORCE ROW LEVEL SECURITY;
CREATE POLICY "bulk_update_same_school" ON "bulk_update" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "guardian_merge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian_merge" FORCE ROW LEVEL SECURITY;
CREATE POLICY "guardian_merge_same_school" ON "guardian_merge" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());

-- Public certificate check (/verify/<code>): anyone holding the code on a
-- printed certificate may learn only its number, type, issue date, status and
-- the school's name. No personal data leaves through this function, and it
-- cannot list certificates: it answers for one exact code.
CREATE POLICY "certificate_verify" ON "certificate" FOR SELECT
  USING (current_user = 'school_os_owner' AND current_setting('app.cert_verify', true) = 'on');
CREATE POLICY "school_name_for_verify" ON "school" FOR SELECT
  USING (current_user = 'school_os_owner' AND current_setting('app.cert_verify', true) = 'on');

CREATE FUNCTION verify_certificate(p_code text)
RETURNS TABLE(cert_number text, cert_type text, issue_date date, cert_status text, is_duplicate boolean, school_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_code IS NULL OR length(p_code) < 12 OR length(p_code) > 64 THEN
    RETURN;
  END IF;
  PERFORM set_config('app.cert_verify', 'on', true);
  RETURN QUERY
    SELECT c.number, c.type::text, c.issue_date, c.status::text, c.is_duplicate, s.name
      FROM certificate c JOIN school s ON s.id = c.school_id
     WHERE c.verify_code = p_code AND c.status IN ('ISSUED', 'CANCELLED')
     LIMIT 1;
  PERFORM set_config('app.cert_verify', 'off', true);
END $$;

REVOKE ALL ON FUNCTION verify_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_certificate(text) TO school_os_app;
