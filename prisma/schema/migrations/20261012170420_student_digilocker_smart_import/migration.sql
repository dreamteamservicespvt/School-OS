-- AlterTable
ALTER TABLE "student_settings" ADD COLUMN     "digilocker_on" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smart_import_on" BOOLEAN NOT NULL DEFAULT false;

