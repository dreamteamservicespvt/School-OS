-- AlterTable
ALTER TABLE "ptm_slot" ADD COLUMN     "booked_via" TEXT;

-- CreateTable
CREATE TABLE "day_close" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "financial_year_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "expected_cash_paise" BIGINT NOT NULL,
    "counted_cash_paise" BIGINT NOT NULL,
    "difference_reason" TEXT,
    "income_paise" BIGINT NOT NULL,
    "expense_paise" BIGINT NOT NULL,
    "entry_count" INTEGER NOT NULL,
    "closed_by_id" UUID,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reopened_at" TIMESTAMP(3),
    "reopened_by_id" UUID,
    "reopen_reason" TEXT,

    CONSTRAINT "day_close_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "day_close_school_id_date_idx" ON "day_close"("school_id", "date");


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "day_close" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "day_close" FORCE ROW LEVEL SECURITY;
CREATE POLICY "day_close_same_school" ON "day_close" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());

-- At most one close in force per school and date (a reopened close keeps its row).
CREATE UNIQUE INDEX "day_close_one_in_force" ON "day_close"("school_id", "date") WHERE "reopened_at" IS NULL;

