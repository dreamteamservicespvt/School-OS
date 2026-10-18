// Income (07 §2): money the school receives other than fees, such as hall
// rent, donations or scrap sale. Posted income goes to the Day Book and gets
// a receipt number; a draft waits. Cancel keeps the record and reverses it.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatDateTime, formatRupees } from "../format";
import { nextNumber, formatNumber } from "../sequences";
import { htmlToPdf, esc } from "../pdf";
import { rupeesInWords } from "../documents/words";
import { dataUri } from "../documents";
import { MoneyProblem } from "../fees/problem";
import { postToDayBook, reverseSource } from "./daybook";
import { accountForMode, financeSettings } from "./settings";
import { assertBooksOpen, assertNotFuture, financialYearOf } from "./years";
import { financeModeLabel } from "./words";

export type IncomeInput = { date: Date; accountHeadId: string; amountPaise: bigint; receivedFrom: string; vendorId: string | null; mode: string; reference: string | null; accountId: string | null; note: string | null };

async function check(tx: Tx, input: IncomeInput) {
  if (input.amountPaise <= BigInt(0)) throw new MoneyProblem("Amount must be more than ₹0.", "amount");
  const head = await tx.accountHead.findFirst({ where: { id: input.accountHeadId, kind: "INCOME", archivedAt: null } });
  if (!head) throw new MoneyProblem("Choose the income head.", "accountHeadId");
  if (head.systemKey === "fees") throw new MoneyProblem("Fees are recorded in Fee Management, not here. Choose another income head.", "accountHeadId");
  if (input.receivedFrom.trim().length < 2) throw new MoneyProblem("Say who the money came from.", "receivedFrom");
  if (!["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"].includes(input.mode)) throw new MoneyProblem("Choose the mode.", "mode");
  if (input.mode !== "CASH" && !input.reference) throw new MoneyProblem(`Enter the ${input.mode === "CHEQUE" ? "cheque number" : "transaction or UTR number"}.`, "reference");
  return head;
}

