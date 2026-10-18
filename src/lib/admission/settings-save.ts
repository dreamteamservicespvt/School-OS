// Saving Admission Settings (02 §6). Only the admission team (full reach)
// changes them; every save is written to the Audit Log with before and after.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { AdmissionProblem } from "./act";
import { requireFull, type Viewer } from "./access";
import { CATEGORIES, DEFAULT_STAGES, DOC_TYPES, SYSTEM_STATUSES, classRule, loadSettings, type ClassDoc, type ListItem, type Quota, type Stage } from "./settings";

const json = (v: unknown) => v as Prisma.InputJsonValue;

async function save(tx: Tx, ctx: SchoolContext, what: string, data: Prisma.AdmissionSettingUpdateInput, before: Record<string, unknown>, after: Record<string, unknown>) {
  const row = await tx.admissionSetting.update({ where: { schoolId: ctx.schoolId }, data: { ...data, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "settings-changed", recordType: "Admission Settings", recordId: row.id, before: { part: what, ...before } as Prisma.InputJsonValue, after: { part: what, ...after } as Prisma.InputJsonValue });
  return row;
}

/** Stages in order: each on or off, and whether it needs an approval. Enquiry, Application, Decision and Admitted are always on. */
export async function saveStages(tx: Tx, ctx: SchoolContext, v: Viewer, input: { key: string; label: string; on: boolean; needsApproval: boolean }[]) {
  requireFull(v, "Admission Settings");
  const s = await loadSettings(tx, ctx);
  const stages: Stage[] = DEFAULT_STAGES.map((d) => {
    const i = input.find((x) => x.key === d.key);
    const labelText = (i?.label ?? d.label).trim().slice(0, 40) || d.label;
    const always = ["enquiry", "application", "decision", "admitted"].includes(d.key);
    return { key: d.key, label: labelText, on: always ? true : Boolean(i?.on), needsApproval: d.key === "decision" ? Boolean(i?.needsApproval) : false };
  });
  const testsOn = stages.find((x) => x.key === "test")!.on;
  const interviewsOn = stages.find((x) => x.key === "interview")!.on;
  return save(tx, ctx, "stages", { stages: json(stages), testsOn, interviewsOn }, { stages: s.stageList }, { stages });
}

export type ListKind = "enquiryStatuses" | "sources" | "lossReasons";

const keyOf = (labelText: string) => labelText.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";

/**
 * A list in order (add, rename, reorder, archive). Keys never change, so old
 * enquiries keep their value; the system statuses cannot be archived.
 */
export async function saveList(tx: Tx, ctx: SchoolContext, v: Viewer, kind: ListKind, input: { key: string | null; label: string; archived: boolean }[]) {
  requireFull(v, "Admission Settings");
  const s = await loadSettings(tx, ctx);
  const current: ListItem[] = kind === "enquiryStatuses" ? s.statusList : kind === "sources" ? s.sourceList : s.lossList;
  const out: ListItem[] = [];
  for (const row of input) {
    const labelText = row.label.trim().slice(0, 60);
    if (!labelText) continue;
    let key = row.key && current.some((c) => c.key === row.key) ? row.key : keyOf(labelText);
    if (!row.key || !current.some((c) => c.key === row.key)) {
      let n = 2;
      const base = key;
      while (out.some((o) => o.key === key) || current.some((c) => c.key === key)) key = `${base}-${n++}`;
    }
    if (out.some((o) => o.label.toLowerCase() === labelText.toLowerCase())) throw new AdmissionProblem(`"${labelText}" is in the list twice.`, "list");
    const system = kind === "enquiryStatuses" && (SYSTEM_STATUSES as readonly string[]).includes(key);
    out.push({ key, label: labelText, ...(row.archived && !system ? { archived: true } : {}) });
  }
  // Nothing is ever dropped: an item left off the form is kept as archived.
  for (const c of current) if (!out.some((o) => o.key === c.key)) out.push({ ...c, archived: !(kind === "enquiryStatuses" && (SYSTEM_STATUSES as readonly string[]).includes(c.key)) });
  if (kind === "enquiryStatuses") {
    for (const k of SYSTEM_STATUSES) if (!out.some((o) => o.key === k)) throw new AdmissionProblem("Applied, Admitted and Lost stay in the list: School OS sets them.");
    if (!out.some((o) => o.key === "new" && !o.archived)) throw new AdmissionProblem("Keep \"New\" in the list: every enquiry starts there.");
  }
  if (!out.some((o) => !o.archived)) throw new AdmissionProblem("Keep at least one item in the list.");
  const column = kind === "enquiryStatuses" ? { enquiryStatuses: json(out) } : kind === "sources" ? { sources: json(out) } : { lossReasons: json(out) };
  return save(tx, ctx, kind, column, { list: current }, { list: out });
}

export async function saveOwnerRule(tx: Tx, ctx: SchoolContext, v: Viewer, input: { rule: string; defaultOwnerStaffId: string | null; turnStaffIds: string[] }) {
  requireFull(v, "Admission Settings");
  const s = await loadSettings(tx, ctx);
  if (!["default", "turn", "class"].includes(input.rule)) throw new AdmissionProblem("Choose who gets new enquiries.", "rule");
  const ids = [...new Set([...(input.defaultOwnerStaffId ? [input.defaultOwnerStaffId] : []), ...input.turnStaffIds])];
  const found = await tx.staff.count({ where: { id: { in: ids }, archivedAt: null } });
  if (found !== ids.length) throw new AdmissionProblem("Choose staff from the list.", "defaultOwnerStaffId");
  if (input.rule === "turn" && input.turnStaffIds.length < 2) throw new AdmissionProblem("Choose at least two staff to share new enquiries in turn.", "turnStaffIds");
  const before = { rule: s.ownerRule, defaultOwnerStaffId: s.defaultOwnerStaffId, turnStaffIds: s.turnStaffIds };
  const after = { rule: input.rule, defaultOwnerStaffId: input.defaultOwnerStaffId, turnStaffIds: input.turnStaffIds };
  const sameTurn = s.turnStaffIds.join() === input.turnStaffIds.join();
  return save(tx, ctx, "owner-rule", { ownerRule: input.rule, defaultOwnerStaffId: input.defaultOwnerStaffId, turnStaffIds: input.turnStaffIds, ...(sameTurn ? {} : { turnNext: 0 }) }, before, after);
}

export type ClassRuleInput = { classId: string; documents: ClassDoc[]; feePaise: bigint | null; onlineOpen: boolean; minAge: number | null; maxAge: number | null; ownerStaffId: string | null };

/** Papers needed, application fee, online form, age rule and owner for one class. */
export async function saveClassRule(tx: Tx, ctx: SchoolContext, v: Viewer, input: ClassRuleInput) {
  requireFull(v, "Admission Settings");
  // A person limited to one campus keeps the rules of their campus's classes only.
  const cls = await tx.schoolClass.findFirst({ where: { id: input.classId, archivedAt: null, ...(v.campusId ? { campusId: v.campusId } : {}) }, select: { id: true, name: true } });
  if (!cls) throw new AdmissionProblem("This class was not found.");
  const docs = input.documents.filter((d) => DOC_TYPES.some((t) => t.key === d.type));
  if (input.minAge !== null && (input.minAge < 1 || input.minAge > 20)) throw new AdmissionProblem("Lowest age must be between 1 and 20.", "minAge");
  if (input.maxAge !== null && (input.maxAge < 1 || input.maxAge > 25)) throw new AdmissionProblem("Highest age must be between 1 and 25.", "maxAge");
  if (input.minAge !== null && input.maxAge !== null && input.minAge > input.maxAge) throw new AdmissionProblem("Lowest age must not be above the highest age.", "maxAge");
  if (input.feePaise !== null && input.feePaise < BigInt(0)) throw new AdmissionProblem("The fee cannot be below zero.", "fee");
  if (input.ownerStaffId && !(await tx.staff.findFirst({ where: { id: input.ownerStaffId, archivedAt: null }, select: { id: true } }))) throw new AdmissionProblem("Choose the owner from the list.", "ownerStaffId");
  const before = await classRule(tx, cls.id);
  const data = { documents: json(docs), feePaise: input.feePaise, onlineOpen: input.onlineOpen, minAge: input.minAge, maxAge: input.maxAge, ownerStaffId: input.ownerStaffId, updatedById: ctx.userId };
  const row = await tx.admissionClassRule.upsert({ where: { schoolId_classId: { schoolId: ctx.schoolId, classId: cls.id } }, create: { schoolId: ctx.schoolId, classId: cls.id, ...data }, update: data });
  await writeAudit(tx, ctx, {
    action: "settings-changed", recordType: "Admission Settings", recordId: row.id,
    before: { part: `class ${cls.name}`, documents: before.documents, feePaise: before.feePaise?.toString() ?? null, onlineOpen: before.onlineOpen, minAge: before.minAge, maxAge: before.maxAge, ownerStaffId: before.ownerStaffId } as Prisma.InputJsonValue,
    after: { part: `class ${cls.name}`, documents: docs, feePaise: input.feePaise?.toString() ?? null, onlineOpen: input.onlineOpen, minAge: input.minAge, maxAge: input.maxAge, ownerStaffId: input.ownerStaffId } as Prisma.InputJsonValue,
  });
  return row;
}

export type RulesInput = {
  admissionYearId: string | null;
  applicationPrefix: string;
  allowOverCapacity: boolean;
  admitWithPapersPending: boolean;
  waitingListOn: boolean;
  siblingPriorityOn: boolean;
  siblingWeight: number;
  quotaOn: boolean;
  quotas: Quota[];
  onlineOn: boolean;
  applicationFeeOn: boolean;
  offerLettersOn: boolean;
  campaignsOn: boolean;
};

/** Admission year, number format, seat rules, sibling priority, quotas and the optional parts. */
export async function saveRules(tx: Tx, ctx: SchoolContext, v: Viewer, input: RulesInput) {
  requireFull(v, "Admission Settings");
  const s = await loadSettings(tx, ctx);
  if (input.admissionYearId) {
    const y = await tx.academicYear.findFirst({ where: { id: input.admissionYearId, archivedAt: null } });
    if (!y || y.status === "CLOSED") throw new AdmissionProblem("Choose an open academic year.", "admissionYearId");
  }
  const prefix = input.applicationPrefix.trim();
  if (!prefix || prefix.length > 30 || !/^[A-Za-z0-9/{}\-_ ]+$/.test(prefix)) throw new AdmissionProblem("The application number format can use letters, numbers, / - _ and {YYYY}, for example APP/{YYYY}/.", "applicationPrefix");
  if (!Number.isInteger(input.siblingWeight) || input.siblingWeight < 0 || input.siblingWeight > 100) throw new AdmissionProblem("Sibling priority must be between 0 and 100 points.", "siblingWeight");
  const quotas = input.quotas.filter((q) => (CATEGORIES as readonly string[]).includes(q.category) && q.sharePct > 0);
  const total = quotas.reduce((p, q) => p + q.sharePct, 0);
  if (total > 100) throw new AdmissionProblem(`The quota shares add up to ${total}%. They can be at most 100%.`, "quotas");
  const before = { admissionYearId: s.admissionYearId, applicationPrefix: s.applicationPrefix, allowOverCapacity: s.allowOverCapacity, admitWithPapersPending: s.admitWithPapersPending, waitingListOn: s.waitingListOn, siblingPriorityOn: s.siblingPriorityOn, siblingWeight: s.siblingWeight, quotaOn: s.quotaOn, quotas: s.quotaList, onlineOn: s.onlineOn, applicationFeeOn: s.applicationFeeOn, offerLettersOn: s.offerLettersOn, campaignsOn: s.campaignsOn };
  const after = { ...input, applicationPrefix: prefix, quotas };
  const stages = s.stageList.map((x) => (x.key === "payment" ? { ...x, on: input.applicationFeeOn ? x.on : false } : x));
  return save(tx, ctx, "rules", { ...after, quotas: json(quotas), stages: json(stages) }, before, after);
}
