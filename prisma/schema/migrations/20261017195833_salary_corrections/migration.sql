-- Salary corrections (gap G22). Leave days beyond the balance now reach
-- salary as loss of pay, a day with approved leave counts once (as leave),
-- and a change to leave or attendance after a month's salary was approved is
-- put right in the next month's salary as an arrears or deduction adjustment,
-- with its reason, the month it belongs to, and PF and ESI worked out by that
-- month's rules.
--
-- Only columns are added, each empty or with a default, so every school's
-- salary months keep working as they are. Lines worked out before this change
-- have no half_days or leave_lop_days; they are never corrected automatically
-- (a correction for them stays a manual adjustment, as before).

-- AlterTable
ALTER TABLE "payroll_adjustment" ADD COLUMN     "er_esi_paise" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "er_pf_paise" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "esi_paise" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "esi_wage_paise" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "for_month" DATE,
ADD COLUMN     "from_run_id" UUID,
ADD COLUMN     "lop_days" DECIMAL(5,1),
ADD COLUMN     "pf_paise" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "pf_wage_paise" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payroll_line" ADD COLUMN     "half_days" INTEGER,
ADD COLUMN     "leave_lop_days" DECIMAL(5,1);

-- AlterTable
ALTER TABLE "payroll_run" ADD COLUMN     "calculated_up_to" DATE;

-- CreateIndex
CREATE INDEX "payroll_adjustment_school_id_staff_id_for_month_idx" ON "payroll_adjustment"("school_id", "staff_id", "for_month");

