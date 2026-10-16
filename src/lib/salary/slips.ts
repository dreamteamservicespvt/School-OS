// Salary Slips (10 §2): one per staff member per approved month, printed in
// the school's "Salary slip" design (Settings, Document Designs). Staff see
// only their own, from My profile; office staff send or print them in bulk.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { decryptField, maskLast4 } from "../crypto";
import { renderDocument, type DocumentData } from "../documents";
import { rupeesInWords } from "../documents/words";
import { MoneyProblem } from "../fees/problem";
import { formatRupees } from "../format";
import { sendMessage } from "../messaging";
import { lineDays } from "./payroll";
import { salarySettings } from "./settings";
import { dayNum, monthName } from "./words";

const ZERO = BigInt(0);
type Money = { name: string; amountPaise: string };

export type SlipLine = { label: string; amountPaise: bigint; kind: "earning" | "deduction" };

/** The earnings and deductions on a slip, from the frozen payroll line. TDS is always shown (Done when 11). */
export function slipLines(l: {
  earnings: Prisma.JsonValue; otherDeductions: Prisma.JsonValue; fullGrossPaise: bigint; grossPaise: bigint; lopDays: Prisma.Decimal | number; overtimePaise: bigint; addPaise: bigint; cutPaise: bigint;
  pfPaise: bigint; esiPaise: bigint; esiApplies: boolean; ptPaise: bigint; tdsPaise: bigint; recoveryPaise: bigint;
}): SlipLine[] {
  const out: SlipLine[] = [];
  for (const e of (l.earnings as Money[]) ?? []) out.push({ label: e.name, amountPaise: BigInt(e.amountPaise), kind: "earning" });
  if (l.overtimePaise > ZERO) out.push({ label: "Overtime", amountPaise: l.overtimePaise, kind: "earning" });
  if (l.addPaise > ZERO) out.push({ label: "Bonus and arrears", amountPaise: l.addPaise, kind: "earning" });
  // Earnings print in full; what was not earned (loss of pay, days before joining or after leaving) is one deduction, so net matches to the paisa.
  const unpaid = l.fullGrossPaise + l.overtimePaise + l.addPaise - l.grossPaise;
  if (unpaid > ZERO) out.push({ label: Number(l.lopDays) > 0 ? "Loss of pay" : "Days not employed", amountPaise: unpaid, kind: "deduction" });
  out.push({ label: "Provident Fund", amountPaise: l.pfPaise, kind: "deduction" });
  if (l.esiApplies) out.push({ label: "ESI", amountPaise: l.esiPaise, kind: "deduction" });
  if (l.ptPaise > ZERO) out.push({ label: "Professional tax", amountPaise: l.ptPaise, kind: "deduction" });
  out.push({ label: "Income tax (TDS)", amountPaise: l.tdsPaise, kind: "deduction" });
  for (const d of (l.otherDeductions as Money[]) ?? []) out.push({ label: d.name, amountPaise: BigInt(d.amountPaise), kind: "deduction" });
  if (l.recoveryPaise > ZERO) out.push({ label: "Advance or loan recovery", amountPaise: l.recoveryPaise, kind: "deduction" });
  if (l.cutPaise > ZERO) out.push({ label: "Other deductions", amountPaise: l.cutPaise, kind: "deduction" });
  return out;
}

async function loadSlip(tx: Tx, slipId: string) {
  const slip = await tx.payslip.findFirst({ where: { id: slipId }, include: { run: true } });
  if (!slip) throw new MoneyProblem("This salary slip was not found.");
  const line = await tx.payrollLine.findFirstOrThrow({ where: { id: slip.lineId } });
  return { ...slip, line };
}

