-- CreateTable
CREATE TABLE "transport_setting" (
    "school_id" UUID NOT NULL,
    "location_interval_sec" INTEGER NOT NULL DEFAULT 30,
    "stale_after_sec" INTEGER NOT NULL DEFAULT 120,
    "offline_after_min" INTEGER NOT NULL DEFAULT 5,
    "over_speed_kmh" INTEGER NOT NULL DEFAULT 50,
    "deviation_meters" INTEGER NOT NULL DEFAULT 300,
    "school_geofence_meters" INTEGER NOT NULL DEFAULT 150,
    "stop_geofence_meters" INTEGER NOT NULL DEFAULT 100,
    "school_lat" DOUBLE PRECISION,
    "school_lng" DOUBLE PRECISION,
    "arriving_minutes" INTEGER NOT NULL DEFAULT 5,
    "trip_left_running_min" INTEGER NOT NULL DEFAULT 30,
    "late_after_min" INTEGER NOT NULL DEFAULT 10,
    "delay_suggestion" BOOLEAN NOT NULL DEFAULT true,
    "alert_role_keys" TEXT[] DEFAULT ARRAY['transport-in-charge', 'principal']::TEXT[],
    "boarding_required" BOOLEAN NOT NULL DEFAULT true,
    "show_parent_phones" BOOLEAN NOT NULL DEFAULT false,
    "change_approval" TEXT NOT NULL DEFAULT 'NONE',
    "fee_frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "fee_due_day" INTEGER NOT NULL DEFAULT 10,
    "no_fee_months" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "expiry_reminder_days" INTEGER NOT NULL DEFAULT 30,
    "gps_provider" TEXT,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_setting_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "transport_vendor" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "gstin" TEXT,
    "bank_name" TEXT,
    "bank_account_no" TEXT,
    "bank_last4" TEXT,
    "ifsc" TEXT,
    "monthly_charge_paise" BIGINT,
    "contract_end" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "transport_vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "label" TEXT,
    "type" TEXT NOT NULL DEFAULT 'BUS',
    "model" TEXT,
    "capacity" INTEGER NOT NULL,
    "ownership" TEXT NOT NULL DEFAULT 'OWNED',
    "vendor_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "gps_device_id" TEXT,
    "odometer_km" INTEGER,
    "service_every_km" INTEGER,
    "service_every_days" INTEGER,
    "last_service_on" DATE,
    "last_service_km" INTEGER,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_document" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "number" TEXT,
    "expires_on" DATE NOT NULL,
    "file_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replaced_at" TIMESTAMP(3),

    CONSTRAINT "vehicle_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'DRIVER',
    "employment" TEXT NOT NULL DEFAULT 'STAFF',
    "staff_id" UUID,
    "vendor_id" UUID,
    "licence_no" TEXT,
    "licence_expiry" DATE,
    "licence_file_id" UUID,
    "user_login_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_device" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_last4" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3),
    "rejected_points" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "driver_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "vehicle_id" UUID,
    "driver_id" UUID,
    "attendant_id" UUID,
    "fee_two_way_paise" BIGINT,
    "fee_one_way_paise" BIGINT,
    "school_arrival_min" INTEGER,
    "evening_depart_min" INTEGER,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stop" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "pickup_min" INTEGER NOT NULL,
    "drop_min" INTEGER,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "geofence_meters" INTEGER,
    "fee_two_way_paise" BIGINT,
    "fee_one_way_paise" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "stop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_assignment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "stop_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TWO_WAY',
    "from_date" DATE NOT NULL,
    "to_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "monthly_fee_paise" BIGINT NOT NULL,
    "bus_pass_no" TEXT,
    "change" TEXT NOT NULL DEFAULT 'ASSIGN',
    "replaces_id" UUID,
    "approval_id" UUID,
    "reason" TEXT,
    "end_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_fee_charge" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "due_id" UUID NOT NULL,
    "period_key" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "transport_fee_charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_schedule" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "vehicle_id" UUID,
    "driver_id" UUID,
    "attendant_id" UUID,
    "start_min" INTEGER NOT NULL,
    "days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "trip_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "vehicle_id" UUID,
    "driver_id" UUID,
    "attendant_id" UUID,
    "planned_start_min" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "changed_for_day" BOOLEAN NOT NULL DEFAULT false,
    "change_note" TEXT,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "started_by_id" UUID,
    "ended_by_id" UUID,
    "cancel_reason" TEXT,
    "last_lat" DOUBLE PRECISION,
    "last_lng" DOUBLE PRECISION,
    "last_speed_kmh" DOUBLE PRECISION,
    "last_point_at" TIMESTAMP(3),
    "points_accepted" INTEGER NOT NULL DEFAULT 0,
    "points_rejected" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gps_point" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speed_kmh" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "accuracy_m" DOUBLE PRECISION,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gps_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_stop_event" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "stop_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REACHED',
    "at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'APP',
    "planned_min" INTEGER,
    "note" TEXT,
    "created_by_id" UUID,

    CONSTRAINT "trip_stop_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boarding_event" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "stop_id" UUID,
    "status" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "created_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boarding_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_alert" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "trip_id" UUID,
    "route_id" UUID,
    "vehicle_id" UUID,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "speed_kmh" DOUBLE PRECISION,
    "at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "once_key" TEXT NOT NULL,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" UUID,
    "close_note" TEXT,
    "message_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_log" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "litres" DECIMAL(8,2),
    "amount_paise" BIGINT NOT NULL,
    "odometer_km" INTEGER,
    "bill_file_id" UUID,
    "expense_id" UUID,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,

    CONSTRAINT "fuel_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_log" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'REPAIR',
    "what" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "odometer_km" INTEGER,
    "bill_file_id" UUID,
    "expense_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,

    CONSTRAINT "maintenance_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_reminder_log" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "once_key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_reminder_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transport_vendor_school_id_idx" ON "transport_vendor"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_school_id_number_key" ON "vehicle"("school_id", "number");

-- CreateIndex
CREATE INDEX "vehicle_document_school_id_vehicle_id_idx" ON "vehicle_document"("school_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_document_school_id_expires_on_idx" ON "vehicle_document"("school_id", "expires_on");

-- CreateIndex
CREATE INDEX "driver_school_id_idx" ON "driver"("school_id");

-- CreateIndex
CREATE INDEX "driver_school_id_user_login_id_idx" ON "driver"("school_id", "user_login_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_device_key_hash_key" ON "driver_device"("key_hash");

-- CreateIndex
CREATE INDEX "driver_device_school_id_driver_id_idx" ON "driver_device"("school_id", "driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_school_id_number_key" ON "route"("school_id", "number");

-- CreateIndex
CREATE INDEX "stop_school_id_route_id_idx" ON "stop"("school_id", "route_id");

-- CreateIndex
CREATE INDEX "transport_assignment_school_id_student_id_idx" ON "transport_assignment"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "transport_assignment_school_id_route_id_status_idx" ON "transport_assignment"("school_id", "route_id", "status");

-- CreateIndex
CREATE INDEX "transport_fee_charge_school_id_assignment_id_idx" ON "transport_fee_charge"("school_id", "assignment_id");

-- CreateIndex
CREATE INDEX "transport_fee_charge_school_id_due_id_idx" ON "transport_fee_charge"("school_id", "due_id");

-- CreateIndex
CREATE INDEX "trip_schedule_school_id_route_id_idx" ON "trip_schedule"("school_id", "route_id");

-- CreateIndex
CREATE INDEX "trip_school_id_date_idx" ON "trip"("school_id", "date");

-- CreateIndex
CREATE INDEX "trip_school_id_driver_id_date_idx" ON "trip"("school_id", "driver_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "trip_school_id_route_id_kind_date_key" ON "trip"("school_id", "route_id", "kind", "date");

-- CreateIndex
CREATE INDEX "gps_point_school_id_trip_id_at_idx" ON "gps_point"("school_id", "trip_id", "at");

-- CreateIndex
CREATE INDEX "trip_stop_event_school_id_trip_id_idx" ON "trip_stop_event"("school_id", "trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_stop_event_trip_id_stop_id_key" ON "trip_stop_event"("trip_id", "stop_id");

-- CreateIndex
CREATE INDEX "boarding_event_school_id_trip_id_idx" ON "boarding_event"("school_id", "trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "boarding_event_trip_id_student_id_key" ON "boarding_event"("trip_id", "student_id");

-- CreateIndex
CREATE INDEX "transport_alert_school_id_at_idx" ON "transport_alert"("school_id", "at");

-- CreateIndex
CREATE INDEX "transport_alert_school_id_status_idx" ON "transport_alert"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "transport_alert_school_id_once_key_key" ON "transport_alert"("school_id", "once_key");

-- CreateIndex
CREATE INDEX "fuel_log_school_id_vehicle_id_date_idx" ON "fuel_log"("school_id", "vehicle_id", "date");

-- CreateIndex
CREATE INDEX "maintenance_log_school_id_vehicle_id_date_idx" ON "maintenance_log"("school_id", "vehicle_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "transport_reminder_log_school_id_once_key_key" ON "transport_reminder_log"("school_id", "once_key");

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "transport_vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_document" ADD CONSTRAINT "vehicle_document_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver" ADD CONSTRAINT "driver_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "transport_vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_device" ADD CONSTRAINT "driver_device_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route" ADD CONSTRAINT "route_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stop" ADD CONSTRAINT "stop_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "transport_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "transport_setting_same_school" ON "transport_setting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "transport_vendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_vendor" FORCE ROW LEVEL SECURITY;
CREATE POLICY "transport_vendor_same_school" ON "transport_vendor" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "vehicle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicle" FORCE ROW LEVEL SECURITY;
CREATE POLICY "vehicle_same_school" ON "vehicle" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "vehicle_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicle_document" FORCE ROW LEVEL SECURITY;
CREATE POLICY "vehicle_document_same_school" ON "vehicle_document" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "driver" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "driver" FORCE ROW LEVEL SECURITY;
CREATE POLICY "driver_same_school" ON "driver" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "driver_device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "driver_device" FORCE ROW LEVEL SECURITY;
CREATE POLICY "driver_device_same_school" ON "driver_device" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "route" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "route" FORCE ROW LEVEL SECURITY;
CREATE POLICY "route_same_school" ON "route" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "stop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stop" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stop_same_school" ON "stop" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "transport_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_assignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "transport_assignment_same_school" ON "transport_assignment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "transport_fee_charge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_fee_charge" FORCE ROW LEVEL SECURITY;
CREATE POLICY "transport_fee_charge_same_school" ON "transport_fee_charge" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "trip_schedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_schedule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "trip_schedule_same_school" ON "trip_schedule" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "trip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip" FORCE ROW LEVEL SECURITY;
CREATE POLICY "trip_same_school" ON "trip" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "gps_point" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gps_point" FORCE ROW LEVEL SECURITY;
CREATE POLICY "gps_point_same_school" ON "gps_point" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "trip_stop_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_stop_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "trip_stop_event_same_school" ON "trip_stop_event" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "boarding_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "boarding_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "boarding_event_same_school" ON "boarding_event" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "transport_alert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_alert" FORCE ROW LEVEL SECURITY;
CREATE POLICY "transport_alert_same_school" ON "transport_alert" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "fuel_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fuel_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fuel_log_same_school" ON "fuel_log" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "maintenance_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY "maintenance_log_same_school" ON "maintenance_log" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "transport_reminder_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_reminder_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY "transport_reminder_log_same_school" ON "transport_reminder_log" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());

-- One open transport place per student: a change ends the old one (to_date) before the new one starts.
CREATE UNIQUE INDEX "transport_assignment_one_open" ON "transport_assignment"("school_id", "student_id") WHERE "status" = 'ACTIVE' AND "to_date" IS NULL;
-- One change waiting for approval per student.
CREATE UNIQUE INDEX "transport_assignment_one_waiting" ON "transport_assignment"("school_id", "student_id") WHERE "status" = 'WAITING';
-- Transport fee charged twice (12 §5): one transport fee row per student per period.
CREATE UNIQUE INDEX "transport_fee_charge_once" ON "transport_fee_charge"("school_id", "student_id", "period_key") WHERE "removed_at" IS NULL;
