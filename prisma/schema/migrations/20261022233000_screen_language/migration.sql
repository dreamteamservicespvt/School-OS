-- Screens in the school's languages (gap list G39; 00-global.md §1.4 and P17).
-- Each person may choose their own screen language in My profile. Empty means the
-- school's default language, so every existing login keeps working as before.
ALTER TABLE "user_login" ADD COLUMN "language" TEXT;
