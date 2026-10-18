// Admission Settings (02 §6): stages and approvals, enquiry statuses,
// sources, loss reasons, who gets new enquiries, papers needed per class,
// seat rules, waiting list, sibling priority, quotas, tests and interviews,
// the online form, the application fee and the application number format.
// The row is made with sensible defaults the first time a page needs it.
import "server-only";

import { randomUUID } from "node:crypto";
import type { AdmissionClassRule, AdmissionSetting, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { currentYear } from "../academic/years";
import { combineRoles, applyExceptions } from "../permissions";
import type { AccessLevel, RolePermissions } from "../roles";

export type ListItem = { key: string; label: string; archived?: boolean };
export type Stage = { key: StageKey; label: string; on: boolean; needsApproval?: boolean };
export type StageKey = "enquiry" | "application" | "documents" | "payment" | "test" | "interview" | "decision" | "admitted";

export const DEFAULT_STAGES: Stage[] = [
  { key: "enquiry", label: "Enquiry", on: true },
  { key: "application", label: "Application", on: true },
  { key: "documents", label: "Documents", on: true },
  { key: "payment", label: "Application fee", on: false },
  { key: "test", label: "Test", on: false },
  { key: "interview", label: "Interview", on: false },
  { key: "decision", label: "Decision", on: true, needsApproval: true },
  { key: "admitted", label: "Admitted", on: true },
];

/** Statuses the software sets by itself: they stay in the list and cannot be archived. */
export const SYSTEM_STATUSES = ["applied", "admitted", "lost"] as const;
/** Enquiries in these statuses are closed: no follow-up is needed. */
export const CLOSED_STATUSES: readonly string[] = SYSTEM_STATUSES;

export const DEFAULT_STATUSES: ListItem[] = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "visit-scheduled", label: "Visit scheduled" },
  { key: "visited", label: "Visited" },
  { key: "application-given", label: "Application given" },
  { key: "applied", label: "Applied" },
  { key: "admitted", label: "Admitted" },
  { key: "lost", label: "Lost" },
];

export const DEFAULT_SOURCES: ListItem[] = [
  { key: "walk-in", label: "Walk-in" },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "campaign", label: "Campaign" },
  { key: "referral", label: "Referral" },
];

export const DEFAULT_LOSS_REASONS: ListItem[] = [
  { key: "fees", label: "Fees too high" },
  { key: "other-school", label: "Chose another school" },
  { key: "distance", label: "Too far from home" },
  { key: "no-seat", label: "No seat in the class wanted" },
  { key: "not-reachable", label: "Could not reach the family" },
  { key: "plans-changed", label: "Family plans changed" },
  { key: "other", label: "Other" },
];

export const DOC_TYPES = [
  { key: "birth-certificate", label: "Birth certificate" },
  { key: "transfer-certificate", label: "Transfer certificate (TC)" },
  { key: "marksheet", label: "Previous marksheet" },
  { key: "aadhaar", label: "Aadhaar card (child)" },
  { key: "address-proof", label: "Address proof" },
  { key: "parent-id", label: "Parent ID proof" },
  { key: "photo", label: "Passport-size photo" },
  { key: "other", label: "Other certificate" },
] as const;
export const docLabel = (key: string) => DOC_TYPES.find((d) => d.key === key)?.label ?? key;

/**
 * Admission papers and the Student Management documents they become on
 * admission (Student Settings, "Documents expected for every student"). The
 * two checklists are written differently, so each paper has the ready
 * student name, and words that find the school's own name for it when the
 * school renamed its list. A paper with no match keeps its admission name.
 */
export const PAPER_TO_STUDENT_DOCUMENT: Record<string, { name: string | null; words: RegExp | null; not?: RegExp }> = {
  "birth-certificate": { name: "Birth certificate", words: /birth/i },
  "transfer-certificate": { name: "Transfer certificate (previous school)", words: /transfer|\btc\b|leaving cert/i },
  marksheet: { name: null, words: /mark ?sheet|marks card|report card|result/i },
  aadhaar: { name: "Aadhaar card", words: /aadh?aa?r/i, not: /parent|father|mother|guardian/i },
  "address-proof": { name: "Address proof", words: /address|residence/i },
  "parent-id": { name: "Parent's ID proof", words: /parent|father|mother|guardian/i },
  photo: { name: "Passport-size photo", words: /photo/i },
  other: { name: null, words: null },
};

