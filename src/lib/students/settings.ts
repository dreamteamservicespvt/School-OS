// Student Settings (03 §6): the rules for student records in one school.
// A school that has never opened the page gets the defaults below.
import "server-only";

import type { Prisma, StudentSettings } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import type { BehaviourKind } from "./labels";

export type IdentifierType = { key: string; label: string; level: "restricted" | "highly" };
export type IncidentType = { key: string; label: string; kind: BehaviourKind; points: number };

export const DEFAULT_IDENTIFIER_TYPES: IdentifierType[] = [
  { key: "board-reg", label: "Board registration number", level: "restricted" },
  { key: "udise-student", label: "UDISE+ student ID", level: "restricted" },
];

export const DEFAULT_INCIDENT_TYPES: IncidentType[] = [
  { key: "late", label: "Late to class", kind: "incident", points: -1 },
  { key: "homework", label: "Homework not done", kind: "incident", points: -1 },
  { key: "uniform", label: "Uniform not proper", kind: "incident", points: -1 },
  { key: "disrupt", label: "Disrupting the class", kind: "incident", points: -2 },
  { key: "fight", label: "Fighting", kind: "incident", points: -5 },
  { key: "bullying", label: "Bullying", kind: "incident", points: -5 },
  { key: "warning", label: "Written warning", kind: "warning", points: -3 },
  { key: "suspension", label: "Suspension", kind: "suspension", points: -10 },
  { key: "helping", label: "Helping others", kind: "reward", points: 2 },
  { key: "excellence", label: "Excellence in class", kind: "reward", points: 3 },
  { key: "competition", label: "Prize in a competition", kind: "recognition", points: 5 },
];

export const DEFAULT_LEAVING_REASONS = [
  "Family moving to another city",
  "Admission in another school",
  "Fees not affordable",
  "Distance from home",
  "Finished the last class",
  "Health reasons",
  "Other",
];

export const DEFAULT_DOCUMENTS = [
  "Birth certificate",
  "Aadhaar card",
  "Passport-size photo",
  "Address proof",
  "Transfer certificate (previous school)",
  "Parent's ID proof",
];

export type ResolvedSettings = Omit<StudentSettings, "identifierTypes" | "incidentTypes" | "defaultSignatories"> & {
  identifierTypes: IdentifierType[];
  incidentTypes: IncidentType[];
  defaultSignatories: Record<string, string>;
};

const DEFAULTS = (schoolId: string): ResolvedSettings => ({
  schoolId,
  admissionPrefix: "",
  admissionUseYear: true,
  admissionPadding: 4,
  admissionRestartYear: false,
  requiredFields: [],
  listColumns: ["photo", "admissionNo", "classSection", "rollNo", "guardian", "phone", "status"],
  identifierTypes: DEFAULT_IDENTIFIER_TYPES,
  requiredDocuments: DEFAULT_DOCUMENTS,
  leavingReasons: DEFAULT_LEAVING_REASONS,
  approvalCertificates: [],
  defaultSignatories: {},
  incidentTypes: DEFAULT_INCIDENT_TYPES,
  pointsOn: false,
  counsellingRoles: ["counsellor", "principal"],
  counsellingOn: false,
  careerOn: false,
  alumniOn: false,
  qrOn: true,
  rfidOn: false,
  migrationOn: false,
  studentLoginsOn: false,
  digiLockerOn: false,
  smartImportOn: false,
  idCardValidUntil: null,
  idCardsPerPage: 8,
  idCardFields: ["admissionNo", "dateOfBirth", "bloodGroup", "guardianPhone", "address"],
  updatedById: null,
  updatedAt: new Date(0),
});

export async function getStudentSettings(tx: Tx, ctx: SchoolContext): Promise<ResolvedSettings> {
  const row = await tx.studentSettings.findUnique({ where: { schoolId: ctx.schoolId } });
  const d = DEFAULTS(ctx.schoolId);
  if (!row) return d;
  const ids = row.identifierTypes as IdentifierType[];
  const types = row.incidentTypes as IncidentType[];
  return {
    ...row,
    identifierTypes: Array.isArray(ids) && ids.length ? ids : d.identifierTypes,
    incidentTypes: Array.isArray(types) && types.length ? types : d.incidentTypes,
    requiredDocuments: row.requiredDocuments.length ? row.requiredDocuments : d.requiredDocuments,
    leavingReasons: row.leavingReasons.length ? row.leavingReasons : d.leavingReasons,
    defaultSignatories: (row.defaultSignatories ?? {}) as Record<string, string>,
  };
}

export type SettingsChange = Partial<Omit<ResolvedSettings, "schoolId" | "updatedAt" | "updatedById">>;

export async function saveStudentSettings(tx: Tx, ctx: SchoolContext, change: SettingsChange, section: string) {
  const before = await getStudentSettings(tx, ctx);
  const data = {
    ...change,
    identifierTypes: change.identifierTypes as Prisma.InputJsonValue | undefined,
    incidentTypes: change.incidentTypes as Prisma.InputJsonValue | undefined,
    defaultSignatories: change.defaultSignatories as Prisma.InputJsonValue | undefined,
    updatedById: ctx.userId,
  };
  await tx.studentSettings.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId, ...data }, update: data });
  const pick = (s: Record<string, unknown>) => Object.fromEntries(Object.keys(change).map((k) => [k, s[k] instanceof Date ? (s[k] as Date).toISOString() : s[k]]));
  await writeAudit(tx, ctx, {
    action: "changed",
    recordType: "Student Settings",
    recordId: ctx.schoolId,
    before: pick(before as unknown as Record<string, unknown>) as Prisma.InputJsonValue,
    after: { section, ...pick(change as Record<string, unknown>) } as Prisma.InputJsonValue,
  });
}

/** The latest Promotion Policy version for a year, or the defaults. */
export async function currentPolicy(tx: Tx, academicYearId: string) {
  return tx.promotionPolicy.findFirst({ where: { academicYearId }, orderBy: { version: "desc" } });
}

export async function savePolicy(tx: Tx, ctx: SchoolContext, academicYearId: string, p: { passRequired: boolean; minAttendancePct: number | null; feeDuesAllowed: boolean; exceptionApproverRole: string }) {
  const last = await currentPolicy(tx, academicYearId);
  const row = await tx.promotionPolicy.create({
    data: { schoolId: ctx.schoolId, academicYearId, version: (last?.version ?? 0) + 1, ...p, createdById: ctx.userId },
  });
  await writeAudit(tx, ctx, {
    action: "created",
    recordType: "Promotion Policy",
    recordId: row.id,
    before: last ? { version: last.version, passRequired: last.passRequired, minAttendancePct: last.minAttendancePct, feeDuesAllowed: last.feeDuesAllowed } : null,
    after: { version: row.version, ...p },
  });
  return row;
}
