-- AlterTable
ALTER TABLE "approval" ADD COLUMN     "about_user_ids" UUID[] DEFAULT ARRAY[]::UUID[];

