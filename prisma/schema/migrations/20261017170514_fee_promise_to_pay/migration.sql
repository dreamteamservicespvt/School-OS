-- Promise to Pay (06 §2 Defaulters): a call note with a promised date can carry
-- an amount, and is tracked as Open, Kept, Broken or Replaced. All new columns
-- are empty for existing notes, so earlier call notes read as before.

-- CreateEnum
CREATE TYPE "FeePromiseState" AS ENUM ('OPEN', 'KEPT', 'BROKEN', 'REPLACED');

-- AlterTable
ALTER TABLE "fee_call_note" ADD COLUMN     "owed_paise" BIGINT,
ADD COLUMN     "promise_paid_paise" BIGINT,
ADD COLUMN     "promise_settled_at" TIMESTAMP(3),
ADD COLUMN     "promise_state" "FeePromiseState",
ADD COLUMN     "promised_paise" BIGINT;

-- CreateIndex
CREATE INDEX "fee_call_note_school_id_promise_state_promised_on_idx" ON "fee_call_note"("school_id", "promise_state", "promised_on");

