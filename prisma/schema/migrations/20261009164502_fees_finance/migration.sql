-- CreateEnum
CREATE TYPE "FeeFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'TERM', 'YEARLY', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "FeeStructureStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "FeeDueKind" AS ENUM ('FEE', 'LATE_FEE', 'OLD_DUES', 'CHARGE');

-- CreateEnum
CREATE TYPE "FeeDueState" AS ENUM ('OPEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "ConcessionType" AS ENUM ('DISCOUNT', 'SCHOLARSHIP', 'SIBLING', 'STAFF_CHILD', 'BULK_DISCOUNT', 'LATE_FEE_WAIVER');

-- CreateEnum
CREATE TYPE "ConcessionStatus" AS ENUM ('WAITING', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'CARD', 'NET_BANKING', 'BANK_TRANSFER', 'CHEQUE', 'GATEWAY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('POSTED', 'WAITING', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('COUNTER', 'LINK', 'PARENT_LINK', 'IMPORT');

-- CreateEnum
CREATE TYPE "PaymentLinkStatus" AS ENUM ('SENT', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('WAITING', 'APPROVED', 'REJECTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OpeningBalanceKind" AS ENUM ('STUDENT_DUES', 'CASH', 'BANK');

-- CreateEnum
CREATE TYPE "DayBookDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "IncomeStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'WAITING', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MoneyAccountKind" AS ENUM ('CASH', 'BANK');

-- CreateTable
CREATE TABLE "fee_setting" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "receipt_prefix" TEXT NOT NULL,
    "receipt_digits" INTEGER NOT NULL DEFAULT 5,
    "restart_each_year" BOOLEAN NOT NULL DEFAULT true,
    "partial_series" BOOLEAN NOT NULL DEFAULT false,
    "partial_prefix" TEXT NOT NULL DEFAULT 'PP/',
    "tax_invoice_prefix" TEXT NOT NULL DEFAULT 'TI/',
    "invoice_prefix" TEXT NOT NULL DEFAULT 'INV/',
    "certificate_prefix" TEXT NOT NULL DEFAULT 'FC/',
    "receipt_terms" TEXT,
    "print_copies" TEXT NOT NULL DEFAULT 'both',
    "late_fee_on" BOOLEAN NOT NULL DEFAULT false,
    "late_fee_type" TEXT NOT NULL DEFAULT 'flat',
    "late_fee_paise" BIGINT NOT NULL DEFAULT 0,
    "late_fee_percent_bp" INTEGER NOT NULL DEFAULT 0,
    "grace_days" INTEGER NOT NULL DEFAULT 7,
    "late_fee_max_paise" BIGINT,
    "late_fee_head_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reminders_on" BOOLEAN NOT NULL DEFAULT false,
    "reminder_days" INTEGER[] DEFAULT ARRAY[-3, 0, 7]::INTEGER[],
    "reminder_channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "reminder_template" TEXT NOT NULL,
    "ageing_groups" JSONB NOT NULL,
    "verify_modes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "concession_limit_paise" BIGINT NOT NULL DEFAULT 100000,
    "cancel_past_approval" BOOLEAN NOT NULL DEFAULT true,
    "gateway_routing" JSONB NOT NULL DEFAULT '{}',
    "counter_permissions" JSONB NOT NULL DEFAULT '{}',
    "scholarship_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_head" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "gst_rate_bp" INTEGER,
    "sac_code" TEXT,
    "bank_account_id" UUID,
    "late_fee_applies" BOOLEAN NOT NULL DEFAULT true,
    "system_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "fee_head_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structure" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "FeeStructureStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" DATE,
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "fee_structure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structure_item" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "structure_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "frequency" "FeeFrequency" NOT NULL DEFAULT 'MONTHLY',
    "total_paise" BIGINT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "fee_structure_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "structure_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "due_date" DATE NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_fee_due" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "installment_id" UUID,
    "structure_id" UUID,
    "fee_head_id" UUID NOT NULL,
    "kind" "FeeDueKind" NOT NULL DEFAULT 'FEE',
    "label" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "concession_paise" BIGINT NOT NULL DEFAULT 0,
    "adjustment_paise" BIGINT NOT NULL DEFAULT 0,
    "paid_paise" BIGINT NOT NULL DEFAULT 0,
    "balance_paise" BIGINT NOT NULL,
    "state" "FeeDueState" NOT NULL DEFAULT 'OPEN',
    "parent_due_id" UUID,
    "brought_in" BOOLEAN NOT NULL DEFAULT false,
    "opening_balance_id" UUID,
    "exception_reason" TEXT,
    "removed_reason" TEXT,
    "removed_by_id" UUID,
    "removed_at" TIMESTAMP(3),
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_fee_due_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_adjustment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "due_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concession" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "type" "ConcessionType" NOT NULL DEFAULT 'DISCOUNT',
    "mode" TEXT NOT NULL DEFAULT 'amount',
    "amount_paise" BIGINT NOT NULL DEFAULT 0,
    "percent_bp" INTEGER NOT NULL DEFAULT 0,
    "fee_head_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "due_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "period_from" DATE,
    "period_to" DATE,
    "reason" TEXT NOT NULL,
    "scholarship_type" TEXT,
    "document_file_id" UUID,
    "status" "ConcessionStatus" NOT NULL DEFAULT 'WAITING',
    "estimated_paise" BIGINT NOT NULL DEFAULT 0,
    "applied_paise" BIGINT NOT NULL DEFAULT 0,
    "approval_id" UUID,
    "decided_by_id" UUID,
    "decision_note" TEXT,
    "bulk_rule_id" UUID,
    "payment_id" UUID,
    "requested_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "concession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concession_line" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "concession_id" UUID NOT NULL,
    "due_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concession_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_discount_rule" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "min_installments" INTEGER NOT NULL,
    "percent_bp" INTEGER NOT NULL,
    "fee_head_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "bulk_discount_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "amount_paise" BIGINT NOT NULL,
    "late_fee_paise" BIGINT NOT NULL DEFAULT 0,
    "advance_paise" BIGINT NOT NULL DEFAULT 0,
    "discount_paise" BIGINT NOT NULL DEFAULT 0,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "cheque_no" TEXT,
    "cheque_bank" TEXT,
    "cheque_date" DATE,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "payment_date" DATE NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'POSTED',
    "source" "PaymentSource" NOT NULL DEFAULT 'COUNTER',
    "is_partial" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "collected_by_id" UUID,
    "cancel_reason" TEXT,
    "cancel_note" TEXT,
    "cancelled_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancel_approval_id" UUID,
    "verify_approval_id" UUID,
    "reject_reason" TEXT,
    "brought_in" BOOLEAN NOT NULL DEFAULT false,
    "old_receipt_no" TEXT,
    "import_batch_id" UUID,
    "gateway_account_id" UUID,
    "gateway_payment_id" TEXT,
    "gateway_order_id" TEXT,
    "payment_link_id" UUID,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocation" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "due_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "bank_account_id" UUID,
    "from_advance" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'valid',
    "brought_in" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_invoice" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "gstin" TEXT NOT NULL,
    "place_of_supply" TEXT,
    "lines" JSONB NOT NULL,
    "taxable_paise" BIGINT NOT NULL,
    "tax_paise" BIGINT NOT NULL,
    "total_paise" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'valid',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'WAITING',
    "approval_id" UUID,
    "decision_note" TEXT,
    "refunded_on" DATE,
    "reference" TEXT,
    "account_id" UUID,
    "advance_used_paise" BIGINT NOT NULL DEFAULT 0,
    "refunded_by_id" UUID,
    "requested_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_link" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID,
    "due_ids" TEXT[],
    "amount_paise" BIGINT NOT NULL,
    "gateway_account_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "gateway_order_id" TEXT,
    "status" "PaymentLinkStatus" NOT NULL DEFAULT 'SENT',
    "source" "PaymentSource" NOT NULL DEFAULT 'LINK',
    "channel" TEXT,
    "sent_to" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "payment_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_transaction" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "gateway_account_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "gateway_payment_id" TEXT,
    "gateway_order_id" TEXT,
    "amount_paise" BIGINT,
    "outcome" TEXT NOT NULL,
    "payment_id" UUID,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balance" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" "OpeningBalanceKind" NOT NULL,
    "financial_year_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "student_id" UUID,
    "account_id" UUID,
    "amount_paise" BIGINT NOT NULL,
    "note" TEXT,
    "source_file" TEXT,
    "import_batch_id" UUID,
    "approval_id" UUID,
    "pending_paise" BIGINT,
    "brought_in_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "opening_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_reminder" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "due_id" UUID,
    "once_key" TEXT,
    "channel" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "phone" TEXT,
    "amount_paise" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "sent_by_id" UUID,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_call_note" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "promised_on" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_call_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_document" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "student_id" UUID NOT NULL,
    "total_paise" BIGINT NOT NULL,
    "details" JSONB NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_setting" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fy_start_month" INTEGER NOT NULL DEFAULT 4,
    "expense_approve_up_to" BIGINT NOT NULL DEFAULT 500000,
    "bill_required_above" BIGINT NOT NULL DEFAULT 200000,
    "income_receipt_prefix" TEXT NOT NULL DEFAULT 'INC/',
    "journal_prefix" TEXT NOT NULL DEFAULT 'JV/',
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_head" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "tally_ledger" TEXT,
    "system_key" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "account_head_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centre" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "cost_centre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_account" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" "MoneyAccountKind" NOT NULL,
    "name" TEXT NOT NULL,
    "bank_name" TEXT,
    "account_no_enc" TEXT,
    "account_last4" TEXT,
    "ifsc" TEXT,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "campus_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "bank_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_book_entry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "financial_year_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "direction" "DayBookDirection" NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "penalty_paise" BIGINT NOT NULL DEFAULT 0,
    "mode" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "head_name" TEXT NOT NULL,
    "fee_head_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "account_head_id" UUID,
    "account_id" UUID,
    "deposit_account_id" UUID,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "student_id" UUID,
    "class_id" UUID,
    "section_id" UUID,
    "staff_id" UUID,
    "vendor_id" UUID,
    "cost_centre_id" UUID,
    "party_name" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "reverses_entry_id" UUID,
    "created_by_id" UUID,

    CONSTRAINT "day_book_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "financial_year_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "account_head_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "received_from" TEXT NOT NULL,
    "vendor_id" UUID,
    "mode" TEXT NOT NULL,
    "reference" TEXT,
    "account_id" UUID NOT NULL,
    "note" TEXT,
    "status" "IncomeStatus" NOT NULL DEFAULT 'DRAFT',
    "receipt_no" TEXT,
    "posted_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "gstin" TEXT,
    "address" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "financial_year_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "account_head_id" UUID NOT NULL,
    "vendor_id" UUID,
    "cost_centre_id" UUID,
    "amount_paise" BIGINT NOT NULL,
    "paid_paise" BIGINT NOT NULL DEFAULT 0,
    "bill_file_id" UUID,
    "is_vendor_bill" BOOLEAN NOT NULL DEFAULT false,
    "bill_no" TEXT,
    "bill_due_date" DATE,
    "note" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "approval_id" UUID,
    "reject_reason" TEXT,
    "duplicate_reason" TEXT,
    "brought_in" BOOLEAN NOT NULL DEFAULT false,
    "import_batch_id" UUID,
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "requested_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_payment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "mode" TEXT NOT NULL,
    "reference" TEXT,
    "account_id" UUID NOT NULL,
    "paid_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "expense_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "financial_year_id" UUID NOT NULL,
    "account_head_id" UUID NOT NULL,
    "cost_centre_id" UUID,
    "period" TEXT NOT NULL DEFAULT 'year',
    "amount_paise" BIGINT NOT NULL,
    "original_paise" BIGINT NOT NULL,
    "split" JSONB NOT NULL DEFAULT '[]',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_revision" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "from_paise" BIGINT NOT NULL,
    "to_paise" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transfer" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "financial_year_id" UUID NOT NULL,
    "from_account_id" UUID NOT NULL,
    "to_account_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "reference" TEXT,
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "financial_year_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "narration" TEXT NOT NULL,
    "campus_id" UUID,
    "reverses_id" UUID,
    "reversed_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_line" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "account_head_id" UUID,
    "bank_account_id" UUID,
    "debit_paise" BIGINT NOT NULL DEFAULT 0,
    "credit_paise" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "journal_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_close" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "financial_year_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "closed_by_id" UUID,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_close_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fee_setting_school_id_key" ON "fee_setting"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_head_school_id_name_key" ON "fee_head"("school_id", "name");

-- CreateIndex
CREATE INDEX "fee_structure_school_id_academic_year_id_status_idx" ON "fee_structure"("school_id", "academic_year_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structure_school_id_academic_year_id_class_id_category__key" ON "fee_structure"("school_id", "academic_year_id", "class_id", "category", "version");

-- CreateIndex
CREATE INDEX "fee_structure_item_school_id_structure_id_idx" ON "fee_structure_item"("school_id", "structure_id");

-- CreateIndex
CREATE INDEX "installment_school_id_structure_id_idx" ON "installment"("school_id", "structure_id");

-- CreateIndex
CREATE INDEX "student_fee_due_school_id_student_id_state_idx" ON "student_fee_due"("school_id", "student_id", "state");

-- CreateIndex
CREATE INDEX "student_fee_due_school_id_state_due_date_idx" ON "student_fee_due"("school_id", "state", "due_date");

-- CreateIndex
CREATE INDEX "student_fee_due_school_id_parent_due_id_idx" ON "student_fee_due"("school_id", "parent_due_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_due_student_id_installment_id_key" ON "student_fee_due"("student_id", "installment_id");

-- CreateIndex
CREATE INDEX "fee_adjustment_school_id_student_id_idx" ON "fee_adjustment"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "concession_school_id_student_id_idx" ON "concession"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "concession_school_id_status_idx" ON "concession"("school_id", "status");

-- CreateIndex
CREATE INDEX "concession_line_school_id_due_id_idx" ON "concession_line"("school_id", "due_id");

-- CreateIndex
CREATE INDEX "payment_school_id_student_id_idx" ON "payment"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "payment_school_id_payment_date_idx" ON "payment"("school_id", "payment_date");

-- CreateIndex
CREATE INDEX "payment_school_id_status_idx" ON "payment"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_school_id_gateway_payment_id_key" ON "payment"("school_id", "gateway_payment_id");

-- CreateIndex
CREATE INDEX "payment_allocation_school_id_due_id_idx" ON "payment_allocation"("school_id", "due_id");

-- CreateIndex
CREATE INDEX "payment_allocation_school_id_payment_id_idx" ON "payment_allocation"("school_id", "payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_payment_id_key" ON "receipt"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_school_id_number_key" ON "receipt"("school_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "tax_invoice_payment_id_key" ON "tax_invoice"("payment_id");

-- CreateIndex
CREATE INDEX "tax_invoice_school_id_date_idx" ON "tax_invoice"("school_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "tax_invoice_school_id_number_key" ON "tax_invoice"("school_id", "number");

-- CreateIndex
CREATE INDEX "refund_school_id_payment_id_idx" ON "refund"("school_id", "payment_id");

-- CreateIndex
CREATE INDEX "refund_school_id_status_idx" ON "refund"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_link_token_hash_key" ON "payment_link"("token_hash");

-- CreateIndex
CREATE INDEX "payment_link_school_id_student_id_idx" ON "payment_link"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "payment_link_school_id_status_idx" ON "payment_link"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_link_school_id_gateway_order_id_key" ON "payment_link"("school_id", "gateway_order_id");

-- CreateIndex
CREATE INDEX "gateway_transaction_school_id_gateway_payment_id_idx" ON "gateway_transaction"("school_id", "gateway_payment_id");

-- CreateIndex
CREATE INDEX "gateway_transaction_school_id_received_at_idx" ON "gateway_transaction"("school_id", "received_at");

-- CreateIndex
CREATE INDEX "opening_balance_school_id_kind_idx" ON "opening_balance"("school_id", "kind");

-- CreateIndex
CREATE INDEX "fee_reminder_school_id_student_id_idx" ON "fee_reminder"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_reminder_school_id_once_key_key" ON "fee_reminder"("school_id", "once_key");

-- CreateIndex
CREATE INDEX "fee_call_note_school_id_student_id_idx" ON "fee_call_note"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "fee_document_school_id_student_id_idx" ON "fee_document"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_document_school_id_kind_number_key" ON "fee_document"("school_id", "kind", "number");

-- CreateIndex
CREATE UNIQUE INDEX "finance_setting_school_id_key" ON "finance_setting"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_head_school_id_code_key" ON "account_head"("school_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centre_school_id_name_key" ON "cost_centre"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "bank_account_school_id_name_key" ON "bank_account"("school_id", "name");

-- CreateIndex
CREATE INDEX "day_book_entry_school_id_financial_year_id_date_idx" ON "day_book_entry"("school_id", "financial_year_id", "date");

-- CreateIndex
CREATE INDEX "day_book_entry_school_id_account_id_date_idx" ON "day_book_entry"("school_id", "account_id", "date");

-- CreateIndex
CREATE INDEX "day_book_entry_school_id_source_type_source_id_idx" ON "day_book_entry"("school_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "day_book_entry_school_id_source_key_key" ON "day_book_entry"("school_id", "source_key");

-- CreateIndex
CREATE INDEX "income_school_id_date_idx" ON "income"("school_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "income_school_id_receipt_no_key" ON "income"("school_id", "receipt_no");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_school_id_name_key" ON "vendor"("school_id", "name");

-- CreateIndex
CREATE INDEX "expense_school_id_status_idx" ON "expense"("school_id", "status");

-- CreateIndex
CREATE INDEX "expense_school_id_date_idx" ON "expense"("school_id", "date");

-- CreateIndex
CREATE INDEX "expense_school_id_vendor_id_bill_no_idx" ON "expense"("school_id", "vendor_id", "bill_no");

-- CreateIndex
CREATE UNIQUE INDEX "expense_school_id_number_key" ON "expense"("school_id", "number");

-- CreateIndex
CREATE INDEX "expense_payment_school_id_expense_id_idx" ON "expense_payment"("school_id", "expense_id");

-- CreateIndex
CREATE INDEX "budget_school_id_financial_year_id_idx" ON "budget"("school_id", "financial_year_id");

-- CreateIndex
CREATE INDEX "cash_transfer_school_id_date_idx" ON "cash_transfer"("school_id", "date");

-- CreateIndex
CREATE INDEX "journal_entry_school_id_date_idx" ON "journal_entry"("school_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entry_school_id_number_key" ON "journal_entry"("school_id", "number");

-- CreateIndex
CREATE INDEX "journal_line_school_id_account_head_id_idx" ON "journal_line"("school_id", "account_head_id");

-- CreateIndex
CREATE UNIQUE INDEX "period_close_school_id_month_key" ON "period_close"("school_id", "month");

-- AddForeignKey
ALTER TABLE "fee_structure_item" ADD CONSTRAINT "fee_structure_item_structure_id_fkey" FOREIGN KEY ("structure_id") REFERENCES "fee_structure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment" ADD CONSTRAINT "installment_structure_id_fkey" FOREIGN KEY ("structure_id") REFERENCES "fee_structure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment" ADD CONSTRAINT "installment_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "fee_structure_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concession_line" ADD CONSTRAINT "concession_line_concession_id_fkey" FOREIGN KEY ("concession_id") REFERENCES "concession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_payment" ADD CONSTRAINT "expense_payment_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_revision" ADD CONSTRAINT "budget_revision_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "fee_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fee_setting_same_school" ON "fee_setting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "fee_head" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_head" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fee_head_same_school" ON "fee_head" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "fee_structure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_structure" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fee_structure_same_school" ON "fee_structure" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "fee_structure_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_structure_item" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fee_structure_item_same_school" ON "fee_structure_item" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "installment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "installment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "installment_same_school" ON "installment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "student_fee_due" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_fee_due" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_fee_due_same_school" ON "student_fee_due" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "fee_adjustment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_adjustment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fee_adjustment_same_school" ON "fee_adjustment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "concession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "concession" FORCE ROW LEVEL SECURITY;
CREATE POLICY "concession_same_school" ON "concession" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "concession_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "concession_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "concession_line_same_school" ON "concession_line" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "bulk_discount_rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bulk_discount_rule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "bulk_discount_rule_same_school" ON "bulk_discount_rule" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_same_school" ON "payment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "payment_allocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_allocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_allocation_same_school" ON "payment_allocation" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "receipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "receipt_same_school" ON "receipt" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "tax_invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_invoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tax_invoice_same_school" ON "tax_invoice" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "refund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refund" FORCE ROW LEVEL SECURITY;
CREATE POLICY "refund_same_school" ON "refund" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "payment_link" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_link" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_link_same_school" ON "payment_link" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "gateway_transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gateway_transaction" FORCE ROW LEVEL SECURITY;
CREATE POLICY "gateway_transaction_same_school" ON "gateway_transaction" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "opening_balance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "opening_balance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "opening_balance_same_school" ON "opening_balance" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "fee_reminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_reminder" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fee_reminder_same_school" ON "fee_reminder" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "fee_call_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_call_note" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fee_call_note_same_school" ON "fee_call_note" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "fee_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_document" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fee_document_same_school" ON "fee_document" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "finance_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "finance_setting_same_school" ON "finance_setting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "account_head" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_head" FORCE ROW LEVEL SECURITY;
CREATE POLICY "account_head_same_school" ON "account_head" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "cost_centre" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_centre" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cost_centre_same_school" ON "cost_centre" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "bank_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_account" FORCE ROW LEVEL SECURITY;
CREATE POLICY "bank_account_same_school" ON "bank_account" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "day_book_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "day_book_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "day_book_entry_same_school" ON "day_book_entry" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "income" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "income" FORCE ROW LEVEL SECURITY;
CREATE POLICY "income_same_school" ON "income" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "vendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor" FORCE ROW LEVEL SECURITY;
CREATE POLICY "vendor_same_school" ON "vendor" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expense" FORCE ROW LEVEL SECURITY;
CREATE POLICY "expense_same_school" ON "expense" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "expense_payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expense_payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "expense_payment_same_school" ON "expense_payment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "budget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "budget" FORCE ROW LEVEL SECURITY;
CREATE POLICY "budget_same_school" ON "budget" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "budget_revision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "budget_revision" FORCE ROW LEVEL SECURITY;
CREATE POLICY "budget_revision_same_school" ON "budget_revision" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "cash_transfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_transfer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cash_transfer_same_school" ON "cash_transfer" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "journal_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "journal_entry_same_school" ON "journal_entry" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "journal_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "journal_line_same_school" ON "journal_line" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "period_close" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "period_close" FORCE ROW LEVEL SECURITY;
CREATE POLICY "period_close_same_school" ON "period_close" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());

-- Day Book Entries are made only by the software and never changed: a wrong
-- entry is corrected at its source, which posts a reversing entry (07 §5).
CREATE FUNCTION day_book_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Day Book entries cannot be changed or deleted. Correct the source record, which posts a reversal.';
END $$;
CREATE TRIGGER day_book_no_update_or_delete
  BEFORE UPDATE OR DELETE ON "day_book_entry"
  FOR EACH ROW EXECUTE FUNCTION day_book_is_append_only();
REVOKE UPDATE ON "day_book_entry" FROM school_os_app;

-- Payments are never edited (04-data-model.md rule 6): the money, the
-- student, the mode and the date can never change once saved. Only the
-- status moves on (posted, cancelled) with who and why.
CREATE FUNCTION payment_money_is_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount_paise <> OLD.amount_paise OR NEW.student_id <> OLD.student_id OR NEW.mode <> OLD.mode
     OR NEW.payment_date <> OLD.payment_date OR NEW.brought_in <> OLD.brought_in
     OR NEW.late_fee_paise <> OLD.late_fee_paise OR NEW.discount_paise <> OLD.discount_paise THEN
    RAISE EXCEPTION 'A payment cannot be edited. Cancel it with a reason and collect again.';
  END IF;
  IF OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED' THEN
    RAISE EXCEPTION 'A cancelled payment stays cancelled.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_no_money_change
  BEFORE UPDATE ON "payment"
  FOR EACH ROW EXECUTE FUNCTION payment_money_is_fixed();

-- A receipt number, once given, is never changed.
CREATE FUNCTION receipt_number_is_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.number <> OLD.number OR NEW.payment_id <> OLD.payment_id THEN
    RAISE EXCEPTION 'A receipt number is never changed or reused.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER receipt_no_number_change
  BEFORE UPDATE ON "receipt"
  FOR EACH ROW EXECUTE FUNCTION receipt_number_is_fixed();
