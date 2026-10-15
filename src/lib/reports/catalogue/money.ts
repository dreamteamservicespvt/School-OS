// Money reports (19 §2): every Fee Report, every Finance Report and the
// Salary reports, including the GST report and the monthly PF and ESI
// statements (decided 9 October 2026). Each runs the module's own report
// function with the module's own access rule, so the totals here are the
// totals there. They are filtered by financial year (Finance Settings).
import "server-only";

import { FEE_REPORTS, type ReportDef, type ReportFilter } from "../../fees/reports";
import { feeViewer } from "../../fees/access";
import { PAYMENT_MODES } from "../../fees/words";
import { FINANCE_REPORTS, type FinanceFilter, type FinanceReportDef } from "../../finance/reports";
import { hiddenPayHeads } from "../../finance/access";
import { SALARY_REPORTS, buildSalaryReport, runsIn, type SalaryReportKey } from "../../salary/reports";
import { statementRows } from "../../salary/statements";
import { monthName } from "../../salary/words";
import type { ReportEntry, ReportOption, RunCtx, Table } from "../types";
import { fromExport, fromMoney, ZERO } from "./util";

/** How a Fee Report shows in the catalogue: the prototype's names where it drew one, else the Fee Reports list. */
const FEE_LOOK: Record<string, { key: string; name: string; sub: string }> = {
  "by-class": { key: "fe-collection", name: "Fee collection", sub: "Due and collected, class by class" },
  defaulters: { key: "fe-defaulter", name: "Fee defaulters", sub: "Who has overdue fees, how much and for how long" },
  modes: { key: "fe-modes", name: "Payments by mode", sub: "UPI, online, cash, cheque and others" },
  concessions: { key: "fe-concession", name: "Concessions and scholarships", sub: "How much was taken off fees, and why" },
  gst: { key: "fe-gst", name: "GST report", sub: "Taxable fee heads, tax invoices and GST by rate and month" },
  collection: { key: "fe-collection-period", name: "Collection by period", sub: "Money collected by day, month or year, with mode and collector" },
  "collection-details": { key: "fe-receipts", name: "Collection details", sub: "Every payment, receipt by receipt" },
  online: { key: "fe-online", name: "Online payments", sub: "Successful, failed and not matched" },
  outstanding: { key: "fe-outstanding", name: "Outstanding fees", sub: "What each student still has to pay, with the ageing groups" },
  penalty: { key: "fe-penalty", name: "Late fees", sub: "Late fees added, waived and collected" },
  refunds: { key: "fe-refunds", name: "Refunds", sub: "Asked, approved and paid back" },
  cancelled: { key: "fe-cancelled", name: "Cancelled payments", sub: "Who cancelled, when and why" },
  audit: { key: "fe-audit", name: "Fee audit", sub: "Installment-wise breakdown of every receipt" },
  tax: { key: "fe-tax", name: "Tax summary", sub: "Taxable value and GST by period" },
};
const FEE_ORDER = ["by-class", "defaulters", "outstanding", "collection", "collection-details", "modes", "online", "concessions", "penalty", "refunds", "cancelled", "audit", "tax", "gst"];

async function feeOptions(rc: Pick<RunCtx, "tx">, def: ReportDef, extra: Record<string, string>): Promise<ReportOption[]> {
  const out: ReportOption[] = [];
  if (def.filters.includes("group")) out.push({ param: "group", label: "Group by", value: extra.group ?? "month", options: [{ value: "day", label: "Daily" }, { value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }] });
  if (def.filters.includes("head")) {
    const heads = await rc.tx.feeHead.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
    out.push({ param: "head", label: "Fee head", value: extra.head ?? "", options: [{ value: "", label: "All fee heads" }, ...heads.map((h) => ({ value: h.id, label: h.name }))] });
  }
  if (def.filters.includes("mode")) out.push({ param: "mode", label: "Mode", value: extra.mode ?? "", options: [{ value: "", label: "All modes" }, ...PAYMENT_MODES.map((m) => ({ value: m.value, label: m.label }))] });
  return out;
}

