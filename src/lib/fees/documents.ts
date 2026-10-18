// Fee receipts, tax invoices, fee invoices and fee certificates, drawn from
// the school's designs in Settings, Document Designs. A receipt prints as
// office copy, parent copy or both; a cancelled receipt carries a CANCELLED
// stamp; brought-in receipts say so.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { renderDocument, type DocumentData } from "../documents";
import { currentDesign } from "../documents/designs";
import { htmlToPdf, esc } from "../pdf";
import { formatDate, formatRupees, formatDateTime } from "../format";
import { nextNumber, formatNumber } from "../sequences";
import { writeAudit } from "../audit";
import { MoneyProblem } from "./problem";
import { dueStatus, openDues, studentCard } from "./dues";
import { todayIn } from "../staff/dates";
import { featureOn, feeSettings } from "./settings";
import { cancelReasonLabel, modeLabel, percentWord } from "./words";
import { financialYearOf } from "../finance/years";

const ZERO = BigInt(0);

type Copy = "both" | "office" | "parent";

/** Adds the copy label, a CANCELLED stamp and the receipt terms to each page of a rendered document. */
function decorate(html: string, pages: { label: string | null; extra: string | null }[], stamp: string | null) {
  const style = `<style>
    .sos-copy{position:absolute;top:2mm;right:3mm;font:600 8pt Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;border:1px solid #888;padding:.6mm 2mm;border-radius:1mm;background:#fff;color:#333}
    .sos-stamp{position:absolute;left:50%;top:45%;transform:translate(-50%,-50%) rotate(-18deg);font:800 34pt Arial,sans-serif;color:rgba(185,28,28,.55);border:5px solid rgba(185,28,28,.55);padding:2mm 8mm;border-radius:3mm;pointer-events:none;white-space:nowrap}
    .sos-extra{margin-top:3mm;font-size:8.5pt;color:#333;border-top:1px dashed #bbb;padding-top:2mm}
  </style>`;
  let i = 0;
  const out = html
    .replace("</head>", `${style}</head>`)
    .replace(/<section class="page">([\s\S]*?)<\/section>/g, (_m, inner: string) => {
      const p = pages[i++] ?? { label: null, extra: null };
      return `<section class="page">${p.label ? `<div class="sos-copy">${esc(p.label)}</div>` : ""}${stamp ? `<div class="sos-stamp">${esc(stamp)}</div>` : ""}${inner}${p.extra ? `<div class="sos-extra">${p.extra}</div>` : ""}</section>`;
    });
  return out;
}

async function paperOf(tx: Tx, kind: string) {
  const d = await currentDesign(tx, kind);
  return { format: d.options.paper, margin: d.options.paper === "A5" ? "8mm" : "12mm" };
}

/** Everything a receipt shows for one payment. */
export async function receiptData(tx: Tx, ctx: SchoolContext, paymentId: string) {
  const p = await tx.payment.findFirst({ where: { id: paymentId }, include: { allocations: { where: { fromAdvance: false } } } });
  if (!p) return null;
  const receipt = await tx.receipt.findUnique({ where: { paymentId } });
  if (!receipt) return null;
  const card = await studentCard(tx, ctx, p.studentId, p.academicYearId);
  const dues = await tx.studentFeeDue.findMany({ where: { id: { in: p.allocations.map((a) => a.dueId) } } });
  const heads = await tx.feeHead.findMany({ where: { id: { in: p.allocations.map((a) => a.feeHeadId) } } });
  const splitOn = await featureOn(tx, ctx, "fee-bank-accounts");
  const accounts = splitOn ? await tx.bankAccount.findMany({ where: { kind: "BANK" } }) : [];
  const main = accounts.find((a) => a.isMain) ?? null;
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const collector = p.collectedById ? await tx.userLogin.findUnique({ where: { id: p.collectedById }, select: { displayName: true } }) : null;
  const lines: NonNullable<DocumentData["lines"]> = p.allocations.filter((a) => a.amountPaise > ZERO).map((a) => {
    const due = dues.find((d) => d.id === a.dueId);
    const head = heads.find((h) => h.id === a.feeHeadId);
    const account = splitOn ? accounts.find((x) => x.id === a.bankAccountId) ?? main : null;
    return {
      label: due?.kind === "LATE_FEE" ? (due.label ?? "Late fee") : `${head?.name ?? "Fees"}${due ? ` · ${due.label}` : ""}`,
      amountPaise: a.amountPaise,
      note: account ? `Into ${account.name}` : undefined,
    };
  });
  if (p.advancePaise > ZERO) lines.push({ label: "Advance (held for the next installments)", amountPaise: p.advancePaise, note: splitOn && main ? `Into ${main.name}` : undefined });
  const balance = (await openDues(tx, p.studentId)).reduce((s, d) => s + d.balancePaise, ZERO);
  const mode = p.mode === "CHEQUE"
    ? `Cheque ${p.chequeNo ?? ""}, ${p.chequeBank ?? ""}${p.chequeDate ? `, dated ${formatDate(p.chequeDate)}` : ""}`
    : modeLabel(p.mode);
  const data: DocumentData = {
    fields: {
      receipt_no: receipt.number,
      receipt_date: formatDateTime(p.paidAt, school.timeZone),
      student_name: card?.name ?? "",
      admission_no: card?.admissionNo ?? "",
      class_section: card?.classSection ?? "",
      roll_no: card?.rollNo ? String(card.rollNo) : "",
      father_name: card?.fatherName ?? "",
      guardian_name: card?.primaryGuardian?.name ?? "",
      guardian_phone: card?.primaryGuardian?.phone ?? "",
      payment_mode: mode,
      reference_no: p.reference ?? (p.oldReceiptNo ? `Old receipt ${p.oldReceiptNo}` : ""),
      received_by: p.broughtIn ? "Brought in from old software" : collector?.displayName ?? (p.source === "COUNTER" ? "" : "Online"),
      balance_due: formatRupees(balance),
    },
    lines,
    photoFileId: card?.photoFileId ?? null,
    verifyText: receipt.number,
    campusId: card?.campusId ?? null,
  };
  return { payment: p, receipt, data, card };
}

