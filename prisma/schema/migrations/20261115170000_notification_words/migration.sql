-- Owner decision 14 (15-11-2026): bell notifications in each reader's language.
--
-- A notification keeps its English text exactly as before, and now also the
-- catalogue words it was made from ({blanks} filled from text_values), so the
-- bell and the Notifications page say it in the reader's own language. Both
-- columns are empty on every existing notification, which keeps showing its
-- stored English text. The table already has row-level security and grants;
-- new columns are covered by them.

-- AlterTable
ALTER TABLE "notification" ADD COLUMN "text_key" TEXT,
ADD COLUMN "text_values" JSONB;
