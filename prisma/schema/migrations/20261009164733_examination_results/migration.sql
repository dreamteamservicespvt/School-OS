-- CreateEnum
CREATE TYPE "ExamPattern" AS ENUM ('PERCENTAGE', 'GRADING', 'CGPA');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RESULTS_PUBLISHED');

-- CreateEnum
CREATE TYPE "MarksPaperStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'LOCKED');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ReportCardStatus" AS ENUM ('NOT_READY', 'READY', 'PRINTED', 'SENT');

-- CreateTable
CREATE TABLE "exam_type" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "exam_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mark_category" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "mark_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_scale" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "preset" TEXT,
    "bands" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "grade_scale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_settings" (
    "school_id" UUID NOT NULL,
    "ranks_on" BOOLEAN NOT NULL DEFAULT true,
    "tie_rule" TEXT NOT NULL DEFAULT 'skip',
    "pass_percent_subject" INTEGER NOT NULL DEFAULT 33,
    "pass_percent_overall" INTEGER NOT NULL DEFAULT 33,
    "grace_marks" INTEGER NOT NULL DEFAULT 0,
    "compartment_subjects" INTEGER NOT NULL DEFAULT 0,
    "absent_rule" TEXT NOT NULL DEFAULT 'zero',
    "final_weights" JSONB NOT NULL DEFAULT '[]',
    "grade_only_grades" TEXT[] DEFAULT ARRAY['A', 'B', 'C']::TEXT[],
    "class_patterns" JSONB NOT NULL DEFAULT '{}',
    "boards" JSONB NOT NULL DEFAULT '{}',
    "default_scale_id" UUID,
    "publish_roles" TEXT[] DEFAULT ARRAY['principal', 'school-admin', 'exam-in-charge']::TEXT[],
    "marks_due_days" INTEGER NOT NULL DEFAULT 7,
    "reminder_days_before" INTEGER NOT NULL DEFAULT 1,
    "gpa_on" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_settings_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "exam" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "exam_type_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "pattern" "ExamPattern" NOT NULL DEFAULT 'PERCENTAGE',
    "grade_scale_id" UUID,
    "class_ids" UUID[],
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "results_published_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "datesheet_entry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "room" TEXT,
    "invigilator_id" UUID,
    "max_marks" INTEGER NOT NULL,
    "pattern" "ExamPattern",
    "categories" JSONB NOT NULL DEFAULT '[]',
    "marks_due_date" DATE,
    "reminder_sent_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "datesheet_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marks_paper" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "status" "MarksPaperStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "submitted_at" TIMESTAMP(3),
    "submitted_by_id" UUID,
    "locked_at" TIMESTAMP(3),
    "locked_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marks_paper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marks" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "parts" JSONB NOT NULL DEFAULT '{}',
    "total" DOUBLE PRECISION,
    "grade" TEXT,
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,
    "entered_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "history" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marks_moderation" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "marks_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "approval_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "requested_by_id" UUID NOT NULL,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marks_moderation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "exam_id" UUID,
    "key" TEXT NOT NULL,
    "student_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "max_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percent" DOUBLE PRECISION,
    "grade" TEXT,
    "points" DOUBLE PRECISION,
    "rank" INTEGER,
    "outcome" TEXT,
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "missing" INTEGER NOT NULL DEFAULT 0,
    "absent_papers" INTEGER NOT NULL DEFAULT 0,
    "subjects" JSONB NOT NULL DEFAULT '[]',
    "status" "ResultStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "scale" JSONB,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_publication" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "exam_id" UUID,
    "section_ids" UUID[],
    "publish_on" TIMESTAMP(3) NOT NULL,
    "message_parents" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "published_at" TIMESTAMP(3),
    "messages_sent" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "unpublished_at" TIMESTAMP(3),
    "unpublished_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_card" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "class_teacher_remark" TEXT,
    "principal_remark" TEXT,
    "attendance_present" INTEGER,
    "attendance_working" INTEGER,
    "status" "ReportCardStatus" NOT NULL DEFAULT 'NOT_READY',
    "printed_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_scholastic_area" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'area',
    "grades" TEXT[] DEFAULT ARRAY['A', 'B', 'C']::TEXT[],
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "co_scholastic_area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_scholastic_grade" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "student_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "grade" TEXT NOT NULL,
    "entered_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "co_scholastic_grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competency" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "levels" TEXT[] DEFAULT ARRAY['Beginning', 'Developing', 'Proficient', 'Advanced']::TEXT[],
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "competency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competency_level" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "student_id" UUID NOT NULL,
    "competency_id" UUID NOT NULL,
    "level" TEXT NOT NULL,
    "entered_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competency_level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_allocation" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "seat_no" INTEGER NOT NULL,
    "student_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "seat_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admit_card_print" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "section_id" UUID,
    "student_id" UUID,
    "count" INTEGER NOT NULL,
    "printed_by_id" UUID,
    "printed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admit_card_print_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "chapter_id" UUID,
    "type" TEXT NOT NULL DEFAULT 'short',
    "text" TEXT NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answer" TEXT,
    "marks" INTEGER NOT NULL DEFAULT 1,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_paper" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "exam_id" UUID,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'manual',
    "question_ids" UUID[],
    "total_marks" INTEGER NOT NULL DEFAULT 0,
    "duration_min" INTEGER,
    "instructions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "question_paper_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_type_school_id_name_key" ON "exam_type"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "mark_category_school_id_name_key" ON "mark_category"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "grade_scale_school_id_name_key" ON "grade_scale"("school_id", "name");

-- CreateIndex
CREATE INDEX "exam_school_id_academic_year_id_status_idx" ON "exam"("school_id", "academic_year_id", "status");

-- CreateIndex
CREATE INDEX "datesheet_entry_school_id_exam_id_idx" ON "datesheet_entry"("school_id", "exam_id");

-- CreateIndex
CREATE INDEX "datesheet_entry_school_id_date_idx" ON "datesheet_entry"("school_id", "date");

-- CreateIndex
CREATE INDEX "datesheet_entry_school_id_invigilator_id_date_idx" ON "datesheet_entry"("school_id", "invigilator_id", "date");

-- CreateIndex
CREATE INDEX "marks_paper_school_id_status_idx" ON "marks_paper"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "marks_paper_entry_id_section_id_key" ON "marks_paper"("entry_id", "section_id");

-- CreateIndex
CREATE INDEX "marks_school_id_student_id_idx" ON "marks"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "marks_school_id_entry_id_section_id_idx" ON "marks"("school_id", "entry_id", "section_id");

-- CreateIndex
CREATE UNIQUE INDEX "marks_entry_id_student_id_key" ON "marks"("entry_id", "student_id");

-- CreateIndex
CREATE INDEX "marks_moderation_school_id_status_idx" ON "marks_moderation"("school_id", "status");

-- CreateIndex
CREATE INDEX "marks_moderation_school_id_entry_id_idx" ON "marks_moderation"("school_id", "entry_id");

-- CreateIndex
CREATE INDEX "result_school_id_section_id_key_idx" ON "result"("school_id", "section_id", "key");

-- CreateIndex
CREATE INDEX "result_school_id_student_id_idx" ON "result"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_school_id_key_student_id_key" ON "result"("school_id", "key", "student_id");

-- CreateIndex
CREATE INDEX "result_publication_school_id_status_publish_on_idx" ON "result_publication"("school_id", "status", "publish_on");

-- CreateIndex
CREATE INDEX "result_publication_school_id_key_idx" ON "result_publication"("school_id", "key");

-- CreateIndex
CREATE INDEX "report_card_school_id_section_id_period_idx" ON "report_card"("school_id", "section_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "report_card_school_id_student_id_academic_year_id_period_key" ON "report_card"("school_id", "student_id", "academic_year_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "co_scholastic_area_school_id_name_key" ON "co_scholastic_area"("school_id", "name");

-- CreateIndex
CREATE INDEX "co_scholastic_grade_school_id_academic_year_id_period_idx" ON "co_scholastic_grade"("school_id", "academic_year_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "co_scholastic_grade_school_id_student_id_area_id_period_key" ON "co_scholastic_grade"("school_id", "student_id", "area_id", "period");

-- CreateIndex
CREATE INDEX "competency_school_id_subject_id_idx" ON "competency"("school_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "competency_level_school_id_student_id_competency_id_period_key" ON "competency_level"("school_id", "student_id", "competency_id", "period");

-- CreateIndex
CREATE INDEX "seat_allocation_school_id_exam_id_date_start_time_idx" ON "seat_allocation"("school_id", "exam_id", "date", "start_time");

-- CreateIndex
CREATE INDEX "admit_card_print_school_id_exam_id_idx" ON "admit_card_print"("school_id", "exam_id");

-- CreateIndex
CREATE INDEX "question_school_id_class_id_subject_id_idx" ON "question"("school_id", "class_id", "subject_id");

-- CreateIndex
CREATE INDEX "question_paper_school_id_class_id_subject_id_idx" ON "question_paper"("school_id", "class_id", "subject_id");

-- AddForeignKey
ALTER TABLE "datesheet_entry" ADD CONSTRAINT "datesheet_entry_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "exam_type" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_type" FORCE ROW LEVEL SECURITY;
CREATE POLICY "exam_type_same_school" ON "exam_type" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "mark_category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mark_category" FORCE ROW LEVEL SECURITY;
CREATE POLICY "mark_category_same_school" ON "mark_category" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "grade_scale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grade_scale" FORCE ROW LEVEL SECURITY;
CREATE POLICY "grade_scale_same_school" ON "grade_scale" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "exam_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "exam_settings_same_school" ON "exam_settings" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "exam" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam" FORCE ROW LEVEL SECURITY;
CREATE POLICY "exam_same_school" ON "exam" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "datesheet_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "datesheet_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "datesheet_entry_same_school" ON "datesheet_entry" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "marks_paper" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marks_paper" FORCE ROW LEVEL SECURITY;
CREATE POLICY "marks_paper_same_school" ON "marks_paper" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "marks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "marks_same_school" ON "marks" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "marks_moderation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marks_moderation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "marks_moderation_same_school" ON "marks_moderation" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "result" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "result" FORCE ROW LEVEL SECURITY;
CREATE POLICY "result_same_school" ON "result" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "result_publication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "result_publication" FORCE ROW LEVEL SECURITY;
CREATE POLICY "result_publication_same_school" ON "result_publication" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "report_card" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_card" FORCE ROW LEVEL SECURITY;
CREATE POLICY "report_card_same_school" ON "report_card" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "co_scholastic_area" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "co_scholastic_area" FORCE ROW LEVEL SECURITY;
CREATE POLICY "co_scholastic_area_same_school" ON "co_scholastic_area" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "co_scholastic_grade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "co_scholastic_grade" FORCE ROW LEVEL SECURITY;
CREATE POLICY "co_scholastic_grade_same_school" ON "co_scholastic_grade" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "competency" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "competency" FORCE ROW LEVEL SECURITY;
CREATE POLICY "competency_same_school" ON "competency" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "competency_level" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "competency_level" FORCE ROW LEVEL SECURITY;
CREATE POLICY "competency_level_same_school" ON "competency_level" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "seat_allocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seat_allocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "seat_allocation_same_school" ON "seat_allocation" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "admit_card_print" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admit_card_print" FORCE ROW LEVEL SECURITY;
CREATE POLICY "admit_card_print_same_school" ON "admit_card_print" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question" FORCE ROW LEVEL SECURITY;
CREATE POLICY "question_same_school" ON "question" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "question_paper" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_paper" FORCE ROW LEVEL SECURITY;
CREATE POLICY "question_paper_same_school" ON "question_paper" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