/** The receipt as HTML and PDF: office copy, parent copy or both (Fee Settings default). */
export async function renderReceipt(tx: Tx, ctx: SchoolContext, paymentId: string, copy?: Copy) {
  const r = await receiptData(tx, ctx, paymentId);
  if (!r) throw new MoneyProblem("This payment has no receipt. Receipts are made only for posted payments.");
  const settings = await feeSettings(tx, ctx);
  const which: Copy = copy ?? (settings.printCopies as Copy);
  const copies = which === "both" ? (["Office copy", "Parent copy"] as const) : which === "office" ? (["Office copy"] as const) : (["Parent copy"] as const);
  const doc = await renderDocument(tx, ctx, "fee-receipt", copies.map(() => r.data));
  const terms = settings.receiptTerms ? esc(settings.receiptTerms).replace(/\n/g, "<br>") : null;
  const pages = copies.map((c) => {
    const parts: string[] = [];
    if (r.payment.discountPaise > ZERO) parts.push(`Discount given with this payment: ${esc(formatRupees(r.payment.discountPaise))}.`);
    if (c === "Office copy" && r.payment.note) parts.push(`Note: ${esc(r.payment.note)}`);
    if (r.payment.broughtIn) parts.push(`Brought in from old software${r.payment.oldReceiptNo ? `, old receipt ${esc(r.payment.oldReceiptNo)}` : ""}. Not in the Day Book.`);
    if (r.receipt.status === "cancelled") parts.push(`Cancelled on ${esc(formatDate(r.payment.cancelledAt ?? new Date()))}: ${esc(cancelReasonLabel(r.payment.cancelReason))}${r.payment.cancelNote ? ` (${esc(r.payment.cancelNote)})` : ""}.`);
    if (terms) parts.push(terms);
    return { label: c, extra: parts.length ? parts.join("<br>") : null };
  });
  const html = decorate(doc.html, pages, r.receipt.status === "cancelled" ? "CANCELLED" : null);
  const size = await paperOf(tx, "fee-receipt");
  return { html, fileName: `receipt-${r.receipt.number.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`, pdf: () => htmlToPdf(html, size), receipt: r.receipt, card: r.card };
}

