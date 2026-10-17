-- Online fee payments are never lost (06 §3 "Automatic work: Online payment
-- received", rule 8):
-- 1. Every gateway order made for a Payment Link is kept (payment_link_order),
--    so a payment on an older order of the link is still matched and posted.
--    Links already open get one row for the order they hold now, so they keep
--    matching exactly as before.
-- 2. The reconcile job notes when it last asked the gateway about a link and
--    what it said (payment_link.checked_at, gateway_status). Empty for
--    existing links: they are asked on the next run.
-- 3. What the gateway told about the payer and the event (contact, method,
--    refund or dispute id) is kept on the Gateway Transaction, to help the
--    office match a payment by hand. Empty for existing rows.

-- AlterTable
ALTER TABLE "gateway_transaction" ADD COLUMN     "details" JSONB;

-- AlterTable
ALTER TABLE "payment_link" ADD COLUMN     "checked_at" TIMESTAMP(3),
ADD COLUMN     "gateway_status" TEXT;

-- CreateTable
CREATE TABLE "payment_link_order" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "payment_link_id" UUID NOT NULL,
    "gateway_order_id" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_link_order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_link_order_school_id_payment_link_id_idx" ON "payment_link_order"("school_id", "payment_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_link_order_school_id_gateway_order_id_key" ON "payment_link_order"("school_id", "gateway_order_id");

-- The order each existing link holds now (row-level security is lifted for the copy only).
ALTER TABLE "payment_link" NO FORCE ROW LEVEL SECURITY;
INSERT INTO "payment_link_order" ("id", "school_id", "payment_link_id", "gateway_order_id", "amount_paise", "created_at")
SELECT gen_random_uuid(), "school_id", "id", "gateway_order_id", "amount_paise", COALESCE("last_attempt_at", "created_at")
  FROM "payment_link"
 WHERE "gateway_order_id" IS NOT NULL
ON CONFLICT ("school_id", "gateway_order_id") DO NOTHING;
ALTER TABLE "payment_link" FORCE ROW LEVEL SECURITY;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "payment_link_order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_link_order" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_link_order_same_school" ON "payment_link_order" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
CREATE POLICY "payment_link_order_purge" ON "payment_link_order" FOR DELETE USING (current_user = 'school_os_owner' AND school_id::text = current_setting('app.school_purge', true));
