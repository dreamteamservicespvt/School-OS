-- Owner decisions 15 and 17 (15-11-2026).
--
-- 15: a parent (Guardian) may have no phone. The column only stops being
-- required: every existing guardian keeps its phone exactly as it is. A parent
-- without one shows "Phone missing", gets no Parent Link and no messages until
-- a phone is added. Searches and family matches never match on an empty phone.
--
-- 17: School Profile keeps a "WhatsApp number for parents", shown on the
-- Parent Link footer. It starts empty for every school, which means "use the
-- office phone when it is a mobile", exactly as the footer worked before.
-- Both tables already have row-level security and grants; new columns are
-- covered by them.

-- AlterTable
ALTER TABLE "guardian" ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "school" ADD COLUMN "parent_whatsapp" TEXT;