/** The GST tax invoice for a payment on taxable fee heads. */
export async function renderTaxInvoice(tx: Tx, ctx: SchoolContext, paymentId: string) {
  const inv = await tx.taxInvoice.findUnique({ where: { paymentId } });
  if (!inv) throw new MoneyProblem("This payment has no tax invoice. Tax invoices are made for taxable fee heads only.");
  const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const card = await studentCard(tx, ctx, p.studentId, p.academicYearId);
  const lines = (inv.lines as { name: string; sacCode: string | null; rateBp: number; amountPaise: string; taxPaise: string }[]).map((l) => ({
    label: `${l.name}${l.sacCode ? ` (SAC ${l.sacCode})` : ""}`,
    amountPaise: BigInt(l.amountPaise),
    note: `GST ${percentWord(l.rateBp)} included: ${formatRupees(BigInt(l.taxPaise))} (CGST ${formatRupees(BigInt(l.taxPaise) / BigInt(2))}, SGST ${formatRupees(BigInt(l.taxPaise) - BigInt(l.taxPaise) / BigInt(2))})`,
  }));
  const receipt = await tx.receipt.findUnique({ where: { paymentId } });
  const doc = await renderDocument(tx, ctx, "tax-invoice", {
    fields: {
      invoice_no: inv.number,
      invoice_date: formatDate(inv.date),
      place_of_supply: inv.placeOfSupply ?? "",
      tax_total: formatRupees(inv.taxPaise),
      student_name: card?.name ?? "",
      admission_no: card?.admissionNo ?? "",
      class_section: card?.classSection ?? "",
      father_name: card?.fatherName ?? "",
    },
    lines,
    verifyText: inv.number,
    campusId: card?.campusId ?? null,
  });
  const extra = `Taxable value ${esc(formatRupees(inv.taxablePaise))} + GST ${esc(formatRupees(inv.taxPaise))} = ${esc(formatRupees(inv.totalPaise))}. School GSTIN ${esc(inv.gstin)}.${receipt ? ` Against receipt ${esc(receipt.number)}.` : ""}`;
  const html = decorate(doc.html, [{ label: null, extra }], inv.status === "cancelled" ? "CANCELLED" : null);
  const size = await paperOf(tx, "tax-invoice");
  return { html, fileName: `tax-invoice-${inv.number.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`, pdf: () => htmlToPdf(html, size), invoice: inv };
}

/**
 * Makes a fee invoice for chosen dues of a student (with its own number) and
 * returns it. With no rows chosen it covers what is due now: the Due and
 * Overdue rows (late fees included), never installments that are not due yet.
 */
