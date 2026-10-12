-- Enquiry numbers (ENQ-0001), given once and never reused.

-- AlterTable
ALTER TABLE "enquiry" ADD COLUMN     "enquiry_no" TEXT;

-- Enquiries already there get numbers in the order they were added, per school.
UPDATE "enquiry" e
SET "enquiry_no" = 'ENQ-' || lpad(n.rn::text, 4, '0')
FROM (SELECT id, row_number() OVER (PARTITION BY school_id ORDER BY created_at, id) AS rn FROM "enquiry") n
WHERE e.id = n.id;

-- The next number follows on from them.
INSERT INTO "number_sequence" ("school_id", "key", "next_value", "updated_at")
SELECT school_id, 'enquiry', count(*) + 1, now() FROM "enquiry" GROUP BY school_id
ON CONFLICT ("school_id", "key") DO UPDATE SET "next_value" = GREATEST("number_sequence"."next_value", EXCLUDED."next_value"), "updated_at" = now();

-- CreateIndex
CREATE UNIQUE INDEX "enquiry_school_id_enquiry_no_key" ON "enquiry"("school_id", "enquiry_no");
