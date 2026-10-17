"use server";

import { formatRupees } from "@/lib/format";
import type { Tx } from "@/lib/db";
import { canSeeStudent, type FeeViewer } from "@/lib/fees/access";
import { createFeeCertificate, createFeeInvoice } from "@/lib/fees/documents";
import { sendPaymentLink } from "@/lib/fees/online";
import { addOldDues } from "@/lib/fees/opening";
import { MoneyProblem } from "@/lib/fees/problem";
import { addCharge, adjustDue, assignToStudent, removeDue } from "@/lib/fees/structure";
import { dateOf, id, ids, needRupees, optionalId, optionalText, str, text } from "@/lib/fees/act";
import { feeAction } from "../../_lib/action";

const BASE = "/fee-management/documents";

async function student(tx: Tx, viewer: FeeViewer, fd: FormData) {
  const studentId = id(fd, "studentId", "student");
  if (!(await canSeeStudent(tx, viewer, studentId))) throw new MoneyProblem("This student was not found.");
  return studentId;
}

/** Old dues from before School OS: a "Brought in" row on the ledger. Nothing goes to the Day Book. */
export async function addOldDuesAction(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx, viewer) => {
    const studentId = await student(tx, viewer, fd);
    const r = await addOldDues(tx, ctx, {
      studentId,
      feeHeadId: optionalId(fd, "feeHeadId"),
      amountPaise: needRupees(fd, "amount", "Amount"),
      dueDate: dateOf(fd, "dueDate", "Due date"),
      note: optionalText(fd, "note", "Note", 300),
    });
    return { amount: formatRupees(r.due.amountPaise), name: r.student.fullName.split(" ")[0] };
  }, (r) => `Opening balance of ${r.amount} added. It shows on ${r.name}’s ledger as “Brought in” and is in the audit log.`, { staffOnly: "add old dues" });
}

/** Adds to, reduces or removes one row, always with a reason. Payments themselves never change. */
export async function adjustAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx, viewer) => {
    const studentId = await student(tx, viewer, fd);
    const dueId = id(fd, "dueId", "row");
    const due = await tx.studentFeeDue.findFirst({ where: { id: dueId, studentId } });
    if (!due) throw new MoneyProblem("Choose the row to change.", "dueId");
    const how = str(fd, "how");
    const reason = text(fd, "reason", "Reason", { min: 5, max: 300 });
    if (how === "remove") {
      await removeDue(tx, ctx, dueId, reason);
      return `${due.label} removed from the fees. It stays on the ledger with the reason.`;
    }
    if (how !== "add" && how !== "reduce") throw new MoneyProblem("Choose what to do with the row.", "how");
    const amount = needRupees(fd, "amount", "Amount");
    await adjustDue(tx, ctx, dueId, how === "add" ? amount : -amount, reason);
    return `${due.label}: ${how === "add" ? "added" : "reduced by"} ${formatRupees(amount)}. The adjustment is on the ledger with the reason.`;
  }, (m) => m, { staffOnly: "adjust fees" });
}

/** A one-off charge for this student (a fine, a lost book, an extra activity). */
export async function addChargeAction(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx, viewer) => {
    const studentId = await student(tx, viewer, fd);
    const due = await addCharge(tx, ctx, {
      studentId,
      feeHeadId: id(fd, "feeHeadId", "fee head"),
      amountPaise: needRupees(fd, "amount", "Amount"),
      dueDate: dateOf(fd, "dueDate", "Due date"),
      label: optionalText(fd, "label", "Name on the receipt", 80) ?? "",
      reason: text(fd, "reason", "Reason", { min: 5, max: 300 }),
    });
    return formatRupees(due.amountPaise);
  }, (a) => `${a} added to the student’s fees.`, { staffOnly: "add fees" });
}

/** Gives the student a published fee plan (their class plan, or another one with a reason). */
export async function assignPlanAction(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx, viewer) => {
    const studentId = await student(tx, viewer, fd);
    const n = await assignToStudent(tx, ctx, studentId, id(fd, "structureId", "fee structure"), optionalText(fd, "reason", "Reason", 300));
    return n;
  }, (n) => `Fee plan assigned: ${n} ${n === 1 ? "row" : "rows"} added.`, { staffOnly: "assign fees" });
}

/** A fee certificate (for income tax) for one financial year, with its own number. */
export async function certificateAction(_prev: unknown, fd: FormData) {
  return feeAction("print", fd, async (tx, ctx, viewer) => {
    const studentId = await student(tx, viewer, fd);
    const doc = await createFeeCertificate(tx, ctx, studentId, id(fd, "financialYearId", "financial year"));
    return { id: doc.id, number: doc.number, total: formatRupees(doc.totalPaise) };
  }, (d) => ({ message: `Fee certificate ${d.number} is ready: ${d.total} paid.`, link: { href: `${BASE}/${d.id}`, label: "Open certificate" } }), { staffOnly: "make fee certificates" });
}

/** A fee invoice for the ticked rows (what is due now unless more are ticked), and (when chosen) the parent gets it with a Razorpay link. */
export async function invoiceAction(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx, viewer) => {
    const studentId = await student(tx, viewer, fd);
    const dueIds = ids(fd, "dueId");
    if (!dueIds.length) throw new MoneyProblem("Tick at least one row to put on the invoice.", "dueId");
    const doc = await createFeeInvoice(tx, ctx, studentId, dueIds);
    let sent = false;
    if (str(fd, "send") === "on") {
      const dueIds = (doc.details as { dueIds: string[] }).dueIds;
      await sendPaymentLink(tx, ctx, { studentId, dueIds, channel: "whatsapp" });
      sent = true;
    }
    return { id: doc.id, number: doc.number, total: formatRupees(doc.totalPaise), sent };
  }, (d) => ({
    message: `Fee invoice ${d.number} for ${d.total} is ready${d.sent ? " and sent on WhatsApp with a payment link" : ""}.`,
    link: { href: `${BASE}/${d.id}`, label: "Open invoice" },
  }), { staffOnly: "make fee invoices" });
}

/** Sends an invoice's unpaid rows to the parent again, with a fresh Razorpay link. */
export async function resendInvoiceAction(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx, viewer) => {
    const studentId = await student(tx, viewer, fd);
    const doc = await tx.feeDocument.findFirst({ where: { id: id(fd, "invoiceId", "invoice"), studentId, kind: "invoice" } });
    if (!doc) throw new MoneyProblem("This invoice was not found.");
    const ids = (doc.details as { dueIds?: string[] }).dueIds ?? [];
    const open = await tx.studentFeeDue.findMany({ where: { id: { in: ids }, state: "OPEN", balancePaise: { gt: 0 } }, select: { id: true } });
    if (!open.length) throw new MoneyProblem(`Invoice ${doc.number} is fully paid, so there is nothing to send.`);
    const r = await sendPaymentLink(tx, ctx, { studentId, dueIds: open.map((d) => d.id), channel: "whatsapp" });
    return { number: doc.number, amount: formatRupees(r.amount) };
  }, (r) => `Invoice ${r.number} sent again on WhatsApp: ${r.amount} with a payment link.`, { staffOnly: "send invoices" });
}
