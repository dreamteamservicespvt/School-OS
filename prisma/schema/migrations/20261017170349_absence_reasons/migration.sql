-- AlterTable
ALTER TABLE "attendance_mark" ADD COLUMN     "absence_note" TEXT,
ADD COLUMN     "absence_reason" TEXT,
ADD COLUMN     "absence_reason_source" TEXT;

-- CreateIndex
CREATE INDEX "attendance_mark_school_id_absence_reason_date_idx" ON "attendance_mark"("school_id", "absence_reason", "date");

