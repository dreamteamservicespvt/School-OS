-- AlterTable
ALTER TABLE "user_login" ADD COLUMN     "accent" TEXT NOT NULL DEFAULT 'blue',
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'system';


-- A session's school is the one the device works in now, not a school record.
ALTER TABLE "session" RENAME COLUMN "school_id" TO "active_school_id";
ALTER TABLE "session" RENAME COLUMN "campus_id" TO "active_campus_id";
