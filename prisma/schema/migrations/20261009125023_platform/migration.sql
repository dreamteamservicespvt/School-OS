-- AlterTable
ALTER TABLE "campus" ADD COLUMN     "head_name" TEXT,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "school" ADD COLUMN     "brand_color" TEXT,
ADD COLUMN     "default_language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "email" TEXT,
ADD COLUMN     "logo_file_id" UUID,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "preferences" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "stored_file" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "stored_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequence" (
    "school_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "number_sequence_pkey" PRIMARY KEY ("school_id","key")
);

-- CreateTable
CREATE TABLE "approval_rule" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "request_type" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "escalate_after_days" INTEGER NOT NULL DEFAULT 2,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "approval_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_job" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "result" JSONB,
    "requested_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "background_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batch" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "added" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "created_ids" JSONB NOT NULL DEFAULT '[]',
    "error_report" JSONB NOT NULL DEFAULT '[]',
    "imported_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_at" TIMESTAMP(3),
    "undone_by_id" UUID,

    CONSTRAINT "import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_file_storage_key_key" ON "stored_file"("storage_key");

-- CreateIndex
CREATE INDEX "stored_file_school_id_purpose_idx" ON "stored_file"("school_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "approval_rule_school_id_request_type_key" ON "approval_rule"("school_id", "request_type");

-- CreateIndex
CREATE INDEX "background_job_status_run_after_idx" ON "background_job"("status", "run_after");

-- CreateIndex
CREATE UNIQUE INDEX "background_job_school_id_idempotency_key_key" ON "background_job"("school_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "import_batch_school_id_created_at_idx" ON "import_batch"("school_id", "created_at");


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "stored_file" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stored_file" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stored_file_same_school" ON "stored_file" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "number_sequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "number_sequence" FORCE ROW LEVEL SECURITY;
CREATE POLICY "number_sequence_same_school" ON "number_sequence" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "approval_rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_rule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "approval_rule_same_school" ON "approval_rule" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "background_job" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "background_job" FORCE ROW LEVEL SECURITY;
CREATE POLICY "background_job_same_school" ON "background_job" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "import_batch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_batch" FORCE ROW LEVEL SECURITY;
CREATE POLICY "import_batch_same_school" ON "import_batch" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());

-- The background worker serves every school. It may only claim queued jobs
-- (and list schools) through these two functions; the jobs themselves then
-- run inside withSchool() for their own school, behind the usual walls.
CREATE POLICY "background_job_claim" ON "background_job"
  USING (current_user = 'school_os_owner' AND current_setting('app.job_claim', true) = 'on');
CREATE POLICY "school_list_for_worker" ON "school" FOR SELECT
  USING (current_user = 'school_os_owner' AND current_setting('app.job_claim', true) = 'on');

CREATE FUNCTION claim_background_jobs(max_jobs int) RETURNS TABLE(job_id uuid, job_school_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.job_claim', 'on', true);
  RETURN QUERY
    UPDATE background_job b
       SET status = 'running', locked_at = now(), attempts = b.attempts + 1
     WHERE b.id IN (
       SELECT j.id FROM background_job j
        WHERE (j.status = 'queued' AND j.run_after <= now())
           OR (j.status = 'running' AND j.locked_at < now() - interval '15 minutes')
        ORDER BY j.run_after
        LIMIT max_jobs
        FOR UPDATE SKIP LOCKED)
    RETURNING b.id, b.school_id;
  PERFORM set_config('app.job_claim', 'off', true);
END $$;

CREATE FUNCTION active_school_ids() RETURNS TABLE(id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.job_claim', 'on', true);
  RETURN QUERY SELECT s.id FROM school s WHERE s.archived_at IS NULL AND s.status IN ('TRIAL', 'ACTIVE');
  PERFORM set_config('app.job_claim', 'off', true);
END $$;

REVOKE ALL ON FUNCTION claim_background_jobs(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION active_school_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_background_jobs(int) TO school_os_app;
GRANT EXECUTE ON FUNCTION active_school_ids() TO school_os_app;
