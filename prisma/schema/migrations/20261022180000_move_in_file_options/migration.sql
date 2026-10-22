-- A file being brought in keeps the choices made with its upload on a
-- module's Import page: on Student Management, the class and section for rows
-- with no class, and whether each student gets their class fee plan (gap list
-- G16, one import engine). Existing files keep an empty set of choices, which
-- means what Switching to School OS always did: no section chosen, fee plans on.
-- AlterTable
ALTER TABLE "move_in_file" ADD COLUMN     "options" JSONB NOT NULL DEFAULT '{}';
