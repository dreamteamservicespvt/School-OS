-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('OPEN', 'CALCULATED', 'WAITING', 'APPROVED', 'PAID', 'LOCKED');

-- CreateEnum
CREATE TYPE "PayslipStatus" AS ENUM ('MADE', 'SENT', 'DOWNLOADED');

-- CreateEnum
CREATE TYPE "SalaryAdvanceStatus" AS ENUM ('WAITING', 'APPROVED', 'ACTIVE', 'CLOSED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "salary_setting" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "pay_day" TEXT NOT NULL DEFAULT 'last-working',
    "lop_days" TEXT NOT NULL DEFAULT 'calendar',
    "late_marks_per_half_day" INTEGER NOT NULL DEFAULT 3,
    "overtime_on" BOOLEAN NOT NULL DEFAULT false,
    "overtime_hour_paise" BIGINT NOT NULL DEFAULT 0,
    "tds_reminder_above_paise" BIGINT NOT NULL DEFAULT 120000000,
    "slip_whatsapp" BOOLEAN NOT NULL DEFAULT true,
    "slip_email" BOOLEAN NOT NULL DEFAULT false,
    "slip_show_employer" BOOLEAN NOT NULL DEFAULT true,
    "slip_show_leave" BOOLEAN NOT NULL DEFAULT false,
    "advances_on" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statutory_setting" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "pf_on" BOOLEAN NOT NULL DEFAULT true,
    "pf_employee_bp" INTEGER NOT NULL DEFAULT 1200,
    "pf_employer_bp" INTEGER NOT NULL DEFAULT 1200,
    "pf_ceiling_paise" BIGINT NOT NULL DEFAULT 1500000,
    "esi_on" BOOLEAN NOT NULL DEFAULT true,
    "esi_employee_bp" INTEGER NOT NULL DEFAULT 75,
    "esi_employer_bp" INTEGER NOT NULL DEFAULT 325,
    "esi_limit_paise" BIGINT NOT NULL DEFAULT 2100000,
    "pt_on" BOOLEAN NOT NULL DEFAULT false,
    "pt_state" TEXT NOT NULL DEFAULT 'Telangana',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "statutory_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_tax_slab" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "state" TEXT NOT NULL,
    "from_paise" BIGINT NOT NULL,
    "to_paise" BIGINT,
    "tax_paise" BIGINT NOT NULL,
    "special_month" INTEGER,
    "special_paise" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "professional_tax_slab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_component" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "calc" TEXT NOT NULL DEFAULT 'FIXED',
    "percent_bp" INTEGER,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "system_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "salary_component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_template" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "salary_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structure" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "lines" JSONB NOT NULL,
    "pf_applies" BOOLEAN NOT NULL DEFAULT true,
    "esi_applies" BOOLEAN NOT NULL DEFAULT true,
    "tds_paise" BIGINT NOT NULL DEFAULT 0,
    "gross_paise" BIGINT NOT NULL,
    "reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "salary_structure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_run" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "number" TEXT NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'OPEN',
    "staff_count" INTEGER NOT NULL DEFAULT 0,
    "gross_paise" BIGINT NOT NULL DEFAULT 0,
    "deductions_paise" BIGINT NOT NULL DEFAULT 0,
    "net_paise" BIGINT NOT NULL DEFAULT 0,
    "employer_pf_paise" BIGINT NOT NULL DEFAULT 0,
    "employer_esi_paise" BIGINT NOT NULL DEFAULT 0,
    "statutory_id" UUID,
    "calculated_at" TIMESTAMP(3),
    "sent_by_id" UUID,
    "sent_at" TIMESTAMP(3),
    "approval_id" UUID,
    "sent_back_reason" TEXT,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "paid_on" DATE,
    "pay_mode" TEXT,
    "pay_reference" TEXT,
    "pay_account_id" UUID,
    "paid_by_id" UUID,
    "reversals" JSONB NOT NULL DEFAULT '[]',
    "locked_at" TIMESTAMP(3),
    "locked_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_line" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "structure_id" UUID,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "days_in_month" INTEGER NOT NULL,
    "paid_days" DECIMAL(5,1) NOT NULL,
    "working_days" INTEGER NOT NULL DEFAULT 0,
    "present_days" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "leave_days" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "unpaid_leave_days" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "absent_days" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "late_marks" INTEGER NOT NULL DEFAULT 0,
    "not_marked_days" INTEGER NOT NULL DEFAULT 0,
    "lop_days" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "earnings" JSONB NOT NULL DEFAULT '[]',
    "other_deductions" JSONB NOT NULL DEFAULT '[]',
    "full_gross_paise" BIGINT NOT NULL DEFAULT 0,
    "lop_paise" BIGINT NOT NULL DEFAULT 0,
    "overtime_paise" BIGINT NOT NULL DEFAULT 0,
    "add_paise" BIGINT NOT NULL DEFAULT 0,
    "cut_paise" BIGINT NOT NULL DEFAULT 0,
    "gross_paise" BIGINT NOT NULL DEFAULT 0,
    "basic_earned_paise" BIGINT NOT NULL DEFAULT 0,
    "pf_wage_paise" BIGINT NOT NULL DEFAULT 0,
    "pf_paise" BIGINT NOT NULL DEFAULT 0,
    "esi_applies" BOOLEAN NOT NULL DEFAULT false,
    "esi_wage_paise" BIGINT NOT NULL DEFAULT 0,
    "esi_paise" BIGINT NOT NULL DEFAULT 0,
    "pt_paise" BIGINT NOT NULL DEFAULT 0,
    "tds_paise" BIGINT NOT NULL DEFAULT 0,
    "recovery_paise" BIGINT NOT NULL DEFAULT 0,
    "recoveries" JSONB NOT NULL DEFAULT '[]',
    "deductions_paise" BIGINT NOT NULL DEFAULT 0,
    "net_paise" BIGINT NOT NULL DEFAULT 0,
    "er_pf_paise" BIGINT NOT NULL DEFAULT 0,
    "er_esi_paise" BIGINT NOT NULL DEFAULT 0,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),
    "archived_by_id" UUID,

    CONSTRAINT "payroll_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "net_paise" BIGINT NOT NULL,
    "status" "PayslipStatus" NOT NULL DEFAULT 'MADE',
    "sent_via" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sent_at" TIMESTAMP(3),
    "downloaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_advance" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "staff_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "installment_paise" BIGINT NOT NULL,
    "start_month" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SalaryAdvanceStatus" NOT NULL DEFAULT 'WAITING',
    "approval_id" UUID,
    "decided_reason" TEXT,
    "paid_on" DATE,
    "pay_mode" TEXT,
    "pay_reference" TEXT,
    "pay_account_id" UUID,
    "recovered_paise" BIGINT NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "history" JSONB NOT NULL DEFAULT '[]',
    "closed_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_advance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_recovery" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "advance_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "run_id" UUID,
    "date" DATE NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_recovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statutory_statement" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "staff_count" INTEGER NOT NULL,
    "wages_paise" BIGINT NOT NULL,
    "employee_paise" BIGINT NOT NULL,
    "employer_paise" BIGINT NOT NULL,
    "lines" JSONB NOT NULL,
    "made_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statutory_statement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salary_setting_school_id_key" ON "salary_setting"("school_id");

