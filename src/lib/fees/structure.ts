// Fee Structure (06 §2): fee heads, class-wise versioned structures with
// installments that add up (rule 11), publishing a new version (paid rows
// never change, unpaid future rows change only after confirmation), copying,
// and assigning a structure to a class or one student.
import "server-only";

import type { FeeFrequency, FeeStructure, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees, formatDate } from "../format";
import { assertYearOpen } from "../academic/years";
import { MoneyProblem } from "./problem";
import { checkSchedule, defaultSchedule, splitTotal, type InstallmentDraft } from "./schedule";
import { refreshBalances } from "./dues";
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
  const approval = await requestApproval(tx, ctx, {
    type: STRUCTURE_CHANGE, recordType: "Fee Structure", recordId: s.id,
    summary: `${cls?.name ?? "Class"} fee structure, version ${s.version}, from ${monthLabel(effectiveFrom)}: ${impact.students} ${impact.students === 1 ? "student's" : "students'"} unpaid installments`,
    reason: reason.trim(),
  });
  await writeAudit(tx, ctx, { action: "asked-to-publish", recordType: "Fee Structure", recordId: s.id, after: { version: s.version, effectiveFrom: formatDate(effectiveFrom), approval: approval.id, students: impact.students } });
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

type Impact = { students: number; rows: number; from: Date; message: string };

/** Students whose fees follow a structure: they hold dues made from one of its versions. */
async function followers(tx: Tx, structureIds: string[]) {
  const rows = await tx.studentFeeDue.findMany({ where: { structureId: { in: structureIds } }, select: { studentId: true }, distinct: ["studentId"] });
  return rows.map((r) => r.studentId);
}

/**
 * What publishing a draft changes for existing students: their unpaid
 * installments due on or after the date move to the new version. Paid and
 * part-paid rows never change.
 */
export async function publishImpact(tx: Tx, structureId: string, effectiveFrom: Date): Promise<Impact> {
  const s = await tx.feeStructure.findFirstOrThrow({ where: { id: structureId } });
  const older = await tx.feeStructure.findMany({ where: { academicYearId: s.academicYearId, classId: s.classId, category: s.category, status: "PUBLISHED", archivedAt: null } });
  const ids = older.map((o) => o.id);
  if (!ids.length) return { students: 0, rows: 0, from: effectiveFrom, message: "Nobody follows this structure yet. Assign it to the class after publishing." };
  const rows = await tx.studentFeeDue.findMany({
    where: { structureId: { in: ids }, state: "OPEN", kind: "FEE", paidPaise: 0, dueDate: { gte: effectiveFrom } },
    select: { studentId: true },
  });
  const students = new Set(rows.map((r) => r.studentId)).size;
  const all = (await followers(tx, ids)).length;
  return {
    students: Math.max(students, 0),
    rows: rows.length,
    from: effectiveFrom,
    message: all === 0
      ? "Nobody follows this structure yet. Assign it to the class after publishing."
      : `This updates ${students} student${students === 1 ? "'s" : "s'"} unpaid installments from ${monthLabel(effectiveFrom)}. Paid rows are not changed.`,
  };
}

/**
 * Publishes a draft as the version in use. The older version is kept as
 * Superseded. Existing students' unpaid rows from the date on are replaced
 * by the new version's installments; paid and part-paid rows stay.
 */
export async function publishStructure(tx: Tx, ctx: SchoolContext, structureId: string, effectiveFrom: Date) {
  const s = await draftOnly(tx, structureId, { waitingOk: true });
  const items = await tx.feeStructureItem.findMany({ where: { structureId, archivedAt: null }, include: { installments: { where: { archivedAt: null } } } });
  if (!items.length) throw new MoneyProblem("Add at least one fee row before publishing.");
  for (const item of items) {
    const problem = checkSchedule(item.totalPaise, item.installments);
    if (problem) throw new MoneyProblem(problem);
  }
  const impact = await publishImpact(tx, structureId, effectiveFrom);
  const older = await tx.feeStructure.findMany({ where: { academicYearId: s.academicYearId, classId: s.classId, category: s.category, status: "PUBLISHED", archivedAt: null } });
  const olderIds = older.map((o) => o.id);
  const students = olderIds.length ? await followers(tx, olderIds) : [];
  await tx.feeStructure.updateMany({ where: { id: { in: olderIds } }, data: { status: "SUPERSEDED" } });
  await tx.feeStructure.update({ where: { id: s.id }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: ctx.userId, effectiveFrom } });

  let replaced = 0;
  if (students.length) {
    const old = await tx.studentFeeDue.findMany({
      where: { structureId: { in: olderIds }, state: "OPEN", kind: "FEE", paidPaise: 0, dueDate: { gte: effectiveFrom } },
    });
    for (const d of old) {
      await tx.studentFeeDue.update({
        where: { id: d.id },
        data: { state: "REMOVED", removedReason: `Replaced by version ${s.version} of the fee structure`, removedById: ctx.userId, removedAt: new Date() },
      });
    }
    replaced = old.length;
    const installments = items.flatMap((i) => i.installments).filter((i) => i.dueDate >= effectiveFrom);
    for (const studentId of students) await createDues(tx, ctx, studentId, s.academicYearId, s.id, installments);
  }
  await writeAudit(tx, ctx, {
    action: "published",
    recordType: "Fee Structure",
    recordId: s.id,
    after: { version: s.version, effectiveFrom: formatDate(effectiveFrom), studentsUpdated: impact.students, rowsReplaced: replaced },
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
export async function addCharge(tx: Tx, ctx: SchoolContext, input: { studentId: string; feeHeadId: string; amountPaise: bigint; dueDate: Date; label: string; reason: string }) {
  const enrolment = await tx.enrolment.findFirst({ where: { studentId: input.studentId, archivedAt: null }, orderBy: { createdAt: "desc" } });
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
