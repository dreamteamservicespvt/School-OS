-- CreateEnum
CREATE TYPE "SyllabusItemKind" AS ENUM ('UNIT', 'CHAPTER', 'LESSON', 'TOPIC');

-- AlterEnum
ALTER TYPE "AcademicYearStatus" ADD VALUE 'OPEN';

-- AlterTable
ALTER TABLE "period_slot" ADD COLUMN     "days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[];

-- AlterTable
ALTER TABLE "section" ADD COLUMN     "stream_id" UUID;

-- AlterTable
ALTER TABLE "substitution" ADD COLUMN     "cover_id" UUID,
ADD COLUMN     "reason" TEXT NOT NULL DEFAULT 'leave';

-- AlterTable
ALTER TABLE "teacher_allocation" ADD COLUMN     "periods_per_week" INTEGER;

-- AlterTable
ALTER TABLE "timetable_period" ADD COLUMN     "label" TEXT;

-- CreateTable
CREATE TABLE "academic_settings" (
    "school_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "day_start" TEXT NOT NULL DEFAULT '08:30',
    "day_end" TEXT NOT NULL DEFAULT '15:00',
    "working_days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "half_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "half_day_end" TEXT,
    "max_periods_per_day" INTEGER NOT NULL DEFAULT 7,
    "max_periods_per_week" INTEGER NOT NULL DEFAULT 32,
    "max_consecutive" INTEGER NOT NULL DEFAULT 4,
    "auto_substitutions" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_settings_pkey" PRIMARY KEY ("school_id","campus_id")
);

-- CreateTable
CREATE TABLE "stream" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "stream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'classroom',
    "capacity" INTEGER,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_booking" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "period_no" INTEGER NOT NULL,
    "section_id" UUID,
    "staff_id" UUID NOT NULL,
    "purpose" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "lab_booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_preference" (
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "max_per_day" INTEGER,
    "max_per_week" INTEGER,
    "unavailable" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_preference_pkey" PRIMARY KEY ("school_id","staff_id")
);

-- CreateTable
CREATE TABLE "subject_condition" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "class_id" UUID,
    "day_of_week" INTEGER,
    "period_no" INTEGER NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "subject_condition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elective_option" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "group_name" TEXT NOT NULL,
    "seats" INTEGER,
    "prerequisite" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "elective_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elective_choice" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "group_name" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "elective_choice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporary_cover" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "absent_staff_id" UUID NOT NULL,
    "temp_staff_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "temporary_cover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_absence" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "staff_absence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus_item" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "parent_id" UUID,
    "kind" "SyllabusItemKind" NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "planned_from" DATE,
    "planned_to" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "syllabus_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_plan" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "objectives" TEXT,
    "resources" TEXT,
    "activities" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "lesson_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus_progress_entry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "staff_id" UUID,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'taught',
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "syllabus_progress_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stream_school_id_campus_id_name_key" ON "stream"("school_id", "campus_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "room_school_id_campus_id_name_key" ON "room"("school_id", "campus_id", "name");

-- CreateIndex
CREATE INDEX "lab_booking_school_id_room_id_date_idx" ON "lab_booking"("school_id", "room_id", "date");

-- CreateIndex
CREATE INDEX "subject_condition_school_id_subject_id_idx" ON "subject_condition"("school_id", "subject_id");

-- CreateIndex
CREATE INDEX "elective_option_school_id_academic_year_id_class_id_idx" ON "elective_option"("school_id", "academic_year_id", "class_id");

-- CreateIndex
CREATE INDEX "elective_choice_school_id_academic_year_id_student_id_idx" ON "elective_choice"("school_id", "academic_year_id", "student_id");

-- CreateIndex
CREATE INDEX "elective_choice_school_id_option_id_idx" ON "elective_choice"("school_id", "option_id");

-- CreateIndex
CREATE INDEX "temporary_cover_school_id_absent_staff_id_idx" ON "temporary_cover"("school_id", "absent_staff_id");

-- CreateIndex
CREATE INDEX "staff_absence_school_id_date_idx" ON "staff_absence"("school_id", "date");

-- CreateIndex
CREATE INDEX "syllabus_item_school_id_academic_year_id_class_id_subject_i_idx" ON "syllabus_item"("school_id", "academic_year_id", "class_id", "subject_id");

-- CreateIndex
CREATE INDEX "lesson_plan_school_id_academic_year_id_staff_id_date_idx" ON "lesson_plan"("school_id", "academic_year_id", "staff_id", "date");

-- CreateIndex
CREATE INDEX "lesson_plan_school_id_section_id_subject_id_idx" ON "lesson_plan"("school_id", "section_id", "subject_id");

-- CreateIndex
CREATE INDEX "syllabus_progress_entry_school_id_section_id_item_id_idx" ON "syllabus_progress_entry"("school_id", "section_id", "item_id");

-- CreateIndex
CREATE INDEX "syllabus_progress_entry_school_id_academic_year_id_date_idx" ON "syllabus_progress_entry"("school_id", "academic_year_id", "date");

-- AddForeignKey
ALTER TABLE "lab_booking" ADD CONSTRAINT "lab_booking_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_choice" ADD CONSTRAINT "elective_choice_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "elective_option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_item" ADD CONSTRAINT "syllabus_item_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "syllabus_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "academic_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "academic_settings_same_school" ON "academic_settings" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "stream" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stream" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stream_same_school" ON "stream" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "room" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "room" FORCE ROW LEVEL SECURITY;
CREATE POLICY "room_same_school" ON "room" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "lab_booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_booking" FORCE ROW LEVEL SECURITY;
CREATE POLICY "lab_booking_same_school" ON "lab_booking" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "teacher_preference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teacher_preference" FORCE ROW LEVEL SECURITY;
CREATE POLICY "teacher_preference_same_school" ON "teacher_preference" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "subject_condition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subject_condition" FORCE ROW LEVEL SECURITY;
CREATE POLICY "subject_condition_same_school" ON "subject_condition" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "elective_option" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "elective_option" FORCE ROW LEVEL SECURITY;
CREATE POLICY "elective_option_same_school" ON "elective_option" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "elective_choice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "elective_choice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "elective_choice_same_school" ON "elective_choice" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "temporary_cover" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "temporary_cover" FORCE ROW LEVEL SECURITY;
CREATE POLICY "temporary_cover_same_school" ON "temporary_cover" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "staff_absence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_absence" FORCE ROW LEVEL SECURITY;
CREATE POLICY "staff_absence_same_school" ON "staff_absence" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "syllabus_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "syllabus_item" FORCE ROW LEVEL SECURITY;
CREATE POLICY "syllabus_item_same_school" ON "syllabus_item" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "lesson_plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lesson_plan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "lesson_plan_same_school" ON "lesson_plan" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "syllabus_progress_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "syllabus_progress_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "syllabus_progress_entry_same_school" ON "syllabus_progress_entry" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());

