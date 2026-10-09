-- CreateTable
CREATE TABLE "rate_limit_bucket" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "error_event" (
    "id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "where" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "digest" TEXT,
    "school_code" TEXT,

    CONSTRAINT "error_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_notice" (
    "id" UUID NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'warning',
    "message" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_notice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_limit_bucket_window_start_idx" ON "rate_limit_bucket"("window_start");

-- CreateIndex
CREATE INDEX "error_event_at_idx" ON "error_event"("at");

-- CreateIndex
CREATE INDEX "system_notice_starts_at_idx" ON "system_notice"("starts_at");


-- Old rate-limit windows are cleared by this function only (the app has no DELETE right).
CREATE OR REPLACE FUNCTION prune_rate_limits() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM rate_limit_bucket WHERE window_start < now() - interval '1 day';
$$;
REVOKE ALL ON FUNCTION prune_rate_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prune_rate_limits() TO school_os_app;
-- Error records are written by the app; nobody edits them.
REVOKE UPDATE ON "error_event" FROM school_os_app;
