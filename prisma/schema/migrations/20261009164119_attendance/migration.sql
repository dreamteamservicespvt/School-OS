-- CreateTable
CREATE TABLE "attendance_setting" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "default_status" TEXT NOT NULL DEFAULT 'present',
    "period_day_rule" TEXT NOT NULL DEFAULT 'any',
    "register_order" TEXT NOT NULL DEFAULT 'roll',
    "show_photos" BOOLEAN NOT NULL DEFAULT true,
    "student_methods" TEXT[] DEFAULT ARRAY['register']::TEXT[],
    "staff_methods" TEXT[] DEFAULT ARRAY['register']::TEXT[],
    "student_start_time" TEXT NOT NULL DEFAULT '08:45',
    "student_late_after_min" INTEGER NOT NULL DEFAULT 10,
    "staff_start_time" TEXT NOT NULL DEFAULT '08:30',
    "staff_late_after_min" INTEGER NOT NULL DEFAULT 10,
    "staff_half_day_after" TEXT DEFAULT '11:00',
    "lock_time" TEXT NOT NULL DEFAULT '11:00',
    "lock_override_roles" TEXT[] DEFAULT ARRAY['principal', 'school-admin']::TEXT[],
    "punch_window_start" TEXT NOT NULL DEFAULT '06:00',
    "punch_window_end" TEXT NOT NULL DEFAULT '20:00',
    "repeat_punch_minutes" INTEGER NOT NULL DEFAULT 5,
    "max_clock_skew_minutes" INTEGER NOT NULL DEFAULT 10,
    "absence_alert_on" BOOLEAN NOT NULL DEFAULT true,
    "absence_delay_minutes" INTEGER NOT NULL DEFAULT 15,
    "absence_channels" TEXT[] DEFAULT ARRAY['whatsapp']::TEXT[],
    "absence_template" TEXT NOT NULL DEFAULT 'Dear parent, {student} of {class} is absent today ({date}). Please call the school if this is not expected. {school}',
    "late_alert_on" BOOLEAN NOT NULL DEFAULT false,
    "threshold_on" BOOLEAN NOT NULL DEFAULT true,
    "threshold_percent" INTEGER NOT NULL DEFAULT 75,
    "threshold_notify" TEXT[] DEFAULT ARRAY['parent', 'class-teacher', 'principal']::TEXT[],
    "chronic_on" BOOLEAN NOT NULL DEFAULT true,
    "chronic_days" INTEGER NOT NULL DEFAULT 3,
    "chronic_notify" TEXT[] DEFAULT ARRAY['class-teacher', 'principal']::TEXT[],
    "class_teacher_leave_days" INTEGER NOT NULL DEFAULT 3,
    "quota_over_needs_approval" BOOLEAN NOT NULL DEFAULT true,
    "qr_students_on" BOOLEAN NOT NULL DEFAULT false,
    "qr_staff_on" BOOLEAN NOT NULL DEFAULT false,
    "qr_rotation" TEXT NOT NULL DEFAULT 'daily',
    "poster_theme" TEXT NOT NULL DEFAULT 'ocean',
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_status" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "letter" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'neutral',
    "counts" TEXT NOT NULL DEFAULT 'present',
    "for_whom" TEXT NOT NULL DEFAULT 'both',
    "system" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "attendance_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_mark" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "student_id" UUID,
    "staff_id" UUID,
    "section_id" UUID,
    "date" DATE NOT NULL,
    "period_no" INTEGER NOT NULL DEFAULT 0,
    "status_key" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'register',
    "in_time" TIMESTAMP(3),
    "out_time" TIMESTAMP(3),
    "late_minutes" INTEGER,
    "note" TEXT,
    "leave_request_id" UUID,
    "marked_by_id" UUID,
    "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taken_at" TIMESTAMP(3),
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "attendance_mark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_submission" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "client_id" TEXT NOT NULL,
    "section_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "period_no" INTEGER NOT NULL DEFAULT 0,
    "submitted_by_id" UUID,
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "taken_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clock_skew_seconds" INTEGER,
    "clock_flagged" BOOLEAN NOT NULL DEFAULT false,
    "outcome" TEXT NOT NULL,
    "correction_id" UUID,
    "entries" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attendance_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_correction" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "for_whom" TEXT NOT NULL DEFAULT 'student',
    "section_id" UUID,
    "date" DATE NOT NULL,
    "period_no" INTEGER NOT NULL DEFAULT 0,
    "entries" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'manual',
    "versions" JSONB,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "approval_id" UUID,
    "requested_by_id" UUID,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "attendance_correction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_alert" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "guardian_id" UUID,
    "text" TEXT NOT NULL,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "note" TEXT,
    "message_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_flag" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "value" DECIMAL(6,2) NOT NULL,
    "raised_on" DATE NOT NULL,
    "cleared_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_device" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "serial_no" TEXT NOT NULL,
    "location" TEXT,
    "device_type" TEXT NOT NULL,
    "allowed_users" TEXT NOT NULL DEFAULT 'both',
    "ip_address" TEXT,
    "connection_note" TEXT,
    "key_hash" TEXT NOT NULL,
    "key_last4" TEXT NOT NULL,
    "key_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_punch_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "attendance_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_user_map" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "device_user_no" TEXT NOT NULL,
    "student_id" UUID,
    "staff_id" UUID,
    "matched_by" TEXT NOT NULL DEFAULT 'manual',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "device_user_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_punch" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "punch_no" TEXT NOT NULL,
    "device_user_no" TEXT NOT NULL,
    "punched_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "reject_reason" TEXT,
    "student_id" UUID,
    "staff_id" UUID,
    "mark_id" UUID,

    CONSTRAINT "device_punch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_session" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campus_id" UUID,
    "name" TEXT NOT NULL,
    "for_whom" TEXT NOT NULL DEFAULT 'staff',
    "scope" TEXT NOT NULL DEFAULT 'school',
    "rotation" TEXT NOT NULL DEFAULT 'daily',
    "secret_enc" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "qr_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geo_fence" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "radius_m" INTEGER NOT NULL DEFAULT 50,
    "students_on" BOOLEAN NOT NULL DEFAULT false,
    "staff_on" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geo_fence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_shift" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "late_after_min" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "staff_shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_shift_assignment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "staff_shift_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_entry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "overtime_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_leave_quota" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "days" DECIMAL(5,1) NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'term',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "student_leave_quota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_setting_school_id_key" ON "attendance_setting"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_status_school_id_key_key" ON "attendance_status"("school_id", "key");