/** The student document name for an admission paper, in the school's own list when it has one. */
export function studentDocumentKind(docType: string, studentDocuments: string[]): string {
  const m = PAPER_TO_STUDENT_DOCUMENT[docType];
  if (!m) return docLabel(docType);
  if (m.name && studentDocuments.includes(m.name)) return m.name;
  const own = m.words ? studentDocuments.find((k) => m.words!.test(k) && !(m.not && m.not.test(k))) : undefined;
  return own ?? docLabel(docType);
}

export type ClassDoc = { type: string; required: boolean };

export const OWNER_RULES = [
  { value: "default", label: "One default owner", help: "Every new enquiry goes to one person." },
  { value: "turn", label: "In turn among chosen staff", help: "Each new enquiry goes to the next person on the list. Staff on approved leave that day are skipped." },
  { value: "class", label: "By class wanted", help: "A staff member for each class. Enquiries with no class wanted go to the default owner." },
] as const;

export const CATEGORIES = ["General", "OBC", "SC", "ST", "EWS"] as const;

export type Quota = { category: string; sharePct: number };

export type Settings = AdmissionSetting & {
  stageList: Stage[];
  statusList: ListItem[];
  sourceList: ListItem[];
  lossList: ListItem[];
  quotaList: Quota[];
};

function asList(v: Prisma.JsonValue, fallback: ListItem[]): ListItem[] {
  if (!Array.isArray(v) || v.length === 0) return fallback;
  return (v as ListItem[]).filter((x) => x && typeof x.key === "string" && typeof x.label === "string");
}

function stagesOf(row: AdmissionSetting): Stage[] {
  const saved = Array.isArray(row.stages) ? (row.stages as Stage[]) : [];
  return DEFAULT_STAGES.map((d) => {
    const s = saved.find((x) => x?.key === d.key);
    const base = { ...d, ...(s ? { label: s.label || d.label, on: Boolean(s.on), needsApproval: Boolean(s.needsApproval) } : {}) };
    // Tests and interviews follow their own switches, so there is one place to turn them on.
    if (d.key === "test") base.on = row.testsOn;
    if (d.key === "interview") base.on = row.interviewsOn;
    if (d.key === "enquiry" || d.key === "application" || d.key === "admitted") base.on = true;
    if (d.key === "decision") base.on = true;
    return base;
  });
}

export function shape(row: AdmissionSetting): Settings {
  return {
    ...row,
    stageList: stagesOf(row),
    statusList: asList(row.enquiryStatuses, DEFAULT_STATUSES),
    sourceList: asList(row.sources, DEFAULT_SOURCES),
    lossList: asList(row.lossReasons, DEFAULT_LOSS_REASONS),
    quotaList: Array.isArray(row.quotas) ? (row.quotas as Quota[]) : [],
  };
}

export async function loadSettings(tx: Tx, ctx: SchoolContext): Promise<Settings> {
  const found = await tx.admissionSetting.findUnique({ where: { schoolId: ctx.schoolId } });
  if (found) return shape(found);
  // First use: made with the defaults. Two first page loads at once must not
  // fail on each other, so a row someone else just made is kept as it is.
  await tx.$executeRaw`
    INSERT INTO admission_setting (id, school_id, stages, enquiry_statuses, sources, loss_reasons, updated_at)
    VALUES (${randomUUID()}::uuid, ${ctx.schoolId}::uuid, ${JSON.stringify(DEFAULT_STAGES)}::jsonb, ${JSON.stringify(DEFAULT_STATUSES)}::jsonb,
            ${JSON.stringify(DEFAULT_SOURCES)}::jsonb, ${JSON.stringify(DEFAULT_LOSS_REASONS)}::jsonb, now())
    ON CONFLICT (school_id) DO NOTHING`;
  return shape(await tx.admissionSetting.findUniqueOrThrow({ where: { schoolId: ctx.schoolId } }));
}

