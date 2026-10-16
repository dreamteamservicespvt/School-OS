-- CreateEnum
CREATE TYPE "HostelGender" AS ENUM ('BOYS', 'GIRLS');

-- CreateEnum
CREATE TYPE "BedAllocationStatus" AS ENUM ('ACTIVE', 'MOVED', 'CHECKED_OUT');

-- CreateEnum
CREATE TYPE "RollCallSession" AS ENUM ('MORNING', 'NIGHT');

-- CreateEnum
CREATE TYPE "RollCallMarkKind" AS ENUM ('PRESENT', 'ABSENT', 'OUTING', 'LEAVE');

-- CreateEnum
CREATE TYPE "HostelIncidentType" AS ENUM ('DISCIPLINE', 'MEDICAL', 'MAINTENANCE');

-- AlterTable
ALTER TABLE "gate_pass" ADD COLUMN     "approval_id" UUID,
ADD COLUMN     "collector_phone" TEXT,
ADD COLUMN     "decided_at" TIMESTAMP(3),
ADD COLUMN     "decided_by_id" UUID,
ADD COLUMN     "decision_note" TEXT,
ADD COLUMN     "from_at" TIMESTAMP(3),
ADD COLUMN     "hostel_id" UUID,
ADD COLUMN     "late_alerted_at" TIMESTAMP(3),
ADD COLUMN     "outing_type" TEXT,
ADD COLUMN     "returned_at" TIMESTAMP(3),
ADD COLUMN     "returned_by_id" UUID,
ADD COLUMN     "to_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "visitor_entry" ADD COLUMN     "allowed_by" TEXT,
ADD COLUMN     "approved_by_id" UUID,
ADD COLUMN     "hostel_id" UUID,
ADD COLUMN     "meet_student_id" UUID,
ADD COLUMN     "relation" TEXT;

