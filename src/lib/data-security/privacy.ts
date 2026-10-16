// Privacy (Settings, Data Backup & Security; DPDP Act 2023): how long records
// are kept, requests to delete a person's data (nothing is removed until the
// request is approved, and then it is anonymised, never hard-deleted), one
// person's data on request, and the last backup time.
import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma, type SchoolContext, type Tx } from "../db";
import { writeAudit } from "../audit";
import { requestApproval, onDecision } from "../approvals";
import { notify } from "../notifications";
import type { PermissionMap } from "../permissions";

// Retention (08-platform-security.md §12): defaults the school can change.

export const RETENTION_DEFAULTS: { recordType: string; label: string; keepMonths: number | null; legal?: string }[] = [
  { recordType: "student-records", label: "Student records, results and certificates", keepMonths: null, legal: "Needed for TCs and old certificates" },
  { recordType: "finance-records", label: "Fee, salary and finance records", keepMonths: 96, legal: "Indian accounting rules: at least 8 years" },
  { recordType: "audit-log", label: "Audit log", keepMonths: 96, legal: "At least 8 years" },
  { recordType: "enquiries", label: "Enquiries that did not join", keepMonths: 24 },
  { recordType: "visitor-entries", label: "Visitor photos and gate entries", keepMonths: 12 },
  { recordType: "message-history", label: "Message history", keepMonths: 36 },
];

/** The least a period may be set to, for records the law makes schools keep. */
const LEGAL_MINIMUM: Record<string, number> = { "finance-records": 96, "audit-log": 96 };

export class PrivacyProblem extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
  }
}

export async function retentionRules(tx: Tx) {
  const saved = await tx.retentionRule.findMany();
  return RETENTION_DEFAULTS.map((d) => {
    const s = saved.find((r) => r.recordType === d.recordType);
    return { ...d, keepMonths: s ? s.keepMonths : d.keepMonths, changed: Boolean(s), updatedAt: s?.updatedAt ?? null };
  });
}

export async function setRetention(tx: Tx, ctx: SchoolContext, recordType: string, keepMonths: number | null) {
  const d = RETENTION_DEFAULTS.find((r) => r.recordType === recordType);
  if (!d) throw new PrivacyProblem("This kind of record is not known.");
  if (keepMonths !== null && (!Number.isInteger(keepMonths) || keepMonths < 1 || keepMonths > 1200)) throw new PrivacyProblem("Choose between 1 month and 100 years, or keep for as long as the school uses School OS.", recordType);
  const min = LEGAL_MINIMUM[recordType];
  if (min && keepMonths !== null && keepMonths < min) throw new PrivacyProblem(`${d.label} must be kept at least ${min / 12} years by law.`, recordType);
  const before = await tx.retentionRule.findUnique({ where: { schoolId_recordType: { schoolId: ctx.schoolId, recordType } } });
  const oldMonths = before ? before.keepMonths : d.keepMonths;
  if (oldMonths === keepMonths) return false;
  await tx.retentionRule.upsert({
    where: { schoolId_recordType: { schoolId: ctx.schoolId, recordType } },
    create: { schoolId: ctx.schoolId, recordType, keepMonths, updatedById: ctx.userId },
    update: { keepMonths, updatedById: ctx.userId },
  });
  await writeAudit(tx, ctx, { action: "retention-changed", recordType: "Retention Rule", recordId: null, before: { recordType, keepMonths: oldMonths }, after: { recordType, keepMonths } });
  return true;
}

// Deletion requests.

export type PersonType = "student" | "guardian" | "staff";

/** Which kinds of people someone may look up here: they must see every record of that kind. */
export function personTypesFor(permissions: PermissionMap): PersonType[] {
  const out: PersonType[] = [];
  if (permissions["student-management"].see === "all") out.push("student", "guardian");
  if (permissions["staff-hr-management"].see === "all") out.push("staff");
  return out;
}

export const DELETION_PARTS = [
  { key: "contact", label: "Phone numbers, email and address" },
  { key: "identity", label: "Aadhaar, PAN, APAAR and other ID numbers" },
  { key: "photos", label: "Photos" },
  { key: "personal", label: "Date of birth, religion, category, health notes and other personal details" },
  { key: "name", label: "Name (replaced with \"Removed person\")" },
] as const;
export type DeletionPart = (typeof DELETION_PARTS)[number]["key"];

