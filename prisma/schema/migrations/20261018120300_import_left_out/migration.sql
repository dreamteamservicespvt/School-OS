-- Imports count the rows they leave out on purpose (not problems), such as
-- "No old dues" for a row with no amount in a sheet listing every student.
-- Existing imports keep an empty list.
-- AlterTable
ALTER TABLE "import_batch" ADD COLUMN     "left_out" JSONB NOT NULL DEFAULT '[]';
