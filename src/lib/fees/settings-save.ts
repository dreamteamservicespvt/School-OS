// Saving Fee Settings (06 §6), one card at a time. Each change is checked,
// saved and written to the audit log with what it was before. Receipt
// numbers already given never change; a new prefix applies to new receipts.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { MoneyProblem } from "./problem";
import { feeSettings } from "./settings";
import { COUNTER_PERMISSIONS, FEE_FEATURES, PAYMENT_MODES, type AgeingGroup, type CounterPermission } from "./words";
import { schoolRoles } from "../school-roles";

const ZERO = BigInt(0);
const PREFIX_RE = /^[A-Za-z0-9/\-_{}.]{0,20}$/;

async function save(tx: Tx, ctx: SchoolContext, what: string, data: Prisma.FeeSettingUpdateInput, before: Record<string, unknown>) {
  const s = await feeSettings(tx, ctx);
  await tx.feeSetting.update({ where: { id: s.id }, data: { ...data, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Fee Setting", recordId: s.id, before: { part: what, ...before }, after: { part: what, ...jsonable(data) } });
}

function jsonable(d: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === "bigint" ? formatRupees(v) : v]));
}

export type LateFeeInput = { on: boolean; type: "flat" | "per-day" | "percent"; amountPaise: bigint; percentBp: number; graceDays: number; maxPaise: bigint | null; headIds: string[] };

export async function saveLateFee(tx: Tx, ctx: SchoolContext, i: LateFeeInput) {
  if (!["flat", "per-day", "percent"].includes(i.type)) throw new MoneyProblem("Choose how the late fee is worked out.", "type");
  if (!Number.isInteger(i.graceDays) || i.graceDays < 0 || i.graceDays > 365) throw new MoneyProblem("Grace period must be 0 to 365 days.", "graceDays");
  if (i.on) {
    if (i.type === "percent" && (i.percentBp <= 0 || i.percentBp > 10000)) throw new MoneyProblem("Percent must be more than 0 and at most 100.", "percent");
    if (i.type !== "percent" && i.amountPaise <= ZERO) throw new MoneyProblem("Late fee must be more than ₹0.", "amount");
  }
  if (i.maxPaise !== null && i.maxPaise < ZERO) throw new MoneyProblem("The most per installment cannot be below ₹0.", "max");
  const heads = i.headIds.length ? await tx.feeHead.count({ where: { id: { in: i.headIds }, archivedAt: null } }) : 0;
  if (heads !== i.headIds.length) throw new MoneyProblem("One of the fee heads was not found.", "headId");
  const s = await feeSettings(tx, ctx);
  await save(tx, ctx, "late fee", {
    lateFeeOn: i.on, lateFeeType: i.type, lateFeePaise: i.type === "percent" ? ZERO : i.amountPaise, lateFeePercentBp: i.type === "percent" ? i.percentBp : 0,
    graceDays: i.graceDays, lateFeeMaxPaise: i.maxPaise, lateFeeHeadIds: i.headIds,
  }, { lateFeeOn: s.lateFeeOn, lateFeeType: s.lateFeeType, lateFee: formatRupees(s.lateFeePaise), percentBp: s.lateFeePercentBp, graceDays: s.graceDays });
}

export const REMINDER_DAY_CHOICES = [-7, -3, -1, 0, 1, 3, 7, 14, 21, 30];

export async function saveReminders(tx: Tx, ctx: SchoolContext, i: { on: boolean; days: number[]; channel: string; template: string }) {
  const days = [...new Set(i.days)].filter((d) => REMINDER_DAY_CHOICES.includes(d)).sort((a, b) => a - b);
  if (i.on && !days.length) throw new MoneyProblem("Choose at least one day to send reminders.", "day");
  if (!["whatsapp", "sms", "email"].includes(i.channel)) throw new MoneyProblem("Choose how reminders are sent.", "channel");
  const t = i.template.trim();
  if (t.length < 10 || t.length > 1000) throw new MoneyProblem("The message must be 10 to 1,000 characters.", "template");
  const s = await feeSettings(tx, ctx);
  await save(tx, ctx, "reminders", { remindersOn: i.on, reminderDays: days, reminderChannel: i.channel, reminderTemplate: t }, { remindersOn: s.remindersOn, reminderDays: s.reminderDays, channel: s.reminderChannel });
}

