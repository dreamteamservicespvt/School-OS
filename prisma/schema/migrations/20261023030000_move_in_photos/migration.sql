-- Photos of paper registers (gap list G43): a Move-in File may be read from
-- photos or scans of register pages by the AI assistant. The photos stay as
-- Stored Files; this column lists them and which rows of the file each one
-- gave, so the review shows the photo beside the rows to check. A nullable
-- column only; every existing file keeps working (no photos).

-- AlterTable
ALTER TABLE "move_in_file" ADD COLUMN "photos" JSONB;