function feeEntry(def: ReportDef): ReportEntry {
  const look = FEE_LOOK[def.key] ?? { key: `fe-${def.key}`, name: def.label, sub: def.about };
  const dated = def.filters.includes("dates");
  return {
    key: look.key, category: "Fees", name: look.name, sub: look.sub, money: true, dated, byClass: def.filters.includes("class"),
    heavy: def.key === "collection-details" || def.key === "audit",
    allowed: (a) => a.fees,
    options: (rc) => feeOptions(rc, def, rc.f?.extra ?? {}),
    async run(rc) {
      const viewer = await rc.memo("fee-viewer", () => feeViewer(rc.tx, rc.ctx, rc.who as unknown as Parameters<typeof feeViewer>[2]));
      if (viewer.see !== "all") return { columns: [], rows: [], empty: "Fee reports need Fee Management for the whole school." };
      const e = rc.f.extra;
      const f: ReportFilter = {
        from: rc.f.from, to: rc.f.to, classId: rc.f.classId, feeHeadId: /^[0-9a-f-]{36}$/i.test(e.head ?? "") ? e.head : null,
        mode: PAYMENT_MODES.some((m) => m.value === e.mode) ? e.mode : null, collectorId: null,
        group: (["day", "month", "year"].includes(e.group ?? "") ? e.group : "month") as ReportFilter["group"], today: rc.f.today,
      };
      const t = fromMoney(await def.run(rc.tx, rc.ctx, f, viewer));
      if (def.key === "defaulters") t.links = [{ label: "Open Defaulters to send reminders", href: "/fee-management/defaulters" }];
      if (def.key === "by-class") t.links = [{ label: "Open Fees by class", href: "/fee-management/dashboard" }];
      return t;
    },
  };
}

const FIN_LOOK: Record<string, { key: string; name: string; sub: string }> = {
  "day-book-summary": { key: "fi-daybook", name: "Day Book", sub: "Receipts and payments, day by day or month by month" },
  "income-expense": { key: "fi-ie", name: "Income and expense", sub: "Money in against money out, by head" },
  books: { key: "fi-cash", name: "Cash and bank book", sub: "Opening, in, out and closing for each account" },
  "profit-loss": { key: "fi-pl", name: "Profit and loss", sub: "Income and expenses by group for the year" },
  "expense-analysis": { key: "fi-expenses", name: "Expense report", sub: "Expenses by head, vendor, month or approver" },
  department: { key: "fi-department", name: "Department-wise expenses", sub: "What each department spent, by head" },
  "pending-expenses": { key: "fi-pending", name: "Pending expenses", sub: "Bills not paid yet, with what is left to pay" },
  "budget-actual": { key: "fi-budget", name: "Budget against actual", sub: "Budget, spent, committed and what remains" },
  "trial-balance": { key: "fi-trial", name: "Trial balance", sub: "Every account's debit and credit" },
};