export async function saveReceipts(tx: Tx, ctx: SchoolContext, i: { prefix: string; digits: number; restartEachYear: boolean; partialSeries: boolean; partialPrefix: string; printCopies: string; terms: string | null }) {
  if (!i.prefix.trim() || !PREFIX_RE.test(i.prefix)) throw new MoneyProblem("Use letters, numbers and / - _ only, up to 20 characters. {YEAR} puts the financial year in.", "prefix");
  if (i.partialSeries && (!i.partialPrefix.trim() || !PREFIX_RE.test(i.partialPrefix))) throw new MoneyProblem("Give the part-payment series its own prefix, such as PP/.", "partialPrefix");
  if (i.partialSeries && i.partialPrefix === i.prefix) throw new MoneyProblem("The part-payment prefix must differ from the receipt prefix.", "partialPrefix");
  if (!Number.isInteger(i.digits) || i.digits < 3 || i.digits > 8) throw new MoneyProblem("The running number has 3 to 8 digits.", "digits");
  if (!["both", "parent", "office"].includes(i.printCopies)) throw new MoneyProblem("Choose which copies to print.", "printCopies");
  if (i.restartEachYear && !i.prefix.includes("{YEAR}")) throw new MoneyProblem("When numbers start again each year, put {YEAR} in the prefix so numbers never repeat.", "prefix");
  if (i.terms && i.terms.length > 600) throw new MoneyProblem("Terms can be up to 600 characters.", "terms");
  const s = await feeSettings(tx, ctx);
  await save(tx, ctx, "receipts", {
    receiptPrefix: i.prefix.trim(), receiptDigits: i.digits, restartEachYear: i.restartEachYear, partialSeries: i.partialSeries, partialPrefix: i.partialPrefix.trim() || "PP/",
    printCopies: i.printCopies, receiptTerms: i.terms?.trim() || null,
  }, { prefix: s.receiptPrefix, digits: s.receiptDigits, restartEachYear: s.restartEachYear, partialSeries: s.partialSeries });
}

export async function saveNumbering(tx: Tx, ctx: SchoolContext, i: { taxInvoicePrefix: string; invoicePrefix: string; certificatePrefix: string }) {
  for (const [k, v] of Object.entries(i)) if (!v.trim() || !PREFIX_RE.test(v)) throw new MoneyProblem("Use letters, numbers and / - _ only, up to 20 characters.", k);
  const s = await feeSettings(tx, ctx);
  await save(tx, ctx, "numbering", { taxInvoicePrefix: i.taxInvoicePrefix.trim(), invoicePrefix: i.invoicePrefix.trim(), certificatePrefix: i.certificatePrefix.trim() },
    { taxInvoicePrefix: s.taxInvoicePrefix, invoicePrefix: s.invoicePrefix, certificatePrefix: s.certificatePrefix });
}

/** Ageing groups from their upper ends, e.g. 30, 60, 90 gives 0–30, 31–60, 61–90 and over 90. */
export function ageingFromEnds(ends: number[]): AgeingGroup[] {
  const out: AgeingGroup[] = [];
  let from = 0;
  for (const e of ends) { out.push({ from, to: e }); from = e + 1; }
  out.push({ from, to: null });
  return out;
}

export async function saveAgeing(tx: Tx, ctx: SchoolContext, ends: number[]) {
  if (ends.length < 1 || ends.length > 8) throw new MoneyProblem("Use 1 to 8 groups before the last one.", "ends");
  for (let i = 0; i < ends.length; i++) {
    if (!Number.isInteger(ends[i]) || ends[i] < 1 || ends[i] > 3650) throw new MoneyProblem("Each group ends after 1 to 3,650 days.", "ends");
    if (i > 0 && ends[i] <= ends[i - 1]) throw new MoneyProblem("Each group must end later than the one before.", "ends");
  }
  const s = await feeSettings(tx, ctx);
  await save(tx, ctx, "ageing groups", { ageingGroups: ageingFromEnds(ends) as unknown as Prisma.InputJsonValue }, { ageingGroups: s.ageing });
}

export async function saveRouting(tx: Tx, ctx: SchoolContext, i: { default: string | null; byClass: Record<string, string> }) {
  const ids = [...new Set([i.default, ...Object.values(i.byClass)].filter((x): x is string => Boolean(x)))];
  const found = ids.length ? await tx.paymentGatewayAccount.count({ where: { id: { in: ids }, archivedAt: null } }) : 0;
  if (found !== ids.length) throw new MoneyProblem("One of the gateways was not found. Connect it in Settings, Payment Gateways first.");
  const s = await feeSettings(tx, ctx);
  await save(tx, ctx, "gateway for each class", { gatewayRouting: { default: i.default, byClass: i.byClass } as Prisma.InputJsonValue }, { routing: s.routing });
}

