-- CreateTable
CREATE TABLE "report_pin" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'report',
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_pin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_use" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_use_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_run" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "filters" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL DEFAULT 'xlsx',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "rows" INTEGER,
    "file_id" UUID,
    "problem" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMP(3),

    CONSTRAINT "report_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "early_warning_setting" (
    "school_id" UUID NOT NULL,
    "marks_drop_percent" INTEGER NOT NULL DEFAULT 15,
    "fee_overdue_days" INTEGER NOT NULL DEFAULT 60,
    "watch_margin" INTEGER NOT NULL DEFAULT 5,
    "last_refresh_at" TIMESTAMP(3),
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "early_warning_setting_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "risk_flag" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID,
    "area" TEXT NOT NULL,
    "strength" TEXT NOT NULL DEFAULT 'WATCH',
    "reason" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "closed_at" TIMESTAMP(3),
    "closed_reason" TEXT,
    "action" TEXT,
    "task_id" UUID,
    "counselling_id" UUID,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flag_review" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "flag_id" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "action" TEXT,
    "reviewer_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flag_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_signal_decision" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "signal_key" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "flag_id" UUID,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_signal_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "government_export" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "return_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "academic_year_id" UUID,
    "campus_id" UUID,
    "rows" INTEGER NOT NULL,
    "problems" INTEGER NOT NULL DEFAULT 0,
    "anyway" BOOLEAN NOT NULL DEFAULT false,
    "file_id" UUID,
    "problem_file_id" UUID,
    "exported_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "government_export_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_report" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "columns" TEXT[],
    "filters" JSONB NOT NULL DEFAULT '{}',
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "custom_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_schedule" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "report_key" TEXT NOT NULL,
    "report_name" TEXT NOT NULL,
    "date_preset" TEXT NOT NULL DEFAULT 'lastweek',
    "frequency" TEXT NOT NULL DEFAULT 'WEEKLY',
    "day" INTEGER NOT NULL DEFAULT 1,
    "time_min" INTEGER NOT NULL DEFAULT 480,
    "format" TEXT NOT NULL DEFAULT 'pdf',
    "recipient_ids" UUID[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "next_at" TIMESTAMP(3) NOT NULL,
    "last_sent_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "report_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_schedule_send" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "slot" TEXT NOT NULL,
    "rows" INTEGER,
    "file_id" UUID,
    "message_id" UUID,
    "problem" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_schedule_send_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_pin_school_id_user_id_kind_key_key" ON "report_pin"("school_id", "user_id", "kind", "key");

-- CreateIndex
CREATE INDEX "report_use_school_id_user_id_used_at_idx" ON "report_use"("school_id", "user_id", "used_at");

-- CreateIndex
CREATE UNIQUE INDEX "report_use_school_id_user_id_key_key" ON "report_use"("school_id", "user_id", "key");

-- CreateIndex
CREATE INDEX "report_run_school_id_user_id_created_at_idx" ON "report_run"("school_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "risk_flag_school_id_status_idx" ON "risk_flag"("school_id", "status");

-- CreateIndex
CREATE INDEX "risk_flag_school_id_student_id_idx" ON "risk_flag"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "flag_review_school_id_flag_id_idx" ON "flag_review"("school_id", "flag_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_signal_decision_school_id_signal_key_key" ON "ai_signal_decision"("school_id", "signal_key");

-- CreateIndex
CREATE INDEX "government_export_school_id_created_at_idx" ON "government_export"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "custom_report_school_id_owner_id_idx" ON "custom_report"("school_id", "owner_id");

-- CreateIndex
CREATE INDEX "report_schedule_school_id_status_next_at_idx" ON "report_schedule"("school_id", "status", "next_at");

-- CreateIndex
CREATE INDEX "report_schedule_send_school_id_schedule_id_idx" ON "report_schedule_send"("school_id", "schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_schedule_send_schedule_id_user_id_slot_key" ON "report_schedule_send"("schedule_id", "user_id", "slot");

-- AddForeignKey
ALTER TABLE "flag_review" ADD CONSTRAINT "flag_review_flag_id_fkey" FOREIGN KEY ("flag_id") REFERENCES "risk_flag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedule_send" ADD CONSTRAINT "report_schedule_send_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "report_schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "report_pin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_pin" FORCE ROW LEVEL SECURITY;
CREATE POLICY "report_pin_same_school" ON "report_pin" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "report_use" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_use" FORCE ROW LEVEL SECURITY;
CREATE POLICY "report_use_same_school" ON "report_use" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "report_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_run" FORCE ROW LEVEL SECURITY;
CREATE POLICY "report_run_same_school" ON "report_run" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "early_warning_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "early_warning_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "early_warning_setting_same_school" ON "early_warning_setting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "risk_flag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "risk_flag" FORCE ROW LEVEL SECURITY;
CREATE POLICY "risk_flag_same_school" ON "risk_flag" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "flag_review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flag_review" FORCE ROW LEVEL SECURITY;
CREATE POLICY "flag_review_same_school" ON "flag_review" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "ai_signal_decision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_signal_decision" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ai_signal_decision_same_school" ON "ai_signal_decision" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "government_export" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "government_export" FORCE ROW LEVEL SECURITY;
CREATE POLICY "government_export_same_school" ON "government_export" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "custom_report" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_report" FORCE ROW LEVEL SECURITY;
CREATE POLICY "custom_report_same_school" ON "custom_report" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "report_schedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_schedule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "report_schedule_same_school" ON "report_schedule" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "report_schedule_send" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_schedule_send" FORCE ROW LEVEL SECURITY;
CREATE POLICY "report_schedule_send_same_school" ON "report_schedule_send" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());

-- One open flag per student and area: a refresh updates it instead of adding another.
CREATE UNIQUE INDEX "risk_flag_one_open" ON "risk_flag"("school_id", "student_id", "area") WHERE "closed_at" IS NULL;
