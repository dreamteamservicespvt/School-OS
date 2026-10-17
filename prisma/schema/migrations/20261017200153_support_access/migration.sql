-- CreateEnum
CREATE TYPE "SupportAccessStatus" AS ENUM ('WAITING', 'ALLOWED', 'DECLINED', 'ENDED');

-- CreateTable
CREATE TABLE "support_access_request" (
    "id" UUID NOT NULL,
    "for_school_id" UUID NOT NULL,
    "school_name" TEXT NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "requested_by_name" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "length_minutes" INTEGER NOT NULL,
    "status" "SupportAccessStatus" NOT NULL DEFAULT 'WAITING',
    "decided_by_id" UUID,
    "decided_by_name" TEXT,
    "decided_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "ended_how" TEXT,
    "ended_by_name" TEXT,
    "entry_ticket_hash" TEXT,
    "entry_ticket_expires_at" TIMESTAMP(3),
    "entry_token_hash" TEXT,
    "entry_session_id" UUID,
    "entered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_access_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_access_request_entry_ticket_hash_key" ON "support_access_request"("entry_ticket_hash");

-- CreateIndex
CREATE UNIQUE INDEX "support_access_request_entry_token_hash_key" ON "support_access_request"("entry_token_hash");

-- CreateIndex
CREATE INDEX "support_access_request_for_school_id_created_at_idx" ON "support_access_request"("for_school_id", "created_at");

-- CreateIndex
CREATE INDEX "support_access_request_status_idx" ON "support_access_request"("status");



-- ---------------------------------------------------------------------------
-- Support Access Requests are the console's own records (07-super-admin.md §10):
-- visible only while app.console is on (withConsole, withConsoleSchool), never
-- from inside a school.
-- ---------------------------------------------------------------------------
ALTER TABLE "support_access_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_access_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY support_access_request_console_only ON "support_access_request"
  USING (app_in_console()) WITH CHECK (app_in_console());

-- One open request (waiting for the school, or allowed) per school at a time.
CREATE UNIQUE INDEX "support_access_request_one_open"
  ON "support_access_request" ("for_school_id") WHERE "status" IN ('WAITING', 'ALLOWED');

-- ---------------------------------------------------------------------------
-- Billing day: a school's year, renewal or second-half invoice is made once per
-- period, even when two workers run at the same moment (gap G35). Cancelled ones
-- do not count, so a wrong invoice can still be replaced. If a database already
-- holds such a duplicate, it is left as it is for the Owner to cancel, and the
-- index is not made there (existing data keeps working); the billing day's own
-- lock still stops new duplicates.
-- ---------------------------------------------------------------------------
SELECT set_config('app.console', 'on', false);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "platform_invoice"
    WHERE "status" <> 'CANCELLED' AND "kind" IN ('NEW', 'RENEWAL', 'SECOND_HALF') AND "period_from" IS NOT NULL
    GROUP BY "for_school_id", "kind", "period_from" HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX "platform_invoice_one_per_period"
      ON "platform_invoice" ("for_school_id", "kind", "period_from")
      WHERE "status" <> 'CANCELLED' AND "kind" IN ('NEW', 'RENEWAL', 'SECOND_HALF');
  ELSE
    RAISE NOTICE 'platform_invoice has duplicate year invoices; the one-per-period index was not made';
  END IF;
END $$;
SELECT set_config('app.console', 'off', false);
