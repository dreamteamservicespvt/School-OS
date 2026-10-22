-- Salary to date (gap list G19): a school that starts on School OS part way
-- through the financial year brings in each staff member's gross, PF, ESI,
-- Professional Tax and TDS already paid this year, for the year's totals and
-- the TDS check. A new table only; nothing existing changes, so every school's
-- data keeps working. Never posted to the Day Book.

-- CreateTable
CREATE TABLE "salary_to_date" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "financial_year_id" UUID NOT NULL,
    "from_month" DATE NOT NULL,
    "up_to_month" DATE NOT NULL,
    "gross_paise" BIGINT NOT NULL,
    "pf_paise" BIGINT NOT NULL DEFAULT 0,
    "esi_paise" BIGINT NOT NULL DEFAULT 0,
    "pt_paise" BIGINT NOT NULL DEFAULT 0,
    "tds_paise" BIGINT NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "salary_to_date_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_to_date_school_id_staff_id_idx" ON "salary_to_date"("school_id", "staff_id");

-- CreateIndex
CREATE INDEX "salary_to_date_school_id_financial_year_id_idx" ON "salary_to_date"("school_id", "financial_year_id");

-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "salary_to_date" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "salary_to_date" FORCE ROW LEVEL SECURITY;
CREATE POLICY "salary_to_date_same_school" ON "salary_to_date" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
CREATE POLICY "salary_to_date_purge" ON "salary_to_date" FOR DELETE USING (current_user = 'school_os_owner' AND school_id::text = current_setting('app.school_purge', true));
