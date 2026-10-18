// Fee Reports (06 §7): collection, outstanding, defaulters, concessions,
// penalty, payment modes, cancelled payments, refunds, audit, tax, GST and
// online payments. Each has filters, a total line and export (P8). Brought-in
// receipts never count in collection.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { formatDate, formatRupees } from "../format";
import { DAY_MS } from "../staff/dates";
import { classInYearOf, classOfStudents } from "./dues";
import { ageingGroupOf, feeSettings } from "./settings";
import { ageingLabel, concessionTypeLabel, modeLabel, percentWord, CONCESSION_STATUS_WORDS, REFUND_STATUS_WORDS } from "./words";
import { defaulters } from "./defaulters";
import { feesByClass } from "./by-class";
import type { FeeViewer } from "./access";

const ZERO = BigInt(0);

export type Cell = string | number | bigint | Date | null;
export type ReportColumn = { key: string; label: string; kind?: "text" | "money" | "date" | "number" };
export type ReportResult = { columns: ReportColumn[]; rows: Record<string, Cell>[]; totals?: Record<string, Cell>; note?: string; chart?: { label: string; value: bigint }[] };
export type ReportFilter = { from: Date; to: Date; classId: string | null; feeHeadId: string | null; mode: string | null; collectorId: string | null; group: "day" | "month" | "year"; today: Date };
export type ReportFilterKey = "dates" | "class" | "head" | "mode" | "collector" | "group";

export type ReportDef = { key: string; label: string; about: string; filters: ReportFilterKey[]; run: (tx: Tx, ctx: SchoolContext, f: ReportFilter, viewer: FeeViewer) => Promise<ReportResult> };

const sum = <T>(list: T[], f: (x: T) => bigint) => list.reduce((s, x) => s + f(x), ZERO);

function periodKey(d: Date, g: ReportFilter["group"]) {
  const iso = d.toISOString();
  return g === "year" ? iso.slice(0, 4) : g === "month" ? iso.slice(0, 7) : iso.slice(0, 10);
}
function periodLabel(key: string, g: ReportFilter["group"]) {
  if (g === "year") return key;
  if (g === "month") return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
  return formatDate(new Date(`${key}T00:00:00Z`));
}

/**
 * Students in a class, for the class filter on records that belong to a year:
 * a record counts when the student was in that class in the record's year
 * (a payment made last year in Class 2 is not a Class 3 payment).
 */
async function inClassFilter(tx: Tx, classId: string | null) {
  if (!classId) return null;
  const rows = await tx.enrolment.findMany({ where: { classId, archivedAt: null }, select: { studentId: true, academicYearId: true } });
  const pairs = new Set(rows.map((e) => `${e.studentId}|${e.academicYearId}`));
  const classIn = await classInYearOf(tx, rows.map((e) => ({ studentId: e.studentId })));
  return {
    studentIds: [...new Set(rows.map((e) => e.studentId))],
    has: (studentId: string, academicYearId?: string | null) => (academicYearId ? pairs.has(`${studentId}|${academicYearId}`) : classIn(studentId)?.classId === classId),
  };
}

/** Posted, School OS payments in the period (never brought-in ones), with the filters applied. */
async function payments(tx: Tx, f: ReportFilter, extra: Prisma.PaymentWhereInput = {}) {
  const inClass = await inClassFilter(tx, f.classId);
  const classStudents = inClass?.studentIds ?? null;
  const list = await tx.payment.findMany({
    where: {
      status: "POSTED",
      broughtIn: false,
      paymentDate: { gte: f.from, lte: f.to },
      ...(f.mode ? { mode: f.mode as never } : {}),
      ...(f.collectorId ? { collectedById: f.collectorId } : {}),
      ...(classStudents ? { studentId: { in: classStudents } } : {}),
      ...(f.feeHeadId ? { allocations: { some: { feeHeadId: f.feeHeadId } } } : {}),
      ...extra,
    },
    include: { allocations: { where: { fromAdvance: false } } },
    orderBy: { paidAt: "asc" },
  });
  return inClass ? list.filter((p) => inClass.has(p.studentId, p.academicYearId)) : list;
}

