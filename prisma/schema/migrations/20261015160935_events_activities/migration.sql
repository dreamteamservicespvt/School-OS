-- AlterTable
ALTER TABLE "event" ADD COLUMN     "consent_by" DATE,
ADD COLUMN     "consent_on" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "events_setting" ADD COLUMN     "activity_kinds" TEXT[] DEFAULT ARRAY['Music', 'Dance', 'Debate', 'Art', 'Public speaking', 'Olympiad', 'Competition', 'Project', 'Volunteering', 'Sport']::TEXT[],
ADD COLUMN     "clubs_on" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "credits_on" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "credits_take_part" INTEGER[] DEFAULT ARRAY[5, 10, 15, 20]::INTEGER[],
ADD COLUMN     "credits_win" INTEGER[] DEFAULT ARRAY[10, 20, 40, 60]::INTEGER[],
ADD COLUMN     "daily_on" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "daily_types" TEXT[] DEFAULT ARRAY['Meal', 'Nap', 'Play', 'Water', 'Learning activity']::TEXT[],
ADD COLUMN     "houses_on" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "levels" TEXT[] DEFAULT ARRAY['School', 'District', 'State', 'National']::TEXT[],
ADD COLUMN     "sports_on" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ptm" ADD COLUMN     "break_end_min" INTEGER,
ADD COLUMN     "break_start_min" INTEGER;

-- CreateTable
CREATE TABLE "event_consent" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID,
    "answer" TEXT NOT NULL,
    "how" TEXT NOT NULL,
    "parent_link_id" UUID,
    "recorded_by_id" UUID,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "activity" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'School',
    "position" TEXT,
    "won" BOOLEAN NOT NULL DEFAULT false,
    "date" DATE NOT NULL,
    "event_id" UUID,
    "team_id" UUID,
    "certificate_no" TEXT,
    "certificate_at" TIMESTAMP(3),
    "certificate_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),
    "archive_reason" TEXT,

    CONSTRAINT "achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_credit_entry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "achievement_id" UUID,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "given_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_credit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT 'info',
    "captain_student_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "house_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_member" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "house_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_points_entry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "given_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "house_points_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "in_charge_id" UUID,
    "meets" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_member" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "added_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "club_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_meeting" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "topic" TEXT,
    "member_ids" UUID[],
    "present_ids" UUID[],
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_team" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "coach_id" UUID,
    "coach_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "sports_team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_member" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "added_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "team_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_session" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_min" INTEGER,
    "venue" TEXT,
    "member_ids" UUID[],
    "present_ids" UUID[],
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixture" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "team_id" UUID,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_min" INTEGER,
    "venue" TEXT,
    "ground" TEXT NOT NULL DEFAULT 'HOME',
    "result" TEXT,
    "score" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "fixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitness_record" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "height_cm" DOUBLE PRECISION,
    "weight_kg" DOUBLE PRECISION,
    "run_seconds" INTEGER,
    "reach_cm" DOUBLE PRECISION,
    "note" TEXT,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fitness_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_activity" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "start_min" INTEGER NOT NULL,
    "options" TEXT[],
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "daily_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_activity_log" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "note" TEXT,
    "logged_by_id" UUID,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_send" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "people" INTEGER NOT NULL,
    "logged" INTEGER NOT NULL,
    "message_id" UUID,
    "sent_by_id" UUID,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diary_send_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_consent_school_id_event_id_idx" ON "event_consent"("school_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_consent_event_id_student_id_key" ON "event_consent"("event_id", "student_id");

-- CreateIndex
CREATE INDEX "achievement_school_id_student_id_idx" ON "achievement"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "achievement_school_id_date_idx" ON "achievement"("school_id", "date");

