-- CreateTable
CREATE TABLE "ai_call" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "feature" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "user_login_id" UUID,
    "model" TEXT NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_write_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_paise" BIGINT NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "masked" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_mapping" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "header_key" TEXT NOT NULL,
    "headings" JSONB NOT NULL DEFAULT '[]',
    "columns" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT,
    "file_name" TEXT NOT NULL,
    "times_used" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "import_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_call_school_id_created_at_idx" ON "ai_call"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "import_mapping_school_id_kind_idx" ON "import_mapping"("school_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "import_mapping_school_id_kind_header_key_key" ON "import_mapping"("school_id", "kind", "header_key");


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "ai_call" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_call" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ai_call_same_school" ON "ai_call" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
CREATE POLICY "ai_call_purge" ON "ai_call" FOR DELETE USING (current_user = 'school_os_owner' AND school_id::text = current_setting('app.school_purge', true));
ALTER TABLE "import_mapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_mapping" FORCE ROW LEVEL SECURITY;
CREATE POLICY "import_mapping_same_school" ON "import_mapping" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
CREATE POLICY "import_mapping_purge" ON "import_mapping" FOR DELETE USING (current_user = 'school_os_owner' AND school_id::text = current_setting('app.school_purge', true));

-- One Smart Import switch (gap list G24 and G18). Smart Import was switched on in two
-- places: Student Settings' "Smart Import" checkbox, and the School Feature
-- "ai-smart-import" under the AI assistant in Modules On/Off, which nothing read. From now
-- on the School Feature is the only switch. A school that had the Student Settings box
-- ticked keeps Smart Import on: the feature is switched on here. Like every AI feature it
-- works while the AI assistant is on, for the roles chosen there. The old column is kept
-- and no longer read, so nothing is lost.
--
-- Row-level security is lifted for this one copy only, and put back straight after.
ALTER TABLE "student_settings" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "school_feature" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_entry" NO FORCE ROW LEVEL SECURITY;

WITH switched AS (
  INSERT INTO "school_feature" ("school_id", "feature_key", "is_on", "updated_at")
  SELECT ss."school_id", 'ai-smart-import', true, now() FROM "student_settings" ss
  WHERE ss."smart_import_on" = true
  ON CONFLICT ("school_id", "feature_key") DO UPDATE SET "is_on" = true, "updated_at" = now()
  WHERE "school_feature"."is_on" = false
  RETURNING "school_id"
)
INSERT INTO "audit_log_entry" ("id", "school_id", "user_login_id", "actor_note", "action", "record_type", "record_id", "before", "after", "at")
SELECT gen_random_uuid(), w."school_id", NULL, 'School OS update: Smart Import has one switch, in Settings, Modules On/Off',
       'switched-on', 'Feature', NULL,
       '{"feature": "Smart Import", "on": false, "from": "Student Settings"}'::jsonb, '{"feature": "Smart Import", "on": true}'::jsonb, now()
FROM switched w;

ALTER TABLE "student_settings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "school_feature" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_entry" FORCE ROW LEVEL SECURITY;