-- CreateIndex
CREATE INDEX "statutory_setting_school_id_valid_from_idx" ON "statutory_setting"("school_id", "valid_from");

-- CreateIndex
CREATE INDEX "professional_tax_slab_school_id_state_idx" ON "professional_tax_slab"("school_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "salary_component_school_id_name_key" ON "salary_component"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "salary_template_school_id_name_key" ON "salary_template"("school_id", "name");

-- CreateIndex
CREATE INDEX "salary_structure_school_id_staff_id_effective_from_idx" ON "salary_structure"("school_id", "staff_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structure_school_id_staff_id_version_key" ON "salary_structure"("school_id", "staff_id", "version");

-- CreateIndex
CREATE INDEX "payroll_run_school_id_month_idx" ON "payroll_run"("school_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_run_school_id_campus_id_month_key" ON "payroll_run"("school_id", "campus_id", "month");

-- CreateIndex
CREATE INDEX "payroll_line_school_id_staff_id_idx" ON "payroll_line"("school_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_line_run_id_staff_id_key" ON "payroll_line"("run_id", "staff_id");

-- CreateIndex
CREATE INDEX "payroll_adjustment_school_id_run_id_idx" ON "payroll_adjustment"("school_id", "run_id");

-- CreateIndex
CREATE UNIQUE INDEX "payslip_line_id_key" ON "payslip"("line_id");

-- CreateIndex
CREATE INDEX "payslip_school_id_staff_id_month_idx" ON "payslip"("school_id", "staff_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payslip_run_id_staff_id_key" ON "payslip"("run_id", "staff_id");

-- CreateIndex
CREATE INDEX "salary_advance_school_id_staff_id_idx" ON "salary_advance"("school_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "salary_advance_school_id_number_key" ON "salary_advance"("school_id", "number");

-- CreateIndex
CREATE INDEX "salary_recovery_school_id_advance_id_idx" ON "salary_recovery"("school_id", "advance_id");

-- CreateIndex
CREATE UNIQUE INDEX "salary_recovery_advance_id_run_id_key" ON "salary_recovery"("advance_id", "run_id");

-- CreateIndex
CREATE INDEX "statutory_statement_school_id_run_id_idx" ON "statutory_statement"("school_id", "run_id");

-- AddForeignKey
ALTER TABLE "payroll_line" ADD CONSTRAINT "payroll_line_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustment" ADD CONSTRAINT "payroll_adjustment_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_recovery" ADD CONSTRAINT "salary_recovery_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "salary_advance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Each school's data stays its own (08-platform-security.md §1).
ALTER TABLE "salary_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "salary_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "salary_setting_same_school" ON "salary_setting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "statutory_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "statutory_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "statutory_setting_same_school" ON "statutory_setting" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "professional_tax_slab" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "professional_tax_slab" FORCE ROW LEVEL SECURITY;
CREATE POLICY "professional_tax_slab_same_school" ON "professional_tax_slab" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "salary_component" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "salary_component" FORCE ROW LEVEL SECURITY;
CREATE POLICY "salary_component_same_school" ON "salary_component" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "salary_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "salary_template" FORCE ROW LEVEL SECURITY;
CREATE POLICY "salary_template_same_school" ON "salary_template" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "salary_structure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "salary_structure" FORCE ROW LEVEL SECURITY;
CREATE POLICY "salary_structure_same_school" ON "salary_structure" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "payroll_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_run" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payroll_run_same_school" ON "payroll_run" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "payroll_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payroll_line_same_school" ON "payroll_line" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "payroll_adjustment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_adjustment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payroll_adjustment_same_school" ON "payroll_adjustment" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "payslip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payslip" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payslip_same_school" ON "payslip" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "salary_advance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "salary_advance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "salary_advance_same_school" ON "salary_advance" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "salary_recovery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "salary_recovery" FORCE ROW LEVEL SECURITY;
CREATE POLICY "salary_recovery_same_school" ON "salary_recovery" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
ALTER TABLE "statutory_statement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "statutory_statement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "statutory_statement_same_school" ON "statutory_statement" USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
