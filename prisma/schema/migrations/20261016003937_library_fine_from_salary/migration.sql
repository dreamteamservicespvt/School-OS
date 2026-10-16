-- AlterTable
ALTER TABLE "library_fine" ADD COLUMN     "adjustment_id" UUID,
ADD COLUMN     "run_id" UUID,
ADD COLUMN     "salary_at" TIMESTAMP(3),
ADD COLUMN     "salary_by_id" UUID;

