-- CreateTable
CREATE TABLE "whatsapp_chat" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "contact_type" TEXT NOT NULL DEFAULT 'unknown',
    "contact_id" UUID,
    "display_name" TEXT NOT NULL,
    "assigned_to_id" UUID,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_inbound_at" TIMESTAMP(3),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "resolved_at" TIMESTAMP(3),
    "query_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "whatsapp_chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_chat_message" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sent_by_id" UUID,
    "provider_message_id" TEXT,
    "status" TEXT,
    "fail_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "audience_kind" TEXT NOT NULL,
    "audience_value" TEXT NOT NULL DEFAULT 'school',
    "audience_label" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "closes_on" DATE,
    "sent_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "invited_count" INTEGER NOT NULL DEFAULT 0,
    "message_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_question" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "survey_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_invite" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "person_type" TEXT NOT NULL,
    "person_id" UUID NOT NULL,
    "answered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_response" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "person_type" TEXT,
    "person_id" UUID,
    "answers" JSONB NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_response_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_chat_school_id_assigned_to_id_last_message_at_idx" ON "whatsapp_chat"("school_id", "assigned_to_id", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_chat_school_id_phone_key" ON "whatsapp_chat"("school_id", "phone");

-- CreateIndex
CREATE INDEX "whatsapp_chat_message_school_id_chat_id_created_at_idx" ON "whatsapp_chat_message"("school_id", "chat_id", "created_at");

-- CreateIndex
CREATE INDEX "whatsapp_chat_message_school_id_provider_message_id_idx" ON "whatsapp_chat_message"("school_id", "provider_message_id");

-- CreateIndex
CREATE INDEX "survey_school_id_status_created_at_idx" ON "survey"("school_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "survey_school_id_number_key" ON "survey"("school_id", "number");

-- CreateIndex
CREATE INDEX "survey_question_school_id_survey_id_idx" ON "survey_question"("school_id", "survey_id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_invite_school_id_token_hash_key" ON "survey_invite"("school_id", "token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "survey_invite_survey_id_person_type_person_id_key" ON "survey_invite"("survey_id", "person_type", "person_id");

-- CreateIndex
CREATE INDEX "survey_response_school_id_survey_id_idx" ON "survey_response"("school_id", "survey_id");

-- AddForeignKey
ALTER TABLE "whatsapp_chat_message" ADD CONSTRAINT "whatsapp_chat_message_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "whatsapp_chat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_question" ADD CONSTRAINT "survey_question_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "survey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_invite" ADD CONSTRAINT "survey_invite_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "survey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_response" ADD CONSTRAINT "survey_response_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "survey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "whatsapp_chat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_chat" FORCE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_chat_same_school" ON "whatsapp_chat" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "whatsapp_chat_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_chat_message" FORCE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_chat_message_same_school" ON "whatsapp_chat_message" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "survey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey" FORCE ROW LEVEL SECURITY;
CREATE POLICY "survey_same_school" ON "survey" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "survey_question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_question" FORCE ROW LEVEL SECURITY;
CREATE POLICY "survey_question_same_school" ON "survey_question" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "survey_invite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_invite" FORCE ROW LEVEL SECURITY;
CREATE POLICY "survey_invite_same_school" ON "survey_invite" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "survey_response" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_response" FORCE ROW LEVEL SECURITY;
CREATE POLICY "survey_response_same_school" ON "survey_response" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
