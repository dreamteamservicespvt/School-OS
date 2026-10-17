-- Examination & Results (gap G23): late joiners and section moves.
-- Only adds columns or makes columns optional, so every school's existing
-- rows keep working: existing results are not left out, existing marks
-- changes keep their marks and "before" value, and every school starts with
-- the safest choices (late marks need an approval; a missed exam is left out
-- of the final result).

-- Exam Settings: how late marks are added, and how a missed exam counts in the final result.
ALTER TABLE "exam_settings" ADD COLUMN     "late_join_rule" TEXT NOT NULL DEFAULT 'leave-out',
ADD COLUMN     "late_marks" TEXT NOT NULL DEFAULT 'approval';

-- Marks Moderation: late marks have no earlier Marks row and no "before" value.
ALTER TABLE "marks_moderation" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'change',
ADD COLUMN     "section_id" UUID,
ALTER COLUMN "marks_id" DROP NOT NULL,
ALTER COLUMN "before" DROP NOT NULL;

-- Result: "Joined after this exam".
ALTER TABLE "result" ADD COLUMN     "left_out" BOOLEAN NOT NULL DEFAULT false;
