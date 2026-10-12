-- AlterTable
ALTER TABLE "user_login" ADD COLUMN     "text_size" TEXT NOT NULL DEFAULT 'normal',
ALTER COLUMN "accent" SET DEFAULT 'lagoon';


-- Colours from the first design move to the nearest colour of the approved design.
UPDATE "user_login" SET "accent" = CASE "accent"
  WHEN 'blue' THEN 'royal' WHEN 'teal' THEN 'lagoon' WHEN 'violet' THEN 'plum'
  WHEN 'amber' THEN 'saffron' WHEN 'green' THEN 'lagoon' ELSE "accent" END
WHERE "accent" IN ('blue', 'teal', 'violet', 'amber', 'green');
