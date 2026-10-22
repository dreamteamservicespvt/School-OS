-- Attendance so far (gap list G19): a school that starts on School OS part way
-- through the year brings in each student's days present and days the school
-- met up to the go-live date, as one opening total per student per year. A new
-- table only; nothing existing changes, so every school's data keeps working.

-- CreateTable
CREATE TABLE "opening_attendance" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "up_to" DATE NOT NULL,
    "days_met" DECIMAL(5,1) NOT NULL,
    "days_present" DECIMAL(5,1) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "opening_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opening_attendance_school_id_student_id_idx" ON "opening_attendance"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "opening_attendance_school_id_academic_year_id_idx" ON "opening_attendance"("school_id", "academic_year_id");

-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "opening_attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "opening_attendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "opening_attendance_same_school" ON "opening_attendance" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
CREATE POLICY "opening_attendance_purge" ON "opening_attendance" FOR DELETE USING (current_user = 'school_os_owner' AND school_id::text = current_setting('app.school_purge', true));
