-- File backups (08-platform-security.md §4 "Files backed up every night"; gap
-- list G46, part 2). Existing files keep working: both columns start empty and
-- the next backup run copies every file and fills them in.

-- AlterTable
ALTER TABLE "stored_file" ADD COLUMN "sha256" TEXT;
ALTER TABLE "stored_file" ADD COLUMN "backed_up_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "stored_file_school_id_backed_up_at_idx" ON "stored_file"("school_id", "backed_up_at");
