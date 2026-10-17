// Fee Structure (06 §2): fee heads, class-wise versioned structures with
// installments that add up (rule 11), publishing a new version (paid rows
// never change, unpaid future rows change only after confirmation), copying,
// and assigning a structure to a class or one student.
import "server-only";

import type { FeeFrequency, FeeStructure, Prisma, StudentFeeDue } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees, formatDate } from "../format";
import { assertYearOpen } from "../academic/years";
import { MoneyProblem } from "./problem";
import { checkSchedule, defaultSchedule, splitTotal, type InstallmentDraft } from "./schedule";
import { lockDues, refreshBalances } from "./dues";
import { monthLabel } from "../staff/dates";
import { ensureFeeDefaults } from "./settings";
import { requestApproval } from "../approvals";

// ---------------------------------------------------------------- fee heads

export type FeeHeadInput = {
  name: string;
  kind: string;
  taxable: boolean;
  gstRateBp: number | null;
  sacCode: string | null;
  bankAccountId: string | null;
  lateFeeApplies: boolean;
};

export const GST_RATES_BP = [500, 1200, 1800, 2800];

export async function saveFeeHead(tx: Tx, ctx: SchoolContext, input: FeeHeadInput, id?: string) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new MoneyProblem("Give the fee head a name, such as Tuition fee.", "name");
  if (name.length > 80) throw new MoneyProblem("Fee head names can be at most 80 characters.", "name");
  if (input.taxable) {
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { gstin: true } });
    if (!school.gstin) throw new MoneyProblem("Add the school's GSTIN in Settings, School Profile first.", "taxable", { href: "/settings/school-profile", label: "Open School Profile" });
    if (!input.gstRateBp || input.gstRateBp <= 0 || input.gstRateBp > 2800) throw new MoneyProblem("Choose the GST rate for a taxable fee head.", "gstRate");
    if (input.sacCode && !/^\d{4,8}$/.test(input.sacCode)) throw new MoneyProblem("SAC code is 4 to 8 digits, such as 999293.", "sacCode");
  }
  if (input.bankAccountId) {
    const acc = await tx.bankAccount.findFirst({ where: { id: input.bankAccountId, kind: "BANK", archivedAt: null } });
    if (!acc) throw new MoneyProblem("Choose one of the school's bank accounts.", "bankAccountId");
  }
  const clash = await tx.feeHead.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
  if (clash) throw new MoneyProblem(clash.archivedAt ? `${clash.name} was archived. Restore it instead of adding it again.` : `There is already a fee head called ${clash.name}.`, "name");
  const data = {
    name,
    kind: input.kind,
    taxable: input.taxable,
    gstRateBp: input.taxable ? input.gstRateBp : null,
    sacCode: input.taxable ? input.sacCode : null,
    bankAccountId: input.bankAccountId,
    lateFeeApplies: input.lateFeeApplies,
  };
  if (id) {
    const before = await tx.feeHead.findFirst({ where: { id } });
    if (!before) throw new MoneyProblem("This fee head was not found.");
    if (before.systemKey && name !== before.name && before.systemKey === "late-fee") {
      // Renaming the software's own heads is fine; it keeps its key.
    }
    const head = await tx.feeHead.update({ where: { id }, data });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Fee Head", recordId: id, before: headAudit(before), after: headAudit(head) });
    return head;
  }
  const count = await tx.feeHead.count();
  const head = await tx.feeHead.create({ data: { ...data, schoolId: ctx.schoolId, sortOrder: count, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Fee Head", recordId: head.id, after: headAudit(head) });
  return head;
}

function headAudit(h: { name: string; taxable: boolean; gstRateBp: number | null; bankAccountId: string | null; lateFeeApplies: boolean }) {
  return { name: h.name, taxable: h.taxable, gstRateBp: h.gstRateBp, bankAccountId: h.bankAccountId, lateFeeApplies: h.lateFeeApplies };
}

export async function archiveFeeHead(tx: Tx, ctx: SchoolContext, id: string) {
  const head = await tx.feeHead.findFirst({ where: { id, archivedAt: null } });
  if (!head) throw new MoneyProblem("This fee head was not found.");
  if (head.systemKey) throw new MoneyProblem(`${head.name} is used by the software itself and cannot be archived.`);
  const used = await tx.feeStructureItem.count({ where: { feeHeadId: id, archivedAt: null, structure: { status: { in: ["DRAFT", "PUBLISHED"] }, archivedAt: null } } });
  if (used) throw new MoneyProblem(`${head.name} is in ${used} class fee structure${used === 1 ? "" : "s"}. Remove those rows first.`);
  await tx.feeHead.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Fee Head", recordId: id, before: { name: head.name } });
}

export async function restoreFeeHead(tx: Tx, ctx: SchoolContext, id: string) {
  await tx.feeHead.update({ where: { id }, data: { archivedAt: null } });
  await writeAudit(tx, ctx, { action: "restored", recordType: "Fee Head", recordId: id });
}

export async function feeHeads(tx: Tx, ctx: SchoolContext, opts: { includeArchived?: boolean; includeSystem?: boolean } = {}) {
  await ensureFeeDefaults(tx, ctx);
  return tx.feeHead.findMany({
    where: { ...(opts.includeArchived ? {} : { archivedAt: null }), ...(opts.includeSystem ? {} : { systemKey: null }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

// ---------------------------------------------------------------- structures

/** The published version of a class's structure for a year and category, and its draft if one is open. */
export async function classStructure(tx: Tx, yearId: string, classId: string, category = "") {
  const rows = await tx.feeStructure.findMany({
    where: { academicYearId: yearId, classId, category, archivedAt: null },
    orderBy: { version: "desc" },
    include: { items: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, include: { installments: { where: { archivedAt: null }, orderBy: { seq: "asc" } } } } },
  });
  return {
    published: rows.find((r) => r.status === "PUBLISHED") ?? null,
    draft: rows.find((r) => r.status === "DRAFT") ?? null,
    versions: rows,
  };
}

export type StructureWithItems = NonNullable<Awaited<ReturnType<typeof classStructure>>["published"]>;

/** The draft to edit: the open draft, or a new one copied from the published version. */
export async function openDraft(tx: Tx, ctx: SchoolContext, yearId: string, classId: string, category = ""): Promise<FeeStructure> {
  await assertYearOpen(tx, yearId);
  const cls = await tx.schoolClass.findFirst({ where: { id: classId, archivedAt: null } });
  if (!cls) throw new MoneyProblem("Choose a class.", "classId");
  const { published, draft, versions } = await classStructure(tx, yearId, classId, category);
  if (draft) return draft;
  const version = (versions[0]?.version ?? 0) + 1;
  const made = await tx.feeStructure.create({
    data: { schoolId: ctx.schoolId, academicYearId: yearId, classId, category, version, status: "DRAFT", createdById: ctx.userId },
  });
  if (published) await copyItems(tx, ctx, published, made.id, { percentBp: 0, sameYear: true, yearStart: null, terms: [] });
  await writeAudit(tx, ctx, { action: "created", recordType: "Fee Structure", recordId: made.id, after: { classId, yearId, category, version } });
  return made;
}

async function copyItems(
  tx: Tx,
  ctx: SchoolContext,
  from: StructureWithItems,
  toId: string,
  opts: { percentBp: number; sameYear: boolean; yearStart: Date | null; terms: { name: string; startDate: Date }[] },
) {
  for (const item of from.items) {
    const total = opts.percentBp ? roundRupee((item.totalPaise * BigInt(10000 + opts.percentBp)) / BigInt(10000)) : item.totalPaise;
    let schedule: InstallmentDraft[];
    if (opts.sameYear && !opts.percentBp) {
      schedule = item.installments.map((i) => ({ label: i.label, dueDate: i.dueDate, amountPaise: i.amountPaise }));
    } else if (opts.sameYear) {
      const parts = scaleParts(item.installments.map((i) => i.amountPaise), total);
      schedule = item.installments.map((i, k) => ({ label: i.label, dueDate: i.dueDate, amountPaise: parts[k] }));
    } else {
      schedule = defaultSchedule(item.frequency, total, opts.yearStart!, opts.terms);
    }
    await createItem(tx, ctx, toId, { feeHeadId: item.feeHeadId, frequency: item.frequency, totalPaise: total, schedule, sortOrder: item.sortOrder });
  }
}

function roundRupee(p: bigint) {
  const r = BigInt(100);
  return ((p + BigInt(50)) / r) * r;
}

/** Scales amounts to a new total keeping their proportions, adding up exactly. */
export function scaleParts(parts: bigint[], total: bigint): bigint[] {
  const old = parts.reduce((s, p) => s + p, BigInt(0));
  if (old === BigInt(0)) return splitTotal(total, parts.length);
  const out = parts.map((p) => roundRupee((p * total) / old));
  const diff = total - out.reduce((s, p) => s + p, BigInt(0));
  out[out.length - 1] += diff;
  return out;
}

async function createItem(tx: Tx, ctx: SchoolContext, structureId: string, input: { feeHeadId: string; frequency: FeeFrequency; totalPaise: bigint; schedule: InstallmentDraft[]; sortOrder: number }) {
  const item = await tx.feeStructureItem.create({
    data: { schoolId: ctx.schoolId, structureId, feeHeadId: input.feeHeadId, frequency: input.frequency, totalPaise: input.totalPaise, sortOrder: input.sortOrder },
  });
  await tx.installment.createMany({
    data: input.schedule.map((s, seq) => ({
      schoolId: ctx.schoolId, structureId, itemId: item.id, feeHeadId: input.feeHeadId, label: s.label.trim(), amountPaise: s.amountPaise, dueDate: s.dueDate, seq,
    })),
  });
  return item;
}

export type FeeRowInput = {
  feeHeadId: string;
  frequency: FeeFrequency;
  totalPaise: bigint;
  schedule: InstallmentDraft[];
};

async function draftOnly(tx: Tx, structureId: string, opts: { waitingOk?: boolean } = {}) {
  const s = await tx.feeStructure.findFirst({ where: { id: structureId, archivedAt: null } });
  if (!s) throw new MoneyProblem("This fee structure was not found.");
  if (s.status !== "DRAFT") throw new MoneyProblem("Only a draft can be changed. Open a new version to change a published structure.");
  await assertYearOpen(tx, s.academicYearId);
  // A draft waiting for the Principal stays exactly as it was sent, so they approve what they saw.
  if (!opts.waitingOk && (await waitingApproval(tx, s.id))) throw new MoneyProblem("This draft is waiting for the Principal's approval. Withdraw the request in Approvals to change it.");
  return s;
}

// ---------------------------------------------------------------- changes after the year starts

export const STRUCTURE_CHANGE = "fee-structure-change" as const;

/** The open approval request for publishing this draft, if any. */
export async function waitingApproval(tx: Tx, structureId: string) {
  return tx.approval.findFirst({ where: { type: STRUCTURE_CHANGE, recordId: structureId, status: { in: ["WAITING", "ESCALATED"] } }, select: { id: true, askedById: true, createdAt: true } });
}

/**
 * Owner's prototype changes of 14 Oct 2026 (mod-fees.jsx Structure): once the
 * year has started and a version is in use, a change to students' unpaid
 * installments is the Principal's decision. The Principal's own change applies
 * at once (they are the approver); anyone else's goes to Approvals. Next
 * year's structure, or a class with no version in use yet, needs no approval.
 */
export async function publishNeedsApproval(tx: Tx, structureId: string, today: Date, roleKeys: readonly (string | null)[]) {
  if (roleKeys.includes("principal")) return false;
  const s = await tx.feeStructure.findFirst({ where: { id: structureId, archivedAt: null }, select: { academicYearId: true, classId: true, category: true } });
  if (!s) return false;
  const year = await tx.academicYear.findFirst({ where: { id: s.academicYearId }, select: { startDate: true } });
  if (!year || year.startDate > today) return false;
  const inUse = await tx.feeStructure.count({ where: { academicYearId: s.academicYearId, classId: s.classId, category: s.category, status: "PUBLISHED", archivedAt: null } });
  return inUse > 0;
}

/** Sends a draft to the Principal to publish from a date. Nothing changes for students until it is approved. */
export async function askToPublish(tx: Tx, ctx: SchoolContext, structureId: string, effectiveFrom: Date, reason: string) {
  const s = await draftOnly(tx, structureId);
  const items = await tx.feeStructureItem.findMany({ where: { structureId, archivedAt: null }, include: { installments: { where: { archivedAt: null } } } });
  if (!items.length) throw new MoneyProblem("Add at least one fee row before sending it for approval.");
  for (const item of items) {
    const problem = checkSchedule(item.totalPaise, item.installments);
    if (problem) throw new MoneyProblem(problem);
  }
  if (reason.trim().length < 5) throw new MoneyProblem("Say why the fees change mid-year, so the Principal can decide.", "reason");
  const impact = await publishImpact(tx, structureId, effectiveFrom);
  const cls = await tx.schoolClass.findFirst({ where: { id: s.classId }, select: { name: true } });
  await tx.feeStructure.update({ where: { id: s.id }, data: { effectiveFrom } });
  // One approval covers the whole change, including the adjustments on part-paid rows: the Principal sees the amounts here.
  const money = [impact.addedPaise ? `${formatRupees(impact.addedPaise)} added` : "", impact.takenOffPaise ? `${formatRupees(impact.takenOffPaise)} taken off` : ""].filter(Boolean).join(", ");
  const approval = await requestApproval(tx, ctx, {
    type: STRUCTURE_CHANGE, recordType: "Fee Structure", recordId: s.id,
    summary: `${cls?.name ?? "Class"} fee structure, version ${s.version}, from ${monthLabel(effectiveFrom)}: ${impact.students} ${impact.students === 1 ? "student's" : "students'"} unpaid installments${money ? ` (${money})` : ""}. Paid rows are not changed`,
    reason: reason.trim(),
  });
  await writeAudit(tx, ctx, { action: "asked-to-publish", recordType: "Fee Structure", recordId: s.id, after: { version: s.version, effectiveFrom: formatDate(effectiveFrom), approval: approval.id, students: impact.students, added: formatRupees(impact.addedPaise), takenOff: formatRupees(impact.takenOffPaise), rowsKept: impact.kept } });
  return { version: s.version, impact, approvalId: approval.id };
}

/** Approvals: approving publishes the draft from the date asked (paid rows never change); anything else leaves it a draft. */
export async function decideStructureChange(tx: Tx, ctx: SchoolContext, structureId: string, decision: string) {
  if (decision !== "approve") return;
  const s = await tx.feeStructure.findFirst({ where: { id: structureId, archivedAt: null } });
  if (!s || s.status !== "DRAFT") throw new MoneyProblem("This draft was already published or discarded.");
  await publishStructure(tx, ctx, s.id, s.effectiveFrom ?? new Date());
}

/** Adds or replaces one fee row (with its installments) on a draft. Installments must add up to the total. */
export async function saveFeeRow(tx: Tx, ctx: SchoolContext, structureId: string, input: FeeRowInput, itemId?: string) {
  const s = await draftOnly(tx, structureId);
  const head = await tx.feeHead.findFirst({ where: { id: input.feeHeadId, archivedAt: null } });
  if (!head) throw new MoneyProblem("Choose a fee head.", "feeHeadId");
  if (input.totalPaise <= BigInt(0)) throw new MoneyProblem("Amount must be more than ₹0.", "total");
  const problem = checkSchedule(input.totalPaise, input.schedule);
  if (problem) throw new MoneyProblem(problem, "schedule");
  const dup = await tx.feeStructureItem.findFirst({ where: { structureId, feeHeadId: input.feeHeadId, archivedAt: null, ...(itemId ? { id: { not: itemId } } : {}) } });
  if (dup) throw new MoneyProblem(`${head.name} is already in this structure. Change that row instead.`, "feeHeadId");
  let sortOrder = await tx.feeStructureItem.count({ where: { structureId, archivedAt: null } });
  if (itemId) {
    const old = await tx.feeStructureItem.findFirst({ where: { id: itemId, structureId, archivedAt: null } });
    if (!old) throw new MoneyProblem("This fee row was not found.");
    sortOrder = old.sortOrder;
    await tx.installment.updateMany({ where: { itemId }, data: { archivedAt: new Date() } });
    await tx.feeStructureItem.update({ where: { id: itemId }, data: { archivedAt: new Date() } });
  }
  const item = await createItem(tx, ctx, s.id, { ...input, sortOrder });
  await writeAudit(tx, ctx, {
    action: itemId ? "changed-row" : "added-row",
    recordType: "Fee Structure",
    recordId: s.id,
    after: { feeHead: head.name, frequency: input.frequency, total: formatRupees(input.totalPaise), installments: input.schedule.length },
  });
  return item;
}

export async function removeFeeRow(tx: Tx, ctx: SchoolContext, structureId: string, itemId: string) {
  const s = await draftOnly(tx, structureId);
  const item = await tx.feeStructureItem.findFirst({ where: { id: itemId, structureId, archivedAt: null } });
  if (!item) throw new MoneyProblem("This fee row was not found.");
  await tx.installment.updateMany({ where: { itemId }, data: { archivedAt: new Date() } });
  await tx.feeStructureItem.update({ where: { id: itemId }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "removed-row", recordType: "Fee Structure", recordId: s.id, before: { feeHeadId: item.feeHeadId, total: formatRupees(item.totalPaise) } });
}

/** Throws away a draft that was never published. */
export async function discardDraft(tx: Tx, ctx: SchoolContext, structureId: string) {
  const s = await draftOnly(tx, structureId);
  await tx.feeStructure.update({ where: { id: s.id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "discarded-draft", recordType: "Fee Structure", recordId: s.id, before: { version: s.version } });
}

// ---------------------------------------------------------------- publishing
//
// Publishing a new version from a date (rule 20: it never rewrites the past).
// For each student who follows the class structure, each of their rows due on
// or after the date is matched to the new version's installment for the same
// period: the same fee head and due month, else the same fee head and name.
//
// - A row with money on it (paid or part-paid, a concession, or an adjustment)
//   is kept, and the new version's installment for that period is not added
//   again, so a period is never charged twice. When something is still left to
//   pay on it, the change in the fee is put on it as an adjustment with a
//   reason (a cut never below what is left). A fully paid or fully waived row
//   does not change: paid rows are not changed.
// - An untouched row is replaced by the new installment (kept as Removed, never
//   deleted), or moves to the new version as it is when nothing differs. Its
//   late fee moves with it to the new row; when there is no new row, or the
//   new one is due later, an unpaid late fee comes off.
// The preview (publishImpact) and the publish run the same plan, so what the
// school is shown is exactly what happens.

const ZERO = BigInt(0);
/** The reason on the adjustments a new version puts on kept rows (also how they are found again). */
const REVISION = "Fee structure version";

/** One installment of the version being published (or put back). */
type NewInstallment = { id: string; feeHeadId: string; label: string; amountPaise: bigint; dueDate: Date; seq: number };

/** Why a row stays as it is: there is money on it. */
type KeptWhy = "paid" | "concession" | "adjusted";

type RowChange =
  | { kind: "same"; old: StudentFeeDue; inst: NewInstallment }
  | { kind: "replace"; old: StudentFeeDue; inst: NewInstallment }
  | { kind: "remove"; old: StudentFeeDue }
  | { kind: "add"; inst: NewInstallment }
  | { kind: "keep"; old: StudentFeeDue; inst: NewInstallment | null; why: KeptWhy; change: bigint; applied: bigint };

type Plan = {
  followers: number;
  students: { studentId: string; changes: RowChange[] }[];
  /** Late fee rows (open) added on rows that are replaced or removed, by the row they are on. */
  lateFees: Map<string, StudentFeeDue[]>;
};

export type Impact = {
  /** Students whose fees change. */
  students: number;
  /** Rows replaced by the new version's installment. */
  rows: number;
  added: number;
  removed: number;
  /** Rows kept because money is on them; how many of those get an adjustment. */
  kept: number;
  adjusted: number;
  addedPaise: bigint;
  takenOffPaise: bigint;
  /** Fully paid rows keep their old amount: how much less (below) or more (above) than the new fee was paid. */
  paidBelowPaise: bigint;
  paidBelowRows: number;
  paidAbovePaise: bigint;
  paidAboveRows: number;
  lateFeesMoved: number;
  lateFeesRemoved: number;
  from: Date;
  /** The headline (06 §5: "This updates 120 students' unpaid installments from Nov 2026. Paid rows are not changed."). */
  message: string;
  /** What else changes, one plain sentence each. */
  details: string[];
};

const monthKey = (d: Date) => d.toISOString().slice(0, 7);
const labelKey = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function keptWhy(d: StudentFeeDue, waitingConcession: Set<string>): KeptWhy | null {
  if (d.paidPaise > ZERO) return "paid";
  if (d.concessionPaise > ZERO || waitingConcession.has(d.id)) return "concession";
  if (d.adjustmentPaise !== ZERO) return "adjusted";
  return null;
}

/**
 * Pairs a student's rows with the new version's installments: first by fee
 * head and due month, then by fee head and name; a row from the date on with
 * money on it that is still unpaired takes the next unpaired installment of
 * its fee head. All rows and installments take part in pairing, so a period
 * whose due date moves across the date is neither charged twice nor lost; only
 * rows due on or after the date change, and only installments due on or after
 * it are added.
 */
function matchRows(olds: StudentFeeDue[], insts: NewInstallment[], from: Date, why: (d: StudentFeeDue) => KeptWhy | null, base: (d: StudentFeeDue) => bigint): RowChange[] {
  const used = new Set<string>();
  const pairs = new Map<string, StudentFeeDue>();
  type Keyed = { dueDate: Date; label: string };
  const keys = [(x: Keyed) => monthKey(x.dueDate), (x: Keyed) => labelKey(x.label)];
  for (const key of keys) {
    for (const inst of insts) {
      if (pairs.has(inst.id)) continue;
      const k = key(inst);
      const candidates = olds.filter((o) => !used.has(o.id) && o.feeHeadId === inst.feeHeadId && key(o) === k);
      if (!candidates.length) continue;
      const pick = candidates.find((o) => why(o)) ?? candidates[0];
      pairs.set(inst.id, pick);
      used.add(pick.id);
    }
  }
  for (const o of olds) {
    if (used.has(o.id) || o.dueDate < from || !why(o)) continue;
    const inst = insts.find((i) => !pairs.has(i.id) && i.dueDate >= from && i.feeHeadId === o.feeHeadId);
    if (!inst) continue;
    pairs.set(inst.id, o);
    used.add(o.id);
  }
  const keep = (old: StudentFeeDue, inst: NewInstallment | null): RowChange => {
    const change = (inst ? inst.amountPaise : ZERO) - base(old);
    // Only what is left to pay follows the new version; a cut never goes below it.
    const applied = old.balancePaise <= ZERO ? ZERO : change >= ZERO ? change : -change > old.balancePaise ? -old.balancePaise : change;
    return { kind: "keep", old, inst, why: why(old)!, change, applied };
  };
  const out: RowChange[] = [];
  for (const inst of insts) {
    const old = pairs.get(inst.id);
    if (!old) {
      if (inst.dueDate >= from) out.push({ kind: "add", inst });
    } else if (old.dueDate < from) {
      // Billed before the date by an older version: the past stays as it is.
    } else if (why(old)) out.push(keep(old, inst));
    else if (old.amountPaise === inst.amountPaise && old.dueDate.getTime() === inst.dueDate.getTime() && labelKey(old.label) === labelKey(inst.label)) out.push({ kind: "same", old, inst });
    else out.push({ kind: "replace", old, inst });
  }
  for (const old of olds) {
    if (used.has(old.id) || old.dueDate < from) continue;
    out.push(why(old) ? keep(old, null) : { kind: "remove", old });
  }
  return out;
}

/** The versions of a class structure whose rows a new version takes over (published and replaced ones). */
async function versionIds(tx: Tx, s: { academicYearId: string; classId: string; category: string; id: string }) {
  const rows = await tx.feeStructure.findMany({
    where: { academicYearId: s.academicYearId, classId: s.classId, category: s.category, status: { in: ["PUBLISHED", "SUPERSEDED"] }, archivedAt: null, id: { not: s.id } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Works out, row by row, what a new version from the date does to every student who follows the structure. */
async function planRepublish(tx: Tx, s: { academicYearId: string; classId: string; category: string; id: string }, installments: NewInstallment[], effectiveFrom: Date, opts: { lock?: boolean } = {}): Promise<Plan> {
  const ids = await versionIds(tx, s);
  if (!ids.length) return { followers: 0, students: [], lateFees: new Map() };
  const followers = (await tx.studentFeeDue.findMany({ where: { structureId: { in: ids }, state: "OPEN" }, select: { studentId: true }, distinct: ["studentId"] })).map((r) => r.studentId);
  if (!followers.length) return { followers: 0, students: [], lateFees: new Map() };
  const where = { studentId: { in: followers }, structureId: { in: ids }, state: "OPEN" as const, kind: "FEE" as const };
  // Only rows from the date on can change; they are locked so a payment cannot slip in meanwhile.
  if (opts.lock) await lockDues(tx, (await tx.studentFeeDue.findMany({ where: { ...where, dueDate: { gte: effectiveFrom } }, select: { id: true } })).map((r) => r.id));
  const olds = await tx.studentFeeDue.findMany({ where, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] });
  // The fee a row stands for now: its amount plus the changes earlier versions put on it (not
  // the school's own adjustments, which stay). A paid row an earlier version did not change keeps its amount.
  const revisions = await tx.feeAdjustment.groupBy({ by: ["dueId"], where: { dueId: { in: olds.map((o) => o.id) }, reason: { startsWith: REVISION } }, _sum: { amountPaise: true } });
  const revisedBy = new Map(revisions.map((r) => [r.dueId, r._sum.amountPaise ?? ZERO]));
  const base = (d: StudentFeeDue) => d.amountPaise + (revisedBy.get(d.id) ?? ZERO);
  // A concession waiting in Approvals for chosen rows keeps those rows, so it still finds them when approved.
  const waiting = await tx.concession.findMany({ where: { studentId: { in: followers }, status: { in: ["WAITING", "APPROVED"] }, NOT: { dueIds: { isEmpty: true } } }, select: { dueIds: true } });
  const waitingSet = new Set(waiting.flatMap((c) => c.dueIds));
  const why = (d: StudentFeeDue) => keptWhy(d, waitingSet);
  const insts = [...installments].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.seq - b.seq);
  const students = followers.map((studentId) => ({ studentId, changes: matchRows(olds.filter((o) => o.studentId === studentId), insts, effectiveFrom, why, base) }));
  const going = students.flatMap((st) => st.changes).filter((c): c is Extract<RowChange, { kind: "replace" | "remove" }> => c.kind === "replace" || c.kind === "remove").map((c) => c.old.id);
  const late = going.length ? await tx.studentFeeDue.findMany({ where: { parentDueId: { in: going }, kind: "LATE_FEE", state: "OPEN" } }) : [];
  const lateFees = new Map<string, StudentFeeDue[]>();
  for (const l of late) lateFees.set(l.parentDueId!, [...(lateFees.get(l.parentDueId!) ?? []), l]);
  return { followers: followers.length, students, lateFees };
}

/** A late fee moves to the new row while the new row is not due later; otherwise an unpaid one comes off (a paid one stays on the new row, so it is never added twice). */
function lateFeeMoves(c: Extract<RowChange, { kind: "replace" | "remove" }>, lateFees: Plan["lateFees"]) {
  const rows = lateFees.get(c.old.id) ?? [];
  const stillLate = c.kind === "replace" && c.inst.dueDate.getTime() <= c.old.dueDate.getTime();
  return {
    move: rows.filter((l) => c.kind === "replace" && (stillLate || l.paidPaise > ZERO)),
    remove: rows.filter((l) => !(c.kind === "replace" && stillLate) && l.paidPaise === ZERO),
  };
}

function impactOf(plan: Plan, from: Date, today?: Date): Impact {
  const out: Impact = {
    students: 0, rows: 0, added: 0, removed: 0, kept: 0, adjusted: 0, addedPaise: ZERO, takenOffPaise: ZERO,
    paidBelowPaise: ZERO, paidBelowRows: 0, paidAbovePaise: ZERO, paidAboveRows: 0, lateFeesMoved: 0, lateFeesRemoved: 0,
    from, message: "", details: [],
  };
  const money = (p: bigint) => { if (p > ZERO) out.addedPaise += p; else out.takenOffPaise -= p; };
  for (const st of plan.students) {
    let changed = false;
    for (const c of st.changes) {
      if (c.kind === "same") continue;
      if (c.kind === "add") { out.added++; money(c.inst.amountPaise); changed = true; continue; }
      if (c.kind === "keep") {
        out.kept++;
        if (c.applied !== ZERO) { out.adjusted++; money(c.applied); changed = true; }
        const rest = c.change - c.applied;
        if (rest > ZERO) { out.paidBelowPaise += rest; out.paidBelowRows++; }
        if (rest < ZERO) { out.paidAbovePaise -= rest; out.paidAboveRows++; }
        continue;
      }
      changed = true;
      if (c.kind === "replace") { out.rows++; money(c.inst.amountPaise - c.old.amountPaise); } else { out.removed++; money(-c.old.amountPaise); }
      const late = lateFeeMoves(c, plan.lateFees);
      out.lateFeesMoved += late.move.length;
      out.lateFeesRemoved += late.remove.length;
      for (const l of late.remove) money(-(l.balancePaise > ZERO ? l.balancePaise : ZERO));
    }
    if (changed) out.students++;
  }
  if (plan.followers === 0) {
    out.message = "Nobody follows this structure yet. Assign it to the class after publishing.";
    return out;
  }
  out.message = `This updates ${out.students} student${out.students === 1 ? "'s" : "s'"} unpaid installments from ${monthLabel(from)}. Paid rows are not changed.`;
  const d = out.details;
  if (out.addedPaise || out.takenOffPaise) {
    d.push([out.addedPaise ? `${formatRupees(out.addedPaise)} added` : "", out.takenOffPaise ? `${formatRupees(out.takenOffPaise)} taken off` : ""].filter(Boolean).join(" and ") + " in all.");
  } else if (out.students === 0) {
    d.push("No student's amounts change.");
  }
  const rows = [out.rows ? `${plural(out.rows, "row", "rows")} replaced` : "", out.added ? `${out.added} added` : "", out.removed ? `${out.removed} taken off` : ""].filter(Boolean);
  if (rows.length) d.push(`${rows.join(", ")}.`);
  if (out.kept) {
    d.push(`${plural(out.kept, "row is", "rows are")} kept because they are paid, part-paid or have a concession, so no period is charged twice${out.adjusted ? `. On ${plural(out.adjusted, "row", "rows")} the change in the fee is added to what is left to pay, as an adjustment` : ""}.`);
  }
  if (out.paidBelowRows) d.push(`${plural(out.paidBelowRows, "fully paid or waived row keeps its", "fully paid or waived rows keep their")} old amount, ${formatRupees(out.paidBelowPaise)} less than the new fee in all. Add a charge on the student's ledger if it should be paid.`);
  if (out.paidAboveRows) d.push(`${formatRupees(out.paidAbovePaise)} was already paid above the new fee on ${plural(out.paidAboveRows, "row", "rows")}. Give it back with a refund on Concessions & Refunds if the school wants.`);
  if (out.lateFeesMoved) d.push(`${plural(out.lateFeesMoved, "late fee moves", "late fees move")} to the new ${out.lateFeesMoved === 1 ? "row" : "rows"}.`);
  if (out.lateFeesRemoved) d.push(`${plural(out.lateFeesRemoved, "unpaid late fee comes", "unpaid late fees come")} off with ${out.lateFeesRemoved === 1 ? "its row" : "their rows"}.`);
  if (today && from < today) d.push(`${formatDate(from)} is before today, so installments already overdue change too.`);
  return out;
}

async function draftInstallments(tx: Tx, structureId: string): Promise<NewInstallment[]> {
  return tx.installment.findMany({ where: { structureId, archivedAt: null, item: { archivedAt: null } }, select: { id: true, feeHeadId: true, label: true, amountPaise: true, dueDate: true, seq: true } });
}

/**
 * What publishing a draft from a date changes for existing students, worked
 * out the same way as the publish itself. Give today to be told about a date
 * in the past.
 */
export async function publishImpact(tx: Tx, structureId: string, effectiveFrom: Date, today?: Date): Promise<Impact> {
  const s = await tx.feeStructure.findFirstOrThrow({ where: { id: structureId } });
  const plan = await planRepublish(tx, s, await draftInstallments(tx, structureId), effectiveFrom);
  return impactOf(plan, effectiveFrom, today);
}

/** What putting an older version back from a date would change (the same plan as publishing it again). */
export async function restoreImpact(tx: Tx, structureId: string, effectiveFrom: Date, today?: Date): Promise<Impact> {
  const s = await tx.feeStructure.findFirstOrThrow({ where: { id: structureId } });
  const plan = await planRepublish(tx, { ...s, id: "00000000-0000-0000-0000-000000000000" }, await draftInstallments(tx, structureId), effectiveFrom);
  return impactOf(plan, effectiveFrom, today);
}

/**
 * Publishes a draft as the version in use. The older version is kept as
 * Superseded. Each student's rows from the date on follow the new version as
 * planned above: paid rows never change, no period is charged twice,
 * concessions stay, and late fees move or come off with their rows.
 */
export async function publishStructure(tx: Tx, ctx: SchoolContext, structureId: string, effectiveFrom: Date) {
  const s = await draftOnly(tx, structureId, { waitingOk: true });
  const items = await tx.feeStructureItem.findMany({ where: { structureId, archivedAt: null }, include: { installments: { where: { archivedAt: null } } } });
  if (!items.length) throw new MoneyProblem("Add at least one fee row before publishing.");
  for (const item of items) {
    const problem = checkSchedule(item.totalPaise, item.installments);
    if (problem) throw new MoneyProblem(problem);
  }
  const plan = await planRepublish(tx, s, items.flatMap((i) => i.installments), effectiveFrom, { lock: true });
  const impact = impactOf(plan, effectiveFrom);
  await tx.feeStructure.updateMany({ where: { academicYearId: s.academicYearId, classId: s.classId, category: s.category, status: "PUBLISHED", archivedAt: null }, data: { status: "SUPERSEDED" } });
  await tx.feeStructure.update({ where: { id: s.id }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: ctx.userId, effectiveFrom } });

  const now = new Date();
  const removed = { state: "REMOVED" as const, removedReason: `Replaced by version ${s.version} of the fee structure`, removedById: ctx.userId, removedAt: now };
  const adjustReason = `${REVISION} ${s.version} from ${monthLabel(effectiveFrom)}`;
  for (const st of plan.students) {
    const made = new Map<string, string>();
    const fresh = st.changes.flatMap((c) => (c.kind === "add" || c.kind === "replace" ? [c.inst] : []));
    if (fresh.length) {
      const rows = await tx.studentFeeDue.createManyAndReturn({
        data: fresh.map((i) => ({
          schoolId: ctx.schoolId, studentId: st.studentId, academicYearId: s.academicYearId, installmentId: i.id, structureId: s.id, feeHeadId: i.feeHeadId, kind: "FEE" as const,
          label: i.label, dueDate: i.dueDate, amountPaise: i.amountPaise, balancePaise: i.amountPaise, createdById: ctx.userId,
        })),
        select: { id: true, installmentId: true },
      });
      for (const r of rows) made.set(r.installmentId!, r.id);
    }
    for (const c of st.changes) {
      if (c.kind === "same" || (c.kind === "keep" && c.inst)) {
        await tx.studentFeeDue.update({ where: { id: c.old.id }, data: { installmentId: c.inst!.id, structureId: s.id } });
      }
      if (c.kind === "keep" && c.applied !== ZERO) await adjustDue(tx, ctx, c.old.id, c.applied, adjustReason);
      if (c.kind === "replace" || c.kind === "remove") {
        await tx.studentFeeDue.update({ where: { id: c.old.id }, data: removed });
        const late = lateFeeMoves(c, plan.lateFees);
        const to = c.kind === "replace" ? made.get(c.inst.id) : undefined;
        if (to && late.move.length) await tx.studentFeeDue.updateMany({ where: { id: { in: late.move.map((l) => l.id) } }, data: { parentDueId: to } });
        if (late.remove.length) await tx.studentFeeDue.updateMany({ where: { id: { in: late.remove.map((l) => l.id) } }, data: { ...removed, removedReason: `Row replaced by version ${s.version} of the fee structure` } });
      }
    }
  }
  await writeAudit(tx, ctx, {
    action: "published",
    recordType: "Fee Structure",
    recordId: s.id,
    after: {
      version: s.version, effectiveFrom: formatDate(effectiveFrom), studentsUpdated: impact.students, rowsReplaced: impact.rows, rowsAdded: impact.added, rowsRemoved: impact.removed,
      rowsKept: impact.kept, rowsAdjusted: impact.adjusted, added: formatRupees(impact.addedPaise), takenOff: formatRupees(impact.takenOffPaise),
      lateFeesMoved: impact.lateFeesMoved, lateFeesRemoved: impact.lateFeesRemoved,
    },
  });
  return { version: s.version, impact };
}

/** Puts back the previous version as a new published version (undo a version). */
export async function restorePreviousVersion(tx: Tx, ctx: SchoolContext, structureId: string, effectiveFrom: Date) {
  const s = await tx.feeStructure.findFirst({ where: { id: structureId, archivedAt: null }, include: { items: { where: { archivedAt: null }, include: { installments: { where: { archivedAt: null } } } } } });
  if (!s || s.status !== "SUPERSEDED") throw new MoneyProblem("Choose an older version to restore.");
  const { draft } = await classStructure(tx, s.academicYearId, s.classId, s.category);
  if (draft) throw new MoneyProblem("Finish or discard the open draft first.");
  const fresh = await openDraft(tx, ctx, s.academicYearId, s.classId, s.category);
  // openDraft copied the current version; replace its rows with the old version's.
  await tx.installment.updateMany({ where: { structureId: fresh.id }, data: { archivedAt: new Date() } });
  await tx.feeStructureItem.updateMany({ where: { structureId: fresh.id }, data: { archivedAt: new Date() } });
  await copyItems(tx, ctx, s, fresh.id, { percentBp: 0, sameYear: true, yearStart: null, terms: [] });
  return publishStructure(tx, ctx, fresh.id, effectiveFrom);
}

// ---------------------------------------------------------------- copying

/** Copies a structure to other classes (same year), or to another year with an optional % increase. Makes drafts. */
export async function copyStructure(tx: Tx, ctx: SchoolContext, fromId: string, input: { classIds: string[]; yearId: string; percentBp: number }) {
  const from = await tx.feeStructure.findFirst({
    where: { id: fromId, archivedAt: null },
    include: { items: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, include: { installments: { where: { archivedAt: null }, orderBy: { seq: "asc" } } } } },
  });
  if (!from) throw new MoneyProblem("This fee structure was not found.");
  if (!input.classIds.length) throw new MoneyProblem("Choose at least one class to copy to.", "classIds");
  if (input.percentBp < -5000 || input.percentBp > 10000) throw new MoneyProblem("Increase must be between -50% and 100%.", "percent");
  const year = await tx.academicYear.findFirst({ where: { id: input.yearId, archivedAt: null }, include: { terms: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } } } });
  if (!year) throw new MoneyProblem("Choose the year to copy to.", "yearId");
  await assertYearOpen(tx, year.id);
  const sameYear = year.id === from.academicYearId;
  let made = 0;
  const skipped: string[] = [];
  for (const classId of input.classIds) {
    if (sameYear && classId === from.classId) continue;
    const existing = await classStructure(tx, year.id, classId, from.category);
    const cls = await tx.schoolClass.findFirst({ where: { id: classId } });
    if (existing.draft && existing.draft.items.length) { skipped.push(cls?.name ?? "a class"); continue; }
    const draft = await openDraft(tx, ctx, year.id, classId, from.category);
    await tx.installment.updateMany({ where: { structureId: draft.id }, data: { archivedAt: new Date() } });
    await tx.feeStructureItem.updateMany({ where: { structureId: draft.id }, data: { archivedAt: new Date() } });
    await copyItems(tx, ctx, from, draft.id, { percentBp: input.percentBp, sameYear, yearStart: year.startDate, terms: year.terms });
    made++;
  }
  await writeAudit(tx, ctx, { action: "copied", recordType: "Fee Structure", recordId: from.id, after: { toYear: year.name, classes: made, percentBp: input.percentBp } });
  return { made, skipped };
}

// ---------------------------------------------------------------- assigning

type InstallmentRow = { id: string; feeHeadId: string; label: string; amountPaise: bigint; dueDate: Date; structureId: string };

/** Makes a student's due rows for installments they do not have yet. */
async function createDues(tx: Tx, ctx: SchoolContext, studentId: string, yearId: string, structureId: string, installments: InstallmentRow[], exceptionReason: string | null = null) {
  if (!installments.length) return 0;
  const existing = await tx.studentFeeDue.findMany({ where: { studentId, installmentId: { in: installments.map((i) => i.id) } }, select: { installmentId: true } });
  const have = new Set(existing.map((e) => e.installmentId));
  const data: Prisma.StudentFeeDueCreateManyInput[] = installments.filter((i) => !have.has(i.id)).map((i) => ({
    schoolId: ctx.schoolId, studentId, academicYearId: yearId, installmentId: i.id, structureId, feeHeadId: i.feeHeadId, kind: "FEE",
    label: i.label, dueDate: i.dueDate, amountPaise: i.amountPaise, balancePaise: i.amountPaise, exceptionReason, createdById: ctx.userId,
  }));
  if (data.length) await tx.studentFeeDue.createMany({ data });
  return data.length;
}

/** The structure a student should follow: the category one when category-wise fees are on and one is published, else the class one. */
export async function structureForStudent(tx: Tx, yearId: string, classId: string, category: string | null, categoryFeesOn: boolean) {
  if (categoryFeesOn && category) {
    const c = await tx.feeStructure.findFirst({ where: { academicYearId: yearId, classId, category, status: "PUBLISHED", archivedAt: null } });
    if (c) return c;
  }
  return tx.feeStructure.findFirst({ where: { academicYearId: yearId, classId, category: "", status: "PUBLISHED", archivedAt: null } });
}

/** Has the student any fee row for the year (from any structure)? */
export async function hasFeePlan(tx: Tx, studentId: string, yearId: string) {
  return (await tx.studentFeeDue.count({ where: { studentId, academicYearId: yearId, kind: "FEE" } })) > 0;
}

/**
 * Assigns a published structure to every student of its class this year who
 * has no fee plan yet (all installments, including past ones). Students who
 * follow another structure of the year are left as they are.
 */
export async function assignToClass(tx: Tx, ctx: SchoolContext, structureId: string, categoryFeesOn: boolean) {
  const s = await tx.feeStructure.findFirst({ where: { id: structureId, status: "PUBLISHED", archivedAt: null } });
  if (!s) throw new MoneyProblem("Publish the structure before assigning it.");
  await assertYearOpen(tx, s.academicYearId);
  const installments = await tx.installment.findMany({ where: { structureId, archivedAt: null }, orderBy: [{ dueDate: "asc" }, { seq: "asc" }] });
  const enrolled = await tx.enrolment.findMany({
    where: { academicYearId: s.academicYearId, classId: s.classId, archivedAt: null, status: "STUDYING", student: { archivedAt: null, status: "ACTIVE" } },
    include: { student: { select: { id: true, category: true } } },
  });
  let students = 0, rows = 0;
  for (const e of enrolled) {
    if (s.category && e.student.category !== s.category) continue;
    if (!s.category && categoryFeesOn && e.student.category) {
      const own = await tx.feeStructure.count({ where: { academicYearId: s.academicYearId, classId: s.classId, category: e.student.category, status: "PUBLISHED", archivedAt: null } });
      if (own) continue;
    }
    if (await hasFeePlan(tx, e.studentId, s.academicYearId)) continue;
    const made = await createDues(tx, ctx, e.studentId, s.academicYearId, s.id, installments);
    if (made) { students++; rows += made; }
  }
  await writeAudit(tx, ctx, { action: "assigned", recordType: "Fee Structure", recordId: s.id, after: { students, rows } });
  return { students, rows };
}

/**
 * Assigns a published structure to one student. A structure of another class
 * or category is an exception and needs a reason.
 */
export async function assignToStudent(tx: Tx, ctx: SchoolContext, studentId: string, structureId: string, reason: string | null) {
  const s = await tx.feeStructure.findFirst({ where: { id: structureId, status: "PUBLISHED", archivedAt: null } });
  if (!s) throw new MoneyProblem("Choose a published fee structure.", "structureId");
  await assertYearOpen(tx, s.academicYearId);
  const enrolment = await tx.enrolment.findFirst({ where: { studentId, academicYearId: s.academicYearId, archivedAt: null }, include: { student: true } });
  if (!enrolment) throw new MoneyProblem("This student is not in a class this year.");
  const exception = enrolment.classId !== s.classId || (s.category !== "" && s.category !== enrolment.student.category);
  if (exception && (!reason || reason.trim().length < 5)) throw new MoneyProblem("This is not the student's own class plan. Give a reason of at least 5 characters.", "reason");
  if (await hasFeePlan(tx, studentId, s.academicYearId)) throw new MoneyProblem(`${enrolment.student.fullName} already has fees for this year. Remove the unpaid rows first to change the plan.`);
  const installments = await tx.installment.findMany({ where: { structureId, archivedAt: null }, orderBy: [{ dueDate: "asc" }, { seq: "asc" }] });
  const made = await createDues(tx, ctx, studentId, s.academicYearId, s.id, installments, exception ? reason!.trim() : null);
  await writeAudit(tx, ctx, { action: "assigned", recordType: "Student Fee Due", recordId: studentId, after: { structureId, rows: made, exception: exception ? reason : null } });
  return made;
}

/** Removes an unpaid row from a student's fees, with a reason ("assign / unassign fees"). */
export async function removeDue(tx: Tx, ctx: SchoolContext, dueId: string, reason: string) {
  if (reason.trim().length < 5) throw new MoneyProblem("Give a reason of at least 5 characters.", "reason");
  const d = await tx.studentFeeDue.findFirst({ where: { id: dueId } });
  if (!d || d.state === "REMOVED") throw new MoneyProblem("This row was not found.");
  if (d.paidPaise > BigInt(0)) throw new MoneyProblem("This row has payments against it. Cancel the payment first, or adjust the amount with a reason.");
  const conc = await tx.concessionLine.count({ where: { dueId } });
  if (conc) throw new MoneyProblem("This row has a concession applied. Remove the row's concession first, or adjust the amount with a reason.");
  await tx.studentFeeDue.update({ where: { id: dueId }, data: { state: "REMOVED", removedReason: reason.trim(), removedById: ctx.userId, removedAt: new Date() } });
  // Late fee rows added on it go too, when unpaid.
  const late = await tx.studentFeeDue.findMany({ where: { parentDueId: dueId, state: "OPEN", paidPaise: 0 } });
  for (const l of late) await tx.studentFeeDue.update({ where: { id: l.id }, data: { state: "REMOVED", removedReason: `Row removed: ${reason.trim()}`, removedById: ctx.userId, removedAt: new Date() } });
  await refreshBalances(tx, [dueId]);
  await writeAudit(tx, ctx, { action: "removed", recordType: "Student Fee Due", recordId: dueId, before: { label: d.label, amount: formatRupees(d.amountPaise) }, after: { reason } });
}

/** Adds a one-off charge to one student (a fine, a lost book, an extra activity). It is an exception with a reason. */
export async function addCharge(tx: Tx, ctx: SchoolContext, input: { studentId: string; feeHeadId: string; amountPaise: bigint; dueDate: Date; label: string; reason: string; /** The year the charge belongs to (an event's year); else the student's latest enrolment. */ academicYearId?: string }) {
  const enrolment = await tx.enrolment.findFirst({ where: { studentId: input.studentId, archivedAt: null, ...(input.academicYearId ? { academicYearId: input.academicYearId } : {}) }, orderBy: { createdAt: "desc" } });
  if (!enrolment) throw new MoneyProblem("This student is not in a class.");
  await assertYearOpen(tx, enrolment.academicYearId);
  if (input.amountPaise <= BigInt(0)) throw new MoneyProblem("Amount must be more than ₹0.", "amount");
  if (input.reason.trim().length < 5) throw new MoneyProblem("Give a reason of at least 5 characters.", "reason");
  const head = await tx.feeHead.findFirst({ where: { id: input.feeHeadId, archivedAt: null } });
  if (!head) throw new MoneyProblem("Choose a fee head.", "feeHeadId");
  const due = await tx.studentFeeDue.create({
    data: {
      schoolId: ctx.schoolId, studentId: input.studentId, academicYearId: enrolment.academicYearId, feeHeadId: head.id, kind: "CHARGE",
      label: input.label.trim() || head.name, dueDate: input.dueDate, amountPaise: input.amountPaise, balancePaise: input.amountPaise,
      exceptionReason: input.reason.trim(), createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "added-charge", recordType: "Student Fee Due", recordId: due.id, after: { head: head.name, amount: formatRupees(input.amountPaise), reason: input.reason } });
  return due;
}

/** Changes one row's amount by an adjustment with a reason (never by editing a payment). */
export async function adjustDue(tx: Tx, ctx: SchoolContext, dueId: string, amountPaise: bigint, reason: string) {
  if (reason.trim().length < 5) throw new MoneyProblem("Give a reason of at least 5 characters.", "reason");
  if (amountPaise === BigInt(0)) throw new MoneyProblem("Enter how much to add or reduce.", "amount");
  const d = await tx.studentFeeDue.findFirst({ where: { id: dueId, state: "OPEN" } });
  if (!d) throw new MoneyProblem("This row was not found.");
  if (d.balancePaise + amountPaise < BigInt(0)) throw new MoneyProblem(`The most this row can be reduced by is ${formatRupees(d.balancePaise)}.`, "amount");
  await tx.feeAdjustment.create({ data: { schoolId: ctx.schoolId, studentId: d.studentId, dueId, amountPaise, reason: reason.trim(), createdById: ctx.userId } });
  await tx.studentFeeDue.update({ where: { id: dueId }, data: { adjustmentPaise: { increment: amountPaise } } });
  await refreshBalances(tx, [dueId]);
  await writeAudit(tx, ctx, { action: "adjusted", recordType: "Student Fee Due", recordId: dueId, before: { balance: formatRupees(d.balancePaise) }, after: { change: formatRupees(amountPaise), reason } });
}

/** Class cards for Fee Structure: each class's published rows, draft and "5 of 18 set". */
export async function classCards(tx: Tx, ctx: SchoolContext, yearId: string, campusId: string | null) {
  const classes = await tx.schoolClass.findMany({ where: { archivedAt: null, ...(campusId ? { campusId } : {}) }, orderBy: { sortOrder: "asc" } });
  const structures = await tx.feeStructure.findMany({
    where: { academicYearId: yearId, archivedAt: null, status: { in: ["DRAFT", "PUBLISHED"] } },
    include: { items: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } } },
  });
  const heads = await feeHeads(tx, ctx);
  const assigned = await tx.studentFeeDue.groupBy({ by: ["structureId"], where: { academicYearId: yearId, kind: "FEE", structureId: { not: null } }, _count: { studentId: true } });
  const enrolled = await tx.enrolment.groupBy({ by: ["classId"], where: { academicYearId: yearId, archivedAt: null, status: "STUDYING" }, _count: { _all: true } });
  const studentsWithPlan = await tx.studentFeeDue.findMany({ where: { academicYearId: yearId, kind: "FEE" }, select: { studentId: true }, distinct: ["studentId"] });
  const planSet = new Set(studentsWithPlan.map((r) => r.studentId));
  const enrolments = await tx.enrolment.findMany({ where: { academicYearId: yearId, archivedAt: null, status: "STUDYING" }, select: { classId: true, studentId: true } });
  return classes.map((c) => {
    const mine = structures.filter((s) => s.classId === c.id);
    const published = mine.filter((s) => s.status === "PUBLISHED");
    const main = published.find((s) => s.category === "") ?? published[0] ?? null;
    const draft = mine.find((s) => s.status === "DRAFT" && s.category === "") ?? mine.find((s) => s.status === "DRAFT") ?? null;
    const shown = main ?? draft;
    const total = shown ? shown.items.reduce((s, i) => s + i.totalPaise, BigInt(0)) : BigInt(0);
    const students = enrolled.find((e) => e.classId === c.id)?._count._all ?? 0;
    const withoutPlan = enrolments.filter((e) => e.classId === c.id && !planSet.has(e.studentId)).length;
    return {
      classId: c.id,
      className: c.name,
      published: main,
      categories: published.filter((s) => s.category !== "").map((s) => s.category),
      draft,
      rows: shown?.items ?? [],
      total,
      setCount: new Set((shown?.items ?? []).map((i) => i.feeHeadId)).size,
      headCount: heads.length,
      students,
      withoutPlan,
      assignedRows: assigned.filter((a) => mine.some((m) => m.id === a.structureId)).reduce((s, a) => s + a._count.studentId, 0),
    };
  });
}
