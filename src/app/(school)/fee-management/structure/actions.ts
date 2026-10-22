"use server";

import type { FeeFrequency } from "@prisma/client";
import type { SchoolContext, Tx } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import type { FeeViewer } from "@/lib/fees/access";
import { counterAllowed, featureOn, feeSettings } from "@/lib/fees/settings";
import { MoneyProblem } from "@/lib/fees/problem";
import { FREQUENCIES, HEAD_KINDS } from "@/lib/fees/words";
import {
  archiveFeeHead, assignToClass, classStructure, copyStructure, discardDraft, GST_RATES_BP, openDraft, publishStructure, removeFeeRow,
  restorePreviousVersion, saveFeeHead, saveFeeRow, publishNeedsApproval, askToPublish,
} from "@/lib/fees/structure";
import { dateOf, id, ids, optionalId, parseRupees, str, strs } from "@/lib/fees/act";
import { feeAction } from "../_lib/action";
import { todayIn } from "@/lib/staff/dates";
import { campusAllows } from "@/lib/campus";

/** "Manage class fee structure" is a counter permission (Fee Settings). */
async function mayManage(tx: Tx, ctx: SchoolContext, viewer: FeeViewer) {
  const s = await feeSettings(tx, ctx);
  if (!counterAllowed(s, viewer.roleKeys, "manage-structure")) throw new MoneyProblem("Your role cannot change fee structures. The School Admin can allow it in Fee Settings, Counter permissions.");
}

/**
 * A Fee Structure belongs to a class and a year of the class's own campus. A
 * class of another campus (for a person limited to one) is "not found"; a year
 * of another campus than the class's is refused.
 */
async function classAndYear(tx: Tx, viewer: FeeViewer, classId: string, yearId: string) {
  const [cls, year] = await Promise.all([
    tx.schoolClass.findFirst({ where: { id: classId }, select: { campusId: true, name: true } }),
    tx.academicYear.findFirst({ where: { id: yearId }, select: { campusId: true } }),
  ]);
  if (cls && !campusAllows(viewer, cls.campusId)) throw new MoneyProblem("This class was not found.", "classId");
  if (cls && year && year.campusId !== cls.campusId) throw new MoneyProblem(`${cls.name} is on another campus, which has its own school year. Open Fee Structure for that campus's year.`, "yearId");
}

/** A structure of a class of another campus (for a person limited to one) is "not found". */
async function structureOnCampus(tx: Tx, viewer: FeeViewer, structureId: string, what = "fee structure") {
  if (!viewer.campusId) return;
  const s = await tx.feeStructure.findFirst({ where: { id: structureId }, select: { classId: true } });
  if (!s) return;
  const cls = await tx.schoolClass.findFirst({ where: { id: s.classId }, select: { campusId: true } });
  if (!campusAllows(viewer, cls?.campusId)) throw new MoneyProblem(`This ${what} was not found.`);
}

export async function saveHeadAction(_prev: unknown, fd: FormData) {
  const headId = optionalId(fd, "headId");
  return feeAction(headId ? "edit" : "create", fd, async (tx, ctx, viewer) => {
    await mayManage(tx, ctx, viewer);
    const kind = str(fd, "kind");
    const taxable = str(fd, "taxable") === "on";
    const rate = Math.round(Number(str(fd, "gstRate")) * 100);
    if (taxable && !GST_RATES_BP.includes(rate)) throw new MoneyProblem("Choose the GST rate.", "gstRate");
    const head = await saveFeeHead(tx, ctx, {
      name: str(fd, "name"),
      kind: (HEAD_KINDS as readonly string[]).includes(kind) ? kind : "other",
      taxable,
      gstRateBp: taxable ? rate : null,
      sacCode: str(fd, "sacCode") || null,
      bankAccountId: optionalId(fd, "bankAccountId"),
      lateFeeApplies: str(fd, "lateFeeApplies") === "on",
    }, headId ?? undefined);
    return { name: head.name, edited: Boolean(headId) };
  }, (r) => (r.edited ? `${r.name} saved. Rows already paid keep their old values.` : `${r.name} added. Now add it to the classes that pay it.`), { staffOnly: "change fee heads" });
}

export async function archiveHeadAction(_prev: unknown, fd: FormData) {
  return feeAction("archive", fd, async (tx, ctx, viewer) => {
    await mayManage(tx, ctx, viewer);
    const headId = id(fd, "headId", "fee head");
    const h = await tx.feeHead.findFirst({ where: { id: headId } });
    await archiveFeeHead(tx, ctx, headId);
    return h?.name ?? "Fee head";
  }, (n) => ({ message: `${n} archived. It stays on old receipts and reports.` }), { staffOnly: "archive fee heads" });
}