export const stageOn = (s: Settings, key: StageKey) => s.stageList.find((x) => x.key === key)?.on ?? false;
export const label = (list: ListItem[], key: string | null | undefined) => (key ? list.find((x) => x.key === key)?.label ?? key : "");
export const live = (list: ListItem[]) => list.filter((x) => !x.archived);

/**
 * The year admissions are open for: the one chosen in Admission Settings,
 * else the upcoming year once it has sections, else the current year (inferred).
 * Each campus has its own years (04-data-model.md rule 19): with a campus, the
 * year is that campus's. The year chosen in Settings belongs to one campus;
 * another campus takes its open year of the same name.
 */
export async function admissionYear(tx: Tx, ctx: SchoolContext, s: Pick<Settings, "admissionYearId">, campusId?: string | null) {
  const campus = campusId ? { campusId } : {};
  if (s.admissionYearId) {
    const y = await tx.academicYear.findFirst({ where: { id: s.admissionYearId, archivedAt: null } });
    if (y && y.status !== "CLOSED") {
      if (!campusId || y.campusId === campusId) return y;
      const same = await tx.academicYear.findFirst({ where: { campusId, name: y.name, archivedAt: null, status: { not: "CLOSED" } } });
      if (same) return same;
    }
  }
  const upcoming = await tx.academicYear.findFirst({ where: { status: "UPCOMING", archivedAt: null, ...campus }, orderBy: { startDate: "asc" } });
  if (upcoming && (await tx.section.count({ where: { academicYearId: upcoming.id, archivedAt: null } })) > 0) return upcoming;
  return currentYear(tx, ctx, campusId ?? null);
}

/** The admission year of each campus the person sees (only theirs when limited to one campus). */
export async function admissionYears(tx: Tx, ctx: SchoolContext, s: Pick<Settings, "admissionYearId">, limit?: string | null) {
  const campuses = await tx.campus.findMany({ where: { archivedAt: null, ...(limit ? { id: limit } : {}) }, orderBy: [{ isMain: "desc" }, { createdAt: "asc" }], select: { id: true } });
  const out: NonNullable<Awaited<ReturnType<typeof admissionYear>>>[] = [];
  for (const c of campuses) {
    const y = await admissionYear(tx, ctx, s, c.id);
    if (y) out.push(y);
  }
  return out;
}

/**
 * The year of a campus for a year chosen on a form: the year itself when it
 * is the campus's, else the campus's open year of the same name, else null.
 */
export async function yearOnCampus(tx: Tx, yearId: string, campusId: string) {
  const y = await tx.academicYear.findFirst({ where: { id: yearId, archivedAt: null } });
  if (!y) return null;
  if (y.campusId === campusId) return y;
  return tx.academicYear.findFirst({ where: { campusId, name: y.name, archivedAt: null, status: { in: ["ACTIVE", "UPCOMING"] } } });
}

/** Years an admission can be for: the current one and upcoming ones (only the campus's when one is given). */
export async function openYears(tx: Tx, campusId?: string | null) {
  return tx.academicYear.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "UPCOMING"] }, ...(campusId ? { campusId } : {}) }, orderBy: { startDate: "asc" } });
}

/** Classes in order (only the campus's when one is given). */
export async function classList(tx: Tx, campusId?: string | null) {
  return tx.schoolClass.findMany({ where: { archivedAt: null, ...(campusId ? { campusId } : {}) }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, sortOrder: true, campusId: true } });
}

/** Campus names by id when the person sees more than one campus, to tell the classes and years of each apart; empty otherwise. */
export async function campusNames(tx: Tx, limit?: string | null): Promise<Map<string, string>> {
  if (limit) return new Map();
  const rows = await tx.campus.findMany({ where: { archivedAt: null }, select: { id: true, name: true } });
  return rows.length > 1 ? new Map(rows.map((c) => [c.id, c.name])) : new Map();
}

/** "Class 1", or "Class 1 (North Campus)" when the person sees more than one campus. */
export function withCampus(names: Map<string, string>, label: string, campusId: string | null | undefined) {
  const c = campusId ? names.get(campusId) : undefined;
  return c ? `${label} (${c})` : label;
}

