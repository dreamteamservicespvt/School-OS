// Switching to School OS (workflow 15, D7): old dues (opening balances) and
// past receipts imported with the shared importer (P10). Old dues become
// rows on the student's fees; past receipts are kept read-only as "Brought
// in" payments with their old receipt numbers. Neither ever reaches the Day
// Book or today's collection (rule 36). Undo takes the whole import back.
import "server-only";

import type { PaymentMode } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { defineImport } from "../importer";
import { writeAudit } from "../audit";
import { parseDateText } from "../staff/import";
import { parseRupees } from "./act";
import { MoneyProblem } from "./problem";
import { lockDues, refreshBalances } from "./dues";
import { ensureFeeDefaults } from "./settings";
import { financialYearOf } from "../finance/years";
import { currentYear } from "../academic/years";
import { PAYMENT_MODES } from "./words";
import { formatRupees } from "../format";

function rupees(v: string, label: string): { ok: true; value: bigint } | { ok: false; problem: string } {
  try {
    const p = parseRupees(v, label);
    if (p === null) return { ok: false, problem: `${label} is needed.` };
    if (p <= BigInt(0)) return { ok: false, problem: `${label} must be more than ₹0.` };
    return { ok: true, value: p };
  } catch (e) {
    return { ok: false, problem: e instanceof MoneyProblem ? e.message : `${label} is not an amount.` };
  }
}

// ---------------------------------------------------------------- old dues

type OldDue = { studentId: string; feeHeadId: string; amountPaise: bigint; dueDate: Date; note: string | null; headName: string };

defineImport<OldDue>({
  key: "fee-old-dues",
  label: "Fee opening balances (old dues)",
  columns: [
    { key: "admissionNo", label: "Admission number", required: true, example: "SPS/2021/0451", aliases: ["admission no", "adm no"] },
    { key: "feeHead", label: "Fee head", example: "Old dues", help: "Leave empty for Old dues", aliases: ["head"] },
    { key: "amount", label: "Amount", required: true, example: "12500", aliases: ["due", "balance", "amount due"] },
    { key: "dueDate", label: "Due date", required: true, example: "31-03-2026", help: "DD-MM-YYYY" },
    { key: "note", label: "Note", example: "Balance from 2025-26" },
  ],
  async check(tx, ctx, row, seen) {
    await ensureFeeDefaults(tx, ctx);
    const problems: string[] = [];
    const student = row.admissionNo ? await tx.student.findFirst({ where: { admissionNo: { equals: row.admissionNo.trim(), mode: "insensitive" }, archivedAt: null } }) : null;
    if (!student) problems.push(`No student with admission number "${row.admissionNo}".`);
    const headName = row.feeHead?.trim() || "Old dues";
    const head = await tx.feeHead.findFirst({ where: { archivedAt: null, name: { equals: headName, mode: "insensitive" } } });
    if (!head) problems.push(`Fee head "${headName}" is not in Fee Structure. Add it there or use Old dues.`);
    const amount = rupees(row.amount ?? "", "Amount");
    if (!amount.ok) problems.push(amount.problem);
    const dueDate = parseDateText(row.dueDate ?? "");
    if (!dueDate) problems.push("Due date is not a date like 31-03-2026.");
    if ((row.note ?? "").length > 300) problems.push("Note can be at most 300 characters.");
    // Workflow 15 "Old dues are imported twice": one brought-in row per student and fee head.
    if (student && head) {
      const k = `od:${student.id}:${head.id}`;
      if (seen.has(k)) problems.push(`Old dues for ${student.fullName} (${head.name}) are on another row of the file. Put them on one row.`);
      else {
        seen.add(k);
        const before = await tx.studentFeeDue.findFirst({ where: { studentId: student.id, feeHeadId: head.id, kind: "OLD_DUES", broughtIn: true, state: "OPEN" } });
        if (before) problems.push(`Old dues for ${student.fullName} (${head.name}) are already brought in: ${formatRupees(before.amountPaise)}. Undo the earlier import to replace them, or leave this row out.`);
      }
    }
    if (problems.length || !student || !head || !amount.ok || !dueDate) return { ok: false, problems };
    return { ok: true, value: { studentId: student.id, feeHeadId: head.id, amountPaise: amount.value, dueDate, note: row.note?.trim() || null, headName: head.name } };
  },
  async save(tx, ctx, v) {
    const year = await currentYear(tx, ctx);
    if (!year) throw new Error("No academic year");
    const fy = await financialYearOf(tx, ctx, v.dueDate);
    const ob = await tx.openingBalance.create({
      data: { schoolId: ctx.schoolId, kind: "STUDENT_DUES", financialYearId: fy.id, date: v.dueDate, studentId: v.studentId, amountPaise: v.amountPaise, note: v.note, sourceFile: "import", broughtInById: ctx.userId },
    });
    const due = await tx.studentFeeDue.create({
      data: {
        schoolId: ctx.schoolId, studentId: v.studentId, academicYearId: year.id, feeHeadId: v.feeHeadId, kind: "OLD_DUES",
        label: v.headName === "Old dues" ? "Old dues" : `Old dues: ${v.headName}`, dueDate: v.dueDate, amountPaise: v.amountPaise, balancePaise: v.amountPaise,
        broughtIn: true, openingBalanceId: ob.id, note: v.note, createdById: ctx.userId,
      },
    });
    return { id: due.id, created: true };
  },
  async undo(tx, ctx, ids) {
    const dues = await tx.studentFeeDue.findMany({ where: { id: { in: ids } } });
    for (const d of dues) {
      if (d.paidPaise > BigInt(0)) continue; // Money already collected on it stays; the row stays with it.
      await tx.studentFeeDue.update({ where: { id: d.id }, data: { state: "REMOVED", removedReason: "Import undone", removedById: ctx.userId, removedAt: new Date() } });
      if (d.openingBalanceId) await tx.openingBalance.update({ where: { id: d.openingBalanceId }, data: { archivedAt: new Date() } });
    }
    await refreshBalances(tx, ids);
  },
});

