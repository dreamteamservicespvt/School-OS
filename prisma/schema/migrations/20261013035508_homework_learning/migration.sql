-- CreateEnum
CREATE TYPE "HomeworkGivenTo" AS ENUM ('SECTION', 'CLASS', 'STUDENTS');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('ASSIGNED', 'SUBMITTED', 'LATE', 'GRADED', 'MISSING', 'EXCUSED');

-- CreateEnum
CREATE TYPE "CheckResult" AS ENUM ('COMPLETE', 'INCORRECT');

-- CreateEnum
CREATE TYPE "LessonItemKind" AS ENUM ('NOTES', 'DOCUMENT', 'VIDEO', 'LINK');

-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "QuizQuestionKind" AS ENUM ('CHOICE', 'TRUE_FALSE', 'SHORT');

-- CreateEnum
CREATE TYPE "OnlineClassStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "homework" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_id" UUID,
    "group_id" UUID,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "given_to" "HomeworkGivenTo" NOT NULL DEFAULT 'SECTION',
    "start_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "max_marks" INTEGER NOT NULL DEFAULT 100,
    "online_submission" BOOLEAN NOT NULL DEFAULT true,
    "from_suggestion" BOOLEAN NOT NULL DEFAULT false,
    "missing_marked_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),
    "archived_by_id" UUID,

    CONSTRAINT "homework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_attachment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "homework_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "file_id" UUID,
    "url" TEXT,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "homework_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "homework_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'ASSIGNED',
    "submitted_at" TIMESTAMP(3),
    "note" TEXT,
    "file_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "check_result" "CheckResult",
    "score" INTEGER,
    "grade" TEXT,
    "feedback" TEXT,
    "resubmit_allowed" BOOLEAN NOT NULL DEFAULT false,
    "resubmit_until" DATE,
    "hand_ins" INTEGER NOT NULL DEFAULT 0,
    "graded_by_id" UUID,
    "graded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_comment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "homework_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "author_id" UUID,
    "author_name" TEXT NOT NULL,
    "from_student" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hidden_at" TIMESTAMP(3),
    "hidden_reason" TEXT,

    CONSTRAINT "homework_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_setting" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "online_submission" BOOLEAN NOT NULL DEFAULT true,
    "max_file_mb" INTEGER NOT NULL DEFAULT 10,
    "resubmit" TEXT NOT NULL DEFAULT 'per-student',
    "discussion_on" BOOLEAN NOT NULL DEFAULT true,
    "grace_minutes" INTEGER NOT NULL DEFAULT 0,
    "missing_on" BOOLEAN NOT NULL DEFAULT true,
    "grading_show" TEXT NOT NULL DEFAULT 'both',
    "default_max_marks" INTEGER NOT NULL DEFAULT 100,
    "grade_bands" JSONB NOT NULL DEFAULT '[{"grade":"A","from":80},{"grade":"B","from":60},{"grade":"C","from":40},{"grade":"D","from":0}]',
    "feedback_visible" BOOLEAN NOT NULL DEFAULT true,
    "list_view" TEXT NOT NULL DEFAULT 'cards',
    "card_shows_seen" BOOLEAN NOT NULL DEFAULT true,
    "card_shows_files" BOOLEAN NOT NULL DEFAULT false,
    "class_teacher_reads_courses" BOOLEAN NOT NULL DEFAULT true,
    "student_courses" TEXT NOT NULL DEFAULT 'section',
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "chapter_id" UUID,
    "chapter_title" TEXT,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_item" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "kind" "LessonItemKind" NOT NULL,
    "name" TEXT NOT NULL,
    "file_id" UUID,
    "url" TEXT,
    "size_bytes" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "lesson_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_view" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "first_opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_at" TIMESTAMP(3),

    CONSTRAINT "lesson_view_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_certificate" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by_id" UUID,

    CONSTRAINT "course_certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_id" UUID,
    "title" TEXT NOT NULL,
    "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
    "opens_at" TIMESTAMP(3),
    "closes_at" TIMESTAMP(3),
    "time_limit_min" INTEGER,
    "attempts_allowed" INTEGER NOT NULL DEFAULT 1,
    "show_answers" BOOLEAN NOT NULL DEFAULT true,
    "closed_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_question" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "kind" "QuizQuestionKind" NOT NULL DEFAULT 'CHOICE',
    "text" TEXT NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "correct_index" INTEGER,
    "marks" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "quiz_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempt" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "answers" JSONB NOT NULL DEFAULT '{}',
    "manual_marks" JSONB NOT NULL DEFAULT '{}',
    "score" INTEGER,
    "max_score" INTEGER NOT NULL DEFAULT 0,
    "needs_marking" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussion_board" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "title" TEXT NOT NULL,
    "section_id" UUID,
    "subject_id" UUID,
    "description" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'all',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "owner_id" UUID,
    "owner_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "discussion_board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussion_post" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "board_id" UUID NOT NULL,
    "topic_id" UUID,
    "title" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "author_id" UUID,
    "author_name" TEXT NOT NULL,
    "author_is_staff" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "hidden_at" TIMESTAMP(3),
    "hidden_reason" TEXT,
    "hidden_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discussion_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_class_session" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_id" UUID,
    "title" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "length_min" INTEGER NOT NULL DEFAULT 40,
    "meeting_link" TEXT NOT NULL,
    "series_id" UUID,
    "status" "OnlineClassStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancel_note" TEXT,
    "recording_links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "materials" JSONB NOT NULL DEFAULT '[]',
    "reminder_user_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "reminded_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "online_class_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_class_attendance" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "joined" BOOLEAN NOT NULL DEFAULT false,
    "minutes" INTEGER,
    "marked_by_id" UUID,
    "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "online_class_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homework_school_id_academic_year_id_due_date_idx" ON "homework"("school_id", "academic_year_id", "due_date");

