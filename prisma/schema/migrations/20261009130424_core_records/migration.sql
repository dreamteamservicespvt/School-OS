-- CreateEnum
CREATE TYPE "AcademicYearStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "FinancialYearStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('CORE', 'OPTIONAL', 'ELECTIVE', 'LANGUAGE');

-- CreateEnum
CREATE TYPE "TimetableVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubstitutionStatus" AS ENUM ('NEEDED', 'ARRANGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('WAITING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'RETIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ADMITTED', 'ACTIVE', 'PROMOTED', 'TRANSFERRED', 'WITHDRAWN', 'GRADUATED', 'ALUMNI', 'INACTIVE');

-- CreateEnum
CREATE TYPE "EnrolmentStatus" AS ENUM ('STUDYING', 'PROMOTED', 'HELD_BACK', 'LEFT');

-- CreateTable
CREATE TABLE "academic_year" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "AcademicYearStatus" NOT NULL DEFAULT 'UPCOMING',
    "closed_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "academic_year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_year" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FinancialYearStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "financial_year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_class" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "level" TEXT,
    "stream" TEXT,
    "board" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "school_class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 40,
    "class_teacher_id" UUID,
    "room" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "SubjectType" NOT NULL DEFAULT 'CORE',
    "grade_only" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_class" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "periods_per_week" INTEGER NOT NULL DEFAULT 0,
    "from_date" DATE,
    "to_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "subject_class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_allocation" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "is_main" BOOLEAN NOT NULL DEFAULT true,
    "from_date" DATE,
    "to_date" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "teacher_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_slot" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "is_break" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "period_slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_version" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TimetableVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" DATE,
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "timetable_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_period" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "period_no" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "subject_id" UUID,
    "staff_id" UUID,
    "room" TEXT,
    "is_break" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "timetable_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "substitution" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "period_id" UUID NOT NULL,
    "absent_staff_id" UUID NOT NULL,
    "substitute_staff_id" UUID,
    "leave_request_id" UUID,
    "status" "SubstitutionStatus" NOT NULL DEFAULT 'NEEDED',
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "substitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_entry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campus_id" UUID,
    "academic_year_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "attendance_on" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "calendar_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_type" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "for_whom" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "days_per_year" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "carry_forward" BOOLEAN NOT NULL DEFAULT false,
    "max_carry" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "needs_doc_after" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "leave_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_request" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "staff_id" UUID,
    "student_id" UUID,
    "leave_type_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "half_day" BOOLEAN NOT NULL DEFAULT false,
    "days" DECIMAL(5,1) NOT NULL,
    "reason" TEXT NOT NULL,
    "document_file_id" UUID,
    "status" "LeaveStatus" NOT NULL DEFAULT 'WAITING',
    "approval_id" UUID,
    "recorded_by_id" UUID,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "leave_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balance" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "staff_id" UUID,
    "student_id" UUID,
    "leave_type_id" UUID NOT NULL,
    "days_given" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "adjustments" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "leave_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "head_staff_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "staff_code" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "full_name" TEXT NOT NULL,
    "photo_file_id" UUID,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "gender" TEXT,
    "date_of_birth" DATE,
    "designation" TEXT NOT NULL,
    "department_id" UUID,
    "staff_type" TEXT NOT NULL DEFAULT 'Teaching',
    "employment_type" TEXT NOT NULL DEFAULT 'Permanent',
    "joining_date" DATE NOT NULL,
    "reporting_to_id" UUID,
    "qualification" TEXT,
    "experience_years" INTEGER,
    "address" TEXT,
    "blood_group" TEXT,
    "emergency_name" TEXT,
    "emergency_phone" TEXT,
    "aadhaar_enc" TEXT,
    "pan_enc" TEXT,
    "bank_account_enc" TEXT,
    "bank_ifsc" TEXT,
    "bank_name" TEXT,
    "uan" TEXT,
    "esi_no" TEXT,
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "leaving_date" DATE,
    "leaving_reason" TEXT,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "user_login_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_document" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "file_id" UUID,
    "number" TEXT,
    "expires_on" DATE,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "staff_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "admission_no" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "full_name" TEXT NOT NULL,
    "photo_file_id" UUID,
    "date_of_birth" DATE,
    "gender" TEXT,
    "blood_group" TEXT,
    "category" TEXT,
    "religion" TEXT,
    "mother_tongue" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pin_code" TEXT,
    "aadhaar_enc" TEXT,
    "apaar_id" TEXT,
    "pen" TEXT,
    "medical_notes" TEXT,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "joining_date" DATE,
    "leaving_date" DATE,
    "leaving_reason" TEXT,
    "application_id" UUID,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "previous_school" TEXT,
    "user_login_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrolment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "roll_no" INTEGER,
    "stream" TEXT,
    "optional_subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "EnrolmentStatus" NOT NULL DEFAULT 'STUDYING',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "enrolment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alt_phone" TEXT,
    "email" TEXT,
    "date_of_birth" DATE,
    "occupation" TEXT,
    "annual_income" TEXT,
    "address" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "opted_out" BOOLEAN NOT NULL DEFAULT false,
    "photo_file_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardian" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "relationship" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "emergency_order" INTEGER,
    "can_pick_up" BOOLEAN NOT NULL DEFAULT true,
    "restriction" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "student_guardian_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_year_school_id_campus_id_status_idx" ON "academic_year"("school_id", "campus_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "academic_year_school_id_campus_id_name_key" ON "academic_year"("school_id", "campus_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "financial_year_school_id_name_key" ON "financial_year"("school_id", "name");

-- CreateIndex
CREATE INDEX "term_school_id_academic_year_id_idx" ON "term"("school_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "school_class_school_id_campus_id_sort_order_idx" ON "school_class"("school_id", "campus_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "school_class_school_id_campus_id_name_key" ON "school_class"("school_id", "campus_id", "name");

-- CreateIndex
CREATE INDEX "section_school_id_academic_year_id_idx" ON "section"("school_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "section_school_id_class_teacher_id_idx" ON "section"("school_id", "class_teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "section_school_id_class_id_academic_year_id_name_key" ON "section"("school_id", "class_id", "academic_year_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "subject_school_id_code_key" ON "subject"("school_id", "code");

-- CreateIndex
CREATE INDEX "subject_class_school_id_class_id_idx" ON "subject_class"("school_id", "class_id");

-- CreateIndex
CREATE INDEX "subject_class_school_id_subject_id_idx" ON "subject_class"("school_id", "subject_id");

-- CreateIndex
CREATE INDEX "teacher_allocation_school_id_staff_id_idx" ON "teacher_allocation"("school_id", "staff_id");

-- CreateIndex
CREATE INDEX "teacher_allocation_school_id_section_id_idx" ON "teacher_allocation"("school_id", "section_id");

-- CreateIndex
CREATE INDEX "period_slot_school_id_campus_id_idx" ON "period_slot"("school_id", "campus_id");

-- CreateIndex
CREATE INDEX "timetable_version_school_id_academic_year_id_status_idx" ON "timetable_version"("school_id", "academic_year_id", "status");

-- CreateIndex
CREATE INDEX "timetable_period_school_id_version_id_staff_id_day_of_week__idx" ON "timetable_period"("school_id", "version_id", "staff_id", "day_of_week", "period_no");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_period_version_id_section_id_day_of_week_period_n_key" ON "timetable_period"("version_id", "section_id", "day_of_week", "period_no");

-- CreateIndex
CREATE INDEX "substitution_school_id_date_idx" ON "substitution"("school_id", "date");

-- CreateIndex
CREATE INDEX "substitution_school_id_substitute_staff_id_date_idx" ON "substitution"("school_id", "substitute_staff_id", "date");

-- CreateIndex
CREATE INDEX "calendar_entry_school_id_academic_year_id_start_date_idx" ON "calendar_entry"("school_id", "academic_year_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "leave_type_school_id_for_whom_code_key" ON "leave_type"("school_id", "for_whom", "code");

-- CreateIndex
CREATE INDEX "leave_request_school_id_staff_id_from_date_idx" ON "leave_request"("school_id", "staff_id", "from_date");

-- CreateIndex
CREATE INDEX "leave_request_school_id_student_id_from_date_idx" ON "leave_request"("school_id", "student_id", "from_date");

-- CreateIndex
CREATE INDEX "leave_request_school_id_status_idx" ON "leave_request"("school_id", "status");

-- CreateIndex
CREATE INDEX "leave_balance_school_id_staff_id_idx" ON "leave_balance"("school_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balance_academic_year_id_staff_id_student_id_leave_ty_key" ON "leave_balance"("academic_year_id", "staff_id", "student_id", "leave_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "department_school_id_name_key" ON "department"("school_id", "name");

-- CreateIndex
CREATE INDEX "staff_school_id_status_idx" ON "staff"("school_id", "status");

-- CreateIndex
CREATE INDEX "staff_school_id_full_name_idx" ON "staff"("school_id", "full_name");

-- CreateIndex
CREATE UNIQUE INDEX "staff_school_id_staff_code_key" ON "staff"("school_id", "staff_code");

-- CreateIndex
CREATE UNIQUE INDEX "staff_school_id_user_login_id_key" ON "staff"("school_id", "user_login_id");

-- CreateIndex
CREATE INDEX "staff_document_school_id_staff_id_idx" ON "staff_document"("school_id", "staff_id");

-- CreateIndex
CREATE INDEX "staff_document_school_id_expires_on_idx" ON "staff_document"("school_id", "expires_on");

-- CreateIndex
CREATE UNIQUE INDEX "student_application_id_key" ON "student"("application_id");

-- CreateIndex
CREATE INDEX "student_school_id_status_idx" ON "student"("school_id", "status");

-- CreateIndex
CREATE INDEX "student_school_id_full_name_idx" ON "student"("school_id", "full_name");

-- CreateIndex
CREATE UNIQUE INDEX "student_school_id_admission_no_key" ON "student"("school_id", "admission_no");

-- CreateIndex
CREATE UNIQUE INDEX "student_school_id_user_login_id_key" ON "student"("school_id", "user_login_id");

-- CreateIndex
CREATE INDEX "enrolment_school_id_section_id_academic_year_id_idx" ON "enrolment"("school_id", "section_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "enrolment_school_id_academic_year_id_class_id_idx" ON "enrolment"("school_id", "academic_year_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrolment_student_id_academic_year_id_key" ON "enrolment"("student_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "guardian_school_id_phone_idx" ON "guardian"("school_id", "phone");

-- CreateIndex
CREATE INDEX "student_guardian_school_id_guardian_id_idx" ON "student_guardian"("school_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_guardian_student_id_guardian_id_key" ON "student_guardian"("student_id", "guardian_id");

-- AddForeignKey
ALTER TABLE "term" ADD CONSTRAINT "term_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section" ADD CONSTRAINT "section_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "school_class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section" ADD CONSTRAINT "section_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_class" ADD CONSTRAINT "subject_class_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_class" ADD CONSTRAINT "subject_class_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "school_class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_allocation" ADD CONSTRAINT "teacher_allocation_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_allocation" ADD CONSTRAINT "teacher_allocation_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_period" ADD CONSTRAINT "timetable_period_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "timetable_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_period" ADD CONSTRAINT "timetable_period_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_period" ADD CONSTRAINT "timetable_period_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitution" ADD CONSTRAINT "substitution_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "timetable_period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_document" ADD CONSTRAINT "staff_document_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardian" ADD CONSTRAINT "student_guardian_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardian" ADD CONSTRAINT "student_guardian_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "academic_year" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_year" FORCE ROW LEVEL SECURITY;
CREATE POLICY "academic_year_same_school" ON "academic_year" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "financial_year" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_year" FORCE ROW LEVEL SECURITY;
CREATE POLICY "financial_year_same_school" ON "financial_year" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "term" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "term" FORCE ROW LEVEL SECURITY;
CREATE POLICY "term_same_school" ON "term" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "school_class" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_class" FORCE ROW LEVEL SECURITY;
CREATE POLICY "school_class_same_school" ON "school_class" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "section" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "section" FORCE ROW LEVEL SECURITY;
CREATE POLICY "section_same_school" ON "section" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "subject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subject" FORCE ROW LEVEL SECURITY;
CREATE POLICY "subject_same_school" ON "subject" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "subject_class" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subject_class" FORCE ROW LEVEL SECURITY;
CREATE POLICY "subject_class_same_school" ON "subject_class" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "teacher_allocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teacher_allocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "teacher_allocation_same_school" ON "teacher_allocation" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "period_slot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "period_slot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "period_slot_same_school" ON "period_slot" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "timetable_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timetable_version" FORCE ROW LEVEL SECURITY;
CREATE POLICY "timetable_version_same_school" ON "timetable_version" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "timetable_period" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timetable_period" FORCE ROW LEVEL SECURITY;
CREATE POLICY "timetable_period_same_school" ON "timetable_period" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "substitution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "substitution" FORCE ROW LEVEL SECURITY;
CREATE POLICY "substitution_same_school" ON "substitution" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "calendar_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "calendar_entry_same_school" ON "calendar_entry" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "leave_type" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_type" FORCE ROW LEVEL SECURITY;
CREATE POLICY "leave_type_same_school" ON "leave_type" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "leave_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY "leave_request_same_school" ON "leave_request" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "leave_balance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_balance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "leave_balance_same_school" ON "leave_balance" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "department" FORCE ROW LEVEL SECURITY;
CREATE POLICY "department_same_school" ON "department" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff" FORCE ROW LEVEL SECURITY;
CREATE POLICY "staff_same_school" ON "staff" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "staff_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_document" FORCE ROW LEVEL SECURITY;
CREATE POLICY "staff_document_same_school" ON "staff_document" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "student" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_same_school" ON "student" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "enrolment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enrolment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "enrolment_same_school" ON "enrolment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "guardian" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian" FORCE ROW LEVEL SECURITY;
CREATE POLICY "guardian_same_school" ON "guardian" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "student_guardian" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_guardian" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_guardian_same_school" ON "student_guardian" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
-- Each campus has only one active Academic Year (04-data-model.md rule 19).
CREATE UNIQUE INDEX "academic_year_one_active" ON "academic_year" ("campus_id") WHERE status = 'ACTIVE' AND archived_at IS NULL;
-- Leave belongs to exactly one person.
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_one_person" CHECK ((staff_id IS NULL) <> (student_id IS NULL));
ALTER TABLE "leave_balance" ADD CONSTRAINT "leave_balance_one_person" CHECK ((staff_id IS NULL) <> (student_id IS NULL));
DROP INDEX "leave_balance_academic_year_id_staff_id_student_id_leave_ty_key";
CREATE UNIQUE INDEX "leave_balance_academic_year_id_staff_id_student_id_leave_ty_key" ON "leave_balance" ("academic_year_id", "staff_id", "student_id", "leave_type_id") NULLS NOT DISTINCT;
-- A teacher is in one place per period per Time Table version (rule 26), checked in code too.
CREATE UNIQUE INDEX "timetable_period_teacher_once" ON "timetable_period" ("version_id", "staff_id", "day_of_week", "period_no") WHERE staff_id IS NOT NULL AND archived_at IS NULL;
