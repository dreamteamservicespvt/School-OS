-- Student Pickup code guessing (gap list G04, 16-front-office.md §2): every wrong pickup
-- code is kept, with who typed it, so wrong codes can be limited per student and per
-- person at the desk, and the lock each limit starts can be shown. A new table only:
-- nothing that schools already have changes.

-- CreateTable
CREATE TABLE "pickup_code_try" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "pickup_code_id" UUID,
    "entered_by_id" UUID,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "student_locked_until" TIMESTAMP(3),
    "person_locked_until" TIMESTAMP(3),

    CONSTRAINT "pickup_code_try_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pickup_code_try_school_id_student_id_at_idx" ON "pickup_code_try"("school_id", "student_id", "at");

-- CreateIndex
CREATE INDEX "pickup_code_try_school_id_entered_by_id_at_idx" ON "pickup_code_try"("school_id", "entered_by_id", "at");


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "pickup_code_try" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pickup_code_try" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pickup_code_try_same_school" ON "pickup_code_try" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
CREATE POLICY "pickup_code_try_purge" ON "pickup_code_try" FOR DELETE USING (current_user = 'school_os_owner' AND school_id::text = current_setting('app.school_purge', true));
