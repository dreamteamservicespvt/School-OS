-- CreateEnum
CREATE TYPE "StockMoveKind" AS ENUM ('OPENING', 'IN', 'RECEIVED', 'OUT', 'ISSUE', 'RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'DAMAGED', 'LOST', 'EXPIRED', 'AUDIT');

-- CreateEnum
CREATE TYPE "IssueTo" AS ENUM ('STAFF', 'DEPARTMENT', 'CLASS', 'STUDENT');

-- CreateEnum
CREATE TYPE "InventoryApproval" AS ENUM ('WAITING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockAuditStatus" AS ENUM ('OPEN', 'WAITING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('WAITING', 'APPROVED', 'REJECTED', 'ORDERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('WAITING', 'SENT', 'PART_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_USE', 'IN_REPAIR', 'DISPOSED');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "inventory_setting" (
    "school_id" UUID NOT NULL,
    "item_code_prefix" TEXT NOT NULL DEFAULT 'ST-',
    "item_code_width" INTEGER NOT NULL DEFAULT 4,
    "asset_tag_prefix" TEXT NOT NULL DEFAULT 'AT-',
    "asset_tag_width" INTEGER NOT NULL DEFAULT 4,
    "po_prefix" TEXT NOT NULL DEFAULT 'PO/',
    "approve_up_to_paise" BIGINT NOT NULL DEFAULT 500000,
    "transfers_need_approval" BOOLEAN NOT NULL DEFAULT false,
    "depreciation_method" TEXT NOT NULL DEFAULT 'SLM',
    "depreciation_rates" JSONB NOT NULL DEFAULT '{}',
    "asset_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "units" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "warranty_reminder_days" INTEGER NOT NULL DEFAULT 30,
    "low_stock_alerts" BOOLEAN NOT NULL DEFAULT true,
    "book_sets_on" BOOLEAN NOT NULL DEFAULT true,
    "sets_with_missing" BOOLEAN NOT NULL DEFAULT true,
    "default_expense_head_id" UUID,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_setting_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "item_category" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_lab" BOOLEAN NOT NULL DEFAULT false,
    "default_reorder_level" INTEGER NOT NULL DEFAULT 0,
    "expense_head_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "item_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_location" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "store_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "size" TEXT,
    "reorder_level" INTEGER,
    "price_paise" BIGINT,
    "last_price_paise" BIGINT,
    "tracks_expiry" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "low_alert_at" TIMESTAMP(3),
    "import_batch_id" UUID,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balance" (
    "school_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_balance_pkey" PRIMARY KEY ("item_id","location_id")
);

-- CreateTable
CREATE TABLE "stock_batch" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "batch_no" TEXT NOT NULL,
    "expires_on" DATE NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "kind" "StockMoveKind" NOT NULL,
    "qty" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "batch_id" UUID,
    "unit_cost_paise" BIGINT,
    "reference" TEXT,
    "reason" TEXT,
    "issue_id" UUID,
    "receipt_id" UUID,
    "audit_id" UUID,
    "transfer_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "from_location_id" UUID NOT NULL,
    "to_location_id" UUID NOT NULL,
    "lines" JSONB NOT NULL,
    "note" TEXT,
    "status" "InventoryApproval" NOT NULL DEFAULT 'APPROVED',
    "approval_id" UUID,
    "decision_note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_set" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "class_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "price_paise" BIGINT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "book_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_set_item" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "set_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "book_set_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_issue" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "to_kind" "IssueTo" NOT NULL,
    "staff_id" UUID,
    "department_id" UUID,
    "section_id" UUID,
    "student_id" UUID,
    "student_section_id" UUID,
    "location_id" UUID NOT NULL,
    "book_set_id" UUID,
    "missing" JSONB NOT NULL DEFAULT '[]',
    "returnable" BOOLEAN NOT NULL DEFAULT false,
    "charge_paise" BIGINT NOT NULL DEFAULT 0,
    "fee_due_id" UUID,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_issue_line" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price_paise" BIGINT NOT NULL DEFAULT 0,
    "returned_qty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_issue_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_audit" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location_id" UUID NOT NULL,
    "status" "StockAuditStatus" NOT NULL DEFAULT 'OPEN',
    "started_on" DATE NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "approval_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_audit_line" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "system_qty" INTEGER NOT NULL,
    "counted_qty" INTEGER,
    "note" TEXT,

    CONSTRAINT "stock_audit_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_detail" (
    "vendor_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "contact_name" TEXT,
    "email" TEXT,
    "bank_name" TEXT,
    "account_no_enc" TEXT,
    "account_last4" TEXT,
    "ifsc" TEXT,
    "items_supplied" TEXT,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_detail_pkey" PRIMARY KEY ("vendor_id")
);

-- CreateTable
CREATE TABLE "purchase_request" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "needed_by" DATE,
    "reason" TEXT NOT NULL,
    "department_id" UUID,
    "estimate_paise" BIGINT NOT NULL DEFAULT 0,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'WAITING',
    "approval_id" UUID,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "requested_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_line" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "est_unit_paise" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_request_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "request_id" UUID,
    "vendor_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "expected_on" DATE,
    "total_paise" BIGINT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'SENT',
    "approval_id" UUID,
    "decision_note" TEXT,
    "note" TEXT,
    "approved_by_id" UUID,
    "emailed_to" TEXT,
    "emailed_at" TIMESTAMP(3),
    "closed_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_line" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price_paise" BIGINT NOT NULL,
    "received_qty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "location_id" UUID NOT NULL,
    "extra_reason" TEXT,
    "note" TEXT,
    "received_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_line" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "batch_no" TEXT,
    "expires_on" DATE,

    CONSTRAINT "goods_receipt_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "order_id" UUID,
    "vendor_id" UUID NOT NULL,
    "bill_no" TEXT NOT NULL,
    "bill_date" DATE NOT NULL,
    "due_date" DATE,
    "amount_paise" BIGINT NOT NULL,
    "expense_id" UUID NOT NULL,
    "file_id" UUID,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "serial_no" TEXT,
    "room_id" UUID,
    "department_id" UUID,
    "staff_id" UUID,
    "purchase_date" DATE,
    "cost_paise" BIGINT,
    "vendor_id" UUID,
    "warranty_end" DATE,
    "amc_end" DATE,
    "condition" TEXT NOT NULL DEFAULT 'Good',
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_USE',
    "receipt_id" UUID,
    "item_id" UUID,
    "depreciation_rate" INTEGER,
    "reminded_for" DATE,
    "disposed_on" DATE,
    "note" TEXT,
    "import_batch_id" UUID,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_assignment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "room_id" UUID,
    "department_id" UUID,
    "staff_id" UUID,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_maintenance_log" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "problem" TEXT NOT NULL,
    "vendor_id" UUID,
    "cost_paise" BIGINT,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "done_on" DATE,
    "expense_id" UUID,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_maintenance_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_disposal" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sale_paise" BIGINT,
    "buyer" TEXT,
    "sale_mode" TEXT,
    "sale_ref" TEXT,
    "status" "InventoryApproval" NOT NULL DEFAULT 'WAITING',
    "approval_id" UUID,
    "decision_note" TEXT,
    "income_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_disposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_item_link" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "asset_item_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_audit" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "room_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "result" JSONB,
    "created_by_id" UUID,

    CONSTRAINT "asset_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_audit_scan" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "asset_id" UUID,
    "room_id" UUID,
    "scanned_by_id" UUID,
    "scanned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_audit_scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility" (
    "room_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "building" TEXT,
    "floor" TEXT,
    "in_charge_staff_id" UUID,
    "note" TEXT,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_pkey" PRIMARY KEY ("room_id")
);

-- CreateTable
CREATE TABLE "maintenance_request" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "room_id" UUID NOT NULL,
    "asset_id" UUID,
    "problem" TEXT NOT NULL,
    "photo_file_id" UUID,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "technician_staff_id" UUID,
    "technician_name" TEXT,
    "vendor_id" UUID,
    "raised_by_id" UUID,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_at" TIMESTAMP(3),
    "done_on" DATE,
    "cost_paise" BIGINT,
    "expense_id" UUID,
    "closing_note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_experiment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "room_id" UUID,
    "materials" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "lab_experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_safety_check" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "checklist" JSONB NOT NULL,
    "result" TEXT NOT NULL,
    "note" TEXT,
    "checked_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_safety_check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "item_category_school_id_name_key" ON "item_category"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "store_location_school_id_name_key" ON "store_location"("school_id", "name");

-- CreateIndex
CREATE INDEX "item_school_id_category_id_idx" ON "item"("school_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_school_id_code_key" ON "item"("school_id", "code");

-- CreateIndex
CREATE INDEX "stock_balance_school_id_location_id_idx" ON "stock_balance"("school_id", "location_id");

-- CreateIndex
CREATE INDEX "stock_batch_school_id_expires_on_idx" ON "stock_batch"("school_id", "expires_on");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batch_school_id_item_id_location_id_batch_no_key" ON "stock_batch"("school_id", "item_id", "location_id", "batch_no");

-- CreateIndex
CREATE INDEX "stock_movement_school_id_item_id_created_at_idx" ON "stock_movement"("school_id", "item_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movement_school_id_date_idx" ON "stock_movement"("school_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_school_id_number_key" ON "stock_transfer"("school_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "book_set_school_id_name_key" ON "book_set"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "book_set_item_set_id_item_id_key" ON "book_set_item"("set_id", "item_id");

-- CreateIndex
CREATE INDEX "stock_issue_school_id_date_idx" ON "stock_issue"("school_id", "date");

-- CreateIndex
CREATE INDEX "stock_issue_school_id_student_id_idx" ON "stock_issue"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "stock_issue_school_id_staff_id_idx" ON "stock_issue"("school_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_issue_school_id_number_key" ON "stock_issue"("school_id", "number");

-- CreateIndex
CREATE INDEX "stock_issue_line_school_id_item_id_idx" ON "stock_issue_line"("school_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_audit_school_id_number_key" ON "stock_audit"("school_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_audit_line_audit_id_item_id_key" ON "stock_audit_line"("audit_id", "item_id");

-- CreateIndex
CREATE INDEX "vendor_detail_school_id_idx" ON "vendor_detail"("school_id");

-- CreateIndex
CREATE INDEX "purchase_request_school_id_status_idx" ON "purchase_request"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_request_school_id_number_key" ON "purchase_request"("school_id", "number");

-- CreateIndex
CREATE INDEX "purchase_order_school_id_status_idx" ON "purchase_order"("school_id", "status");

-- CreateIndex
CREATE INDEX "purchase_order_school_id_vendor_id_idx" ON "purchase_order"("school_id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_school_id_number_key" ON "purchase_order"("school_id", "number");

-- CreateIndex
CREATE INDEX "goods_receipt_school_id_date_idx" ON "goods_receipt"("school_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_school_id_number_key" ON "goods_receipt"("school_id", "number");

-- CreateIndex
CREATE INDEX "purchase_invoice_school_id_vendor_id_bill_no_idx" ON "purchase_invoice"("school_id", "vendor_id", "bill_no");

-- CreateIndex
CREATE INDEX "asset_school_id_status_idx" ON "asset"("school_id", "status");

-- CreateIndex
CREATE INDEX "asset_school_id_room_id_idx" ON "asset"("school_id", "room_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_school_id_tag_key" ON "asset"("school_id", "tag");

-- CreateIndex
CREATE INDEX "asset_assignment_school_id_asset_id_idx" ON "asset_assignment"("school_id", "asset_id");

-- CreateIndex
CREATE INDEX "asset_maintenance_log_school_id_asset_id_idx" ON "asset_maintenance_log"("school_id", "asset_id");

-- CreateIndex
CREATE INDEX "asset_disposal_school_id_status_idx" ON "asset_disposal"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_item_link_asset_id_item_id_key" ON "asset_item_link"("asset_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_audit_scan_audit_id_code_key" ON "asset_audit_scan"("audit_id", "code");

-- CreateIndex
CREATE INDEX "facility_school_id_idx" ON "facility"("school_id");

-- CreateIndex
CREATE INDEX "maintenance_request_school_id_status_idx" ON "maintenance_request"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_request_school_id_number_key" ON "maintenance_request"("school_id", "number");

-- CreateIndex
CREATE INDEX "lab_experiment_school_id_class_id_idx" ON "lab_experiment"("school_id", "class_id");

-- CreateIndex
CREATE INDEX "lab_safety_check_school_id_room_id_date_idx" ON "lab_safety_check"("school_id", "room_id", "date");

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "item_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_set_item" ADD CONSTRAINT "book_set_item_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "book_set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_issue_line" ADD CONSTRAINT "stock_issue_line_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "stock_issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_audit_line" ADD CONSTRAINT "stock_audit_line_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "stock_audit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_line" ADD CONSTRAINT "purchase_request_line_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "purchase_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "purchase_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "goods_receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice" ADD CONSTRAINT "purchase_invoice_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance_log" ADD CONSTRAINT "asset_maintenance_log_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_disposal" ADD CONSTRAINT "asset_disposal_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_item_link" ADD CONSTRAINT "asset_item_link_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_audit_scan" ADD CONSTRAINT "asset_audit_scan_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "asset_audit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "inventory_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inventory_setting_same_school" ON "inventory_setting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "item_category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_category" FORCE ROW LEVEL SECURITY;
CREATE POLICY "item_category_same_school" ON "item_category" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "store_location" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_location" FORCE ROW LEVEL SECURITY;
CREATE POLICY "store_location_same_school" ON "store_location" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item" FORCE ROW LEVEL SECURITY;
CREATE POLICY "item_same_school" ON "item" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "stock_balance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_balance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stock_balance_same_school" ON "stock_balance" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "stock_batch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_batch" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stock_batch_same_school" ON "stock_batch" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "stock_movement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stock_movement_same_school" ON "stock_movement" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "stock_transfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_transfer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stock_transfer_same_school" ON "stock_transfer" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "book_set" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "book_set" FORCE ROW LEVEL SECURITY;
CREATE POLICY "book_set_same_school" ON "book_set" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "book_set_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "book_set_item" FORCE ROW LEVEL SECURITY;
CREATE POLICY "book_set_item_same_school" ON "book_set_item" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "stock_issue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_issue" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stock_issue_same_school" ON "stock_issue" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "stock_issue_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_issue_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stock_issue_line_same_school" ON "stock_issue_line" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "stock_audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_audit" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stock_audit_same_school" ON "stock_audit" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "stock_audit_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_audit_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stock_audit_line_same_school" ON "stock_audit_line" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "vendor_detail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor_detail" FORCE ROW LEVEL SECURITY;
CREATE POLICY "vendor_detail_same_school" ON "vendor_detail" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "purchase_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY "purchase_request_same_school" ON "purchase_request" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "purchase_request_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_request_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "purchase_request_line_same_school" ON "purchase_request_line" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "purchase_order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_order" FORCE ROW LEVEL SECURITY;
CREATE POLICY "purchase_order_same_school" ON "purchase_order" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "purchase_order_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_order_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "purchase_order_line_same_school" ON "purchase_order_line" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "goods_receipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goods_receipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "goods_receipt_same_school" ON "goods_receipt" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "goods_receipt_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goods_receipt_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "goods_receipt_line_same_school" ON "goods_receipt_line" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "purchase_invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_invoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "purchase_invoice_same_school" ON "purchase_invoice" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset" FORCE ROW LEVEL SECURITY;
CREATE POLICY "asset_same_school" ON "asset" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "asset_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_assignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "asset_assignment_same_school" ON "asset_assignment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "asset_maintenance_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_maintenance_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY "asset_maintenance_log_same_school" ON "asset_maintenance_log" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "asset_disposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_disposal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "asset_disposal_same_school" ON "asset_disposal" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "asset_item_link" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_item_link" FORCE ROW LEVEL SECURITY;
CREATE POLICY "asset_item_link_same_school" ON "asset_item_link" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "asset_audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_audit" FORCE ROW LEVEL SECURITY;
CREATE POLICY "asset_audit_same_school" ON "asset_audit" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "asset_audit_scan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_audit_scan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "asset_audit_scan_same_school" ON "asset_audit_scan" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "facility" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "facility" FORCE ROW LEVEL SECURITY;
CREATE POLICY "facility_same_school" ON "facility" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "maintenance_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY "maintenance_request_same_school" ON "maintenance_request" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "lab_experiment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_experiment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "lab_experiment_same_school" ON "lab_experiment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "lab_safety_check" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_safety_check" FORCE ROW LEVEL SECURITY;
CREATE POLICY "lab_safety_check_same_school" ON "lab_safety_check" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
