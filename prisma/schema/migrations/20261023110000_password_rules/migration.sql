-- Password rules a School Admin sets in Settings, Users & Permissions (gap list
-- G45): the shortest new password, how many earlier passwords may not be used
-- again, and an optional expiry. The defaults are the rules every school had
-- before (8 characters, not checked against earlier passwords, never expire), so
-- every existing password keeps working.
ALTER TABLE "password_policy" ADD COLUMN "min_length" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "password_policy" ADD COLUMN "history_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "password_policy" ADD COLUMN "expiry_days" INTEGER;
ALTER TABLE "password_policy" ADD COLUMN "expiry_since" TIMESTAMP(3);

-- Safe bounds: 8 to 32 characters; 0 to 10 earlier passwords; expiry of 30 to 365 days or never.
ALTER TABLE "password_policy" ADD CONSTRAINT "password_policy_password_bounds"
  CHECK ("min_length" BETWEEN 8 AND 32 AND "history_count" BETWEEN 0 AND 10 AND ("expiry_days" IS NULL OR "expiry_days" BETWEEN 30 AND 365));

-- Earlier passwords of a login, as hashes only. Like the login itself, they belong to no one school.
CREATE TABLE "password_history" (
    "id" UUID NOT NULL,
    "user_login_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "password_history_user_login_id_created_at_idx" ON "password_history"("user_login_id", "created_at");
