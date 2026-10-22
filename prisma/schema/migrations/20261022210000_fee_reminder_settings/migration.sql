-- Fee reminders follow Fee Settings (gap list G11): a smallest amount worth a
-- reminder, and no reminders on days the school is closed. Both start off, so
-- every school's reminders go exactly as before until the school changes them.
ALTER TABLE "fee_setting" ADD COLUMN "reminder_min_paise" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "fee_setting" ADD COLUMN "reminder_quiet_days" BOOLEAN NOT NULL DEFAULT false;
