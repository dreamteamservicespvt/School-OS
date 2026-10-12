-- The default look is now light with Royal blue. People still on the old defaults
-- (Auto, Lagoon) move to the new ones; anyone who picked something else keeps it.
ALTER TABLE "user_login" ALTER COLUMN "theme" SET DEFAULT 'light',
ALTER COLUMN "accent" SET DEFAULT 'royal';
UPDATE "user_login" SET "theme" = 'light' WHERE "theme" = 'system';
UPDATE "user_login" SET "accent" = 'royal' WHERE "accent" = 'lagoon';
