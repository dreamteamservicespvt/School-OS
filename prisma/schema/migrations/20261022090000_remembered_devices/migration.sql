-- Remembered devices (decided by the owner, 22 October 2026). After a person types the
-- right two-step code, the device is remembered without a tick, and skips the code until
-- they sign out there, sign out everywhere, or leave it unused for 180 days.
--
-- A remembered device now keeps the browser's device id (hashed, the same as on
-- "session"), so signing that device out from My profile forgets it too. Devices
-- trusted before this change have no device id; they keep working until they run out.
ALTER TABLE "trusted_device" ADD COLUMN "device_key" TEXT;

CREATE INDEX "trusted_device_user_login_id_device_key_idx" ON "trusted_device"("user_login_id", "device_key");
