-- DropForeignKey
ALTER TABLE "gateway_linked_account" DROP CONSTRAINT "gateway_linked_account_gateway_fkey";

-- DropForeignKey
ALTER TABLE "trusted_device" DROP CONSTRAINT "trusted_device_user_login_fkey";

-- DropForeignKey
ALTER TABLE "two_step_challenge" DROP CONSTRAINT "two_step_challenge_user_login_fkey";

-- CreateTable
CREATE TABLE "backup_run" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'nightly',
    "finished_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT,
    "restore_tested_at" TIMESTAMP(3),

    CONSTRAINT "backup_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backup_run_finished_at_idx" ON "backup_run"("finished_at");

