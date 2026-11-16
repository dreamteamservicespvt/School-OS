-- Pickup "tap to approve" (decision 21, 16-11-2026): WhatsApp never delivers
-- one-time codes to Indian (+91) numbers, so with "Pickup code check" on no
-- code could go. The front desk now asks the guardian on WhatsApp: the
-- guardian's own Parent Link comes with a one-time secret in its button, and
-- the guardian taps Approve or "No, call the school". The request is a Parent
-- Link Code with purpose "pickup"; these columns keep the answer, when it was
-- given, and when the desk used the approval to release the child (used once).
--
-- Three nullable columns: every existing code keeps them empty and works
-- exactly as before. The table already has school_id, row-level security, its
-- policy and grants; new columns are covered by them.

-- AlterTable
ALTER TABLE "parent_link_code" ADD COLUMN "answer" TEXT,
ADD COLUMN "answered_at" TIMESTAMP(3),
ADD COLUMN "released_at" TIMESTAMP(3);