-- CreateIndex
CREATE INDEX "activity_credit_entry_school_id_student_id_idx" ON "activity_credit_entry"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "activity_credit_entry_school_id_academic_year_id_idx" ON "activity_credit_entry"("school_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "house_school_id_idx" ON "house"("school_id");

-- CreateIndex
CREATE INDEX "house_member_school_id_academic_year_id_student_id_idx" ON "house_member"("school_id", "academic_year_id", "student_id");

-- CreateIndex
CREATE INDEX "house_member_school_id_house_id_idx" ON "house_member"("school_id", "house_id");

-- CreateIndex
CREATE INDEX "house_points_entry_school_id_academic_year_id_idx" ON "house_points_entry"("school_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "club_school_id_idx" ON "club"("school_id");

-- CreateIndex
CREATE INDEX "club_member_school_id_club_id_idx" ON "club_member"("school_id", "club_id");

-- CreateIndex
CREATE INDEX "club_member_school_id_student_id_idx" ON "club_member"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "club_meeting_school_id_club_id_date_idx" ON "club_meeting"("school_id", "club_id", "date");

-- CreateIndex
CREATE INDEX "sports_team_school_id_idx" ON "sports_team"("school_id");

-- CreateIndex
CREATE INDEX "team_member_school_id_team_id_idx" ON "team_member"("school_id", "team_id");

-- CreateIndex
CREATE INDEX "team_member_school_id_student_id_idx" ON "team_member"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "training_session_school_id_team_id_date_idx" ON "training_session"("school_id", "team_id", "date");

-- CreateIndex
CREATE INDEX "fixture_school_id_date_idx" ON "fixture"("school_id", "date");

-- CreateIndex
CREATE INDEX "fitness_record_school_id_student_id_idx" ON "fitness_record"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "fitness_record_school_id_date_idx" ON "fitness_record"("school_id", "date");

-- CreateIndex
CREATE INDEX "daily_activity_school_id_section_id_date_idx" ON "daily_activity"("school_id", "section_id", "date");

-- CreateIndex
CREATE INDEX "daily_activity_log_school_id_student_id_idx" ON "daily_activity_log"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_activity_log_activity_id_student_id_key" ON "daily_activity_log"("activity_id", "student_id");

-- CreateIndex
CREATE INDEX "diary_send_school_id_section_id_date_idx" ON "diary_send"("school_id", "section_id", "date");

-- AddForeignKey
ALTER TABLE "daily_activity_log" ADD CONSTRAINT "daily_activity_log_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "daily_activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "event_consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_consent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "event_consent_same_school" ON "event_consent" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "achievement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "achievement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "achievement_same_school" ON "achievement" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "activity_credit_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_credit_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "activity_credit_entry_same_school" ON "activity_credit_entry" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "house" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "house" FORCE ROW LEVEL SECURITY;
CREATE POLICY "house_same_school" ON "house" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "house_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "house_member" FORCE ROW LEVEL SECURITY;
CREATE POLICY "house_member_same_school" ON "house_member" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "house_points_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "house_points_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "house_points_entry_same_school" ON "house_points_entry" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "club" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "club" FORCE ROW LEVEL SECURITY;
CREATE POLICY "club_same_school" ON "club" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "club_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "club_member" FORCE ROW LEVEL SECURITY;
CREATE POLICY "club_member_same_school" ON "club_member" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "club_meeting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "club_meeting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "club_meeting_same_school" ON "club_meeting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "sports_team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sports_team" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sports_team_same_school" ON "sports_team" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "team_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "team_member" FORCE ROW LEVEL SECURITY;
CREATE POLICY "team_member_same_school" ON "team_member" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "training_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_session" FORCE ROW LEVEL SECURITY;
CREATE POLICY "training_session_same_school" ON "training_session" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "fixture" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fixture" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fixture_same_school" ON "fixture" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "fitness_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fitness_record" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fitness_record_same_school" ON "fitness_record" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "daily_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_activity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "daily_activity_same_school" ON "daily_activity" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "daily_activity_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_activity_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY "daily_activity_log_same_school" ON "daily_activity_log" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "diary_send" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "diary_send" FORCE ROW LEVEL SECURITY;
CREATE POLICY "diary_send_same_school" ON "diary_send" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
