-- A staff login can start with a temporary password that HR types and hands
-- over in person (09 Add Staff step 2, 20 §2 "Invite or temporary password").
-- Only its hash is kept, like every password (08 §2). The person must choose
-- their own password at their first sign-in. Existing logins are unchanged
-- (false): their passwords are already their own.
-- AlterTable
ALTER TABLE "user_login" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;