async function names(tx: Tx, studentIds: string[]) {
  const s = await tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, fullName: true, admissionNo: true } });
  return new Map(s.map((x) => [x.id, x]));
}

async function headNames(tx: Tx) {
  const h = await tx.feeHead.findMany({});
  return new Map(h.map((x) => [x.id, x]));
}

export const FEE_REPORTS: ReportDef[] = [
  {
    key: "collection",
    label: "Collection report",
    about: "Money collected by date, class, fee head, mode and collector; daily, monthly or yearly.",
    filters: ["dates", "group", "class", "head", "mode", "collector"],
    async run(tx, _ctx, f) {
      const list = await payments(tx, f);
      const groups = new Map<string, { count: number; amount: bigint; late: bigint; cash: bigint; other: bigint }>();
      for (const p of list) {
        const k = periodKey(p.paymentDate, f.group);
        const g = groups.get(k) ?? { count: 0, amount: ZERO, late: ZERO, cash: ZERO, other: ZERO };
        const amount = f.feeHeadId ? sum(p.allocations.filter((a) => a.feeHeadId === f.feeHeadId), (a) => a.amountPaise) : p.amountPaise;
        g.count++;
        g.amount += amount;
        g.late += p.lateFeePaise;
        if (p.mode === "CASH") g.cash += amount; else g.other += amount;
        groups.set(k, g);
      }
      const rows = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, g]) => ({ period: periodLabel(k, f.group), payments: g.count, cash: g.cash, other: g.other, late: g.late, amount: g.amount }));
      return {
        columns: [
          { key: "period", label: f.group === "day" ? "Date" : f.group === "month" ? "Month" : "Year" },
          { key: "payments", label: "Payments", kind: "number" },
          { key: "cash", label: "Cash", kind: "money" },
          { key: "other", label: "Other modes", kind: "money" },
          { key: "late", label: "Late fee in it", kind: "money" },
          { key: "amount", label: "Collected", kind: "money" },
        ],
        rows,
        totals: { period: "Total", payments: list.length, cash: sum(rows, (r) => r.cash), other: sum(rows, (r) => r.other), late: sum(rows, (r) => r.late), amount: sum(rows, (r) => r.amount) },
        chart: rows.map((r) => ({ label: r.period, value: r.amount })),
      };
    },
  },
  {
    key: "collection-details",
    label: "Collection details",
    about: "Every payment in the period with receipt number, student, heads, mode and collector.",
    filters: ["dates", "class", "head", "mode", "collector"],
    async run(tx, _ctx, f) {
      const list = await payments(tx, f);
      const n = await names(tx, list.map((p) => p.studentId));
      const heads = await headNames(tx);
      const receipts = await tx.receipt.findMany({ where: { paymentId: { in: list.map((p) => p.id) } } });
      const users = await tx.userLogin.findMany({ where: { id: { in: list.map((p) => p.collectedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
      const classIn = await classInYearOf(tx, list);
      const rows = list.map((p) => ({
        date: p.paymentDate,
        receipt: receipts.find((r) => r.paymentId === p.id)?.number ?? "",
        student: n.get(p.studentId)?.fullName ?? "",
        admissionNo: n.get(p.studentId)?.admissionNo ?? "",
        class: classIn(p.studentId, p.academicYearId)?.label ?? "",
        heads: [...new Set(p.allocations.map((a) => heads.get(a.feeHeadId)?.name ?? ""))].join(", ") || (p.advancePaise > ZERO ? "Advance" : ""),
        mode: modeLabel(p.mode),
        reference: p.reference ?? p.chequeNo ?? "",
        collector: users.find((u) => u.id === p.collectedById)?.displayName ?? (p.source === "COUNTER" ? "" : "Online"),
        amount: p.amountPaise,
      }));
      return {
        columns: [
          { key: "date", label: "Date", kind: "date" }, { key: "receipt", label: "Receipt" }, { key: "student", label: "Student" }, { key: "admissionNo", label: "Admission no." },
          { key: "class", label: "Class" }, { key: "heads", label: "Fee heads" }, { key: "mode", label: "Mode" }, { key: "reference", label: "Reference" },
          { key: "collector", label: "Collected by" }, { key: "amount", label: "Amount", kind: "money" },
        ],
        rows,
        totals: { date: null, receipt: `${rows.length} payments`, amount: sum(rows, (r) => r.amount) },
      };
    },
  },
  {
    key: "outstanding",
    label: "Outstanding report",
    about: "What is still to pay by class and student, in the school's ageing groups.",
    filters: ["class", "head"],
    async run(tx, ctx, f, viewer) {
      const s = await feeSettings(tx, ctx);
      const dues = await tx.studentFeeDue.findMany({ where: { state: "OPEN", balancePaise: { gt: 0 }, ...(f.feeHeadId ? { feeHeadId: f.feeHeadId } : {}) }, select: { studentId: true, balancePaise: true, dueDate: true } });
      const classes = await classOfStudents(tx, [...new Set(dues.map((d) => d.studentId))], viewer.yearId);
      const n = await names(tx, [...new Set(dues.map((d) => d.studentId))]);
      const per = new Map<string, { notDue: bigint; buckets: bigint[]; total: bigint }>();
      for (const d of dues) {
        const c = classes.get(d.studentId);
        if (f.classId && c?.classId !== f.classId) continue;
        const row = per.get(d.studentId) ?? { notDue: ZERO, buckets: s.ageing.map(() => ZERO), total: ZERO };
        const days = Math.floor((f.today.getTime() - d.dueDate.getTime()) / DAY_MS);
        if (days <= 0) row.notDue += d.balancePaise;
        else {
          const g = ageingGroupOf(s.ageing, days);
          const i = g ? s.ageing.indexOf(g) : s.ageing.length - 1;
          row.buckets[i] += d.balancePaise;
        }
        row.total += d.balancePaise;
        per.set(d.studentId, row);
      }
      const rows = [...per.entries()].map(([id, r]) => {
        const out: Record<string, Cell> = { student: n.get(id)?.fullName ?? "", admissionNo: n.get(id)?.admissionNo ?? "", class: classes.get(id)?.label ?? "", notDue: r.notDue };
        s.ageing.forEach((_, i) => { out[`b${i}`] = r.buckets[i]; });
        out.total = r.total;
        return out;
      }).sort((a, b) => String(a.class).localeCompare(String(b.class), "en", { numeric: true }) || String(a.student).localeCompare(String(b.student)));
      const totals: Record<string, Cell> = { student: "Total", notDue: sum(rows, (r) => r.notDue as bigint), total: sum(rows, (r) => r.total as bigint) };
      s.ageing.forEach((_, i) => { totals[`b${i}`] = sum(rows, (r) => r[`b${i}`] as bigint); });
      return {
        columns: [
          { key: "student", label: "Student" }, { key: "admissionNo", label: "Admission no." }, { key: "class", label: "Class" }, { key: "notDue", label: "Not yet due", kind: "money" },
          ...s.ageing.map((g, i) => ({ key: `b${i}`, label: ageingLabel(g), kind: "money" as const })),
          { key: "total", label: "Total to pay", kind: "money" },
        ],
        rows,
        totals,
        chart: s.ageing.map((g, i) => ({ label: ageingLabel(g), value: totals[`b${i}`] as bigint })),
      };
    },
  },
  {
    key: "by-class",
    label: "Fees by class",
    about: "Each section's fees due so far, collected, pending and overdue, with its class teacher. The same rows as the Fee Dashboard.",
    filters: [],
    async run(tx, _ctx, f, viewer) {
      // The one per-class source (./by-class.ts): these rows add up to the Fee Dashboard band.
      const data = await feesByClass(tx, viewer, f.today);
      const rows = data.sections.map((s) => ({
        class: s.name, teacher: s.teacher?.name ?? "", students: s.students, due: s.due, paid: s.paid,
        percent: `${s.percent}%`, notLate: s.notLate, overdue: s.overdue, overdueStudents: s.overdueStudents,
      }));
      const t = data.totals;
      return {
        columns: [
          { key: "class", label: "Class" }, { key: "teacher", label: "Class teacher" }, { key: "students", label: "Students", kind: "number" },
          { key: "due", label: "Due so far", kind: "money" }, { key: "paid", label: "Collected", kind: "money" }, { key: "percent", label: "Collected %" },
          { key: "notLate", label: "Pending, not late", kind: "money" }, { key: "overdue", label: "Overdue", kind: "money" }, { key: "overdueStudents", label: "Students overdue", kind: "number" },
        ],
        rows,
        totals: { class: "Total", students: t.students, due: t.due, paid: t.paid, percent: `${t.percent}%`, notLate: t.notLate, overdue: t.overdue, overdueStudents: t.overdueStudents },
        chart: data.sections.filter((s) => s.overdue > ZERO).map((s) => ({ label: s.name, value: s.overdue })),
        note: "Due so far counts fees falling due in the next 30 days. Students who left or are not in a class this year are in their own row.",
      };
    },
  },
  {
    key: "defaulters",
    label: "Defaulter report",
    about: "Students with overdue fees, days overdue, ageing group and reminders sent.",
    filters: ["class", "head"],
    async run(tx, ctx, f, viewer) {
      const d = await defaulters(tx, ctx, viewer, f.today, { classId: f.classId, feeHeadId: f.feeHeadId });
      return {
        columns: [
          { key: "student", label: "Student" }, { key: "admissionNo", label: "Admission no." }, { key: "class", label: "Class" }, { key: "parent", label: "Parent" }, { key: "phone", label: "Phone" },
          { key: "oldest", label: "Oldest due", kind: "date" }, { key: "days", label: "Days overdue", kind: "number" }, { key: "ageing", label: "Ageing group" },
          { key: "reminders", label: "Reminders sent", kind: "number" }, { key: "overdue", label: "Overdue", kind: "money" },
        ],
        rows: d.rows.map((r) => ({ student: r.name, admissionNo: r.admissionNo, class: r.classLabel, parent: r.parentName, phone: r.phone, oldest: r.oldestDue, days: r.daysOverdue, ageing: r.ageing ? ageingLabel(r.ageing) : "", reminders: r.reminders, overdue: r.overduePaise })),
        totals: { student: `${d.rows.length} students`, overdue: d.total },
      };
    },
  },
  {
    key: "concessions",
    label: "Discount and concession report",
    about: "Every discount, scholarship, bulk discount and waiver with reason, status and amount.",
    filters: ["dates", "class"],
    async run(tx, _ctx, f) {
      const list = await tx.concession.findMany({ where: { createdAt: { gte: f.from, lt: new Date(f.to.getTime() + DAY_MS) } }, orderBy: { createdAt: "asc" } });
      const n = await names(tx, list.map((c) => c.studentId));
      const classIn = await classInYearOf(tx, list);
      const filtered = list.filter((c) => !f.classId || classIn(c.studentId, c.academicYearId)?.classId === f.classId);
      const users = await tx.userLogin.findMany({ where: { id: { in: filtered.flatMap((c) => [c.requestedById, c.decidedById]).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
      const who = (id: string | null) => users.find((u) => u.id === id)?.displayName ?? "";
      const rows = filtered.map((c) => ({
        date: c.createdAt, student: n.get(c.studentId)?.fullName ?? "", class: classIn(c.studentId, c.academicYearId)?.label ?? "", type: concessionTypeLabel(c.type),
        value: c.mode === "percent" ? percentWord(c.percentBp) : formatRupees(c.amountPaise), reason: c.reason, requestedBy: who(c.requestedById), decidedBy: who(c.decidedById),
        status: CONCESSION_STATUS_WORDS[c.status]?.label ?? c.status, applied: c.appliedPaise,
      }));
      return {
        columns: [
          { key: "date", label: "Date", kind: "date" }, { key: "student", label: "Student" }, { key: "class", label: "Class" }, { key: "type", label: "Type" }, { key: "value", label: "Amount or %" },
          { key: "reason", label: "Reason" }, { key: "requestedBy", label: "Requested by" }, { key: "decidedBy", label: "Approved by" }, { key: "status", label: "Status" }, { key: "applied", label: "Applied", kind: "money" },
        ],
        rows,
        totals: { date: null, student: `${rows.length} concessions`, applied: sum(rows, (r) => r.applied) },
      };
    },
  },
  {
    key: "penalty",
    label: "Penalty (late fee) report",
    about: "Late fee added, waived and collected in the period.",
    filters: ["dates", "class"],
    async run(tx, _ctx, f) {
      const rowsDb = await tx.studentFeeDue.findMany({ where: { kind: "LATE_FEE", createdAt: { gte: f.from, lt: new Date(f.to.getTime() + DAY_MS) } } });
      const classIn = await classInYearOf(tx, rowsDb);
      const n = await names(tx, rowsDb.map((r) => r.studentId));
      const filtered = rowsDb.filter((r) => !f.classId || classIn(r.studentId, r.academicYearId)?.classId === f.classId);
      const rows = filtered.map((r) => ({ date: r.dueDate, student: n.get(r.studentId)?.fullName ?? "", class: classIn(r.studentId, r.academicYearId)?.label ?? "", on: r.label.replace(/^Late fee: /, ""), added: r.amountPaise, waived: r.concessionPaise, collected: r.paidPaise, open: r.state === "OPEN" ? r.balancePaise : ZERO }));
      return {
        columns: [
          { key: "date", label: "Added on", kind: "date" }, { key: "student", label: "Student" }, { key: "class", label: "Class" }, { key: "on", label: "Late on" },
          { key: "added", label: "Added", kind: "money" }, { key: "waived", label: "Waived", kind: "money" }, { key: "collected", label: "Collected", kind: "money" }, { key: "open", label: "Still to pay", kind: "money" },
        ],
        rows,
        totals: { date: null, student: `${rows.length} late fees`, added: sum(rows, (r) => r.added), waived: sum(rows, (r) => r.waived), collected: sum(rows, (r) => r.collected), open: sum(rows, (r) => r.open) },
      };
    },
  },
  {
    key: "modes",
    label: "Payment-mode report",
    about: "Collection by mode: cash, UPI, card, net banking, bank transfer, cheque, gateway.",
    filters: ["dates", "class", "collector"],
    async run(tx, _ctx, f) {
      const list = await payments(tx, f);
      const by = new Map<string, { count: number; amount: bigint }>();
      for (const p of list) {
        const g = by.get(p.mode) ?? { count: 0, amount: ZERO };
        g.count++; g.amount += p.amountPaise;
        by.set(p.mode, g);
      }
      const total = sum(list, (p) => p.amountPaise);
      const rows = [...by.entries()].sort((a, b) => Number(b[1].amount - a[1].amount)).map(([m, g]) => ({ mode: modeLabel(m), payments: g.count, share: total > ZERO ? `${((Number(g.amount) * 100) / Number(total)).toFixed(1)}%` : "0%", amount: g.amount }));
      return {
        columns: [{ key: "mode", label: "Mode" }, { key: "payments", label: "Payments", kind: "number" }, { key: "share", label: "Share" }, { key: "amount", label: "Collected", kind: "money" }],
        rows,
        totals: { mode: "Total", payments: list.length, share: "100%", amount: total },
        chart: rows.map((r) => ({ label: r.mode, value: r.amount })),
      };
    },
  },
  {
    key: "cancelled",
    label: "Cancelled payments report",
    about: "Who cancelled which payment, when, the reason and the amount (replaces the old Deleted Payments Log).",
    filters: ["dates", "class"],
    async run(tx, _ctx, f) {
      const list = await tx.payment.findMany({ where: { status: "CANCELLED", cancelledAt: { gte: f.from, lt: new Date(f.to.getTime() + DAY_MS) } }, orderBy: { cancelledAt: "asc" } });
      const n = await names(tx, list.map((p) => p.studentId));
      const classIn = await classInYearOf(tx, list);
      const receipts = await tx.receipt.findMany({ where: { paymentId: { in: list.map((p) => p.id) } } });
      const users = await tx.userLogin.findMany({ where: { id: { in: list.map((p) => p.cancelledById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
      const filtered = list.filter((p) => !f.classId || classIn(p.studentId, p.academicYearId)?.classId === f.classId);
      const rows = filtered.map((p) => ({ cancelledOn: p.cancelledAt, paidOn: p.paymentDate, receipt: receipts.find((r) => r.paymentId === p.id)?.number ?? "Not posted", student: n.get(p.studentId)?.fullName ?? "", class: classIn(p.studentId, p.academicYearId)?.label ?? "", mode: modeLabel(p.mode), by: users.find((u) => u.id === p.cancelledById)?.displayName ?? "", reason: [p.cancelReason, p.cancelNote ?? p.rejectReason].filter(Boolean).join(": "), amount: p.amountPaise }));
      return {
        columns: [
          { key: "cancelledOn", label: "Cancelled on", kind: "date" }, { key: "paidOn", label: "Paid on", kind: "date" }, { key: "receipt", label: "Receipt" }, { key: "student", label: "Student" }, { key: "class", label: "Class" },
          { key: "mode", label: "Mode" }, { key: "by", label: "Cancelled by" }, { key: "reason", label: "Reason" }, { key: "amount", label: "Amount", kind: "money" },
        ],
        rows,
        totals: { cancelledOn: null, receipt: `${rows.length} cancelled`, amount: sum(rows, (r) => r.amount) },
      };
    },
  },
  {
    key: "refunds",
    label: "Refund report",
    about: "Refunds asked, approved and paid, with reason and mode.",
    filters: ["dates", "class"],
    async run(tx, _ctx, f) {
      const list = await tx.refund.findMany({ where: { createdAt: { gte: f.from, lt: new Date(f.to.getTime() + DAY_MS) } }, orderBy: { createdAt: "asc" } });
      const n = await names(tx, list.map((r) => r.studentId));
      const classes = await classOfStudents(tx, list.map((r) => r.studentId));
      const filtered = list.filter((r) => !f.classId || classes.get(r.studentId)?.classId === f.classId);
      const rows = filtered.map((r) => ({ asked: r.createdAt, student: n.get(r.studentId)?.fullName ?? "", class: classes.get(r.studentId)?.label ?? "", reason: r.reason, mode: modeLabel(r.mode), status: REFUND_STATUS_WORDS[r.status]?.label ?? r.status, refundedOn: r.refundedOn, reference: r.reference ?? "", amount: r.amountPaise }));
      return {
        columns: [
          { key: "asked", label: "Asked on", kind: "date" }, { key: "student", label: "Student" }, { key: "class", label: "Class" }, { key: "reason", label: "Reason" }, { key: "mode", label: "Mode" },
          { key: "status", label: "Status" }, { key: "refundedOn", label: "Refunded on", kind: "date" }, { key: "reference", label: "Reference" }, { key: "amount", label: "Amount", kind: "money" },
        ],
        rows,
        totals: { asked: null, student: `${rows.length} refunds`, amount: sum(rows.filter((r) => r.status === REFUND_STATUS_WORDS.REFUNDED.label), (r) => r.amount) },
        note: "The total counts refunds already paid.",
      };
    },
  },
  {
    key: "audit",
    label: "Audit report",
    about: "Installment-wise breakdown of every payment, for accounting.",
    filters: ["dates", "class", "head"],
    async run(tx, _ctx, f) {
      const list = await payments(tx, f);
      const dues = await tx.studentFeeDue.findMany({ where: { id: { in: list.flatMap((p) => p.allocations.map((a) => a.dueId)) } } });
      const heads = await headNames(tx);
      const receipts = await tx.receipt.findMany({ where: { paymentId: { in: list.map((p) => p.id) } } });
      const n = await names(tx, list.map((p) => p.studentId));
      const accounts = await tx.bankAccount.findMany({});
      const rows: Record<string, Cell>[] = [];
      for (const p of list) {
        for (const a of p.allocations) {
          if (f.feeHeadId && a.feeHeadId !== f.feeHeadId) continue;
          const d = dues.find((x) => x.id === a.dueId);
          rows.push({ date: p.paymentDate, receipt: receipts.find((r) => r.paymentId === p.id)?.number ?? "", student: n.get(p.studentId)?.fullName ?? "", head: heads.get(a.feeHeadId)?.name ?? "", installment: d?.label ?? "", dueDate: d?.dueDate ?? null, account: accounts.find((x) => x.id === a.bankAccountId)?.name ?? "", mode: modeLabel(p.mode), amount: a.amountPaise });
        }
        if (p.advancePaise > ZERO && !f.feeHeadId) rows.push({ date: p.paymentDate, receipt: receipts.find((r) => r.paymentId === p.id)?.number ?? "", student: n.get(p.studentId)?.fullName ?? "", head: "Advance", installment: "", dueDate: null, account: "", mode: modeLabel(p.mode), amount: p.advancePaise });
      }
      return {
        columns: [
          { key: "date", label: "Date", kind: "date" }, { key: "receipt", label: "Receipt" }, { key: "student", label: "Student" }, { key: "head", label: "Fee head" }, { key: "installment", label: "Installment" },
          { key: "dueDate", label: "Due date", kind: "date" }, { key: "account", label: "Bank account" }, { key: "mode", label: "Mode" }, { key: "amount", label: "Amount", kind: "money" },
        ],
        rows,
        totals: { date: null, receipt: `${rows.length} lines`, amount: sum(rows, (r) => r.amount as bigint) },
      };
    },
  },
  {
    key: "tax",
    label: "Tax report",
    about: "Collection on taxable fee heads by period.",
    filters: ["dates", "group"],
    async run(tx, _ctx, f) {
      const inv = await tx.taxInvoice.findMany({ where: { date: { gte: f.from, lte: f.to }, status: "valid" }, orderBy: { date: "asc" } });
      const by = new Map<string, { count: number; taxable: bigint; tax: bigint; total: bigint }>();
      for (const i of inv) {
        const k = periodKey(i.date, f.group);
        const g = by.get(k) ?? { count: 0, taxable: ZERO, tax: ZERO, total: ZERO };
        g.count++; g.taxable += i.taxablePaise; g.tax += i.taxPaise; g.total += i.totalPaise;
        by.set(k, g);
      }
      const rows = [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, g]) => ({ period: periodLabel(k, f.group), invoices: g.count, taxable: g.taxable, tax: g.tax, total: g.total }));
      return {
        columns: [{ key: "period", label: "Period" }, { key: "invoices", label: "Tax invoices", kind: "number" }, { key: "taxable", label: "Taxable value", kind: "money" }, { key: "tax", label: "GST", kind: "money" }, { key: "total", label: "Collected", kind: "money" }],
        rows,
        totals: { period: "Total", invoices: inv.length, taxable: sum(rows, (r) => r.taxable), tax: sum(rows, (r) => r.tax), total: sum(rows, (r) => r.total) },
      };
    },
  },
  {
    key: "gst",
    label: "GST report",
    about: "For GST filing: taxable collection by fee head and GST rate, tax amount, and every tax invoice in the period.",
    filters: ["dates"],
    async run(tx, _ctx, f) {
      const inv = await tx.taxInvoice.findMany({ where: { date: { gte: f.from, lte: f.to }, status: "valid" }, orderBy: [{ date: "asc" }, { number: "asc" }] });
      const pays = await tx.payment.findMany({ where: { id: { in: inv.map((i) => i.paymentId) } }, select: { id: true, studentId: true } });
      const n = await names(tx, pays.map((p) => p.studentId));
      const rows: Record<string, Cell>[] = [];
      const byHead = new Map<string, { head: string; sac: string; rate: number; taxable: bigint; tax: bigint }>();
      for (const i of inv) {
        const student = n.get(pays.find((p) => p.id === i.paymentId)?.studentId ?? "")?.fullName ?? "";
        for (const l of i.lines as { name: string; sacCode: string | null; rateBp: number; amountPaise: string; taxPaise: string }[]) {
          const amount = BigInt(l.amountPaise), tax = BigInt(l.taxPaise);
          rows.push({ date: i.date, invoice: i.number, student, head: l.name, sac: l.sacCode ?? "", rate: percentWord(l.rateBp), taxable: amount - tax, cgst: tax / BigInt(2), sgst: tax - tax / BigInt(2), total: amount });
          const k = `${l.name}|${l.rateBp}`;
          const g = byHead.get(k) ?? { head: l.name, sac: l.sacCode ?? "", rate: l.rateBp, taxable: ZERO, tax: ZERO };
          g.taxable += amount - tax; g.tax += tax;
          byHead.set(k, g);
        }
      }
      const summary = [...byHead.values()].map((g) => `${g.head} at ${percentWord(g.rate)}: taxable ${formatRupees(g.taxable)}, GST ${formatRupees(g.tax)}`).join(". ");
      return {
        columns: [
          { key: "date", label: "Date", kind: "date" }, { key: "invoice", label: "Tax invoice" }, { key: "student", label: "Student" }, { key: "head", label: "Fee head" }, { key: "sac", label: "SAC" }, { key: "rate", label: "GST rate" },
          { key: "taxable", label: "Taxable value", kind: "money" }, { key: "cgst", label: "CGST", kind: "money" }, { key: "sgst", label: "SGST", kind: "money" }, { key: "total", label: "Invoice value", kind: "money" },
        ],
        rows,
        totals: { date: null, invoice: `${inv.length} invoices`, taxable: sum(rows, (r) => r.taxable as bigint), cgst: sum(rows, (r) => r.cgst as bigint), sgst: sum(rows, (r) => r.sgst as bigint), total: sum(rows, (r) => r.total as bigint) },
        note: summary ? `By fee head and rate: ${summary}.` : undefined,
      };
    },
  },
  {
    key: "online",
    label: "Online payments",
    about: "Every gateway confirmation and failure: posted, already posted (a second confirmation), failed, found by reconciliation, matched by hand, not matched, or refunded or disputed at Razorpay.",
    filters: ["dates"],
    async run(tx, _ctx, f) {
      const list = await tx.gatewayTransaction.findMany({ where: { receivedAt: { gte: f.from, lt: new Date(f.to.getTime() + DAY_MS) } }, orderBy: { receivedAt: "asc" } });
      const pays = await tx.payment.findMany({ where: { id: { in: list.map((l) => l.paymentId).filter((x): x is string => Boolean(x)) } }, select: { id: true, studentId: true } });
      const n = await names(tx, pays.map((p) => p.studentId));
      const OUTCOME: Record<string, string> = {
        posted: "Posted", "already-posted": "Second confirmation, ignored", "failed-recorded": "Failed", unmatched: "Not matched", ignored: "Ignored",
        "refund-reported": "Refunded at Razorpay, to check", "dispute-reported": "Disputed at the bank, to check", "reversal-unmatched": "Refund or dispute, not matched",
      };
      const EVENT: Record<string, string> = {
        "payment.captured": "Payment captured", "order.paid": "Order paid", "checkout.verified": "Checkout confirmed", "payment.failed": "Payment failed",
        "reconcile.captured": "Found by reconciliation", "matched-by-hand": "Matched by hand", "refund.processed": "Refunded", "payment.dispute.created": "Dispute opened", "payment.dispute.lost": "Dispute lost",
      };
      const rows = list.map((l) => ({ at: l.receivedAt, event: EVENT[l.event] ?? l.event, paymentId: l.gatewayPaymentId ?? "", order: l.gatewayOrderId ?? "", student: n.get(pays.find((p) => p.id === l.paymentId)?.studentId ?? "")?.fullName ?? "", outcome: OUTCOME[l.outcome] ?? l.outcome, amount: l.amountPaise }));
      return {
        columns: [{ key: "at", label: "Received", kind: "date" }, { key: "event", label: "Event" }, { key: "paymentId", label: "Gateway payment ID" }, { key: "order", label: "Order" }, { key: "student", label: "Student" }, { key: "outcome", label: "Outcome" }, { key: "amount", label: "Amount", kind: "money" }],
        rows,
        totals: { at: null, event: `${rows.length} confirmations`, amount: sum(rows.filter((r) => r.outcome === "Posted"), (r) => r.amount ?? ZERO) },
        note: `The total counts posted payments only. ${rows.filter((r) => r.outcome === "Posted" && (r.event === "Found by reconciliation" || r.event === "Matched by hand")).length} were reconciled: found by asking Razorpay, or matched to a student by hand.`,
      };
    },
  },
];

export const findFeeReport = (key: string) => FEE_REPORTS.find((r) => r.key === key) ?? null;

/** A cell as text for screens and exports. */
export function cellText(c: Cell, kind: ReportColumn["kind"]): string {
  if (c === null || c === undefined) return "";
  if (kind === "money" && (typeof c === "bigint" || typeof c === "number")) return formatRupees(c);
  if (c instanceof Date) return formatDate(c);
  if (typeof c === "bigint") return c.toString();
  return String(c);
}
