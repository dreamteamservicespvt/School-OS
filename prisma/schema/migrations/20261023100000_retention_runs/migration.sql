-- Retention schedule (08-platform-security.md §12; gap list G46, part 1).
-- Existing rows keep working: every new column is empty (null) until the
-- retention check clears a record, and nothing is ever deleted from a school table.

-- AlterTable
ALTER TABLE "visitor_entry" ADD COLUMN "cleared_at" TIMESTAMP(3);
ALTER TABLE "gate_entry" ADD COLUMN "cleared_at" TIMESTAMP(3);
ALTER TABLE "enquiry" ADD COLUMN "cleared_at" TIMESTAMP(3);
ALTER TABLE "message" ADD COLUMN "cleared_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "retention_run" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "run_on" DATE NOT NULL,
    "due" JSONB NOT NULL DEFAULT '{}',
    "auto_cleared" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'nothing-due',
    "cleared" JSONB NOT NULL DEFAULT '{}',
    "cleared_at" TIMESTAMP(3),
    "cleared_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retention_run_school_id_run_on_key" ON "retention_run"("school_id", "run_on");
CREATE INDEX "retention_run_school_id_created_at_idx" ON "retention_run"("school_id", "created_at");

-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "retention_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "retention_run" FORCE ROW LEVEL SECURITY;
CREATE POLICY "retention_run_same_school" ON "retention_run" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
CREATE POLICY "retention_run_purge" ON "retention_run" FOR DELETE USING (current_user = 'school_os_owner' AND school_id::text = current_setting('app.school_purge', true));

-- Two-step sign-in codes belong to a login, not a school. Old ones (30 days)
-- are cleared by this function only; the app has no DELETE right.
CREATE OR REPLACE FUNCTION prune_two_step_challenges() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  DELETE FROM two_step_challenge WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION prune_two_step_challenges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prune_two_step_challenges() TO school_os_app;