// ---------------------------------------------------------------- past receipts

type PastReceipt = { studentId: string; oldReceiptNo: string; date: Date; amountPaise: bigint; mode: PaymentMode; headName: string | null; academicYearId: string | null };

const modeOf = (v: string): PaymentMode | null => {
  const t = v.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (!t) return "CASH";
  const found = PAYMENT_MODES.find((m) => m.label.toLowerCase() === t || m.value.toLowerCase().replace(/_/g, " ") === t);
  if (found) return found.value;
  if (["online", "gateway", "razorpay"].includes(t)) return "GATEWAY";
  if (["neft", "rtgs", "imps", "transfer"].includes(t)) return "BANK_TRANSFER";
  if (["dd", "demand draft"].includes(t)) return "CHEQUE";
  return null;
};

defineImport<PastReceipt>({
  key: "fee-past-receipts",
  label: "Fee past receipts (brought in)",
  columns: [
    { key: "admissionNo", label: "Admission number", required: true, example: "SPS/2021/0451", aliases: ["admission no", "adm no"] },
    { key: "oldReceiptNo", label: "Old receipt number", required: true, example: "R-2025-1182", aliases: ["receipt no", "receipt number"] },
    { key: "date", label: "Date", required: true, example: "15-07-2025", help: "DD-MM-YYYY" },
    { key: "amount", label: "Amount", required: true, example: "4500" },
    { key: "mode", label: "Mode", example: "Cash", help: "Cash, UPI, Card, Net banking, Bank transfer, Cheque or Online" },
    { key: "feeHead", label: "Fee head", example: "Tuition fee" },
  ],
  async check(tx, ctx, row, seen) {
    const problems: string[] = [];
    const student = row.admissionNo ? await tx.student.findFirst({ where: { admissionNo: { equals: row.admissionNo.trim(), mode: "insensitive" }, releasedAt: null } }) : null;
    if (!student) problems.push(`No student with admission number "${row.admissionNo}".`);
    const no = (row.oldReceiptNo ?? "").trim();
    if (!no) problems.push("Old receipt number is needed.");
    else if (no.length > 40) problems.push("Old receipt number can be at most 40 characters.");
    else if (seen.has(`r:${no.toLowerCase()}`)) problems.push("This receipt number is on another row of the file.");
    else {
      seen.add(`r:${no.toLowerCase()}`);
      const dup = await tx.payment.findFirst({ where: { broughtIn: true, oldReceiptNo: { equals: no, mode: "insensitive" }, status: { not: "CANCELLED" } } });
      if (dup) problems.push(`Receipt ${no} was already brought in.`);
    }
    const date = parseDateText(row.date ?? "");
    if (!date) problems.push("Date is not a date like 15-07-2025.");
    else if (date > new Date()) problems.push("Date is in the future.");
    const amount = rupees(row.amount ?? "", "Amount");
    if (!amount.ok) problems.push(amount.problem);
    const mode = modeOf(row.mode ?? "");
    if (!mode) problems.push(`Mode "${row.mode}" is not one of Cash, UPI, Card, Net banking, Bank transfer, Cheque or Online.`);
    if (problems.length || !student || !date || !amount.ok || !mode) return { ok: false, problems };
    const enrol = await tx.enrolment.findFirst({ where: { studentId: student.id, archivedAt: null }, orderBy: { createdAt: "desc" } });
    void ctx;
    return { ok: true, value: { studentId: student.id, oldReceiptNo: no, date, amountPaise: amount.value, mode, headName: row.feeHead?.trim() || null, academicYearId: enrol?.academicYearId ?? null } };
  },
  async save(tx, ctx, v) {
    const p = await tx.payment.create({
      data: {
        schoolId: ctx.schoolId, studentId: v.studentId, academicYearId: v.academicYearId, amountPaise: v.amountPaise, mode: v.mode,
        paidAt: v.date, paymentDate: v.date, status: "POSTED", source: "IMPORT", broughtIn: true, oldReceiptNo: v.oldReceiptNo,
        note: v.headName ? `Brought in: ${v.headName}` : "Brought in from old software", collectedById: ctx.userId,
      },
    });
    // Kept apart from School OS numbers; a receipt number is never reused, even after an import is undone.
    let number = `OLD-${v.oldReceiptNo}`;
    for (let n = 2; await tx.receipt.findUnique({ where: { schoolId_number: { schoolId: ctx.schoolId, number } } }); n++) number = `OLD-${v.oldReceiptNo}-${n}`;
    await tx.receipt.create({ data: { schoolId: ctx.schoolId, paymentId: p.id, number, date: v.date, broughtIn: true } });
    await allocateBroughtIn(tx, ctx, p.id, v);
    return { id: p.id, created: true };
  },
  async undo(tx, ctx, ids) {
    for (const id of ids) {
      const p = await tx.payment.findFirst({ where: { id, broughtIn: true } });
      if (!p || p.status === "CANCELLED") continue;
      // The dues it paid open again, as they were before the import.
      const allocs = await tx.paymentAllocation.findMany({ where: { paymentId: id } });
      await lockDues(tx, allocs.map((a) => a.dueId));
      for (const a of allocs) await tx.studentFeeDue.update({ where: { id: a.dueId }, data: { paidPaise: { decrement: a.amountPaise } } });
      await refreshBalances(tx, allocs.map((a) => a.dueId));
      await tx.payment.update({ where: { id }, data: { status: "CANCELLED", cancelReason: "Import undone", cancelledById: ctx.userId, cancelledAt: new Date() } });
      await tx.receipt.updateMany({ where: { paymentId: id }, data: { status: "cancelled", cancelledAt: new Date() } });
    }
    await writeAudit(tx, ctx, { action: "brought-in-undone", recordType: "Payment", recordId: null, after: { count: ids.length } });
  },
});