-- CreateTable
CREATE TABLE "hostel_setting" (
    "school_id" UUID NOT NULL,
    "rules" TEXT NOT NULL DEFAULT '',
    "morning_roll_minute" INTEGER NOT NULL DEFAULT 390,
    "night_roll_minute" INTEGER NOT NULL DEFAULT 1290,
    "outing_back_minute" INTEGER NOT NULL DEFAULT 1080,
    "visiting_days" INTEGER[] DEFAULT ARRAY[0]::INTEGER[],
    "visiting_from_minute" INTEGER NOT NULL DEFAULT 600,
    "visiting_to_minute" INTEGER NOT NULL DEFAULT 780,
    "meals" TEXT[] DEFAULT ARRAY['Breakfast', 'Lunch', 'Snacks', 'Dinner']::TEXT[],
    "message_on_out" BOOLEAN NOT NULL DEFAULT true,
    "message_on_return" BOOLEAN NOT NULL DEFAULT true,
    "message_on_late" BOOLEAN NOT NULL DEFAULT true,
    "message_on_incident" BOOLEAN NOT NULL DEFAULT true,
    "alert_night_absent" BOOLEAN NOT NULL DEFAULT true,
    "alert_late" BOOLEAN NOT NULL DEFAULT true,
    "late_after_minutes" INTEGER NOT NULL DEFAULT 15,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hostel_setting_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "hostel" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "HostelGender" NOT NULL,
    "floors" TEXT[] DEFAULT ARRAY['Ground']::TEXT[],
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "hostel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_warden" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "hostel_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Warden',
    "from_date" DATE NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),
    "archived_by_id" UUID,

    CONSTRAINT "hostel_warden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_room" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "hostel_id" UUID NOT NULL,
    "floor" TEXT NOT NULL,
    "room_no" TEXT NOT NULL,
    "room_type" TEXT,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "hostel_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_bed" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "hostel_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "bed_no" INTEGER NOT NULL,
    "blocked_at" TIMESTAMP(3),
    "blocked_reason" TEXT,
    "blocked_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "hostel_bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bed_allocation" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "hostel_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "bed_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "status" "BedAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE NOT NULL,
    "checked_in_at" TIMESTAMP(3),
    "check_in_by_id" UUID,
    "end_date" DATE,
    "ended_at" TIMESTAMP(3),
    "ended_by_id" UUID,
    "end_reason" TEXT,
    "moved_from_id" UUID,
    "moved_to_id" UUID,
    "fee_plan_id" UUID,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bed_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_fee_plan" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "hostel_id" UUID,
    "room_type" TEXT,
    "fee_head_id" UUID NOT NULL,
    "includes_mess" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "hostel_fee_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_fee_installment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "hostel_fee_installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_fee_charge" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "allocation_id" UUID NOT NULL,
    "installment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "due_id" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ADDED',
    "stopped_at" TIMESTAMP(3),
    "stopped_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_fee_charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roll_call" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "hostel_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "session" "RollCallSession" NOT NULL,
    "taken_by_id" UUID,
    "taken_at" TIMESTAMP(3) NOT NULL,
    "present_count" INTEGER NOT NULL DEFAULT 0,
    "absent_count" INTEGER NOT NULL DEFAULT 0,
    "away_count" INTEGER NOT NULL DEFAULT 0,
    "alerted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roll_call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roll_call_mark" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "roll_call_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "mark" "RollCallMarkKind" NOT NULL,
    "gate_pass_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roll_call_mark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_incident" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "incident_no" TEXT NOT NULL,
    "hostel_id" UUID,
    "type" "HostelIncidentType" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "student_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "place" TEXT,
    "description" TEXT NOT NULL,
    "action_taken" TEXT,
    "inform_parent" BOOLEAN NOT NULL DEFAULT false,
    "parent_messaged_at" TIMESTAMP(3),
    "behaviour_incident_id" UUID,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "hostel_incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mess_menu_item" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "day_index" INTEGER NOT NULL,
    "meal" TEXT NOT NULL,
    "dishes" TEXT NOT NULL,
    "kcal" INTEGER,
    "protein_g" INTEGER,
    "note" TEXT,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mess_menu_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_head_count" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "meal" TEXT NOT NULL,
    "expected" INTEGER NOT NULL,
    "actual" INTEGER NOT NULL,
    "note" TEXT,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_head_count_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mess_expense" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "item" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "vendor_id" UUID,
    "bill_file_id" UUID,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "expense_id" UUID,
    "note" TEXT,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "mess_expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hostel_school_id_name_key" ON "hostel"("school_id", "name");

-- CreateIndex
CREATE INDEX "hostel_warden_school_id_hostel_id_idx" ON "hostel_warden"("school_id", "hostel_id");

-- CreateIndex
CREATE INDEX "hostel_warden_school_id_staff_id_idx" ON "hostel_warden"("school_id", "staff_id");

-- CreateIndex
CREATE INDEX "hostel_room_school_id_hostel_id_idx" ON "hostel_room"("school_id", "hostel_id");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_room_hostel_id_room_no_key" ON "hostel_room"("hostel_id", "room_no");

-- CreateIndex
CREATE INDEX "hostel_bed_school_id_hostel_id_idx" ON "hostel_bed"("school_id", "hostel_id");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_bed_room_id_bed_no_key" ON "hostel_bed"("room_id", "bed_no");

-- CreateIndex
CREATE INDEX "bed_allocation_school_id_status_idx" ON "bed_allocation"("school_id", "status");

-- CreateIndex
CREATE INDEX "bed_allocation_school_id_student_id_idx" ON "bed_allocation"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "bed_allocation_school_id_bed_id_idx" ON "bed_allocation"("school_id", "bed_id");