function schedule(fd: FormData) {
  const labels = strs(fd, "instLabel");
  const dues = fd.getAll("instDue").map(String);
  const amounts = fd.getAll("instAmount").map(String);
  if (!labels.length || labels.length !== dues.length || dues.length !== amounts.length) throw new MoneyProblem("Add at least one installment.", "schedule");
  return labels.map((label, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dues[i])) throw new MoneyProblem(`Installment ${i + 1} needs a due date.`, "schedule");
    const amount = parseRupees(amounts[i], `Installment ${i + 1}`, "schedule");
    if (amount === null) throw new MoneyProblem(`Installment ${i + 1} needs an amount.`, "schedule");
    return { label, dueDate: new Date(`${dues[i]}T00:00:00Z`), amountPaise: amount };
  });
}

/** Adds or changes one fee row with its installments. A published structure gets a new draft version first. */
export async function saveRowAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx, viewer) => {
    await mayManage(tx, ctx, viewer);
    const yearId = id(fd, "yearId", "year");
    const classId = id(fd, "classId", "class");
    const category = str(fd, "category");
    const frequency = str(fd, "frequency");
    if (!FREQUENCIES.some((f) => f.value === frequency)) throw new MoneyProblem("Choose how often it is paid.", "frequency");
    const total = parseRupees(str(fd, "total"), "Amount for the year", "total");
    if (total === null || total <= BigInt(0)) throw new MoneyProblem("Enter the amount for the year.", "total");
    await classAndYear(tx, viewer, classId, yearId);
    const draft = await openDraft(tx, ctx, yearId, classId, category);
    const was = optionalId(fd, "wasHeadId");
    const existing = was ? await tx.feeStructureItem.findFirst({ where: { structureId: draft.id, feeHeadId: was, archivedAt: null } }) : null;
    const feeHeadId = id(fd, "feeHeadId", "fee head");
    await saveFeeRow(tx, ctx, draft.id, { feeHeadId, frequency: frequency as FeeFrequency, totalPaise: total, schedule: schedule(fd) }, existing?.id);
    const head = await tx.feeHead.findFirst({ where: { id: feeHeadId }, select: { name: true } });
    return { name: head?.name ?? "Fee row", total: formatRupees(total), version: draft.version };
  }, (r) => `${r.name} ${r.total} saved in the draft (version ${r.version}). Publish it when the class is ready.`, { staffOnly: "change fee structures" });
}

export async function removeRowAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx, viewer) => {
    await mayManage(tx, ctx, viewer);
    const yearId = id(fd, "yearId", "year");
    const classId = id(fd, "classId", "class");
    await classAndYear(tx, viewer, classId, yearId);
    const draft = await openDraft(tx, ctx, yearId, classId, str(fd, "category"));
    const headId = id(fd, "feeHeadId", "fee head");
    const item = await tx.feeStructureItem.findFirst({ where: { structureId: draft.id, feeHeadId: headId, archivedAt: null } });
    if (!item) throw new MoneyProblem("This fee row was not found.");
    await removeFeeRow(tx, ctx, draft.id, item.id);
    return draft.version;
  }, (v) => `Row removed from the draft (version ${v}). Students’ fees change only when you publish.`, { staffOnly: "change fee structures" });
}

/** Publishes the draft: the new version is in use from the date. Paid rows never change. */
export async function publishAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx, viewer, current) => {
    await mayManage(tx, ctx, viewer);
    if (str(fd, "confirm") !== "on") throw new MoneyProblem("Tick the box to confirm the change to students’ unpaid installments.", "confirm");
    const structureId = id(fd, "structureId", "draft");
    await structureOnCampus(tx, viewer, structureId, "draft");
    const from = dateOf(fd, "effectiveFrom", "Date it applies from");
    // After the year starts, a change by anyone but the Principal goes to the Principal (they approve fee changes).
    if (await publishNeedsApproval(tx, structureId, todayIn(current.school.timeZone), viewer.roleKeys)) {
      const asked = await askToPublish(tx, ctx, structureId, from, str(fd, "reason"));
      return { version: asked.version, updated: 0, assigned: 0, asked: true };
    }
    const r = await publishStructure(tx, ctx, structureId, from);
    let assigned = { students: 0, rows: 0 };
    if (str(fd, "assign") === "on") {
      const on = await featureOn(tx, ctx, "fee-category-fees");
      assigned = await assignToClass(tx, ctx, structureId, on);
    }
    return { version: r.version, updated: r.impact.students, assigned: assigned.students, asked: false };
  }, (r) => r.asked ? `Version ${r.version} sent to the Principal for approval. Students’ fees change only when they approve.` : `Version ${r.version} published.${r.updated ? ` ${r.updated} students’ unpaid installments updated.` : ""}${r.assigned ? ` ${r.assigned} students without fees got the plan.` : ""} Paid rows are not changed.`, { staffOnly: "publish fee structures" });
}

export async function discardAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx, viewer) => {
    await mayManage(tx, ctx, viewer);
    const structureId = id(fd, "structureId", "draft");
    await structureOnCampus(tx, viewer, structureId, "draft");
    await discardDraft(tx, ctx, structureId);
    return true;
  }, () => "Draft discarded. The version in use is unchanged.", { staffOnly: "change fee structures" });
}

