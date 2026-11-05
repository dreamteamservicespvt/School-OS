-- The console's card for each school keeps a WhatsApp summary (console, school
-- page and Dashboard "WhatsApp by school"): which number the school sends from
-- (DREAM TEAM's shared number or its own), whether it is on, messages sent
-- today and this month, failed, credits used and the last error in plain words.
-- Counts only, written by measureSchool(); never a parent's number or a message.
-- console_school is a console record (not a school's), so its existing
-- row-level security and grants cover the new column. Every existing card
-- starts empty and is filled at its next count.

-- AlterTable
ALTER TABLE "console_school" ADD COLUMN "whatsapp" JSONB NOT NULL DEFAULT '{}';
