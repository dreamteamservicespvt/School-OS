-- Remark phrase bank (gap list G30): the school's own words for report-card
-- remark suggestions, kept with Exam Settings. One new column with an empty
-- default, so every school keeps the ready-made phrases until it changes them.

-- AlterTable
ALTER TABLE "exam_settings" ADD COLUMN "remark_phrases" JSONB NOT NULL DEFAULT '{}';
