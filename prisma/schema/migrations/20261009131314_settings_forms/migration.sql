-- CreateTable
CREATE TABLE "custom_form" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "about_type" TEXT NOT NULL DEFAULT 'general',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "custom_form_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_form_school_id_name_key" ON "custom_form"("school_id", "name");


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "custom_form" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_form" FORCE ROW LEVEL SECURITY;
CREATE POLICY "custom_form_same_school" ON "custom_form" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
