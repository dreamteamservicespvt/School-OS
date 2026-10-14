-- CreateEnum
CREATE TYPE "GatePassKind" AS ENUM ('PICKUP', 'HOSTEL_OUTING');

-- CreateTable
CREATE TABLE "front_office_setting" (
    "school_id" UUID NOT NULL,
    "visitor_purposes" TEXT[] DEFAULT ARRAY['Meeting', 'Fee payment', 'Admission enquiry', 'Delivery', 'Interview', 'Other']::TEXT[],
    "call_purposes" TEXT[] DEFAULT ARRAY['Admission enquiry', 'Fee', 'Transport', 'Complaint', 'Other']::TEXT[],
    "request_departments" TEXT[] DEFAULT ARRAY['Office', 'Accounts', 'Academics', 'Transport', 'Admissions', 'Exams', 'Hostel', 'Library']::TEXT[],
    "photo_required" BOOLEAN NOT NULL DEFAULT false,
    "id_proof_required" BOOLEAN NOT NULL DEFAULT false,
    "pickup_code_check" BOOLEAN NOT NULL DEFAULT false,
    "pass_expiry" TEXT,
    "slot_minutes" INTEGER NOT NULL DEFAULT 15,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "front_office_setting_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "visitor_entry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "pass_no" TEXT NOT NULL,
    "visit_date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "meet_staff_id" UUID,
    "note" TEXT,
    "people_count" INTEGER NOT NULL DEFAULT 1,
    "photo_file_id" UUID,
    "id_proof_type" TEXT,
    "id_proof_no" TEXT,
    "id_proof_last4" TEXT,
    "vehicle_no" TEXT,
    "time_in" TIMESTAMP(3) NOT NULL,
    "time_out" TIMESTAMP(3),
    "pass_expires_at" TIMESTAMP(3) NOT NULL,
    "staff_reply" TEXT,
    "staff_reply_at" TIMESTAMP(3),
    "appointment_id" UUID,
    "enquiry_id" UUID,
    "checked_out_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "visitor_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_entry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "who" TEXT NOT NULL,
    "vehicle_no" TEXT,
    "purpose" TEXT,
    "visitor_entry_id" UUID,
    "gate_pass_id" UUID,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "gate_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_pass" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "pass_no" TEXT NOT NULL,
    "kind" "GatePassKind" NOT NULL,
    "student_id" UUID NOT NULL,
    "section_label" TEXT,
    "reason" TEXT NOT NULL,
    "time_out" TIMESTAMP(3) NOT NULL,
    "issued_by_id" UUID,
    "guardian_id" UUID,
    "collector_name" TEXT,
    "collector_relation" TEXT,
    "verification" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "left_at" TIMESTAMP(3),
    "gate_checked_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "gate_pass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_code" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "front_office_note" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cleared_at" TIMESTAMP(3),
    "cleared_by_id" UUID,

    CONSTRAINT "front_office_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "walk_in_request" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "request_no" TEXT NOT NULL,
    "from_name" TEXT NOT NULL,
    "from_phone" TEXT,
    "guardian_id" UUID,
    "student_id" UUID,
    "about" TEXT,
    "request" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "note" TEXT,
    "given_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "task_id" UUID,
    "handler_login_id" UUID,
    "done_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "walk_in_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_log_entry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "direction" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "who" TEXT,
    "is_parent" BOOLEAN NOT NULL DEFAULT false,
    "guardian_id" UUID,
    "purpose" TEXT NOT NULL,
    "note" TEXT,
    "enquiry_id" UUID,
    "query_id" UUID,
    "query_no" TEXT,
    "follow_up_at" TIMESTAMP(3),
    "follow_up_login_id" UUID,
    "task_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'CLOSED',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "call_log_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_min" INTEGER NOT NULL,
    "length_min" INTEGER NOT NULL,
    "visitor_name" TEXT NOT NULL,
    "visitor_phone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "status_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitor_entry_id" UUID,
    "confirmation_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postal_entry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "entry_no" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "direction" TEXT NOT NULL,
    "item_type" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "for_staff_id" UUID,
    "for_text" TEXT NOT NULL,
    "courier" TEXT,
    "tracking_no" TEXT,
    "photo_file_id" UUID,
    "status" TEXT NOT NULL,
    "handed_to_name" TEXT,
    "handed_at" TIMESTAMP(3),
    "handed_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "postal_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visitor_entry_school_id_visit_date_idx" ON "visitor_entry"("school_id", "visit_date");

-- CreateIndex
CREATE INDEX "visitor_entry_school_id_phone_idx" ON "visitor_entry"("school_id", "phone");

-- CreateIndex
CREATE INDEX "visitor_entry_school_id_meet_staff_id_idx" ON "visitor_entry"("school_id", "meet_staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_entry_school_id_pass_no_key" ON "visitor_entry"("school_id", "pass_no");

-- CreateIndex
CREATE INDEX "gate_entry_school_id_at_idx" ON "gate_entry"("school_id", "at");

-- CreateIndex
CREATE INDEX "gate_pass_school_id_time_out_idx" ON "gate_pass"("school_id", "time_out");

-- CreateIndex
CREATE INDEX "gate_pass_school_id_student_id_idx" ON "gate_pass"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "gate_pass_school_id_pass_no_key" ON "gate_pass"("school_id", "pass_no");

-- CreateIndex
CREATE INDEX "pickup_code_school_id_student_id_guardian_id_idx" ON "pickup_code"("school_id", "student_id", "guardian_id");

-- CreateIndex
CREATE INDEX "front_office_note_school_id_cleared_at_idx" ON "front_office_note"("school_id", "cleared_at");

-- CreateIndex
CREATE INDEX "walk_in_request_school_id_created_at_idx" ON "walk_in_request"("school_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "walk_in_request_school_id_request_no_key" ON "walk_in_request"("school_id", "request_no");

-- CreateIndex
CREATE INDEX "call_log_entry_school_id_at_idx" ON "call_log_entry"("school_id", "at");

-- CreateIndex
CREATE INDEX "call_log_entry_school_id_phone_idx" ON "call_log_entry"("school_id", "phone");

-- CreateIndex
CREATE INDEX "appointment_school_id_staff_id_date_idx" ON "appointment"("school_id", "staff_id", "date");

-- CreateIndex
CREATE INDEX "appointment_school_id_date_idx" ON "appointment"("school_id", "date");

-- CreateIndex
CREATE INDEX "postal_entry_school_id_at_idx" ON "postal_entry"("school_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "postal_entry_school_id_entry_no_key" ON "postal_entry"("school_id", "entry_no");


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "front_office_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "front_office_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "front_office_setting_same_school" ON "front_office_setting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "visitor_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visitor_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "visitor_entry_same_school" ON "visitor_entry" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "gate_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gate_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "gate_entry_same_school" ON "gate_entry" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "gate_pass" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gate_pass" FORCE ROW LEVEL SECURITY;
CREATE POLICY "gate_pass_same_school" ON "gate_pass" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "pickup_code" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pickup_code" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pickup_code_same_school" ON "pickup_code" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "front_office_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "front_office_note" FORCE ROW LEVEL SECURITY;
CREATE POLICY "front_office_note_same_school" ON "front_office_note" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "walk_in_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walk_in_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY "walk_in_request_same_school" ON "walk_in_request" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "call_log_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "call_log_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "call_log_entry_same_school" ON "call_log_entry" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "appointment_same_school" ON "appointment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "postal_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "postal_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "postal_entry_same_school" ON "postal_entry" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
