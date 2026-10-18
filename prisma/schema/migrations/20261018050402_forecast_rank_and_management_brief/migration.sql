-- AlterTable
ALTER TABLE "forecast_signal" ADD COLUMN     "certainty" TEXT,
ADD COLUMN     "score" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "management_brief" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_login_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "for_date" DATE NOT NULL,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "notification_id" UUID,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "management_brief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "management_brief_school_id_for_date_idx" ON "management_brief"("school_id", "for_date");

-- CreateIndex
CREATE UNIQUE INDEX "management_brief_school_id_user_login_id_kind_for_date_key" ON "management_brief"("school_id", "user_login_id", "kind", "for_date");


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "management_brief" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "management_brief" FORCE ROW LEVEL SECURITY;
CREATE POLICY "management_brief_same_school" ON "management_brief" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
CREATE POLICY "management_brief_purge" ON "management_brief" FOR DELETE USING (current_user = 'school_os_owner' AND school_id::text = current_setting('app.school_purge', true));
