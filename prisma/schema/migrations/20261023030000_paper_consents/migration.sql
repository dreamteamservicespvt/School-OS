-- Paper consent forms (gap list G42): consents parents signed on paper before
-- the school came to School OS are recorded from a file or class by class,
-- marked "paper-form" with who recorded them. A "no" on a paper form is kept
-- as a refusal. Undo of such an import archives the records it made.
-- Columns only, each with a default or empty: every existing Consent Record
-- keeps working as it was (not refused, not archived).

ALTER TABLE "consent_record" ADD COLUMN "refused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "consent_record" ADD COLUMN "created_at" TIMESTAMP(3);
ALTER TABLE "consent_record" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "consent_record" ADD COLUMN "archived_at" TIMESTAMP(3);
