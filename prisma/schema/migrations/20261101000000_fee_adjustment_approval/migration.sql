-- A fee row reduced by Adjust on the student ledger by more than the school's
-- concession limit waits for approval, like a concession of the same amount
-- (security audit run-2, lead L1). Three new columns on the adjustment: its
-- status (waiting, applied or not approved), the request in Approvals, and who
-- approved it. Every adjustment already made was applied at once, so it is
-- APPLIED with no request and no approver recorded.

-- AlterTable
ALTER TABLE "fee_adjustment" ADD COLUMN "status" "ConcessionStatus" NOT NULL DEFAULT 'APPLIED',
ADD COLUMN "approval_id" UUID,
ADD COLUMN "decided_by_id" UUID;