/** What the slip document needs, for one slip. */
export async function slipDocument(tx: Tx, ctx: SchoolContext, slipId: string): Promise<{ data: DocumentData; fileName: string; staffId: string; title: string }> {
  const slip = await loadSlip(tx, slipId);
  const staff = await tx.staff.findFirstOrThrow({ where: { id: slip.staffId }, include: { department: { select: { name: true } } } });
  const l = slip.line;
  const settings = await salarySettings(tx, ctx);
  const d = lineDays(l);
  const lines = slipLines(l);
  const fields: DocumentData["fields"] = {
    staff_name: staff.fullName, staff_code: staff.staffCode, designation: staff.designation, department: staff.department?.name ?? "",
    slip_month: monthName(slip.month), bank_account: staff.bankAccountEnc ? maskLast4(decryptField(staff.bankAccountEnc)) : "", pan: staff.panEnc ? maskPan(decryptField(staff.panEnc)) : "",
    uan: staff.uan ?? "", days_paid: `${dayNum(d.paid)} of ${l.daysInMonth}${settings.slipShowLeave && d.lop ? ` (loss of pay ${dayNum(d.lop)})` : ""}`,
    net_pay_words: rupeesInWords(l.netPaise), amount_in_words: rupeesInWords(l.netPaise),
  };
  if (settings.slipShowEmployer) fields.employer_share = `School also paid PF ${formatRupees(l.erPfPaise)}${l.esiApplies ? ` and ESI ${formatRupees(l.erEsiPaise)}` : ""}`;
  return {
    data: { fields, lines: lines.map((x) => ({ label: x.label, amountPaise: x.amountPaise, kind: x.kind })), campusId: slip.run.campusId },
    fileName: `salary-slip-${staff.staffCode}-${slip.month.toISOString().slice(0, 7)}.pdf`.replace(/[^\w.-]/g, "-"),
    staffId: staff.id, title: `Salary slip ${staff.fullName} ${monthName(slip.month)}`,
  };
}

const maskPan = (pan: string) => (pan.length === 10 ? `XXXXX${pan.slice(5, 9)}X` : maskLast4(pan));

/** The slip PDF. When the staff member opens their own, it is marked downloaded. */
export async function slipPdf(tx: Tx, ctx: SchoolContext, slipIds: string[], opts: { ownStaffId?: string | null } = {}) {
  const docs = [];
  for (const id of slipIds) docs.push(await slipDocument(tx, ctx, id));
  if (!docs.length) throw new MoneyProblem("Choose the slips.");
  const doc = await renderDocument(tx, ctx, "salary-slip", docs.map((d) => d.data));
  if (opts.ownStaffId) {
    await tx.payslip.updateMany({ where: { id: { in: slipIds }, staffId: opts.ownStaffId }, data: { status: "DOWNLOADED", downloadedAt: new Date() } });
  }
  return { pdf: await doc.pdf(), html: doc.html, fileName: docs.length === 1 ? docs[0].fileName : `salary-slips-${docs.length}.pdf`, title: docs.length === 1 ? docs[0].title : `${docs.length} salary slips` };
}

/** Send slips to staff on WhatsApp or email (the PDF stays in My profile, behind their login). */
export async function sendSlips(tx: Tx, ctx: SchoolContext, slipIds: string[], channel: "whatsapp" | "email" | "app") {
  if (!slipIds.length) throw new MoneyProblem("Choose the slips to send.");
  const slips = await tx.payslip.findMany({ where: { id: { in: slipIds } }, include: { run: { select: { month: true, status: true } } } });
  if (!slips.length) throw new MoneyProblem("Choose the slips to send.");
  const month = slips[0].run.month;
  const result = await sendMessage(tx, ctx, {
    to: { staffIds: slips.map((s) => s.staffId) }, channels: [channel], title: "Salary slip ready",
    text: `Dear {staff_name}, your salary slip for ${monthName(month)} is ready. Open it in My profile.`,
    trigger: "Salary slips", source: { type: "Payroll Run", id: slips[0].runId }, scope: undefined,
  });
  await tx.payslip.updateMany({ where: { id: { in: slips.map((s) => s.id) }, status: "MADE" }, data: { status: "SENT", sentAt: new Date() } });
  for (const s of slips) {
    if (!s.sentVia.includes(channel)) await tx.payslip.update({ where: { id: s.id }, data: { sentVia: { push: channel } } });
  }
  await writeAudit(tx, ctx, { action: "salary-slips-sent", recordType: "Payroll Run", recordId: slips[0].runId, after: { slips: slips.length, channel, month: monthName(month) } });
  return { count: slips.length, people: result.people, skipped: result.skipped };
}