/** Class 2 and above ask for the previous school, TC and marksheet (inferred). */
export function needsPreviousSchool(cls: { sortOrder: number }, classes: { name: string; sortOrder: number }[]) {
  const class2 = classes.find((c) => /^class\s*(2|ii)$/i.test(c.name.trim()));
  return class2 ? cls.sortOrder >= class2.sortOrder : false;
}

export function defaultDocsFor(previousSchool: boolean): ClassDoc[] {
  return [
    { type: "birth-certificate", required: true },
    { type: "photo", required: true },
    { type: "address-proof", required: true },
    { type: "parent-id", required: true },
    { type: "aadhaar", required: false },
    ...(previousSchool ? [{ type: "transfer-certificate", required: true }, { type: "marksheet", required: true }] : []),
  ];
}

export type ClassRule = { classId: string; documents: ClassDoc[]; feePaise: bigint | null; onlineOpen: boolean; minAge: number | null; maxAge: number | null; ownerStaffId: string | null; saved: boolean };

/** Every class's rule: the saved one, or the defaults. */
export async function classRules(tx: Tx): Promise<Map<string, ClassRule>> {
  const [classes, rows] = await Promise.all([classList(tx), tx.admissionClassRule.findMany()]);
  const out = new Map<string, ClassRule>();
  for (const c of classes) {
    const r = rows.find((x) => x.classId === c.id);
    // "Class 2 and above" is read among the classes of the class's own campus.
    out.set(c.id, r ? fromRow(r) : { classId: c.id, documents: defaultDocsFor(needsPreviousSchool(c, classes.filter((x) => x.campusId === c.campusId))), feePaise: null, onlineOpen: true, minAge: null, maxAge: null, ownerStaffId: null, saved: false });
  }
  return out;
}

function fromRow(r: AdmissionClassRule): ClassRule {
  const docs = Array.isArray(r.documents) ? (r.documents as ClassDoc[]).filter((d) => d && typeof d.type === "string") : [];
  return { classId: r.classId, documents: docs, feePaise: r.feePaise, onlineOpen: r.onlineOpen, minAge: r.minAge, maxAge: r.maxAge, ownerStaffId: r.ownerStaffId, saved: true };
}

export async function classRule(tx: Tx, classId: string): Promise<ClassRule> {
  const all = await classRules(tx);
  return all.get(classId) ?? { classId, documents: defaultDocsFor(false), feePaise: null, onlineOpen: true, minAge: null, maxAge: null, ownerStaffId: null, saved: false };
}

/**
 * Staff who can work on enquiries: active staff with a login whose roles give
 * Admission Management (full or own). Owners and interviewers come from here
 * (only the campus's staff for a person limited to one campus).
 */
export async function admissionStaff(tx: Tx, ctx: SchoolContext, opts: { allStaff?: boolean; campusId?: string | null } = {}) {
  const staff = await tx.staff.findMany({
    where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, ...(opts.allStaff ? {} : { userLoginId: { not: null } }), ...(opts.campusId ? { campusId: opts.campusId } : {}) },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, designation: true, userLoginId: true },
  });
  if (opts.allStaff) return staff.map((s) => ({ ...s, canWork: true }));
  const accesses = await tx.schoolAccess.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, userLoginId: { in: staff.map((s) => s.userLoginId!) }, userLogin: { status: "ACTIVE" } },
    include: { roles: { include: { role: true } } },
  });
  return staff
    .map((s) => {
      const mine = accesses.filter((a) => a.userLoginId === s.userLoginId);
      const roles = mine.flatMap((a) => a.roles.map((r) => r.role)).filter((r) => r.isEnabled && !r.archivedAt);
      const perms = applyExceptions(combineRoles(roles.map((r) => r.permissions as RolePermissions)), mine.map((a) => a.exceptions as Record<string, AccessLevel>));
      return { ...s, canWork: perms["admission-management"].change !== "none" };
    })
    .filter((s) => s.canWork);
}

/** Next application number in the school's format, e.g. APP/2026/0001. Unique and never reused. */
export function applicationPrefix(format: string, yearName: string) {
  const startYear = yearName.slice(0, 4);
  return format.replace(/\{YYYY\}/g, startYear).replace(/\{YY\}/g, startYear.slice(2)).replace(/\{YEAR\}/g, yearName);
}