export async function recordIncome(tx: Tx, ctx: SchoolContext, input: IncomeInput, postNow: boolean) {
  await assertNotFuture(tx, ctx, input.date, "date", "The date received");
  const head = await check(tx, input);
  const fy = postNow ? await assertBooksOpen(tx, ctx, input.date) : await financialYearOf(tx, ctx, input.date);
  const accountId = await accountForMode(tx, ctx, input.mode, input.accountId);
  const income = await tx.income.create({
    data: {
      schoolId: ctx.schoolId, financialYearId: fy.id, date: input.date, accountHeadId: head.id, amountPaise: input.amountPaise, receivedFrom: input.receivedFrom.trim(),
      vendorId: input.vendorId, mode: input.mode, reference: input.reference, accountId, note: input.note, status: "DRAFT", recordedById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Income", recordId: income.id, after: { head: head.name, amount: formatRupees(input.amountPaise), from: input.receivedFrom, date: formatDate(input.date) } });
  if (postNow) return postIncome(tx, ctx, income.id);
  return { ...income, dayBookDate: null as Date | null };
}

/** Posts a draft: receipt number, Day Book entry. */
export async function postIncome(tx: Tx, ctx: SchoolContext, incomeId: string) {
  const i = await tx.income.findFirst({ where: { id: incomeId } });
  if (!i) throw new MoneyProblem("This income was not found.");
  if (i.status === "POSTED") return { ...i, dayBookDate: null as Date | null };
  if (i.status === "CANCELLED") throw new MoneyProblem("This income is cancelled.");
  await assertNotFuture(tx, ctx, i.date, "date", "The date received");
  const fy = await assertBooksOpen(tx, ctx, i.date);
  const s = await financeSettings(tx, ctx);
  const n = await nextNumber(tx, ctx, `income-receipt:${fy.name}`);
  const receiptNo = formatNumber(`${s.incomeReceiptPrefix}${fy.name}/`, n, 5);
  const posted = await tx.income.update({ where: { id: i.id }, data: { status: "POSTED", receiptNo, postedAt: new Date(), financialYearId: fy.id } });
  const head = await tx.accountHead.findUnique({ where: { id: i.accountHeadId } });
  const { entry } = await postToDayBook(tx, ctx, {
    date: i.date, direction: "IN", amountPaise: i.amountPaise, mode: i.mode, section: "other-income", headName: head?.name ?? "Income", accountHeadId: i.accountHeadId,
    accountId: i.accountId, sourceType: "income", sourceId: i.id, sourceKey: `income:${i.id}`, vendorId: i.vendorId, partyName: i.receivedFrom, reference: i.reference, note: i.note,
  });
  await writeAudit(tx, ctx, { action: "posted", recordType: "Income", recordId: i.id, after: { receiptNo } });
  // The Day Book date differs from the income's date when that day was already closed.
  return { ...posted, dayBookDate: entry.date as Date | null };
}

export async function cancelIncome(tx: Tx, ctx: SchoolContext, incomeId: string, reason: string, today: Date) {
  if (reason.trim().length < 5) throw new MoneyProblem("Give a reason of at least 5 characters.", "reason");
  const i = await tx.income.findFirst({ where: { id: incomeId } });
  if (!i) throw new MoneyProblem("This income was not found.");
  if (i.status === "CANCELLED") throw new MoneyProblem("This income is already cancelled.");
  if (i.status === "POSTED") {
    await assertBooksOpen(tx, ctx, today);
    await reverseSource(tx, ctx, { sourceType: "income", sourceId: i.id, date: today, reversalType: "income-cancel", note: `Income cancelled: ${reason}` });
  }
  await tx.income.update({ where: { id: i.id }, data: { status: "CANCELLED", cancelReason: reason.trim(), cancelledAt: new Date(), cancelledById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "cancelled", recordType: "Income", recordId: i.id, before: { status: i.status }, after: { reason } });
}

/** A printable receipt for posted income, in the school's colours. */
export async function incomeReceipt(tx: Tx, ctx: SchoolContext, incomeId: string) {
  const i = await tx.income.findFirst({ where: { id: incomeId } });
  if (!i || i.status !== "POSTED" || !i.receiptNo) throw new MoneyProblem("Only posted income has a receipt.");
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId } });
  const head = await tx.accountHead.findUnique({ where: { id: i.accountHeadId } });
  const by = i.recordedById ? await tx.userLogin.findUnique({ where: { id: i.recordedById }, select: { displayName: true } }) : null;
  const logo = await dataUri(tx, school.logoFileId);
  const accent = school.brandColor && /^#[0-9a-fA-F]{6}$/.test(school.brandColor) ? school.brandColor : "#1D4ED8";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Income receipt ${esc(i.receiptNo)}</title><style>
    body{font-family:Arial,"Noto Sans",sans-serif;color:#111;font-size:10.5pt;margin:0}
    .page{border:1.5px solid ${accent};padding:7mm;position:relative}
    .head{display:flex;gap:5mm;align-items:center;border-bottom:2px solid ${accent};padding-bottom:3mm;margin-bottom:4mm}
    .head img{height:18mm} h1{font-size:15pt;margin:0} .addr{font-size:9pt;color:#444}
    h2{text-align:center;letter-spacing:.08em;font-size:12pt;margin:2mm 0 4mm;color:${accent}}
    dl{display:grid;grid-template-columns:38mm 1fr;gap:1.5mm 4mm;margin:0} dt{color:#555} dd{margin:0;font-weight:600}
    .amt{margin-top:5mm;border:1px solid #bbb;padding:3mm;display:flex;justify-content:space-between;font-size:13pt}
    .words{font-style:italic;margin-top:2mm} .sign{margin-top:16mm;text-align:right} .cancel{color:#b91c1c;font-weight:700}
  </style></head><body><section class="page">
    <div class="head">${logo ? `<img src="${logo}" alt="">` : ""}<div><h1>${esc(school.name)}</h1><div class="addr">${esc(school.address ?? "")}</div><div class="addr">${esc([school.phone, school.email].filter(Boolean).join(" · "))}</div></div></div>
    <h2>INCOME RECEIPT</h2>
    <dl>
      <dt>Receipt number</dt><dd>${esc(i.receiptNo)}</dd>
      <dt>Date</dt><dd>${esc(formatDate(i.date))}</dd>
      <dt>Received from</dt><dd>${esc(i.receivedFrom)}</dd>
      <dt>Towards</dt><dd>${esc(head?.name ?? "")}${i.note ? ` (${esc(i.note)})` : ""}</dd>
      <dt>Mode</dt><dd>${esc(financeModeLabel(i.mode))}${i.reference ? `, ${esc(i.reference)}` : ""}</dd>
      <dt>Recorded by</dt><dd>${esc(by?.displayName ?? "")}, ${esc(formatDateTime(i.postedAt ?? i.createdAt, school.timeZone))}</dd>
    </dl>
    <div class="amt"><span>Amount received</span><strong>${esc(formatRupees(i.amountPaise))}</strong></div>
    <p class="words">${esc(rupeesInWords(i.amountPaise))}</p>
    ${i.status !== "POSTED" ? `<p class="cancel">Cancelled: ${esc(i.cancelReason ?? "")}</p>` : ""}
    <p class="sign">Authorised signatory</p>
  </section></body></html>`;
  return { html, fileName: `income-receipt-${i.receiptNo.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`, pdf: () => htmlToPdf(html, { format: "A5", margin: "8mm" }) };
}
