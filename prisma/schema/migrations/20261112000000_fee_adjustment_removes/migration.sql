-- Owner decision 2026-11-12: removing a fee row by Adjust on the student
-- ledger follows the same rule as reducing it. When the unpaid amount that
-- would disappear is above the school's concession limit, the removal waits in
-- Approvals as a Fee Adjustment and the row comes off only once approved. One
-- new column marks such an adjustment as a removal. Every adjustment already
-- made is a change of amount, so it is false.

-- AlterTable
ALTER TABLE "fee_adjustment" ADD COLUMN "removes" BOOLEAN NOT NULL DEFAULT false;