-- CreateIndex
CREATE INDEX "hostel_fee_plan_school_id_academic_year_id_idx" ON "hostel_fee_plan"("school_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "hostel_fee_installment_school_id_plan_id_idx" ON "hostel_fee_installment"("school_id", "plan_id");

-- CreateIndex
CREATE INDEX "hostel_fee_charge_school_id_student_id_idx" ON "hostel_fee_charge"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_fee_charge_allocation_id_installment_id_key" ON "hostel_fee_charge"("allocation_id", "installment_id");

-- CreateIndex
CREATE INDEX "roll_call_school_id_date_idx" ON "roll_call"("school_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "roll_call_hostel_id_date_session_key" ON "roll_call"("hostel_id", "date", "session");

-- CreateIndex
CREATE INDEX "roll_call_mark_school_id_student_id_idx" ON "roll_call_mark"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "roll_call_mark_roll_call_id_student_id_key" ON "roll_call_mark"("roll_call_id", "student_id");

-- CreateIndex
CREATE INDEX "hostel_incident_school_id_at_idx" ON "hostel_incident"("school_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_incident_school_id_incident_no_key" ON "hostel_incident"("school_id", "incident_no");

-- CreateIndex
CREATE UNIQUE INDEX "mess_menu_item_school_id_week_start_day_index_meal_key" ON "mess_menu_item"("school_id", "week_start", "day_index", "meal");

-- CreateIndex
CREATE UNIQUE INDEX "meal_head_count_school_id_date_meal_key" ON "meal_head_count"("school_id", "date", "meal");

-- CreateIndex
CREATE INDEX "mess_expense_school_id_date_idx" ON "mess_expense"("school_id", "date");

-- CreateIndex
CREATE INDEX "gate_pass_school_id_kind_status_idx" ON "gate_pass"("school_id", "kind", "status");

-- CreateIndex
CREATE INDEX "visitor_entry_school_id_meet_student_id_idx" ON "visitor_entry"("school_id", "meet_student_id");

-- AddForeignKey
ALTER TABLE "hostel_bed" ADD CONSTRAINT "hostel_bed_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "hostel_room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_fee_installment" ADD CONSTRAINT "hostel_fee_installment_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "hostel_fee_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roll_call_mark" ADD CONSTRAINT "roll_call_mark_roll_call_id_fkey" FOREIGN KEY ("roll_call_id") REFERENCES "roll_call"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "hostel_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hostel_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hostel_setting_same_school" ON "hostel_setting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "hostel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hostel" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hostel_same_school" ON "hostel" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "hostel_warden" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hostel_warden" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hostel_warden_same_school" ON "hostel_warden" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "hostel_room" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hostel_room" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hostel_room_same_school" ON "hostel_room" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "hostel_bed" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hostel_bed" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hostel_bed_same_school" ON "hostel_bed" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "bed_allocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bed_allocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "bed_allocation_same_school" ON "bed_allocation" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "hostel_fee_plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hostel_fee_plan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hostel_fee_plan_same_school" ON "hostel_fee_plan" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "hostel_fee_installment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hostel_fee_installment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hostel_fee_installment_same_school" ON "hostel_fee_installment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "hostel_fee_charge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hostel_fee_charge" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hostel_fee_charge_same_school" ON "hostel_fee_charge" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "roll_call" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roll_call" FORCE ROW LEVEL SECURITY;
CREATE POLICY "roll_call_same_school" ON "roll_call" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "roll_call_mark" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roll_call_mark" FORCE ROW LEVEL SECURITY;
CREATE POLICY "roll_call_mark_same_school" ON "roll_call_mark" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "hostel_incident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hostel_incident" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hostel_incident_same_school" ON "hostel_incident" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "mess_menu_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mess_menu_item" FORCE ROW LEVEL SECURITY;
CREATE POLICY "mess_menu_item_same_school" ON "mess_menu_item" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "meal_head_count" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meal_head_count" FORCE ROW LEVEL SECURITY;
CREATE POLICY "meal_head_count_same_school" ON "meal_head_count" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "mess_expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mess_expense" FORCE ROW LEVEL SECURITY;
CREATE POLICY "mess_expense_same_school" ON "mess_expense" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());

-- One bed per student, and one student per bed (15 §5): only one ACTIVE allocation each.
CREATE UNIQUE INDEX "bed_allocation_one_active_per_student" ON "bed_allocation"("student_id") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "bed_allocation_one_active_per_bed" ON "bed_allocation"("bed_id") WHERE "status" = 'ACTIVE';