function financeEntry(def: FinanceReportDef): ReportEntry {
  const look = FIN_LOOK[def.key] ?? { key: `fi-${def.key}`, name: def.label, sub: def.about };
  return {
    key: look.key, category: "Finance", name: look.name, sub: look.sub, money: true, dated: def.filters.includes("dates"), heavy: def.key === "day-book-summary",
    allowed: (a, who) => a.finance !== null && (a.finance === "full" || !def.fullOnly) && (!def.feature || who.features.has(def.feature)),
    options: async (rc) => {
      const e = rc.f?.extra ?? {};
      const out: ReportOption[] = [];
      if (def.filters.includes("group")) out.push({ param: "group", label: "Group by", value: e.group === "day" ? "day" : "month", options: [{ value: "day", label: "Daily" }, { value: "month", label: "Monthly" }] });
      if (def.filters.includes("by")) out.push({ param: "by", label: "By", value: e.by ?? "head", options: [{ value: "head", label: "Expense head" }, { value: "vendor", label: "Vendor" }, { value: "month", label: "Month" }, { value: "approver", label: "Approver" }] });
      return out;
    },
    async run(rc) {
      const fy = rc.f.fy;
      if (!fy) return { columns: [], rows: [], empty: "No financial year yet." };
      const e = rc.f.extra;
      const f: FinanceFilter = {
        financialYearId: fy.id, yearStart: fy.startDate, from: rc.f.from, to: rc.f.to, group: e.group === "day" ? "day" : "month",
        by: (["vendor", "month", "approver"] as const).find((b) => b === e.by) ?? "head", today: rc.f.today, hidePay: await hiddenPayHeads(rc.tx, rc.who.permissions),
      };
      const t = fromMoney(await def.run(rc.tx, rc.ctx, f));
      if (f.hidePay) t.note = [t.note, "Staff pay is not shown for your role."].filter(Boolean).join(" ");
      return t;
    },
  };
}

const SAL_LOOK: Partial<Record<SalaryReportKey, { key: string; name: string; sub: string; category?: "Staff and HR" }>> = {
  summary: { key: "sa-register", name: "Salary register", sub: "Gross, deductions and net pay, month by month" },
  trends: { key: "sa-trends", name: "Salary trends", sub: "How the salary bill moved over the period" },
  department: { key: "sa-department", name: "Salary by department", sub: "Where the salary goes, by department and designation" },
  employee: { key: "sa-employee", name: "Employee salary history", sub: "Every month for one person" },
  deductions: { key: "sa-deductions", name: "Deductions by component", sub: "PF, ESI, Professional Tax, TDS and recoveries" },
  "pt-tds": { key: "sa-pt-tds", name: "Professional Tax and TDS", sub: "Deducted by month and staff member" },
  days: { key: "hr-lop", name: "Paid days, leave and loss of pay", sub: "From each month's salary, by staff member", category: "Staff and HR" },
};

const MONEY_COLS = ["Gross", "Deductions", "Net", "Employer PF", "Employer ESI", "Net pay", "Amount", "Total"];

function salaryEntry(def: (typeof SALARY_REPORTS)[number]): ReportEntry {
  const look = SAL_LOOK[def.key] ?? { key: `sa-${def.key}`, name: def.title, sub: def.sub };
  const hr = look.category === "Staff and HR";
  return {
    key: look.key, category: hr ? "Staff and HR" : "Salary", name: look.name, sub: look.sub, money: !hr, dated: true, fallback: "finyear",
    allowed: (a, who) => (hr ? who.permissions["salary-management"].see === "all" : a.salaryMoney),
    options: def.key === "employee" ? async (rc) => {
      const staff = await rc.tx.staff.findMany({ where: { archivedAt: null }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } });
      return [{ param: "who", label: "Staff member", value: rc.f?.extra.who ?? "", options: [{ value: "", label: "Choose the staff member" }, ...staff.map((s) => ({ value: s.id, label: `${s.fullName} (${s.staffCode})` }))] }];
    } : undefined,
    async run(rc) {
      const staffId = /^[0-9a-f-]{36}$/i.test(rc.f.extra.who ?? "") ? rc.f.extra.who : null;
      if (def.key === "employee" && !staffId) return { columns: [], rows: [], empty: "Choose the staff member above to see their salary month by month." };
      const built = await buildSalaryReport(rc.tx, def.key, { from: rc.f.from, to: rc.f.to, staffId, money: rc.who.permissions["salary-management"].change === "all" });
      if (!built) return { columns: [], rows: [], empty: "Salary amounts need full Salary Management." };
      return fromExport(built.columns, built.rows);
    },
  };
}

