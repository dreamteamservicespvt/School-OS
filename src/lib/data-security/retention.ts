// Retention schedule (08-platform-security.md §12; Settings, Data Backup &
// Security, Privacy). Every night School OS looks for records past the period
// the school chose (privacy.ts, RETENTION_DEFAULTS). They are listed for the
// School Admin's approval; nothing a person would miss is removed by itself.
//
// Nothing is ever deleted from a school table. "Cleared" means the personal
// details are blanked and the record stays, so counts, pass numbers, message
// costs and the audit trail keep working. Records the law or the blueprint
// keeps (students and results, fees, salary and finance, the audit log and the
// login history in it) are never cleared here.
//
// Working rows nobody reads are cleared without asking: one-time codes after
// 30 days and the files of full data exports once their link has expired.
import "server-only";

import { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { fileStore } from "../storage";
import { activeSchoolAdminIds } from "../settings/common";
import { EXPORT_LINK_HOURS } from "./data-export";
import { retentionRules } from "./privacy";

/** The kinds of record the check can clear, with the words the screen uses. */
export const CLEARABLE = {
  "visitor-entries": { one: "visitor entry or gate entry", many: "visitor and gate entries", how: "Name, phone, photo, ID proof and vehicle number removed" },
  enquiries: { one: "enquiry that did not join", many: "enquiries that did not join", how: "Child's and parent's names, phone, email and notes removed; the enquiry is archived" },
  "message-history": { one: "message", many: "messages", how: "Message text and each recipient's name, number and text removed; counts and costs stay" },
} as const;
export type ClearableType = keyof typeof CLEARABLE;
export const CLEARABLE_TYPES = Object.keys(CLEARABLE) as ClearableType[];

/** Kept by School OS whatever happens here (shown on the page so nobody wonders). */
export const NEVER_CLEARED = ["Student records, results and certificates", "Fee payments, receipts, salary and finance records", "The audit log and login history"];

/** One-time codes are kept this long, then blanked (inferred: 30 days). */
export const CODE_KEEP_DAYS = 30;

/** Words for one count, e.g. "12 messages". */
export function countWords(type: string, n: number) {
  const w = CLEARABLE[type as ClearableType];
  if (!w) return `${n} ${type}`;
  return `${n} ${n === 1 ? w.one : w.many}`;
}

export const AUTO_WORDS: Record<string, [string, string]> = {
  "one-time-codes": ["old one-time code", "old one-time codes"],
  "export-files": ["expired export file", "expired export files"],
};

export type Due = Partial<Record<ClearableType, { count: number; before: string }>>;
export type Counts = Record<string, number>;

const REMOVED_TEXT = "Removed after the keeping period";

/** The moment `months` before `now`: anything older is past its period. */
export function cutoffFor(now: Date, months: number) {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

const ENQUIRY_JOINED = ["applied", "admitted"];

function whereFor(type: ClearableType, before: Date) {
  switch (type) {
    case "visitor-entries":
      return {
        visitors: { clearedAt: null, visitDate: { lt: before } } satisfies Prisma.VisitorEntryWhereInput,
        gate: { clearedAt: null, at: { lt: before } } satisfies Prisma.GateEntryWhereInput,
      };
    case "enquiries":
      return { enquiries: { clearedAt: null, status: { notIn: ENQUIRY_JOINED }, updatedAt: { lt: before } } satisfies Prisma.EnquiryWhereInput };
    case "message-history":
      return { messages: { clearedAt: null, createdAt: { lt: before } } satisfies Prisma.MessageWhereInput };
  }
}

async function countPast(tx: Tx, type: ClearableType, before: Date): Promise<number> {
  const w = whereFor(type, before);
  if ("visitors" in w) return (await tx.visitorEntry.count({ where: w.visitors })) + (await tx.gateEntry.count({ where: w.gate }));
  if ("enquiries" in w) return tx.enquiry.count({ where: w.enquiries });
  return tx.message.count({ where: w.messages });
}

/** Records past their period now, per kind, with the cut-off used. */
export async function findDue(tx: Tx, now = new Date()): Promise<Due> {
  const rules = await retentionRules(tx);
  const due: Due = {};
  for (const type of CLEARABLE_TYPES) {
    const months = rules.find((r) => r.recordType === type)?.keepMonths;
    if (months === null || months === undefined) continue;
    const before = cutoffFor(now, months);
    const count = await countPast(tx, type, before);
    if (count > 0) due[type] = { count, before: before.toISOString() };
  }
  return due;
}

/** Removes the personal details of one kind of record older than `before`. Returns how many records. */
async function clearType(tx: Tx, type: ClearableType, before: Date, now: Date): Promise<number> {
  const w = whereFor(type, before);
  if ("visitors" in w) {
    // Visitor photos are removed from storage too ("delete visitor photos after 1 year").
    const photos = await tx.visitorEntry.findMany({ where: { ...w.visitors, photoFileId: { not: null } }, select: { photoFileId: true } });
    const fileIds = photos.map((p) => p.photoFileId).filter((x): x is string => Boolean(x));
    await removeFiles(tx, fileIds, now);
    const v = await tx.visitorEntry.updateMany({
      where: w.visitors,
      data: { name: "Removed visitor", phone: "", note: null, photoFileId: null, idProofType: null, idProofNo: null, idProofLast4: null, vehicleNo: null, relation: null, clearedAt: now },
    });
    const g = await tx.gateEntry.updateMany({ where: w.gate, data: { who: "Removed", vehicleNo: null, purpose: null, clearedAt: now } });
    return v.count + g.count;
  }
  if ("enquiries" in w) {
    const ids = (await tx.enquiry.findMany({ where: w.enquiries, select: { id: true } })).map((e) => e.id);
    if (ids.length === 0) return 0;
    await tx.enquiry.updateMany({ where: { id: { in: ids }, archivedAt: null }, data: { archivedAt: now } });
    await tx.enquiry.updateMany({
      where: { id: { in: ids } },
      data: { childName: "Removed person", parentName: "Removed person", phone: "", email: null, childDob: null, currentSchool: null, referredBy: null, notes: null, lostNote: null, nextAction: null, customFields: {}, clearedAt: now },
    });
    await tx.enquiryActivity.updateMany({ where: { enquiryId: { in: ids } }, data: { text: REMOVED_TEXT, data: Prisma.DbNull } });
    return ids.length;
  }
  // Recipients first, while their message still shows as not cleared.
  await tx.messageRecipient.updateMany({
    where: { message: w.messages },
    data: { name: "Removed", description: null, address: "", values: {}, text: REMOVED_TEXT, sealedCode: null, history: [] },
  });
  const m = await tx.message.updateMany({ where: w.messages, data: { title: null, body: REMOVED_TEXT, audienceLabel: REMOVED_TEXT, audience: {}, skipped: [], translations: [], trigger: null, clearedAt: now } });
  return m.count;
}

/** Archives the Stored File records and removes the files themselves from storage. */
async function removeFiles(tx: Tx, fileIds: string[], now: Date) {
  if (fileIds.length === 0) return 0;
  const files = await tx.storedFile.findMany({ where: { id: { in: fileIds } }, select: { id: true, storageKey: true } });
  for (const f of files) await fileStore().remove(f.storageKey);
  await tx.storedFile.updateMany({ where: { id: { in: files.map((f) => f.id) }, archivedAt: null }, data: { archivedAt: now } });
  return files.length;
}

/** Working rows cleared without asking: old one-time codes and expired export files. */
export async function clearAutomatic(tx: Tx, now = new Date()): Promise<Counts> {
  const codeBefore = new Date(now.getTime() - CODE_KEEP_DAYS * 86_400_000);
  const a = await tx.admissionOtp.updateMany({ where: { createdAt: { lt: codeBefore }, codeHash: { not: "" } }, data: { codeHash: "", phone: "" } });
  const p = await tx.parentLinkCode.updateMany({ where: { createdAt: { lt: codeBefore }, codeHash: { not: "" } }, data: { codeHash: "", keyHash: null } });
  // Two-step sign-in codes belong to logins, not schools: removed by a database function (the app cannot delete).
  await tx.$queryRaw`SELECT prune_two_step_challenges()`;

  const exportBefore = new Date(now.getTime() - EXPORT_LINK_HOURS * 3_600_000);
  const exports = await tx.dataExport.findMany({ where: { status: "ready", readyAt: { lt: exportBefore }, fileId: { not: null } }, select: { fileId: true } });
  const live = await tx.storedFile.findMany({ where: { id: { in: exports.map((e) => e.fileId!) }, archivedAt: null }, select: { id: true } });
  const files = await removeFiles(tx, live.map((f) => f.id), now);

  const out: Counts = {};
  if (a.count + p.count) out["one-time-codes"] = a.count + p.count;
  if (files) out["export-files"] = files;
  return out;
}

const dayOf = (now: Date) => new Date(now.toISOString().slice(0, 10));
const total = (c: Record<string, number | { count: number }>) => Object.values(c).reduce<number>((s, v) => s + (typeof v === "number" ? v : v.count), 0);

/**
 * The nightly check for one school (scripts/worker.ts, schedule "retention-check").
 * Safe to run twice: a second run the same day finds nothing new to clear and
 * updates the same day's row.
 */
export async function runRetentionCheck(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const autoCleared = await clearAutomatic(tx, now);
  const due = await findDue(tx, now);
  const runOn = dayOf(now);
  const before = await tx.retentionRun.findFirst({ where: { status: "waiting" }, orderBy: { runOn: "desc" } });
  // A newer list replaces an older one still waiting: the newer one includes its records.
  await tx.retentionRun.updateMany({ where: { status: "waiting", runOn: { lt: runOn } }, data: { status: "replaced" } });
  const today = await tx.retentionRun.findUnique({ where: { schoolId_runOn: { schoolId: ctx.schoolId, runOn } } });
  const status = total(due) > 0 ? "waiting" : "nothing-due";
  let run;
  if (today) {
    const merged: Counts = { ...(today.autoCleared as Counts) };
    for (const [k, n] of Object.entries(autoCleared)) merged[k] = (merged[k] ?? 0) + n;
    run = await tx.retentionRun.update({
      where: { id: today.id },
      // A list already approved today stays as it is; a later run only adds what it cleared by itself.
      data: today.status === "cleared" ? { autoCleared: merged } : { autoCleared: merged, due, status },
    });
  } else {
    run = await tx.retentionRun.create({ data: { schoolId: ctx.schoolId, runOn, due, autoCleared, status } });
  }
  if (total(due) > 0 || total(autoCleared) > 0) {
    await writeAudit(tx, ctx, { action: "retention-checked", recordType: "Retention Run", recordId: run.id, after: { due: Object.fromEntries(Object.entries(due).map(([k, v]) => [k, v.count])), clearedWithoutAsking: autoCleared } });
  }
  // School Admins are told once when records start waiting, not every night.
  if (status === "waiting" && !before) {
    const text = `${Object.entries(due).map(([k, v]) => countWords(k, v.count)).join(", ")} are past the period your school keeps them. Review and clear them.`;
    for (const to of await activeSchoolAdminIds(tx, ctx.schoolId)) {
      await notify(tx, ctx, { to, type: "privacy", text, link: "/settings/data-security/privacy#retention" });
    }
  }
  return run;
}

export class RetentionProblem extends Error {}

/**
 * The School Admin's yes: clears exactly the records the list showed. If the
 * school has since chosen a longer period, the later cut-off wins, so nothing
 * the school now wants kept is cleared.
 */
export async function clearListed(tx: Tx, ctx: SchoolContext, runId: string, now = new Date()) {
  const run = await tx.retentionRun.findUnique({ where: { id: runId } });
  if (!run) throw new RetentionProblem("This list was not found. Reload the page.");
  if (run.status === "cleared") throw new RetentionProblem("These records were already cleared.");
  if (run.status !== "waiting") throw new RetentionProblem("A newer list has replaced this one. Reload the page.");
  const listed = run.due as Due;
  const current = await retentionRules(tx);
  const cleared: Counts = {};
  for (const type of CLEARABLE_TYPES) {
    const item = listed[type];
    if (!item) continue;
    const months = current.find((r) => r.recordType === type)?.keepMonths;
    if (months === null || months === undefined) continue; // now kept for as long as the school uses School OS
    const nowCut = cutoffFor(now, months);
    const listedCut = new Date(item.before);
    const before = nowCut < listedCut ? nowCut : listedCut;
    const n = await clearType(tx, type, before, now);
    if (n) cleared[type] = n;
  }
  const done = await tx.retentionRun.update({ where: { id: run.id }, data: { status: "cleared", cleared, clearedAt: now, clearedById: ctx.userId } });
  // Only counts go in the log, never the removed values.
  await writeAudit(tx, ctx, { action: "retention-cleared", recordType: "Retention Run", recordId: run.id, after: { cleared } });
  return done;
}

/** For the Privacy page: the latest list, and what was cleared lately. */
export async function retentionOverview(tx: Tx) {
  const runs = await tx.retentionRun.findMany({ orderBy: { runOn: "desc" }, take: 30 });
  const latest = runs[0] ?? null;
  const waiting = runs.find((r) => r.status === "waiting") ?? null;
  const history = runs.filter((r) => r.status === "cleared" || total(r.autoCleared as Counts) > 0).slice(0, 10);
  return { latest, waiting, history };
}
