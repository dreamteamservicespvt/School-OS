-- Which children a message to a guardian is about (security review of the
-- Parent Link "Messages from the school" part, 16-11-2026, L1). A guardian's
-- message about two children at once is one row with no single student_id;
-- the Parent Link must hide it once the guardian may no longer see one of
-- those children (a custody or access restriction, a child who left), so the
-- row keeps every child's id.
--
-- One column with an empty default: every existing row keeps working (an
-- empty list means the row is about no child beyond its student_id). The
-- table already has school_id, row-level security, its policy and grants;
-- the new column is covered by them.

-- AlterTable
ALTER TABLE "message_recipient" ADD COLUMN "student_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