export type DeletionInput = {
  personType: "student" | "guardian" | "staff";
  personId: string;
  scope: "all" | DeletionPart[];
  reason: string;
  askedBy: string;
  proofFileId: string | null;
};

async function personName(tx: Tx, type: DeletionInput["personType"], id: string) {
  if (type === "student") return (await tx.student.findUnique({ where: { id }, select: { fullName: true, admissionNo: true } }).then((s) => (s ? `${s.fullName} (${s.admissionNo})` : null)));
  if (type === "guardian") return (await tx.guardian.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
  return (await tx.staff.findUnique({ where: { id }, select: { fullName: true, staffCode: true } }).then((s) => (s ? `${s.fullName} (${s.staffCode})` : null)));
}

/** Records the request and sends it to Approvals. Nothing is removed until it is approved. */
export async function requestDeletion(tx: Tx, ctx: SchoolContext, input: DeletionInput) {
  const name = await personName(tx, input.personType, input.personId);
  if (!name) throw new PrivacyProblem("Choose the person whose data should be removed.", "personId");
  const reason = input.reason.trim();
  if (reason.length < 5) throw new PrivacyProblem("Give the reason in a few words, so the approver knows why.", "reason");
  if (!input.askedBy.trim()) throw new PrivacyProblem("Say who asked, for example \"Father, by letter\".", "askedBy");
  const open = await tx.deletionRequest.findFirst({ where: { personType: input.personType, personId: input.personId, status: "waiting" } });
  if (open) throw new PrivacyProblem(`A request for ${name} is already waiting for approval.`, "personId");
  const scope = input.scope === "all" ? "all" : [...new Set(input.scope)].join(",");
  if (!scope) throw new PrivacyProblem("Choose what to remove.", "scope");
  const row = await tx.deletionRequest.create({
    data: { schoolId: ctx.schoolId, personType: input.personType, personId: input.personId, personName: name, scope, reason: reason.slice(0, 1000), askedBy: input.askedBy.trim().slice(0, 200), proofFileId: input.proofFileId, createdById: ctx.userId },
  });
  const approval = await requestApproval(tx, ctx, {
    type: "data-deletion",
    recordType: "Deletion Request",
    recordId: row.id,
    summary: `Remove ${scope === "all" ? "all personal data" : "some personal data"} of ${name}`,
    reason,
  });
  await tx.deletionRequest.update({ where: { id: row.id }, data: { approvalId: approval.id } });
  await writeAudit(tx, ctx, { action: "deletion-requested", recordType: "Deletion Request", recordId: row.id, after: { personType: input.personType, person: name, scope, askedBy: input.askedBy } });
  return row;
}

const REMOVED = "Removed person";

function partsOf(scope: string): Set<DeletionPart> {
  return new Set(scope === "all" ? DELETION_PARTS.map((p) => p.key) : (scope.split(",") as DeletionPart[]));
}

/** Anonymises the chosen parts. The record stays (fees, results and the audit trail keep working). */
export async function anonymise(tx: Tx, type: DeletionInput["personType"], id: string, scope: string): Promise<string[]> {
  const parts = partsOf(scope);
  const changed: string[] = [];
  if (type === "student") {
    const data: Prisma.StudentUpdateInput = {};
    if (parts.has("name")) Object.assign(data, { firstName: "Removed", lastName: "person", fullName: REMOVED });
    if (parts.has("contact")) Object.assign(data, { address: null, city: null, state: null, pinCode: null });
    if (parts.has("identity")) Object.assign(data, { aadhaarEnc: null, apaarId: null, pen: null });
    if (parts.has("photos")) Object.assign(data, { photoFileId: null });
    if (parts.has("personal")) Object.assign(data, { dateOfBirth: null, religion: null, category: null, motherTongue: null, medicalNotes: null, bloodGroup: null, previousSchool: null, customFields: {} });
    await tx.student.update({ where: { id }, data });
    changed.push(...Object.keys(data));
  } else if (type === "guardian") {
    const data: Prisma.GuardianUpdateInput = {};
    if (parts.has("name")) Object.assign(data, { name: REMOVED });
    if (parts.has("contact")) Object.assign(data, { phone: "", altPhone: null, email: null, address: null, optedOut: true });
    if (parts.has("photos")) Object.assign(data, { photoFileId: null });
    if (parts.has("personal")) Object.assign(data, { dateOfBirth: null, occupation: null, annualIncome: null });
    await tx.guardian.update({ where: { id }, data });
    changed.push(...Object.keys(data));
  } else {
    const data: Prisma.StaffUpdateInput = {};
    if (parts.has("name")) Object.assign(data, { firstName: "Removed", lastName: "person", fullName: REMOVED });
    if (parts.has("contact")) Object.assign(data, { phone: "", email: null, address: null, emergencyName: null, emergencyPhone: null });
    if (parts.has("identity")) Object.assign(data, { aadhaarEnc: null, panEnc: null, uan: null, esiNo: null });
    if (parts.has("photos")) Object.assign(data, { photoFileId: null });
    if (parts.has("personal")) Object.assign(data, { dateOfBirth: null, bloodGroup: null, qualification: null, customFields: {} });
    await tx.staff.update({ where: { id }, data });
    changed.push(...Object.keys(data));
  }
  return changed;
}

/** What happens when the Approvals page decides a deletion request. */
onDecision("data-deletion", async (tx, ctx, approval, decision, note) => {
  const req = await tx.deletionRequest.findUnique({ where: { id: approval.recordId } });
  if (!req || req.status !== "waiting") return;
  if (decision === "approve") {
    const fields = await anonymise(tx, req.personType as DeletionInput["personType"], req.personId, req.scope);
    await tx.deletionRequest.update({ where: { id: req.id }, data: { status: "completed", completedAt: new Date() } });
    // Only the names of the fields go in the log, never the removed values.
    await writeAudit(tx, ctx, { action: "deletion-completed", recordType: "Deletion Request", recordId: req.id, after: { personType: req.personType, personId: req.personId, fieldsRemoved: fields } });
  } else {
    await tx.deletionRequest.update({ where: { id: req.id }, data: { status: decision === "withdraw" ? "withdrawn" : "rejected" } });
    await writeAudit(tx, ctx, { action: "deletion-rejected", recordType: "Deletion Request", recordId: req.id, after: { decision, note } });
  }
  if (req.createdById && req.createdById !== ctx.userId && decision !== "withdraw") {
    await notify(tx, ctx, { to: req.createdById, type: "privacy", text: decision === "approve" ? `The personal data of ${req.personName} was removed as asked.` : `The request to remove ${req.personName}'s data was not approved.`, link: "/settings/data-security/privacy" });
  }
});

// One person's data on request.

export async function personData(tx: Tx, type: DeletionInput["personType"], id: string) {
  const strip = <T extends Record<string, unknown>>(row: T | null) => (row ? Object.fromEntries(Object.entries(row).filter(([k]) => !/(Enc|Hash)$/.test(k) && k !== "schoolId")) : null);
  if (type === "student") {
    const student = await tx.student.findUnique({ where: { id }, include: { enrolments: true, guardians: { include: { guardian: true } } } });
    if (!student) return null;
    const { enrolments, guardians, ...rest } = student;
    return {
      name: student.fullName,
      sections: {
        student: [strip(rest)],
        enrolments: enrolments.map((e) => strip(e)),
        guardians: guardians.map((g) => ({ relationship: g.relationship, isPrimary: g.isPrimary, ...strip(g.guardian) })),
      },
    };
  }
  if (type === "guardian") {
    const g = await tx.guardian.findUnique({ where: { id }, include: { students: { include: { student: { select: { fullName: true, admissionNo: true } } } } } });
    if (!g) return null;
    const { students, ...rest } = g;
    return { name: g.name, sections: { guardian: [strip(rest)], children: students.map((s) => ({ relationship: s.relationship, student: s.student.fullName, admissionNo: s.student.admissionNo })) } };
  }
  const s = await tx.staff.findUnique({ where: { id }, include: { documents: true, department: true } });
  if (!s) return null;
  const { documents, department, ...rest } = s;
  return { name: s.fullName, sections: { staff: [{ ...strip(rest), department: department?.name ?? null }], documents: documents.map((d) => strip(d)) } };
}

// Backups (08-platform-security.md §4).

export async function lastBackup() {
  const [nightly, restore] = await Promise.all([
    prisma.backupRun.findFirst({ where: { kind: "nightly" }, orderBy: { finishedAt: "desc" } }),
    prisma.backupRun.findFirst({ where: { restoreTestedAt: { not: null } }, orderBy: { restoreTestedAt: "desc" } }),
  ]);
  return { at: nightly?.finishedAt ?? null, restoreTestedAt: restore?.restoreTestedAt ?? null };
}
