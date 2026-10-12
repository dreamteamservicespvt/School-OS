-- My profile: two-step login a person switches on for themselves, and codes that confirm a new mobile number or email.
ALTER TABLE "user_login" ADD COLUMN "two_step_chosen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "two_step_challenge" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'sign-in',
ADD COLUMN "new_value" TEXT;
