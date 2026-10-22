-- Where a class teacher remark came from (gap list G30): from a suggestion
-- (the school's phrase bank, or reworded by the AI assistant), kept as it was
-- or edited, and the evidence that suggestion showed. Two new empty columns:
-- every remark already written stays as it is, with no origin recorded.

-- AlterTable
ALTER TABLE "report_card" ADD COLUMN "class_teacher_remark_from" TEXT,
ADD COLUMN "class_teacher_remark_evidence" JSONB;
