-- CreateEnum
CREATE TYPE "VacancyStatus" AS ENUM ('OPEN', 'ON_HOLD', 'FILLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('NEW', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ExitType" AS ENUM ('RESIGNATION', 'RETIREMENT', 'TERMINATION');

-- CreateEnum
CREATE TYPE "ExitStatus" AS ENUM ('WAITING_APPROVAL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permanent_address" TEXT,
ADD COLUMN     "phone_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status_reason" TEXT,
ADD COLUMN     "status_since" DATE;

-- AlterTable
ALTER TABLE "staff_document" ADD COLUMN     "issued_on" DATE,
ADD COLUMN     "reminders_sent" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "hr_setting" (
    "school_id" UUID NOT NULL,
    "staff_id_prefix" TEXT NOT NULL DEFAULT 'ST-',
    "staff_id_digits" INTEGER NOT NULL DEFAULT 3,
    "username_format" TEXT NOT NULL DEFAULT 'first.last',
    "notice_days" INTEGER NOT NULL DEFAULT 30,
    "reminder_days" INTEGER[] DEFAULT ARRAY[30, 7]::INTEGER[],
    "document_types" TEXT[] DEFAULT ARRAY['Certificate', 'ID proof', 'Contract', 'Police verification', 'Other']::TEXT[],
    "required_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_setting_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "designation" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "staff_type" TEXT NOT NULL DEFAULT 'Teaching',
    "default_department_id" UUID,
    "default_role_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "designation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_type_rule" (
    "leave_type_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "half_day_allowed" BOOLEAN NOT NULL DEFAULT true,
    "document_required" BOOLEAN NOT NULL DEFAULT false,
    "counts_holidays" BOOLEAN NOT NULL DEFAULT false,
    "loss_of_pay" BOOLEAN NOT NULL DEFAULT false,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "quota_by_group" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_type_rule_pkey" PRIMARY KEY ("leave_type_id")
);

-- CreateTable
CREATE TABLE "staff_leave_detail" (
    "leave_request_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "half_day_part" TEXT,
    "lop_days" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "on_behalf" BOOLEAN NOT NULL DEFAULT false,
    "periods_affected" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_leave_detail_pkey" PRIMARY KEY ("leave_request_id")
);

-- CreateTable
CREATE TABLE "emergency_contact" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "emergency_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_id_card_print" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "batch_key" TEXT,
    "reprint" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "printed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_id_card_print_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacancy" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "designation" TEXT NOT NULL,
    "department_id" UUID,
    "openings" INTEGER NOT NULL DEFAULT 1,
    "closing_date" DATE,
    "details" TEXT,
    "status" "VacancyStatus" NOT NULL DEFAULT 'OPEN',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "vacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_application" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "vacancy_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "qualification" TEXT,
    "experience_years" INTEGER,
    "resume_file_id" UUID,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "hired_staff_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "job_application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 30,
    "interviewer_ids" UUID[],
    "place" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "offer_no" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "department_id" UUID,
    "joining_date" DATE NOT NULL,
    "monthly_paise" BIGINT,
    "respond_by" DATE,
    "status" TEXT NOT NULL DEFAULT 'MADE',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appraisal_cycle" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" TEXT[],
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appraisal_cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appraisal" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'SELF_REVIEW',
    "self_ratings" JSONB NOT NULL DEFAULT '{}',
    "self_comment" TEXT,
    "manager_ratings" JSONB NOT NULL DEFAULT '{}',
    "manager_comment" TEXT,
    "final_rating" DECIMAL(3,1),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appraisal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_record" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "course" TEXT NOT NULL,
    "provider" TEXT,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "hours" DECIMAL(6,1) NOT NULL,
    "certificate_file_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "training_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_record" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "from_designation" TEXT NOT NULL,
    "to_designation" TEXT NOT NULL,
    "from_department_id" UUID,
    "to_department_id" UUID,
    "effective_from" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exit_case" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "type" "ExitType" NOT NULL,
    "received_on" DATE NOT NULL,
    "last_working_day" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "letter_file_id" UUID,
    "status" "ExitStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "approval_id" UUID,
    "settlement_status" TEXT NOT NULL DEFAULT 'NOT_SENT',
    "settlement_note" TEXT,
    "login_disabled_at" TIMESTAMP(3),
    "experience_letter_no" TEXT,
    "experience_letter_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exit_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_item" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "exit_case_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ref_id" UUID,
    "to_staff_id" UUID,
    "done_at" TIMESTAMP(3),
    "done_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clearance_check" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "exit_case_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "cleared_by_id" UUID,
    "cleared_at" TIMESTAMP(3),

    CONSTRAINT "clearance_check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "designation_school_id_name_key" ON "designation"("school_id", "name");

-- CreateIndex
CREATE INDEX "leave_type_rule_school_id_idx" ON "leave_type_rule"("school_id");

-- CreateIndex
CREATE INDEX "staff_leave_detail_school_id_idx" ON "staff_leave_detail"("school_id");

-- CreateIndex
CREATE INDEX "emergency_contact_school_id_staff_id_idx" ON "emergency_contact"("school_id", "staff_id");

-- CreateIndex
CREATE INDEX "staff_id_card_print_school_id_staff_id_idx" ON "staff_id_card_print"("school_id", "staff_id");

-- CreateIndex
CREATE INDEX "vacancy_school_id_status_idx" ON "vacancy"("school_id", "status");

-- CreateIndex
CREATE INDEX "job_application_school_id_vacancy_id_idx" ON "job_application"("school_id", "vacancy_id");

-- CreateIndex
CREATE INDEX "interview_school_id_starts_at_idx" ON "interview"("school_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "offer_school_id_offer_no_key" ON "offer"("school_id", "offer_no");

-- CreateIndex
CREATE UNIQUE INDEX "appraisal_cycle_school_id_name_key" ON "appraisal_cycle"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "appraisal_cycle_id_staff_id_key" ON "appraisal"("cycle_id", "staff_id");

-- CreateIndex
CREATE INDEX "training_record_school_id_staff_id_idx" ON "training_record"("school_id", "staff_id");

-- CreateIndex
CREATE INDEX "promotion_record_school_id_staff_id_idx" ON "promotion_record"("school_id", "staff_id");

-- CreateIndex
CREATE INDEX "exit_case_school_id_status_idx" ON "exit_case"("school_id", "status");

-- CreateIndex
CREATE INDEX "exit_case_school_id_staff_id_idx" ON "exit_case"("school_id", "staff_id");

-- CreateIndex
CREATE INDEX "handover_item_school_id_exit_case_id_idx" ON "handover_item"("school_id", "exit_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "clearance_check_exit_case_id_key_key" ON "clearance_check"("exit_case_id", "key");

-- AddForeignKey
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_vacancy_id_fkey" FOREIGN KEY ("vacancy_id") REFERENCES "vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview" ADD CONSTRAINT "interview_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "job_application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "job_application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appraisal" ADD CONSTRAINT "appraisal_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "appraisal_cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_item" ADD CONSTRAINT "handover_item_exit_case_id_fkey" FOREIGN KEY ("exit_case_id") REFERENCES "exit_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_check" ADD CONSTRAINT "clearance_check_exit_case_id_fkey" FOREIGN KEY ("exit_case_id") REFERENCES "exit_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "hr_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_setting_same_school" ON "hr_setting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "designation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "designation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "designation_same_school" ON "designation" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "leave_type_rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_type_rule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "leave_type_rule_same_school" ON "leave_type_rule" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "staff_leave_detail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_leave_detail" FORCE ROW LEVEL SECURITY;
CREATE POLICY "staff_leave_detail_same_school" ON "staff_leave_detail" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "emergency_contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "emergency_contact" FORCE ROW LEVEL SECURITY;
CREATE POLICY "emergency_contact_same_school" ON "emergency_contact" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "staff_id_card_print" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_id_card_print" FORCE ROW LEVEL SECURITY;
CREATE POLICY "staff_id_card_print_same_school" ON "staff_id_card_print" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "vacancy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vacancy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "vacancy_same_school" ON "vacancy" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "job_application" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job_application" FORCE ROW LEVEL SECURITY;
CREATE POLICY "job_application_same_school" ON "job_application" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "interview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interview" FORCE ROW LEVEL SECURITY;
CREATE POLICY "interview_same_school" ON "interview" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "offer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "offer_same_school" ON "offer" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "appraisal_cycle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appraisal_cycle" FORCE ROW LEVEL SECURITY;
CREATE POLICY "appraisal_cycle_same_school" ON "appraisal_cycle" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "appraisal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appraisal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "appraisal_same_school" ON "appraisal" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "training_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_record" FORCE ROW LEVEL SECURITY;
CREATE POLICY "training_record_same_school" ON "training_record" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "promotion_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promotion_record" FORCE ROW LEVEL SECURITY;
CREATE POLICY "promotion_record_same_school" ON "promotion_record" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "exit_case" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exit_case" FORCE ROW LEVEL SECURITY;
CREATE POLICY "exit_case_same_school" ON "exit_case" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "handover_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "handover_item" FORCE ROW LEVEL SECURITY;
CREATE POLICY "handover_item_same_school" ON "handover_item" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "clearance_check" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clearance_check" FORCE ROW LEVEL SECURITY;
CREATE POLICY "clearance_check_same_school" ON "clearance_check" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
