-- CreateTable
CREATE TABLE "two_step_challenge" (
    "id" UUID NOT NULL,
    "user_login_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sent_to" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "target_school_id" UUID,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_step_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trusted_device" (
    "id" UUID NOT NULL,
    "user_login_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "trusted_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_linked_account" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "gateway_account_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "bank_account_id" UUID,
    "bank_name" TEXT NOT NULL,
    "account_last4" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "linked_account_id" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "gateway_linked_account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "two_step_challenge_token_hash_key" ON "two_step_challenge"("token_hash");

-- CreateIndex
CREATE INDEX "two_step_challenge_user_login_id_created_at_idx" ON "two_step_challenge"("user_login_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "trusted_device_token_hash_key" ON "trusted_device"("token_hash");

-- CreateIndex
CREATE INDEX "trusted_device_user_login_id_idx" ON "trusted_device"("user_login_id");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_linked_account_school_id_gateway_account_id_linked__key" ON "gateway_linked_account"("school_id", "gateway_account_id", "linked_account_id");


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "gateway_linked_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gateway_linked_account" FORCE ROW LEVEL SECURITY;
CREATE POLICY "gateway_linked_account_same_school" ON "gateway_linked_account" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());

-- Links kept by hand (records in other schema files carry ids, not relations).
ALTER TABLE "two_step_challenge" ADD CONSTRAINT "two_step_challenge_user_login_fkey" FOREIGN KEY ("user_login_id") REFERENCES "user_login"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trusted_device" ADD CONSTRAINT "trusted_device_user_login_fkey" FOREIGN KEY ("user_login_id") REFERENCES "user_login"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gateway_linked_account" ADD CONSTRAINT "gateway_linked_account_gateway_fkey" FOREIGN KEY ("gateway_account_id") REFERENCES "payment_gateway_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
