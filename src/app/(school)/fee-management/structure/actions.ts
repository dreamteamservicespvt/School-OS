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
  restorePreviousVersion, saveFeeHead, saveFeeRow,
} from "@/lib/fees/structure";
import { dateOf, id, ids, optionalId, parseRupees, str, strs } from "@/lib/fees/act";
import { feeAction } from "../_lib/action";

/** "Manage class fee structure" is a counter permission (Fee Settings). */
async function mayManage(tx: Tx, ctx: SchoolContext, viewer: FeeViewer) {
  const s = await feeSettings(tx, ctx);
  if (!counterAllowed(s, viewer.roleKeys, "manage-structure")) throw new MoneyProblem("Your role cannot change fee structures. The School Admin can allow it in Fee Settings, Counter permissions.");
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
    const draft = await openDraft(tx, ctx, id(fd, "yearId", "year"), id(fd, "classId", "class"), str(fd, "category"));
    const headId = id(fd, "feeHeadId", "fee head");
    const item = await tx.feeStructureItem.findFirst({ where: { structureId: draft.id, feeHeadId: headId, archivedAt: null } });
    if (!item) throw new MoneyProblem("This fee row was not found.");
    await removeFeeRow(tx, ctx, draft.id, item.id);
    return draft.version;
  }, (v) => `Row removed from the draft (version ${v}). Students’ fees change only when you publish.`, { staffOnly: "change fee structures" });
}

/** Publishes the draft: the new version is in use from the date. Paid rows never change. */
export async function publishAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx, viewer) => {
    await mayManage(tx, ctx, viewer);
    if (str(fd, "confirm") !== "on") throw new MoneyProblem("Tick the box to confirm the change to students’ unpaid installments.", "confirm");
    const structureId = id(fd, "structureId", "draft");
    const r = await publishStructure(tx, ctx, structureId, dateOf(fd, "effectiveFrom", "Date it applies from"));
    let assigned = { students: 0, rows: 0 };
    if (str(fd, "assign") === "on") {
      const on = await featureOn(tx, ctx, "fee-category-fees");
      assigned = await assignToClass(tx, ctx, structureId, on);
    }
    return { version: r.version, updated: r.impact.students, assigned: assigned.students };
  }, (r) => `Version ${r.version} published.${r.updated ? ` ${r.updated} students’ unpaid installments updated.` : ""}${r.assigned ? ` ${r.assigned} students without fees got the plan.` : ""} Paid rows are not changed.`, { staffOnly: "publish fee structures" });
}

export async function discardAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx, viewer) => {
    await mayManage(tx, ctx, viewer);
    await discardDraft(tx, ctx, id(fd, "structureId", "draft"));
    return true;
  }, () => "Draft discarded. The version in use is unchanged.", { staffOnly: "change fee structures" });
}

/** Gives the published plan to every student of the class who has no fees for the year yet. */
export async function assignClassAction(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx, viewer) => {
    const s = await feeSettings(tx, ctx);
    if (!counterAllowed(s, viewer.roleKeys, "assign-fees")) throw new MoneyProblem("Your role cannot assign fees. The School Admin can allow it in Fee Settings, Counter permissions.");
    const on = await featureOn(tx, ctx, "fee-category-fees");
    return assignToClass(tx, ctx, id(fd, "structureId", "fee structure"), on);
  }, (r) => (r.students ? `Fees assigned to ${r.students} students (${r.rows} rows).` : "Every student of the class already has fees for this year."), { staffOnly: "assign fees" });
}

export async function copyAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx, viewer) => {
    await mayManage(tx, ctx, viewer);
    const pct = Number(str(fd, "percent") || "0");
    if (!Number.isFinite(pct)) throw new MoneyProblem("Increase is a number, like 5.", "percent");
    return copyStructure(tx, ctx, id(fd, "fromId", "fee structure"), { classIds: ids(fd, "classId"), yearId: id(fd, "yearId", "year"), percentBp: Math.round(pct * 100) });
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
  return feeAction("edit", fd, async (tx, ctx, viewer) => {
    await mayManage(tx, ctx, viewer);
    if (str(fd, "confirm") !== "on") throw new MoneyProblem("Tick the box to confirm.", "confirm");
    const s = await tx.feeStructure.findFirst({ where: { id: id(fd, "structureId", "version") } });
    if (!s) throw new MoneyProblem("This version was not found.");
    const { draft } = await classStructure(tx, s.academicYearId, s.classId, s.category);
    if (draft) throw new MoneyProblem("Finish or discard the open draft first.");
    const from = dateOf(fd, "effectiveFrom", "Date it applies from");
    const r = await restorePreviousVersion(tx, ctx, s.id, from);
    return { version: r.version, old: s.version, from: formatDate(from) };
  }, (r) => `Version ${r.old} is back in use as version ${r.version}, from ${r.from}. Paid rows are not changed.`, { staffOnly: "change fee structures" });
}
