-- CreateTable
CREATE TABLE "push_device" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_login_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "push_device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "push_device_school_id_user_login_id_idx" ON "push_device"("school_id", "user_login_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_device_school_id_token_key" ON "push_device"("school_id", "token");

-- AddForeignKey
ALTER TABLE "push_device" ADD CONSTRAINT "push_device_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_device" ADD CONSTRAINT "push_device_user_login_id_fkey" FOREIGN KEY ("user_login_id") REFERENCES "user_login"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "push_device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_device" FORCE ROW LEVEL SECURITY;
CREATE POLICY "push_device_same_school" ON "push_device" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