/**
 * Workflow 15 step 6: a payment already made in the old software reduces this
 * year's dues: rows of the named fee head first, then the oldest open rows.
 * What is left over is held as advance, as at the counter. It never reaches
 * the Day Book.
 */
async function allocateBroughtIn(tx: Tx, ctx: SchoolContext, paymentId: string, v: PastReceipt) {
  const head = v.headName ? await tx.feeHead.findFirst({ where: { archivedAt: null, name: { equals: v.headName, mode: "insensitive" } }, select: { id: true } }) : null;
  const open = await tx.studentFeeDue.findMany({
    where: { studentId: v.studentId, state: "OPEN", balancePaise: { gt: 0 }, ...(v.academicYearId ? { academicYearId: v.academicYearId } : {}) },
    orderBy: [{ dueDate: "asc" }, { kind: "asc" }, { createdAt: "asc" }],
  });
  const ordered = head ? [...open.filter((d) => d.feeHeadId === head.id), ...open.filter((d) => d.feeHeadId !== head.id)] : open;
  await lockDues(tx, ordered.map((d) => d.id));
  let left = v.amountPaise;
  const lines: { dueId: string; feeHeadId: string; amountPaise: bigint }[] = [];
  for (const d of ordered) {
    if (left <= BigInt(0)) break;
    const take = d.balancePaise < left ? d.balancePaise : left;
    lines.push({ dueId: d.id, feeHeadId: d.feeHeadId, amountPaise: take });
    left -= take;
  }
  if (lines.length) {
    await tx.paymentAllocation.createMany({ data: lines.map((l) => ({ schoolId: ctx.schoolId, paymentId, dueId: l.dueId, feeHeadId: l.feeHeadId, amountPaise: l.amountPaise })) });
    for (const l of lines) await tx.studentFeeDue.update({ where: { id: l.dueId }, data: { paidPaise: { increment: l.amountPaise } } });
    await refreshBalances(tx, lines.map((l) => l.dueId));
  }
  if (left > BigInt(0)) await tx.payment.update({ where: { id: paymentId }, data: { advancePaise: left } });
}
