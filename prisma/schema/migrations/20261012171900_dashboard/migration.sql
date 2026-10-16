-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "task" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "assigned_to_id" UUID NOT NULL,
    "given_by_id" UUID NOT NULL,
    "due_at" TIMESTAMP(3),
    "remind" BOOLEAN NOT NULL DEFAULT true,
    "reminders_sent" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "status_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_seen" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_login_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "dashboard_seen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setup_step_status" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "step_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "marked_by_id" UUID,
    "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "setup_step_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_school_id_assigned_to_id_status_idx" ON "task"("school_id", "assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "task_school_id_given_by_id_idx" ON "task"("school_id", "given_by_id");

-- CreateIndex
CREATE INDEX "task_school_id_due_at_idx" ON "task"("school_id", "due_at");

-- CreateIndex
CREATE INDEX "task_comment_school_id_task_id_idx" ON "task_comment"("school_id", "task_id");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_seen_school_id_user_login_id_item_key_key" ON "dashboard_seen"("school_id", "user_login_id", "item_key");

-- CreateIndex
CREATE UNIQUE INDEX "setup_step_status_school_id_step_key_key" ON "setup_step_status"("school_id", "step_key");

-- AddForeignKey
ALTER TABLE "task_comment" ADD CONSTRAINT "task_comment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task" FORCE ROW LEVEL SECURITY;
CREATE POLICY "task_same_school" ON "task" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "task_comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_comment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "task_comment_same_school" ON "task_comment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "dashboard_seen" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dashboard_seen" FORCE ROW LEVEL SECURITY;
CREATE POLICY "dashboard_seen_same_school" ON "dashboard_seen" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "setup_step_status" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "setup_step_status" FORCE ROW LEVEL SECURITY;
CREATE POLICY "setup_step_status_same_school" ON "setup_step_status" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
