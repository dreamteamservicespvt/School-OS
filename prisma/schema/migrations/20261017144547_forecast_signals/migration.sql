-- CreateTable
CREATE TABLE "forecast_signal" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "strength" TEXT NOT NULL DEFAULT 'WATCH',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "href" TEXT,
    "href_label" TEXT,
    "student_id" UUID,
    "value" DOUBLE PRECISION,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "forecast_signal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "forecast_signal_school_id_archived_at_idx" ON "forecast_signal"("school_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_signal_school_id_key_key" ON "forecast_signal"("school_id", "key");


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "forecast_signal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "forecast_signal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "forecast_signal_same_school" ON "forecast_signal" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
CREATE POLICY "forecast_signal_purge" ON "forecast_signal" FOR DELETE USING (current_user = 'school_os_owner' AND school_id::text = current_setting('app.school_purge', true));