/** Gives the published plan to every student of the class who has no fees for the year yet. */
export async function assignClassAction(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx, viewer) => {
    const s = await feeSettings(tx, ctx);
    if (!counterAllowed(s, viewer.roleKeys, "assign-fees")) throw new MoneyProblem("Your role cannot assign fees. The School Admin can allow it in Fee Settings, Counter permissions.");
    const structureId = id(fd, "structureId", "fee structure");
    await structureOnCampus(tx, viewer, structureId);
    const on = await featureOn(tx, ctx, "fee-category-fees");
    return assignToClass(tx, ctx, structureId, on);
  }, (r) => (r.students ? `Fees assigned to ${r.students} students (${r.rows} rows).` : "Every student of the class already has fees for this year."), { staffOnly: "assign fees" });
}

export async function copyAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx, viewer) => {
    await mayManage(tx, ctx, viewer);
    const pct = Number(str(fd, "percent") || "0");
    if (!Number.isFinite(pct)) throw new MoneyProblem("Increase is a number, like 5.", "percent");
    const fromId = id(fd, "fromId", "fee structure");
    const classIds = ids(fd, "classId");
    const yearId = id(fd, "yearId", "year");
    await structureOnCampus(tx, viewer, fromId);
    for (const classId of classIds) await classAndYear(tx, viewer, classId, yearId);
    return copyStructure(tx, ctx, fromId, { classIds, yearId, percentBp: Math.round(pct * 100) });
  }, (r) => `${r.made} ${r.made === 1 ? "class has" : "classes have"} a new draft to check and publish.${r.skipped.length ? ` Skipped (a draft is already open): ${r.skipped.join(", ")}.` : ""}`, { staffOnly: "copy fee structures" });
}

/** Opens next year's drafts for every class, copied from this year with an optional % increase. */
export async function prepareYearAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx, viewer) => {
    await mayManage(tx, ctx, viewer);
    const fromYear = id(fd, "fromYearId", "year");
    const toYear = id(fd, "toYearId", "next year");
    const pct = Number(str(fd, "percent") || "0");
    if (!Number.isFinite(pct)) throw new MoneyProblem("Increase is a number, like 5.", "percent");
    // Both years of one campus (the person's, when limited to one): its classes move on to its own next year.
    const [y1, y2] = await Promise.all([fromYear, toYear].map((y) => tx.academicYear.findFirst({ where: { id: y }, select: { campusId: true } })));
    if ((y1 && !campusAllows(viewer, y1.campusId)) || (y2 && !campusAllows(viewer, y2.campusId))) throw new MoneyProblem("This year was not found.");
    if (y1 && y2 && y1.campusId !== y2.campusId) throw new MoneyProblem("Next year is of another campus. Choose the next year of the same campus.", "toYearId");
    const published = await tx.feeStructure.findMany({ where: { academicYearId: fromYear, status: "PUBLISHED", archivedAt: null } });
    if (!published.length) throw new MoneyProblem("No class has a published structure this year to copy.");
    let made = 0;
    const skipped: string[] = [];
    for (const s of published) {
      const r = await copyStructure(tx, ctx, s.id, { classIds: [s.classId], yearId: toYear, percentBp: Math.round(pct * 100) });
      made += r.made;
      skipped.push(...r.skipped);
    }
    const y = await tx.academicYear.findFirst({ where: { id: toYear }, select: { name: true } });
    return { made, skipped, year: y?.name ?? "next year" };
  }, (r) => `${r.year} drafts opened for ${r.made} ${r.made === 1 ? "class" : "classes"}. Nothing changes for this year.${r.skipped.length ? ` Already had drafts: ${r.skipped.join(", ")}.` : ""}`, { staffOnly: "prepare next year" });
}

/** Undo a version: the older version is published again as a new version. */
export async function restoreAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx, viewer, current) => {
    await mayManage(tx, ctx, viewer);
    if (str(fd, "confirm") !== "on") throw new MoneyProblem("Tick the box to confirm.", "confirm");
    const s = await tx.feeStructure.findFirst({ where: { id: id(fd, "structureId", "version") } });
    if (!s) throw new MoneyProblem("This version was not found.");
    await structureOnCampus(tx, viewer, s.id, "version");
    const { draft } = await classStructure(tx, s.academicYearId, s.classId, s.category);
    if (draft) throw new MoneyProblem("Finish or discard the open draft first.");
    const from = dateOf(fd, "effectiveFrom", "Date it applies from");
    // Putting back an older version is a change to students' unpaid installments too: after the year starts, the Principal's.
    if (await publishNeedsApproval(tx, s.id, todayIn(current.school.timeZone), viewer.roleKeys)) {
      throw new MoneyProblem("This year has started, so only the Principal can put back an older version. Open a new draft with the old amounts and send it for approval.");
    }
    const r = await restorePreviousVersion(tx, ctx, s.id, from);
    return { version: r.version, old: s.version, from: formatDate(from) };
  }, (r) => `Version ${r.old} is back in use as version ${r.version}, from ${r.from}. Paid rows are not changed.`, { staffOnly: "change fee structures" });
}
