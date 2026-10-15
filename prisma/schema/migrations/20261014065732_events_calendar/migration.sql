-- AlterTable
ALTER TABLE "calendar_entry" ADD COLUMN     "class_ids" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "details" TEXT;

-- CreateTable
CREATE TABLE "events_setting" (
    "school_id" UUID NOT NULL,
    "event_types" TEXT[] DEFAULT ARRAY['Annual day', 'Sports day', 'Cultural', 'Competition', 'Trip', 'Safety drill', 'Meeting', 'Alumni']::TEXT[],
    "venues" TEXT[] DEFAULT ARRAY['Assembly hall', 'Auditorium', 'Library hall', 'School ground', 'Classrooms', 'Outside the school']::TEXT[],
    "second_saturday_off" BOOLEAN NOT NULL DEFAULT false,
    "fourth_saturday_off" BOOLEAN NOT NULL DEFAULT false,
    "ptm_slot_minutes" INTEGER NOT NULL DEFAULT 10,
    "ptm_reminder_hour" INTEGER NOT NULL DEFAULT 18,
    "gallery_rule" TEXT NOT NULL DEFAULT 'OUT',
    "feed_on" BOOLEAN NOT NULL DEFAULT false,
    "feed_version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_setting_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "campus_id" UUID,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_min" INTEGER NOT NULL,
    "end_min" INTEGER,
    "venue" TEXT,
    "audience_kind" TEXT NOT NULL DEFAULT 'school',
    "class_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "audience_label" TEXT NOT NULL,
    "registration_on" BOOLEAN NOT NULL DEFAULT false,
    "seats" INTEGER,
    "fee_paise" BIGINT,
    "fee_head_id" UUID,
    "reminder" TEXT NOT NULL DEFAULT '1d',
    "reminder_sent_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "calendar_entry_id" UUID,
    "description" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registration" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "due_id" UUID,
    "seat" TEXT,
    "attended" BOOLEAN,
    "marked_at" TIMESTAMP(3),
    "marked_by_id" UUID,
    "registered_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_by_id" UUID,

    CONSTRAINT "event_registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_volunteer" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "person_id" UUID,
    "name" TEXT NOT NULL,
    "duty" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "event_volunteer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_reminder" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'reminder',
    "people" INTEGER NOT NULL,
    "message_id" UUID,
    "note" TEXT NOT NULL,
    "sent_by_id" UUID,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ptm" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "class_ids" UUID[],
    "classes_label" TEXT NOT NULL,
    "start_min" INTEGER NOT NULL,
    "end_min" INTEGER NOT NULL,
    "slot_minutes" INTEGER NOT NULL,
    "venue" TEXT,
    "queue_open" BOOLEAN NOT NULL DEFAULT false,
    "summary_sent_at" TIMESTAMP(3),
    "calendar_entry_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "ptm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ptm_teacher" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "ptm_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "section_ids" UUID[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ptm_teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ptm_slot" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "ptm_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "start_min" INTEGER NOT NULL,
    "student_id" UUID,
    "guardian_id" UUID,
    "booked_by_id" UUID,
    "booked_at" TIMESTAMP(3),
    "arrived_at" TIMESTAMP(3),
    "reminded_at" TIMESTAMP(3),

    CONSTRAINT "ptm_slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ptm_meeting_note" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "ptm_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "remarks" TEXT,
    "feedback" TEXT,
    "follow_up" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ptm_meeting_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "album" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "event_id" UUID,
    "date" DATE NOT NULL,
    "visible_to" TEXT NOT NULL DEFAULT 'STAFF',
    "class_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "consent_rule" TEXT NOT NULL DEFAULT 'OUT',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "share_version" INTEGER NOT NULL DEFAULT 1,
    "shared_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "album_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_item" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "album_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PHOTO',
    "no_students" BOOLEAN NOT NULL DEFAULT false,
    "blur_file_id" UUID,
    "blur_key" TEXT,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "media_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_tag" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "tagged_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "media_tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_school_id_date_idx" ON "event"("school_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "event_school_id_number_key" ON "event"("school_id", "number");

-- CreateIndex
CREATE INDEX "event_registration_school_id_student_id_idx" ON "event_registration"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_registration_event_id_student_id_key" ON "event_registration"("event_id", "student_id");

-- CreateIndex
CREATE INDEX "event_volunteer_school_id_event_id_idx" ON "event_volunteer"("school_id", "event_id");

-- CreateIndex
CREATE INDEX "event_reminder_school_id_event_id_idx" ON "event_reminder"("school_id", "event_id");

-- CreateIndex
CREATE INDEX "ptm_school_id_date_idx" ON "ptm"("school_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ptm_teacher_ptm_id_staff_id_key" ON "ptm_teacher"("ptm_id", "staff_id");

-- CreateIndex
CREATE INDEX "ptm_slot_school_id_ptm_id_student_id_idx" ON "ptm_slot"("school_id", "ptm_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "ptm_slot_ptm_id_staff_id_start_min_key" ON "ptm_slot"("ptm_id", "staff_id", "start_min");

-- CreateIndex
CREATE UNIQUE INDEX "ptm_meeting_note_slot_id_key" ON "ptm_meeting_note"("slot_id");

-- CreateIndex
CREATE INDEX "ptm_meeting_note_school_id_student_id_idx" ON "ptm_meeting_note"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "album_school_id_date_idx" ON "album"("school_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "album_school_id_number_key" ON "album"("school_id", "number");

-- CreateIndex
CREATE INDEX "media_item_school_id_album_id_idx" ON "media_item"("school_id", "album_id");

-- CreateIndex
CREATE INDEX "media_tag_school_id_student_id_idx" ON "media_tag"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_tag_media_id_student_id_key" ON "media_tag"("media_id", "student_id");

-- AddForeignKey
ALTER TABLE "event_registration" ADD CONSTRAINT "event_registration_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_volunteer" ADD CONSTRAINT "event_volunteer_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_reminder" ADD CONSTRAINT "event_reminder_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ptm_teacher" ADD CONSTRAINT "ptm_teacher_ptm_id_fkey" FOREIGN KEY ("ptm_id") REFERENCES "ptm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ptm_slot" ADD CONSTRAINT "ptm_slot_ptm_id_fkey" FOREIGN KEY ("ptm_id") REFERENCES "ptm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_item" ADD CONSTRAINT "media_item_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "album"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_tag" ADD CONSTRAINT "media_tag_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "events_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "events_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "events_setting_same_school" ON "events_setting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "event_same_school" ON "event" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "event_registration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_registration" FORCE ROW LEVEL SECURITY;
CREATE POLICY "event_registration_same_school" ON "event_registration" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "event_volunteer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_volunteer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "event_volunteer_same_school" ON "event_volunteer" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "event_reminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_reminder" FORCE ROW LEVEL SECURITY;
CREATE POLICY "event_reminder_same_school" ON "event_reminder" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "ptm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ptm" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ptm_same_school" ON "ptm" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "ptm_teacher" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ptm_teacher" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ptm_teacher_same_school" ON "ptm_teacher" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "ptm_slot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ptm_slot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ptm_slot_same_school" ON "ptm_slot" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "ptm_meeting_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ptm_meeting_note" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ptm_meeting_note_same_school" ON "ptm_meeting_note" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "album" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "album" FORCE ROW LEVEL SECURITY;
CREATE POLICY "album_same_school" ON "album" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "media_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_item" FORCE ROW LEVEL SECURITY;
CREATE POLICY "media_item_same_school" ON "media_item" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "media_tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_tag" FORCE ROW LEVEL SECURITY;
CREATE POLICY "media_tag_same_school" ON "media_tag" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
