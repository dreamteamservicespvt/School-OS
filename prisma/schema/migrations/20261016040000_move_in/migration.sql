-- CreateTable
CREATE TABLE "move_in_file" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "sheets" JSONB NOT NULL DEFAULT '[]',
    "sheet_index" INTEGER NOT NULL DEFAULT 0,
    "header_row" INTEGER NOT NULL DEFAULT 1,
    "kind" TEXT NOT NULL,
    "column_match" JSONB NOT NULL DEFAULT '{}',
    "value_match" JSONB NOT NULL DEFAULT '{}',
    "row_fixes" JSONB NOT NULL DEFAULT '{}',
    "left_out" JSONB NOT NULL DEFAULT '[]',
    "tidy" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'open',
    "import_file_id" UUID,
    "batch_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "move_in_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "move_in_plan" (
    "school_id" UUID NOT NULL,
    "old_software" TEXT,
    "expected" JSONB NOT NULL DEFAULT '{}',
    "go_live_date" DATE,
    "went_live_at" TIMESTAMP(3),
    "went_live_by_id" UUID,
    "live_summary" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "move_in_plan_pkey" PRIMARY KEY ("school_id")
);

-- CreateIndex
CREATE INDEX "move_in_file_school_id_created_at_idx" ON "move_in_file"("school_id", "created_at");


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "move_in_file" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "move_in_file" FORCE ROW LEVEL SECURITY;
CREATE POLICY "move_in_file_same_school" ON "move_in_file" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "move_in_plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "move_in_plan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "move_in_plan_same_school" ON "move_in_plan" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
