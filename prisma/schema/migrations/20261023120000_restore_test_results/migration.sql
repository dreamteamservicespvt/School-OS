-- Restore tests (08-platform-security.md §4 "A restore is tested every month
-- on a copy, and the result is recorded"; §16 Done when 3; gap list G46,
-- part 3). Earlier rows keep working: an empty result on a row with a restore
-- time means it passed, as before.

-- AlterTable
ALTER TABLE "backup_run" ADD COLUMN "result" TEXT;
ALTER TABLE "backup_run" ADD COLUMN "details" JSONB;