export async function createFeeInvoice(tx: Tx, ctx: SchoolContext, studentId: string, dueIds: string[]) {
  const open = await openDues(tx, studentId);
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const today = todayIn(school.timeZone);
  // A chosen row brings its late fee with it (the ledger shows them together).
  const chosen = dueIds.length
    ? open.filter((d) => dueIds.includes(d.id) || (d.kind === "LATE_FEE" && d.parentDueId !== null && dueIds.includes(d.parentDueId)))
    : open.filter((d) => ["DUE", "OVERDUE"].includes(dueStatus(d, today)));
  if (!chosen.length) throw new MoneyProblem(dueIds.length ? "None of the chosen rows has anything left to pay." : "Nothing is due now for this student, so there is nothing to invoice.");
  const settings = await feeSettings(tx, ctx);
  const fy = await financialYearOf(tx, ctx, new Date());
  const n = await nextNumber(tx, ctx, `fee-invoice:${fy.name}`);
  const number = formatNumber(`${settings.invoicePrefix}${fy.name}/`, n, 5);
  const total = chosen.reduce((s, d) => s + d.balancePaise, ZERO);
  const doc = await tx.feeDocument.create({
    data: { schoolId: ctx.schoolId, kind: "invoice", number, studentId, totalPaise: total, details: { dueIds: chosen.map((d) => d.id), dueDate: chosen[0].dueDate.toISOString().slice(0, 10), timeZone: school.timeZone }, createdById: ctx.userId },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Fee Invoice", recordId: doc.id, after: { number, total: formatRupees(total) } });
  return doc;
}

export async function renderFeeInvoice(tx: Tx, ctx: SchoolContext, documentId: string) {
  const doc = await tx.feeDocument.findFirst({ where: { id: documentId, kind: "invoice" } });
  if (!doc) throw new MoneyProblem("This invoice was not found.");
  const details = doc.details as { dueIds: string[]; dueDate: string };
  const dues = await tx.studentFeeDue.findMany({ where: { id: { in: details.dueIds } }, orderBy: { dueDate: "asc" } });
  const heads = await tx.feeHead.findMany({ where: { id: { in: dues.map((d) => d.feeHeadId) } } });
  const card = await studentCard(tx, ctx, doc.studentId);
  const lines = dues.map((d) => ({ label: d.kind === "LATE_FEE" ? d.label : `${heads.find((h) => h.id === d.feeHeadId)?.name ?? "Fees"} · ${d.label}`, amountPaise: d.amountPaise - d.concessionPaise + d.adjustmentPaise - d.paidPaise > ZERO ? d.amountPaise - d.concessionPaise + d.adjustmentPaise - d.paidPaise : ZERO, note: `Due ${formatDate(d.dueDate)}` }));
  const rendered = await renderDocument(tx, ctx, "fee-invoice", {
    fields: {
      invoice_no: doc.number,
      invoice_date: formatDate(doc.createdAt),
      due_date: formatDate(new Date(`${details.dueDate}T00:00:00Z`)),
      student_name: card?.name ?? "",
      admission_no: card?.admissionNo ?? "",
      class_section: card?.classSection ?? "",
      father_name: card?.fatherName ?? "",
    },
    lines: lines.map((l) => ({ ...l, amountPaise: l.amountPaise })),
    verifyText: doc.number,
    campusId: card?.campusId ?? null,
  });
  return { html: rendered.html, fileName: `invoice-${doc.number.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`, pdf: rendered.pdf, doc };
}

/** Fees paid by a student in a financial year: total and tuition part (for the fee certificate). Brought-in receipts count. */
export async function feesPaidIn(tx: Tx, studentId: string, from: Date, to: Date) {
  const payments = await tx.payment.findMany({ where: { studentId, status: "POSTED", paymentDate: { gte: from, lte: to } }, include: { allocations: { where: { fromAdvance: false } } } });
  const refunds = await tx.refund.aggregate({ where: { studentId, status: "REFUNDED", refundedOn: { gte: from, lte: to } }, _sum: { amountPaise: true } });
  const headIds = [...new Set(payments.flatMap((p) => p.allocations.map((a) => a.feeHeadId)))];
  const tuitionHeads = new Set((await tx.feeHead.findMany({ where: { id: { in: headIds }, kind: "tuition" } })).map((h) => h.id));
  const total = payments.reduce((s, p) => s + p.amountPaise, ZERO) - (refunds._sum.amountPaise ?? ZERO);
  const tuition = payments.flatMap((p) => p.allocations).filter((a) => tuitionHeads.has(a.feeHeadId)).reduce((s, a) => s + a.amountPaise, ZERO);
  return { total, tuition, count: payments.length };
}

export async function createFeeCertificate(tx: Tx, ctx: SchoolContext, studentId: string, financialYearId: string) {
  const fy = await tx.financialYear.findFirst({ where: { id: financialYearId } });
  if (!fy) throw new MoneyProblem("Choose the financial year.", "financialYearId");
  const paid = await feesPaidIn(tx, studentId, fy.startDate, fy.endDate);
  if (paid.total <= ZERO) throw new MoneyProblem(`No fees were paid in ${fy.name}, so there is nothing to certify.`, "financialYearId");
  const settings = await feeSettings(tx, ctx);
  const n = await nextNumber(tx, ctx, `fee-certificate:${fy.name}`);
  const number = formatNumber(`${settings.certificatePrefix}${fy.name}/`, n, 4);
  const doc = await tx.feeDocument.create({
    data: { schoolId: ctx.schoolId, kind: "certificate", number, studentId, totalPaise: paid.total, details: { financialYearId: fy.id, financialYear: fy.name, tuitionPaise: paid.tuition.toString() }, createdById: ctx.userId },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Fee Certificate", recordId: doc.id, after: { number, year: fy.name, total: formatRupees(paid.total) } });
  return doc;
}

export async function renderFeeCertificate(tx: Tx, ctx: SchoolContext, documentId: string) {
  const doc = await tx.feeDocument.findFirst({ where: { id: documentId, kind: "certificate" } });
  if (!doc) throw new MoneyProblem("This certificate was not found.");
  const details = doc.details as { financialYear: string; tuitionPaise: string };
  const s = await tx.student.findFirst({ where: { id: doc.studentId } });
  const card = await studentCard(tx, ctx, doc.studentId);
  const mother = card?.guardians.find((g) => /mother/i.test(g.relationship));
  const rendered = await renderDocument(tx, ctx, "fee-certificate", {
    fields: {
      certificate_no: doc.number,
      fees_paid: formatRupees(doc.totalPaise),
      tuition_paid: formatRupees(BigInt(details.tuitionPaise)),
      financial_year: details.financialYear,
      student_name: card?.name ?? "",
      admission_no: card?.admissionNo ?? "",
      class_section: card?.classSection ?? "",
      roll_no: card?.rollNo ? String(card.rollNo) : "",
      father_name: card?.fatherName ?? "",
      mother_name: mother?.name ?? "",
      gender: s?.gender ?? "",
    },
    photoFileId: card?.photoFileId ?? null,
    verifyText: doc.number,
    campusId: card?.campusId ?? null,
  });
  return { html: rendered.html, fileName: `fee-certificate-${doc.number.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`, pdf: rendered.pdf, doc };
}