-- CreateIndex
CREATE INDEX "attendance_mark_school_id_section_id_date_idx" ON "attendance_mark"("school_id", "section_id", "date");

-- CreateIndex
CREATE INDEX "attendance_mark_school_id_date_status_key_idx" ON "attendance_mark"("school_id", "date", "status_key");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_mark_school_id_student_id_date_period_no_key" ON "attendance_mark"("school_id", "student_id", "date", "period_no");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_mark_school_id_staff_id_date_period_no_key" ON "attendance_mark"("school_id", "staff_id", "date", "period_no");

-- CreateIndex
CREATE INDEX "attendance_submission_school_id_section_id_date_idx" ON "attendance_submission"("school_id", "section_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_submission_school_id_client_id_key" ON "attendance_submission"("school_id", "client_id");

-- CreateIndex
CREATE INDEX "attendance_correction_school_id_status_idx" ON "attendance_correction"("school_id", "status");

-- CreateIndex
CREATE INDEX "attendance_correction_school_id_date_idx" ON "attendance_correction"("school_id", "date");

-- CreateIndex
CREATE INDEX "attendance_alert_school_id_date_idx" ON "attendance_alert"("school_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_alert_school_id_student_id_date_kind_key" ON "attendance_alert"("school_id", "student_id", "date", "kind");

-- CreateIndex
CREATE INDEX "attendance_flag_school_id_student_id_kind_idx" ON "attendance_flag"("school_id", "student_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_device_key_hash_key" ON "attendance_device"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_device_school_id_serial_no_key" ON "attendance_device"("school_id", "serial_no");

-- CreateIndex
CREATE UNIQUE INDEX "device_user_map_device_id_device_user_no_key" ON "device_user_map"("device_id", "device_user_no");

-- CreateIndex
CREATE INDEX "device_punch_school_id_received_at_idx" ON "device_punch"("school_id", "received_at");

-- CreateIndex
CREATE INDEX "device_punch_school_id_accepted_reject_reason_idx" ON "device_punch"("school_id", "accepted", "reject_reason");

-- CreateIndex
CREATE UNIQUE INDEX "device_punch_device_id_punch_no_key" ON "device_punch"("device_id", "punch_no");

-- CreateIndex
CREATE UNIQUE INDEX "geo_fence_school_id_campus_id_key" ON "geo_fence"("school_id", "campus_id");

-- CreateIndex
CREATE INDEX "staff_shift_assignment_school_id_staff_id_from_date_idx" ON "staff_shift_assignment"("school_id", "staff_id", "from_date");

-- CreateIndex
CREATE INDEX "overtime_entry_school_id_staff_id_date_idx" ON "overtime_entry"("school_id", "staff_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "student_leave_quota_leave_type_id_key" ON "student_leave_quota"("leave_type_id");

-- AddForeignKey
ALTER TABLE "device_user_map" ADD CONSTRAINT "device_user_map_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "attendance_device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_punch" ADD CONSTRAINT "device_punch_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "attendance_device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_shift_assignment" ADD CONSTRAINT "staff_shift_assignment_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "staff_shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "attendance_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attendance_setting_same_school" ON "attendance_setting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "attendance_status" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_status" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attendance_status_same_school" ON "attendance_status" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "attendance_mark" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_mark" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attendance_mark_same_school" ON "attendance_mark" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "attendance_submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_submission" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attendance_submission_same_school" ON "attendance_submission" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "attendance_correction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_correction" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attendance_correction_same_school" ON "attendance_correction" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "attendance_alert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_alert" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attendance_alert_same_school" ON "attendance_alert" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "attendance_flag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_flag" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attendance_flag_same_school" ON "attendance_flag" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "attendance_device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_device" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attendance_device_same_school" ON "attendance_device" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "device_user_map" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "device_user_map" FORCE ROW LEVEL SECURITY;
CREATE POLICY "device_user_map_same_school" ON "device_user_map" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "device_punch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "device_punch" FORCE ROW LEVEL SECURITY;
CREATE POLICY "device_punch_same_school" ON "device_punch" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "qr_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qr_session" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qr_session_same_school" ON "qr_session" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "geo_fence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "geo_fence" FORCE ROW LEVEL SECURITY;
CREATE POLICY "geo_fence_same_school" ON "geo_fence" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "staff_shift" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_shift" FORCE ROW LEVEL SECURITY;
CREATE POLICY "staff_shift_same_school" ON "staff_shift" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "staff_shift_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_shift_assignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "staff_shift_assignment_same_school" ON "staff_shift_assignment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "overtime_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "overtime_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "overtime_entry_same_school" ON "overtime_entry" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "student_leave_quota" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_leave_quota" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_leave_quota_same_school" ON "student_leave_quota" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
