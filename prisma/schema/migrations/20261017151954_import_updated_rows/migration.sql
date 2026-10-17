-- AlterTable
ALTER TABLE "import_batch" ADD COLUMN     "updated_rows" JSONB NOT NULL DEFAULT '[]';

