-- Moving in (workflow 15, gap list G12, G13 and G17).
--
-- 1. Undo, fix the file, import again: a typed admission number, accession
--    number, item code, asset tag or room number of a record whose import was
--    undone is freed. Only an import undo sets released_at; the record stays
--    archived (or withdrawn) for the record. Every live record keeps its number
--    unique, now through a partial unique index; existing rows all have
--    released_at NULL, so nothing changes for them.
-- 2. A Move-in File keeps the choice made for each row that may already be on
--    record (same student, same family, a new student).
-- 3. The duplicate check by date of birth uses an index.

-- AlterTable
ALTER TABLE "student" ADD COLUMN "released_at" TIMESTAMP(3);
ALTER TABLE "book_copy" ADD COLUMN "released_at" TIMESTAMP(3);
ALTER TABLE "item" ADD COLUMN "released_at" TIMESTAMP(3);
ALTER TABLE "asset" ADD COLUMN "released_at" TIMESTAMP(3);
ALTER TABLE "hostel_room" ADD COLUMN "released_at" TIMESTAMP(3);
ALTER TABLE "move_in_file" ADD COLUMN "row_choices" JSONB NOT NULL DEFAULT '{}';

-- Unique among records not released by an import undo (replaces the full unique indexes).
CREATE UNIQUE INDEX "student_admission_no_live" ON "student"("school_id", "admission_no") WHERE "released_at" IS NULL;
DROP INDEX "student_school_id_admission_no_key";

CREATE UNIQUE INDEX "book_copy_accession_no_live" ON "book_copy"("school_id", "accession_no") WHERE "released_at" IS NULL;
DROP INDEX "book_copy_school_id_accession_no_key";
CREATE UNIQUE INDEX "book_copy_barcode_live" ON "book_copy"("school_id", "barcode") WHERE "released_at" IS NULL;
DROP INDEX "book_copy_school_id_barcode_key";

CREATE UNIQUE INDEX "item_code_live" ON "item"("school_id", "code") WHERE "released_at" IS NULL;
DROP INDEX "item_school_id_code_key";

CREATE UNIQUE INDEX "asset_tag_live" ON "asset"("school_id", "tag") WHERE "released_at" IS NULL;
DROP INDEX "asset_school_id_tag_key";

CREATE UNIQUE INDEX "hostel_room_number_live" ON "hostel_room"("hostel_id", "room_no") WHERE "released_at" IS NULL;
DROP INDEX "hostel_room_hostel_id_room_no_key";

-- The duplicate check finds students with the same date of birth.
CREATE INDEX "student_school_id_date_of_birth_idx" ON "student"("school_id", "date_of_birth");