/** PF and ESI statements, month by month: the same totals as the files made in Salary Management (EPFO ECR text and ESIC Excel). */
const pfEsi: ReportEntry = {
  key: "sa-pfesi", category: "Salary", name: "PF and ESI statements", sub: "Monthly statements in the EPFO and ESIC portal formats", money: true, dated: true, fallback: "finyear",
  allowed: (a) => a.salaryMoney,
  async run(rc): Promise<Table> {
    const runs = await runsIn(rc.tx, rc.f.from, rc.f.to, { done: true });
    const campuses = await rc.tx.campus.findMany({ select: { id: true, name: true } });
    const many = campuses.length > 1;
    const rows: { month: string; pfStaff: number; pfEmployee: bigint; pfEmployer: bigint; esiStaff: number; esiEmployee: bigint; esiEmployer: bigint; made: string }[] = [];
    const links: { label: string; href: string }[] = [];
    for (const run of runs) {
      const [pf, esi] = await Promise.all([statementRows(rc.tx, run.id, "PF"), statementRows(rc.tx, run.id, "ESI")]);
      const made = await rc.tx.statutoryStatement.findMany({ where: { runId: run.id }, select: { kind: true, createdAt: true }, orderBy: { createdAt: "desc" } });
      const label = `${monthName(run.month)}${many ? ` · ${campuses.find((c) => c.id === run.campusId)?.name ?? ""}` : ""}`;
      rows.push({
        month: label, pfStaff: pf.rows.length, pfEmployee: pf.totals.employee, pfEmployer: pf.totals.employer, esiStaff: esi.rows.length, esiEmployee: esi.totals.employee, esiEmployer: esi.totals.employer,
        made: ["PF", "ESI"].map((k) => (made.some((m) => m.kind === k) ? `${k} file made` : null)).filter(Boolean).join(", ") || "Not made yet",
      });
      if (pf.rows.length) links.push({ label: `PF file, ${label}`, href: `/salary-management/generate/statement?run=${run.id}&kind=PF` });
      if (esi.rows.length) links.push({ label: `ESI file, ${label}`, href: `/salary-management/generate/statement?run=${run.id}&kind=ESI` });
    }
    const sum = (k: "pfEmployee" | "pfEmployer" | "esiEmployee" | "esiEmployer") => rows.reduce((s, r) => s + r[k], ZERO);
    return {
      columns: [
        { key: "month", label: "Month" }, { key: "pfStaff", label: "PF members", kind: "number" }, { key: "pfEmployee", label: "PF, staff share", kind: "money" }, { key: "pfEmployer", label: "PF, school share", kind: "money" },
        { key: "esiStaff", label: "ESI members", kind: "number" }, { key: "esiEmployee", label: "ESI, staff share", kind: "money" }, { key: "esiEmployer", label: "ESI, school share", kind: "money" }, { key: "made", label: "Files" },
      ],
      rows,
      totals: rows.length ? { month: "Total", pfStaff: null, pfEmployee: sum("pfEmployee"), pfEmployer: sum("pfEmployer"), esiStaff: null, esiEmployee: sum("esiEmployee"), esiEmployer: sum("esiEmployer"), made: null } : null,
      note: "Only approved salary months. Files: PF-ECR text file for the EPFO portal, ESI Excel for the ESIC portal.",
      links,
      empty: rows.length ? null : "No approved salary month in these dates.",
    };
  },
};

export const MONEY_REPORTS: ReportEntry[] = [
  ...FEE_ORDER.map((k) => FEE_REPORTS.find((d) => d.key === k)).filter((d): d is ReportDef => Boolean(d)).map(feeEntry),
  ...FEE_REPORTS.filter((d) => !FEE_ORDER.includes(d.key)).map(feeEntry),
  ...[...FINANCE_REPORTS].sort((a, b) => Object.keys(FIN_LOOK).indexOf(a.key) - Object.keys(FIN_LOOK).indexOf(b.key)).map(financeEntry),
  ...SALARY_REPORTS.filter((d) => d.key === "summary").map(salaryEntry),
  pfEsi,
  ...SALARY_REPORTS.filter((d) => d.key !== "summary").map(salaryEntry),
];

void MONEY_COLS;