export async function savePayments(tx: Tx, ctx: SchoolContext, i: { verifyModes: string[]; concessionLimitPaise: bigint; cancelPastApproval: boolean }) {
  const modes = i.verifyModes.filter((m) => PAYMENT_MODES.some((p) => p.value === m) && m !== "GATEWAY");
  if (i.concessionLimitPaise < ZERO) throw new MoneyProblem("The limit cannot be below ₹0.", "limit");
  const s = await feeSettings(tx, ctx);
  await save(tx, ctx, "payments", { verifyModes: modes, concessionLimitPaise: i.concessionLimitPaise, cancelPastApproval: i.cancelPastApproval },
    { verifyModes: s.verifyModes, concessionLimit: formatRupees(s.concessionLimitPaise), cancelPastApproval: s.cancelPastApproval });
}

export async function saveCounter(tx: Tx, ctx: SchoolContext, map: Record<string, string[]>) {
  const roles = await schoolRoles(tx, ctx, { where: { archivedAt: null, key: { not: null } }, select: { key: true } });
  const known = new Set(roles.map((r) => r.key!));
  const next = {} as Record<CounterPermission, string[]>;
  for (const p of COUNTER_PERMISSIONS) next[p.key] = [...new Set((map[p.key] ?? []).filter((k) => known.has(k)))];
  const s = await feeSettings(tx, ctx);
  await save(tx, ctx, "counter permissions", { counterPermissions: next as Prisma.InputJsonValue }, { counter: s.counter });
}

export async function saveHeadAccounts(tx: Tx, ctx: SchoolContext, map: Record<string, string | null>) {
  const accountIds = [...new Set(Object.values(map).filter((x): x is string => Boolean(x)))];
  const found = accountIds.length ? await tx.bankAccount.count({ where: { id: { in: accountIds }, kind: "BANK", archivedAt: null } }) : 0;
  if (found !== accountIds.length) throw new MoneyProblem("One of the bank accounts was not found. Add it in Finance Management, Cash & Bank.");
  const heads = await tx.feeHead.findMany({ where: { id: { in: Object.keys(map) }, archivedAt: null } });
  for (const h of heads) {
    const to = map[h.id] ?? null;
    if (h.bankAccountId === to) continue;
    await tx.feeHead.update({ where: { id: h.id }, data: { bankAccountId: to } });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Fee Head", recordId: h.id, before: { bankAccountId: h.bankAccountId }, after: { bankAccountId: to } });
  }
}

export async function saveScholarshipTypes(tx: Tx, ctx: SchoolContext, names: string[]) {
  const list = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (list.some((n) => n.length > 80)) throw new MoneyProblem("Each name can be up to 80 characters.", "types");
  if (list.length > 30) throw new MoneyProblem("Up to 30 scholarship types.", "types");
  const s = await feeSettings(tx, ctx);
  await save(tx, ctx, "scholarship types", { scholarshipTypes: list }, { scholarshipTypes: s.scholarshipTypes });
}

/** Switches one of Fee Management's optional parts on or off for this school. */
export async function setFeeFeature(tx: Tx, ctx: SchoolContext, key: string, on: boolean) {
  const f = FEE_FEATURES.find((x) => x.key === key);
  if (!f) throw new MoneyProblem("This part was not found.");
  const row = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } } });
  if ((row?.isOn ?? false) === on) return false;
  await tx.schoolFeature.upsert({
    where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } },
    create: { schoolId: ctx.schoolId, featureKey: key, isOn: on },
    update: { isOn: on },
  });
  await writeAudit(tx, ctx, { action: on ? "switched-on" : "switched-off", recordType: "Feature", recordId: null, after: { feature: f.label, on } });
  return true;
}

/** The next receipt number, shown in Fee Settings (not taken). */
export async function nextReceiptPreview(tx: Tx, ctx: SchoolContext, fyName: string) {
  const s = await feeSettings(tx, ctx);
  const key = `fee-receipt${s.restartEachYear ? `:${fyName}` : ""}`;
  const seq = await tx.numberSequence.findUnique({ where: { schoolId_key: { schoolId: ctx.schoolId, key } } });
  const n = seq?.nextValue ?? 1;
  return `${s.receiptPrefix.replaceAll("{YEAR}", fyName)}${String(n).padStart(s.receiptDigits, "0")}`;
}