-- CreateIndex
CREATE INDEX "homework_school_id_section_id_subject_id_idx" ON "homework"("school_id", "section_id", "subject_id");

-- CreateIndex
CREATE INDEX "homework_school_id_teacher_id_idx" ON "homework"("school_id", "teacher_id");

-- CreateIndex
CREATE INDEX "homework_attachment_school_id_homework_id_idx" ON "homework_attachment"("school_id", "homework_id");

-- CreateIndex
CREATE INDEX "submission_school_id_student_id_idx" ON "submission"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "submission_school_id_homework_id_status_idx" ON "submission"("school_id", "homework_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "submission_homework_id_student_id_key" ON "submission"("homework_id", "student_id");

-- CreateIndex
CREATE INDEX "homework_comment_school_id_homework_id_student_id_idx" ON "homework_comment"("school_id", "homework_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "homework_setting_school_id_key" ON "homework_setting"("school_id");

-- CreateIndex
CREATE INDEX "course_school_id_section_id_idx" ON "course"("school_id", "section_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_academic_year_id_section_id_subject_id_key" ON "course"("academic_year_id", "section_id", "subject_id");

-- CreateIndex
CREATE INDEX "lesson_school_id_course_id_sort_order_idx" ON "lesson"("school_id", "course_id", "sort_order");

-- CreateIndex
CREATE INDEX "lesson_item_school_id_lesson_id_idx" ON "lesson_item"("school_id", "lesson_id");

-- CreateIndex
CREATE INDEX "lesson_view_school_id_student_id_idx" ON "lesson_view"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_view_lesson_id_student_id_key" ON "lesson_view"("lesson_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_certificate_course_id_student_id_key" ON "course_certificate"("course_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_certificate_school_id_number_key" ON "course_certificate"("school_id", "number");

-- CreateIndex
CREATE INDEX "quiz_school_id_section_id_status_idx" ON "quiz"("school_id", "section_id", "status");

-- CreateIndex
CREATE INDEX "quiz_school_id_teacher_id_idx" ON "quiz"("school_id", "teacher_id");

-- CreateIndex
CREATE INDEX "quiz_question_school_id_quiz_id_idx" ON "quiz_question"("school_id", "quiz_id");

-- CreateIndex
CREATE INDEX "quiz_attempt_school_id_student_id_idx" ON "quiz_attempt"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempt_quiz_id_student_id_attempt_no_key" ON "quiz_attempt"("quiz_id", "student_id", "attempt_no");

-- CreateIndex
CREATE INDEX "discussion_board_school_id_section_id_idx" ON "discussion_board"("school_id", "section_id");

-- CreateIndex
CREATE INDEX "discussion_post_school_id_board_id_topic_id_idx" ON "discussion_post"("school_id", "board_id", "topic_id");

-- CreateIndex
CREATE INDEX "online_class_session_school_id_starts_at_idx" ON "online_class_session"("school_id", "starts_at");

-- CreateIndex
CREATE INDEX "online_class_session_school_id_section_id_idx" ON "online_class_session"("school_id", "section_id");

-- CreateIndex
CREATE UNIQUE INDEX "online_class_attendance_session_id_student_id_key" ON "online_class_attendance"("session_id", "student_id");

-- AddForeignKey
ALTER TABLE "homework_attachment" ADD CONSTRAINT "homework_attachment_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "homework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission" ADD CONSTRAINT "submission_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "homework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_comment" ADD CONSTRAINT "homework_comment_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "homework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_item" ADD CONSTRAINT "lesson_item_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_view" ADD CONSTRAINT "lesson_view_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_certificate" ADD CONSTRAINT "course_certificate_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_question" ADD CONSTRAINT "quiz_question_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt" ADD CONSTRAINT "quiz_attempt_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_post" ADD CONSTRAINT "discussion_post_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "discussion_board"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_class_attendance" ADD CONSTRAINT "online_class_attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "online_class_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "homework" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "homework" FORCE ROW LEVEL SECURITY;
CREATE POLICY "homework_same_school" ON "homework" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "homework_attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "homework_attachment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "homework_attachment_same_school" ON "homework_attachment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "submission" FORCE ROW LEVEL SECURITY;
CREATE POLICY "submission_same_school" ON "submission" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "homework_comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "homework_comment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "homework_comment_same_school" ON "homework_comment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "homework_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "homework_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "homework_setting_same_school" ON "homework_setting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "course" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course" FORCE ROW LEVEL SECURITY;
CREATE POLICY "course_same_school" ON "course" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "lesson" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lesson" FORCE ROW LEVEL SECURITY;
CREATE POLICY "lesson_same_school" ON "lesson" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "lesson_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lesson_item" FORCE ROW LEVEL SECURITY;
CREATE POLICY "lesson_item_same_school" ON "lesson_item" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "lesson_view" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lesson_view" FORCE ROW LEVEL SECURITY;
CREATE POLICY "lesson_view_same_school" ON "lesson_view" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "course_certificate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course_certificate" FORCE ROW LEVEL SECURITY;
CREATE POLICY "course_certificate_same_school" ON "course_certificate" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "quiz" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quiz" FORCE ROW LEVEL SECURITY;
CREATE POLICY "quiz_same_school" ON "quiz" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "quiz_question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quiz_question" FORCE ROW LEVEL SECURITY;
CREATE POLICY "quiz_question_same_school" ON "quiz_question" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "quiz_attempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quiz_attempt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "quiz_attempt_same_school" ON "quiz_attempt" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "discussion_board" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discussion_board" FORCE ROW LEVEL SECURITY;
CREATE POLICY "discussion_board_same_school" ON "discussion_board" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "discussion_post" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discussion_post" FORCE ROW LEVEL SECURITY;
CREATE POLICY "discussion_post_same_school" ON "discussion_post" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "online_class_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "online_class_session" FORCE ROW LEVEL SECURITY;
CREATE POLICY "online_class_session_same_school" ON "online_class_session" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "online_class_attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "online_class_attendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "online_class_attendance_same_school" ON "online_class_attendance" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
