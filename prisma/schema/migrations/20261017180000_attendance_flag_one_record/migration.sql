-- Attendance is flagged once (gap list P1.6). The Attendance Flag is the one
-- record of a student's attendance concern: Early Warnings lists and reviews
-- it instead of raising its own Risk Flag, and the Dashboard counts it once.
--
-- Only columns are added, each empty or with a default, so every school's
-- flags keep working as they are. A flag already cleared reads as Closed.
-- Open attendance Risk Flags raised before this change are joined to the
-- student's Attendance Flag by the next Early Warnings check
-- (src/lib/reports/warnings.ts, joinAttendanceFlags): their reviews are linked,
-- a review already made carries over, and the Risk Flag is closed with the
-- reason and a link, never deleted. Until then the screens already show the
-- Attendance Flag in their place.

-- AlterTable
ALTER TABLE "attendance_flag" ADD COLUMN     "action" TEXT,
ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "closed_reason" TEXT,
ADD COLUMN     "counselling_id" UUID,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'NEW',
ADD COLUMN     "task_id" UUID;

-- AlterTable
ALTER TABLE "flag_review" ADD COLUMN     "attendance_flag_id" UUID,
ALTER COLUMN "flag_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "risk_flag" ADD COLUMN     "attendance_flag_id" UUID;

-- CreateIndex
CREATE INDEX "flag_review_school_id_attendance_flag_id_idx" ON "flag_review"("school_id", "attendance_flag_id");

-- AddForeignKey
ALTER TABLE "flag_review" ADD CONSTRAINT "flag_review_attendance_flag_id_fkey" FOREIGN KEY ("attendance_flag_id") REFERENCES "attendance_flag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every review belongs to a flag.
ALTER TABLE "flag_review" ADD CONSTRAINT "flag_review_has_flag" CHECK ("flag_id" IS NOT NULL OR "attendance_flag_id" IS NOT NULL);
