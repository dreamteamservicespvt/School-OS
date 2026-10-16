-- AlterTable
ALTER TABLE "user_login" ADD COLUMN     "text_size" TEXT NOT NULL DEFAULT 'normal',
ALTER COLUMN "accent" SET DEFAULT 'lagoon';


-- The first design's default (blue) becomes the approved default (lagoon); other choices move to the nearest colour.
UPDATE "user_login" SET "accent" = CASE "accent"
  WHEN 'blue' THEN 'lagoon' WHEN 'teal' THEN 'lagoon' WHEN 'violet' THEN 'plum'
  WHEN 'amber' THEN 'saffron' WHEN 'green' THEN 'lagoon' ELSE "accent" END
WHERE "accent" IN ('blue', 'teal', 'violet', 'amber', 'green');
