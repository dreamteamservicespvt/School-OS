-- Paper consent at the counter (decision 23, 16-11-2026): WhatsApp never
-- delivers one-time codes to Indian (+91) numbers and SMS is off, so the
-- counter could not record consent at all. The office can now record a
-- consent form the parent signed on paper: how_given "admission-paper-form",
-- the staff login who recorded it, and the photo or scan of the form.
--
-- Two nullable columns: every existing consent keeps them empty and stays
-- exactly as it was (confirmed by a one-time code). The table already has
-- school_id, row-level security, its policy and grants; new columns are
-- covered by them.

-- AlterTable
ALTER TABLE "admission_consent" ADD COLUMN "recorded_by_id" UUID,
ADD COLUMN "paper_file_id" UUID;
