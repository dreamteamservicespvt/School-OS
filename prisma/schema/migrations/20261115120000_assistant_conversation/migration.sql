-- The School OS Assistant's conversations (docs/assistant/plan.md): the
-- conversation's language, the last few turns and the one change prepared.
-- A new table only: every school's existing data keeps working.
CREATE TABLE "assistant_conversation" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_login_id" UUID NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "pending_language" JSONB,
    "turns" JSONB NOT NULL DEFAULT '[]',
    "prepared" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "assistant_conversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assistant_conversation_school_id_user_login_id_updated_at_idx" ON "assistant_conversation"("school_id", "user_login_id", "updated_at");

-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "assistant_conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_conversation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "assistant_conversation_same_school" ON "assistant_conversation" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
CREATE POLICY "assistant_conversation_purge" ON "assistant_conversation" FOR DELETE USING (current_user = 'school_os_owner' AND school_id::text = current_setting('app.school_purge', true));
