-- PF, ESI, Professional Tax and TDS to pay to the government (gap list G34, 10 §6
-- "Statutory deductions", 07 §2 Accounts "Payables"): what salary took for the
-- government stays money to pay until a Statutory Payment records it paid.
--
-- Existing schools keep working exactly as before: the new Salary Settings date
-- is empty for them, so nothing is tracked until the school switches it on from
-- a month it chooses (earlier months were often paid as expenses already). New
-- schools get the date when Salary Settings are first made.

-- AlterTable
ALTER TABLE "salary_setting" ADD COLUMN "statutory_dues_from" DATE;

-- CreateTable
CREATE TABLE "statutory_payment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "paid_on" DATE NOT NULL,
    "mode" TEXT NOT NULL,
    "reference" TEXT,
    "account_id" UUID,
    "financial_year_id" UUID NOT NULL,
    "paid_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "cancelled_by_id" UUID,

    CONSTRAINT "statutory_payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "statutory_payment_kind_check" CHECK ("kind" IN ('PF', 'ESI', 'PT', 'TDS')),
    CONSTRAINT "statutory_payment_amount_check" CHECK ("amount_paise" > 0)
);

-- CreateIndex
CREATE INDEX "statutory_payment_school_id_run_id_idx" ON "statutory_payment"("school_id", "run_id");


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "statutory_payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "statutory_payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "statutory_payment_same_school" ON "statutory_payment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
CREATE POLICY "statutory_payment_purge" ON "statutory_payment" FOR DELETE USING (current_user = 'school_os_owner' AND school_id::text = current_setting('app.school_purge', true));
