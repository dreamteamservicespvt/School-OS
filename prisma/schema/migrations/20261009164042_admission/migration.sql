-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('SUBMITTED', 'SUBMITTED_ONLINE', 'REVIEWED', 'DOCUMENTS', 'TEST_INTERVIEW', 'DECISION', 'APPROVED', 'WAITING_LIST', 'REJECTED', 'ADMITTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AdmissionDocStatus" AS ENUM ('NOT_RECEIVED', 'RECEIVED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InterviewOutcome" AS ENUM ('RECOMMENDED', 'NOT_RECOMMENDED', 'HOLD');

-- CreateEnum
CREATE TYPE "FeePaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "admission_setting" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "admission_year_id" UUID,
    "stages" JSONB NOT NULL DEFAULT '[]',
    "enquiry_statuses" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "loss_reasons" JSONB NOT NULL DEFAULT '[]',
    "owner_rule" TEXT NOT NULL DEFAULT 'default',
    "default_owner_staff_id" UUID,
    "turn_staff_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "turn_next" INTEGER NOT NULL DEFAULT 0,
    "allow_over_capacity" BOOLEAN NOT NULL DEFAULT false,
    "admit_with_papers_pending" BOOLEAN NOT NULL DEFAULT false,
    "waiting_list_on" BOOLEAN NOT NULL DEFAULT true,
    "sibling_priority_on" BOOLEAN NOT NULL DEFAULT false,
    "sibling_weight" INTEGER NOT NULL DEFAULT 20,
    "quota_on" BOOLEAN NOT NULL DEFAULT false,
    "quotas" JSONB NOT NULL DEFAULT '[]',
    "tests_on" BOOLEAN NOT NULL DEFAULT false,
    "interviews_on" BOOLEAN NOT NULL DEFAULT false,
    "online_on" BOOLEAN NOT NULL DEFAULT false,
    "application_fee_on" BOOLEAN NOT NULL DEFAULT false,
    "offer_letters_on" BOOLEAN NOT NULL DEFAULT false,
    "campaigns_on" BOOLEAN NOT NULL DEFAULT false,
    "application_prefix" TEXT NOT NULL DEFAULT 'APP/{YYYY}/',
    "facts" TEXT,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_class_rule" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "fee_paise" BIGINT,
    "online_open" BOOLEAN NOT NULL DEFAULT true,
    "min_age" INTEGER,
    "max_age" INTEGER,
    "owner_staff_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_class_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_campaign" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "admission_campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "child_name" TEXT NOT NULL,
    "parent_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "class_id" UUID,
    "source" TEXT NOT NULL,
    "first_source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "owner_staff_id" UUID,
    "next_follow_up_at" TIMESTAMP(3),
    "next_action" TEXT,
    "reminded_for" TIMESTAMP(3),
    "child_dob" DATE,
    "current_school" TEXT,
    "referred_by" TEXT,
    "notes" TEXT,
    "lost_reason" TEXT,
    "lost_note" TEXT,
    "closed_at" TIMESTAMP(3),
    "campaign_id" UUID,
    "sibling_of_id" UUID,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "import_batch_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_activity" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "enquiry_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "direction" TEXT,
    "outcome" TEXT,
    "data" JSONB,
    "by_id" UUID,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "application_no" TEXT NOT NULL,
    "enquiry_id" UUID,
    "class_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "full_name" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "gender" TEXT NOT NULL,
    "father_name" TEXT,
    "mother_name" TEXT,
    "guardian_name" TEXT,
    "guardian_relation" TEXT,
    "phone" TEXT NOT NULL,
    "alt_phone" TEXT,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "previous_school" TEXT,
    "previous_class" TEXT,
    "previous_marks" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "sibling_student_id" UUID,
    "category" TEXT,
    "religion" TEXT,
    "mother_tongue" TEXT,
    "occupation" TEXT,
    "aadhaar_enc" TEXT,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "channel" TEXT NOT NULL DEFAULT 'counter',
    "stage" "ApplicationStage" NOT NULL DEFAULT 'SUBMITTED',
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "review_note" TEXT,
    "sent_back_at" TIMESTAMP(3),
    "sent_back_note" TEXT,
    "papers_exception" TEXT,
    "fee_due_paise" BIGINT,
    "decision_remarks" TEXT,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "approval_id" UUID,
    "waiting_rank" INTEGER,
    "waiting_reason" TEXT,
    "waiting_since" TIMESTAMP(3),
    "offer_letter_no" TEXT,
    "offer_sent_at" TIMESTAMP(3),
    "offer_accepted_at" TIMESTAMP(3),
    "withdrawn_reason" TEXT,
    "withdrawn_at" TIMESTAMP(3),
    "student_id" UUID,
    "admitted_at" TIMESTAMP(3),
    "admitted_by_id" UUID,
    "conversion" JSONB,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_activity" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "data" JSONB,
    "by_id" UUID,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_document" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "file_id" UUID,
    "status" "AdmissionDocStatus" NOT NULL DEFAULT 'NOT_RECEIVED',
    "note" TEXT,
    "reject_reason" TEXT,
    "original_seen" BOOLEAN NOT NULL DEFAULT false,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMP(3),
    "uploaded_by_id" UUID,
    "uploaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_test" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID,
    "title" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "max_marks" INTEGER NOT NULL DEFAULT 100,
    "calendar_entry_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "admission_test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_test_booking" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "test_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "marks" DECIMAL(6,2),
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "scored_by_id" UUID,
    "scored_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "admission_test_booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_slot" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "interviewer_staff_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 15,
    "outcome" "InterviewOutcome",
    "notes" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "cancelled_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_fee_payment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "mode" TEXT NOT NULL,
    "reference" TEXT,
    "status" "FeePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "gateway_account_id" UUID,
    "gateway_order_id" TEXT,
    "gateway_payment_id" TEXT,
    "receipt_no" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "failed_reason" TEXT,
    "received_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_fee_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_consent" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "consent_type" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "given_by_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "how_given" TEXT NOT NULL,
    "given_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "otp_verified_at" TIMESTAMP(3),
    "guardian_id" UUID,
    "student_id" UUID,
    "withdrawn_at" TIMESTAMP(3),

    CONSTRAINT "admission_consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_otp" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_otp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admission_setting_school_id_key" ON "admission_setting"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_class_rule_school_id_class_id_key" ON "admission_class_rule"("school_id", "class_id");

-- CreateIndex
CREATE INDEX "admission_campaign_school_id_created_at_idx" ON "admission_campaign"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "enquiry_school_id_academic_year_id_status_idx" ON "enquiry"("school_id", "academic_year_id", "status");

-- CreateIndex
CREATE INDEX "enquiry_school_id_owner_staff_id_next_follow_up_at_idx" ON "enquiry"("school_id", "owner_staff_id", "next_follow_up_at");

-- CreateIndex
CREATE INDEX "enquiry_school_id_phone_idx" ON "enquiry"("school_id", "phone");

-- CreateIndex
CREATE INDEX "enquiry_school_id_created_at_idx" ON "enquiry"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "enquiry_activity_school_id_enquiry_id_at_idx" ON "enquiry_activity"("school_id", "enquiry_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "application_student_id_key" ON "application"("student_id");

-- CreateIndex
CREATE INDEX "application_school_id_academic_year_id_stage_idx" ON "application"("school_id", "academic_year_id", "stage");

-- CreateIndex
CREATE INDEX "application_school_id_class_id_stage_idx" ON "application"("school_id", "class_id", "stage");

-- CreateIndex
CREATE INDEX "application_school_id_phone_idx" ON "application"("school_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "application_school_id_application_no_key" ON "application"("school_id", "application_no");

-- CreateIndex
CREATE INDEX "application_activity_school_id_application_id_at_idx" ON "application_activity"("school_id", "application_id", "at");

-- CreateIndex
CREATE INDEX "application_document_school_id_status_idx" ON "application_document"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "application_document_application_id_doc_type_key" ON "application_document"("application_id", "doc_type");

-- CreateIndex
CREATE INDEX "admission_test_school_id_starts_at_idx" ON "admission_test"("school_id", "starts_at");

-- CreateIndex
CREATE INDEX "admission_test_booking_school_id_application_id_idx" ON "admission_test_booking"("school_id", "application_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_test_booking_test_id_application_id_key" ON "admission_test_booking"("test_id", "application_id");

-- CreateIndex
CREATE INDEX "interview_slot_school_id_interviewer_staff_id_starts_at_idx" ON "interview_slot"("school_id", "interviewer_staff_id", "starts_at");

-- CreateIndex
CREATE INDEX "interview_slot_school_id_application_id_idx" ON "interview_slot"("school_id", "application_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_fee_payment_gateway_order_id_key" ON "application_fee_payment"("gateway_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_fee_payment_gateway_payment_id_key" ON "application_fee_payment"("gateway_payment_id");

-- CreateIndex
CREATE INDEX "application_fee_payment_school_id_application_id_idx" ON "application_fee_payment"("school_id", "application_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_fee_payment_school_id_receipt_no_key" ON "application_fee_payment"("school_id", "receipt_no");

-- CreateIndex
CREATE INDEX "admission_consent_school_id_guardian_id_idx" ON "admission_consent"("school_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_consent_application_id_consent_type_key" ON "admission_consent"("application_id", "consent_type");

-- CreateIndex
CREATE INDEX "admission_otp_school_id_purpose_idx" ON "admission_otp"("school_id", "purpose");

-- AddForeignKey
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "admission_campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_activity" ADD CONSTRAINT "enquiry_activity_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_activity" ADD CONSTRAINT "application_activity_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_document" ADD CONSTRAINT "application_document_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_test_booking" ADD CONSTRAINT "admission_test_booking_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "admission_test"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_test_booking" ADD CONSTRAINT "admission_test_booking_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_slot" ADD CONSTRAINT "interview_slot_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_fee_payment" ADD CONSTRAINT "application_fee_payment_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_consent" ADD CONSTRAINT "admission_consent_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "admission_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "admission_setting_same_school" ON "admission_setting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "admission_class_rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_class_rule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "admission_class_rule_same_school" ON "admission_class_rule" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "admission_campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_campaign" FORCE ROW LEVEL SECURITY;
CREATE POLICY "admission_campaign_same_school" ON "admission_campaign" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "enquiry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enquiry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "enquiry_same_school" ON "enquiry" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "enquiry_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enquiry_activity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "enquiry_activity_same_school" ON "enquiry_activity" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "application" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "application" FORCE ROW LEVEL SECURITY;
CREATE POLICY "application_same_school" ON "application" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "application_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "application_activity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "application_activity_same_school" ON "application_activity" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "application_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "application_document" FORCE ROW LEVEL SECURITY;
CREATE POLICY "application_document_same_school" ON "application_document" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "admission_test" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_test" FORCE ROW LEVEL SECURITY;
CREATE POLICY "admission_test_same_school" ON "admission_test" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "admission_test_booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_test_booking" FORCE ROW LEVEL SECURITY;
CREATE POLICY "admission_test_booking_same_school" ON "admission_test_booking" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "interview_slot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interview_slot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "interview_slot_same_school" ON "interview_slot" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "application_fee_payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "application_fee_payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "application_fee_payment_same_school" ON "application_fee_payment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "admission_consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_consent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "admission_consent_same_school" ON "admission_consent" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "admission_otp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_otp" FORCE ROW LEVEL SECURITY;
CREATE POLICY "admission_otp_same_school" ON "admission_otp" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());

-- An interviewer cannot be booked twice for the same time (02 §2, Test & Interview).
CREATE UNIQUE INDEX "interview_slot_interviewer_time_key" ON "interview_slot"("school_id", "interviewer_staff_id", "starts_at") WHERE "cancelled_at" IS NULL;

-- The online admission form (/apply/<school code>) has no login. It may only
-- find which active school a code belongs to; all reading and writing after
-- that happens inside that school's walls (withSchool).
CREATE FUNCTION admission_school_by_code(school_code text) RETURNS TABLE(id uuid, name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.job_claim', 'on', true);
  RETURN QUERY SELECT s.id, s.name FROM school s
    WHERE upper(s.code) = upper(school_code) AND s.archived_at IS NULL AND s.status IN ('TRIAL', 'ACTIVE');
  PERFORM set_config('app.job_claim', 'off', true);
END $$;
REVOKE ALL ON FUNCTION admission_school_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admission_school_by_code(text) TO school_os_app;
