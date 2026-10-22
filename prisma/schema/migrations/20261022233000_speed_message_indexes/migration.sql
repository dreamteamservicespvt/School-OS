-- Speed at a real school's size (gap list G37): indexes on message_recipient, which
-- grows to hundreds of thousands of rows a year. Indexes only: no data changes.
-- CreateIndex
CREATE INDEX IF NOT EXISTS "message_recipient_school_id_status_failed_at_idx" ON "message_recipient"("school_id", "status", "failed_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "message_recipient_school_id_is_backup_status_provider_idx" ON "message_recipient"("school_id", "is_backup", "status", "provider");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "message_recipient_school_id_queued_at_idx" ON "message_recipient"("school_id", "queued_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "message_recipient_school_id_template_version_id_idx" ON "message_recipient"("school_id", "template_version_id");

