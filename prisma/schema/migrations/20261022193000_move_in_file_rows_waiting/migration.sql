-- A file brought in keeps the rows that were not ready (rows with problems and
-- rows left out by the person): they stay with the file, counted, to fix and
-- bring in as a further import of the same file, each import with its own
-- Undo (QA IMPORT-01). Existing files keep working: a file already imported
-- keeps its one import in batch_ids; a file still being checked has none.
-- AlterTable
ALTER TABLE "move_in_file" ADD COLUMN     "batch_ids" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "brought_in" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "waiting" INTEGER NOT NULL DEFAULT 0;

-- Existing imports of a file.
UPDATE "move_in_file" SET "batch_ids" = ARRAY["batch_id"] WHERE "batch_id" IS NOT NULL;
