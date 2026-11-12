-- Layman test LD11 (12-11-2026): a Transport Supervisor was rated on
-- "Classroom teaching" and "Student results". An appraisal cycle now has a
-- second list of points for non-teaching staff, and each appraisal keeps the
-- points it is rated on, fixed when the cycle starts.
--
-- Existing data keeps working: an empty list means "the cycle's points", which
-- is exactly how every appraisal was rated before. Only appraisals that nobody
-- has rated yet, of non-teaching staff, in an open cycle that uses the shipped
-- teacher points, get the non-teaching points; anything already rated is left
-- exactly as it is.

-- AlterTable
ALTER TABLE "appraisal_cycle" ADD COLUMN "staff_criteria" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "appraisal" ADD COLUMN "criteria" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "appraisal_cycle"
SET "staff_criteria" = ARRAY['Knowledge of the job', 'Quality of work', 'Punctuality', 'Teamwork', 'Care for students and visitors']
WHERE "status" = 'OPEN' AND "criteria" && ARRAY['Classroom teaching', 'Student results', 'Subject knowledge'];

UPDATE "appraisal" a
SET "criteria" = c."staff_criteria"
FROM "appraisal_cycle" c, "staff" s
WHERE a."cycle_id" = c."id" AND s."id" = a."staff_id"
  AND c."status" = 'OPEN' AND cardinality(c."staff_criteria") > 0
  AND s."staff_type" <> 'Teaching'
  AND a."self_ratings" = '{}'::jsonb AND a."manager_ratings" = '{}'::jsonb;
