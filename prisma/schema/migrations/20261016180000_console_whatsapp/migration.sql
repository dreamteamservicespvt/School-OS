-- CreateTable
CREATE TABLE "console_provider" (
    "key" TEXT NOT NULL,
    "phone_number_id" TEXT,
    "business_account_id" TEXT,
    "access_token_enc" TEXT,
    "token_last4" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "templates" JSONB NOT NULL DEFAULT '{}',
    "tested_at" TIMESTAMP(3),
    "test_result" TEXT,
    "updated_by_id" UUID,
    "updated_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "console_provider_pkey" PRIMARY KEY ("key")
);

-- The console's own records are visible only inside withConsole() (see the
-- 20261013012230_console migration). Schools never see this table.
ALTER TABLE "console_provider" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "console_provider" FORCE ROW LEVEL SECURITY;
CREATE POLICY "console_provider_console_only" ON "console_provider"
  USING (app_in_console()) WITH CHECK (app_in_console());
