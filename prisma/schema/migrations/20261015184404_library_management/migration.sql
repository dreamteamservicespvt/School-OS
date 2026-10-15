-- CreateEnum
CREATE TYPE "BookCopyStatus" AS ENUM ('AVAILABLE', 'ISSUED', 'RESERVED', 'LOST', 'DAMAGED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "LibraryMemberKind" AS ENUM ('STUDENT', 'STAFF');

-- CreateEnum
CREATE TYPE "BookIssueOutcome" AS ENUM ('RETURNED', 'LOST', 'DAMAGED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('WAITING', 'READY', 'COLLECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LibraryFineReason" AS ENUM ('LATE', 'LOST', 'DAMAGED');

-- CreateEnum
CREATE TYPE "LibraryFineStatus" AS ENUM ('DUE', 'PAID', 'WAIVED', 'WAITING', 'NOT_APPROVED');

-- CreateEnum
CREATE TYPE "StockCheckStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "library_setting" (
    "school_id" UUID NOT NULL,
    "student_rules" JSONB NOT NULL DEFAULT '[]',
    "student_books" INTEGER NOT NULL DEFAULT 2,
    "student_loan_days" INTEGER NOT NULL DEFAULT 14,
    "staff_books" INTEGER NOT NULL DEFAULT 5,
    "staff_loan_days" INTEGER NOT NULL DEFAULT 30,
    "move_due_off_holidays" BOOLEAN NOT NULL DEFAULT true,
    "fine_per_day_paise" BIGINT NOT NULL DEFAULT 200,
    "max_fine_paise" BIGINT NOT NULL DEFAULT 10000,
    "grace_days" INTEGER NOT NULL DEFAULT 0,
    "block_fines_above_paise" BIGINT NOT NULL DEFAULT 10000,
    "fines_to_fees" BOOLEAN NOT NULL DEFAULT true,
    "lost_charge" TEXT NOT NULL DEFAULT 'price-plus',
    "lost_extra_paise" BIGINT NOT NULL DEFAULT 5000,
    "approval_above_paise" BIGINT NOT NULL DEFAULT 50000,
    "max_renewals" INTEGER NOT NULL DEFAULT 2,
    "queue_order" TEXT NOT NULL DEFAULT 'fcfs',
    "label_type" TEXT NOT NULL DEFAULT 'barcode',
    "accession_prefix" TEXT NOT NULL DEFAULT '',
    "accession_width" INTEGER NOT NULL DEFAULT 5,
    "remind_due_tomorrow" BOOLEAN NOT NULL DEFAULT true,
    "remind_overdue" BOOLEAN NOT NULL DEFAULT true,
    "remind_reservation" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_setting_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "library_category" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "shelf" TEXT,
    "loan_days" INTEGER,
    "for_loan" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "library_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_author" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "library_author_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_publisher" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "library_publisher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "author_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "author_text" TEXT NOT NULL,
    "publisher_id" UUID,
    "isbn" TEXT,
    "category_id" UUID,
    "subject" TEXT,
    "language" TEXT,
    "edition" TEXT,
    "price_paise" BIGINT,
    "shelf" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_copy" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "accession_no" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "status" "BookCopyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "status_note" TEXT,
    "status_at" TIMESTAMP(3),
    "acquired_on" DATE,
    "label_printed_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_copy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_issue" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "copy_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "member_kind" "LibraryMemberKind" NOT NULL,
    "student_id" UUID,
    "staff_id" UUID,
    "section_id" UUID,
    "issued_on" DATE NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_on" DATE NOT NULL,
    "renewals" INTEGER NOT NULL DEFAULT 0,
    "returned_on" DATE,
    "returned_at" TIMESTAMP(3),
    "outcome" "BookIssueOutcome",
    "late_days" INTEGER,
    "due_changed_reason" TEXT,
    "last_reminded_on" DATE,
    "issued_by_id" UUID,
    "returned_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_member" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "member_kind" "LibraryMemberKind" NOT NULL,
    "student_id" UUID,
    "staff_id" UUID,
    "limit_override" INTEGER,
    "limit_reason" TEXT,
    "blocked_at" TIMESTAMP(3),
    "block_reason" TEXT,
    "blocked_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_reservation" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "member_kind" "LibraryMemberKind" NOT NULL,
    "student_id" UUID,
    "staff_id" UUID,
    "status" "ReservationStatus" NOT NULL DEFAULT 'WAITING',
    "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "copy_id" UUID,
    "ready_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "closed_reason" TEXT,
    "issue_id" UUID,
    "created_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_fine" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fine_no" TEXT NOT NULL,
    "issue_id" UUID,
    "copy_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "member_kind" "LibraryMemberKind" NOT NULL,
    "student_id" UUID,
    "staff_id" UUID,
    "reason" "LibraryFineReason" NOT NULL,
    "late_days" INTEGER,
    "amount_paise" BIGINT NOT NULL,
    "status" "LibraryFineStatus" NOT NULL DEFAULT 'DUE',
    "note" TEXT,
    "fee_due_id" UUID,
    "approval_id" UUID,
    "paid_how" TEXT,
    "paid_at" TIMESTAMP(3),
    "receipt_no" TEXT,
    "income_id" UUID,
    "waived_at" TIMESTAMP(3),
    "waived_by_id" UUID,
    "waive_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_fine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_check_session" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "StockCheckStatus" NOT NULL DEFAULT 'OPEN',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_by_id" UUID,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" UUID,
    "expected" INTEGER,
    "found" INTEGER,
    "missing" INTEGER,
    "extra" INTEGER,
    "missing_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "lost_marked_at" TIMESTAMP(3),

    CONSTRAINT "stock_check_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_check_scan" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "copy_id" UUID,
    "scanned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanned_by_id" UUID,

    CONSTRAINT "stock_check_scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_card_print" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "member_kind" "LibraryMemberKind" NOT NULL,
    "student_id" UUID,
    "staff_id" UUID,
    "academic_year_id" UUID,
    "card_no" TEXT NOT NULL,
    "printed_by_id" UUID,
    "printed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_card_print_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "library_category_school_id_name_key" ON "library_category"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "library_author_school_id_name_key" ON "library_author"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "library_publisher_school_id_name_key" ON "library_publisher"("school_id", "name");

-- CreateIndex
CREATE INDEX "book_school_id_title_idx" ON "book"("school_id", "title");

-- CreateIndex
CREATE INDEX "book_school_id_isbn_idx" ON "book"("school_id", "isbn");

-- CreateIndex
CREATE INDEX "book_school_id_category_id_idx" ON "book"("school_id", "category_id");

-- CreateIndex
CREATE INDEX "book_copy_school_id_book_id_status_idx" ON "book_copy"("school_id", "book_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "book_copy_school_id_accession_no_key" ON "book_copy"("school_id", "accession_no");

-- CreateIndex
CREATE UNIQUE INDEX "book_copy_school_id_barcode_key" ON "book_copy"("school_id", "barcode");

-- CreateIndex
CREATE INDEX "book_issue_school_id_returned_at_due_on_idx" ON "book_issue"("school_id", "returned_at", "due_on");

-- CreateIndex
CREATE INDEX "book_issue_school_id_student_id_idx" ON "book_issue"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "book_issue_school_id_staff_id_idx" ON "book_issue"("school_id", "staff_id");

-- CreateIndex
CREATE INDEX "book_issue_school_id_issued_on_idx" ON "book_issue"("school_id", "issued_on");

-- CreateIndex
CREATE INDEX "book_issue_school_id_book_id_idx" ON "book_issue"("school_id", "book_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_member_school_id_student_id_key" ON "library_member"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_member_school_id_staff_id_key" ON "library_member"("school_id", "staff_id");

-- CreateIndex
CREATE INDEX "library_reservation_school_id_book_id_status_idx" ON "library_reservation"("school_id", "book_id", "status");

-- CreateIndex
CREATE INDEX "library_fine_school_id_status_idx" ON "library_fine"("school_id", "status");

-- CreateIndex
CREATE INDEX "library_fine_school_id_student_id_idx" ON "library_fine"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "library_fine_school_id_staff_id_idx" ON "library_fine"("school_id", "staff_id");

-- CreateIndex
CREATE INDEX "library_fine_school_id_created_at_idx" ON "library_fine"("school_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "library_fine_school_id_fine_no_key" ON "library_fine"("school_id", "fine_no");

-- CreateIndex
CREATE INDEX "stock_check_session_school_id_status_idx" ON "stock_check_session"("school_id", "status");

-- CreateIndex
CREATE INDEX "stock_check_scan_school_id_session_id_idx" ON "stock_check_scan"("school_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_check_scan_session_id_code_key" ON "stock_check_scan"("session_id", "code");

-- CreateIndex
CREATE INDEX "library_card_print_school_id_academic_year_id_idx" ON "library_card_print"("school_id", "academic_year_id");

-- AddForeignKey
ALTER TABLE "book_copy" ADD CONSTRAINT "book_copy_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_issue" ADD CONSTRAINT "book_issue_copy_id_fkey" FOREIGN KEY ("copy_id") REFERENCES "book_copy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_check_scan" ADD CONSTRAINT "stock_check_scan_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "stock_check_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "library_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "library_setting_same_school" ON "library_setting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "library_category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_category" FORCE ROW LEVEL SECURITY;
CREATE POLICY "library_category_same_school" ON "library_category" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "library_author" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_author" FORCE ROW LEVEL SECURITY;
CREATE POLICY "library_author_same_school" ON "library_author" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "library_publisher" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_publisher" FORCE ROW LEVEL SECURITY;
CREATE POLICY "library_publisher_same_school" ON "library_publisher" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "book" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "book" FORCE ROW LEVEL SECURITY;
CREATE POLICY "book_same_school" ON "book" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "book_copy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "book_copy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "book_copy_same_school" ON "book_copy" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "book_issue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "book_issue" FORCE ROW LEVEL SECURITY;
CREATE POLICY "book_issue_same_school" ON "book_issue" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "library_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_member" FORCE ROW LEVEL SECURITY;
CREATE POLICY "library_member_same_school" ON "library_member" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "library_reservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_reservation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "library_reservation_same_school" ON "library_reservation" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "library_fine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_fine" FORCE ROW LEVEL SECURITY;
CREATE POLICY "library_fine_same_school" ON "library_fine" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "stock_check_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_check_session" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stock_check_session_same_school" ON "stock_check_session" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "stock_check_scan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_check_scan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stock_check_scan_same_school" ON "stock_check_scan" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "library_card_print" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_card_print" FORCE ROW LEVEL SECURITY;
CREATE POLICY "library_card_print_same_school" ON "library_card_print" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
