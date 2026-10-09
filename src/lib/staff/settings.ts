// HR Settings (09 §6): departments with heads, designations, leave types and
// their rules, staff ID and username formats, notice period, document types
// and reminder days, and the optional Recruitment & Appraisal parts.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";

export const EMPLOYMENT_TYPES = ["Permanent", "Probation", "Contract", "Temporary", "Part-time", "Guest"] as const;
export const STAFF_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_LEAVE", label: "On leave" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "RESIGNED", label: "Resigned" },
  { value: "RETIRED", label: "Retired" },
  { value: "TERMINATED", label: "Terminated" },
] as const;
export const statusLabel = (s: string) => STAFF_STATUSES.find((x) => x.value === s)?.label ?? s;
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const GENDERS = ["Female", "Male", "Other"] as const;

/** The optional parts of Recruitment & Appraisal, each switched on in HR Settings (School Feature records). */
export const HR_FEATURES = [
  { key: "hr-recruitment", label: "Recruitment", about: "Vacancies, applications, interviews and offers." },
  { key: "hr-appraisal", label: "Appraisal", about: "A yearly appraisal cycle with self and manager reviews." },
  { key: "hr-training", label: "Training", about: "Courses each staff member attended, with hours and certificates." },
  { key: "hr-promotions", label: "Promotions", about: "A history of designation changes." },
] as const;
export type HrFeature = (typeof HR_FEATURES)[number]["key"];

export const USERNAME_FORMATS = [
  { value: "first.last", label: "first.last (ravi.teja)" },
  { value: "firstlast", label: "firstlast (raviteja)" },
  { value: "phone", label: "Phone number (9876543210)" },
  { value: "staffid", label: "Staff ID (sps-st-042)" },
] as const;

/** The old software's designations, with a default role for each (inferred). */
const DEFAULT_DESIGNATIONS: { name: string; type: "Teaching" | "Non-teaching"; role: string | null; dept?: string }[] = [
  { name: "Teacher", type: "Teaching", role: "teacher" },
  { name: "Lecturer", type: "Teaching", role: "teacher" },
  { name: "Coordinator", type: "Teaching", role: "teacher" },
  { name: "Vice Principal", type: "Teaching", role: "vice-principal", dept: "Administration" },
  { name: "Academic Head", type: "Teaching", role: "academic-head", dept: "Administration" },
  { name: "HR Manager", type: "Non-teaching", role: "hr", dept: "Administration" },
  { name: "Accountant", type: "Non-teaching", role: "accountant", dept: "Accounts" },
  { name: "Cashier-cum-Accountant", type: "Non-teaching", role: "accountant", dept: "Accounts" },
  { name: "Driver", type: "Non-teaching", role: "driver", dept: "Transport" },
  { name: "Security", type: "Non-teaching", role: "gate-security", dept: "Support" },
  { name: "Housekeeping", type: "Non-teaching", role: null, dept: "Support" },
  { name: "Support Staff", type: "Non-teaching", role: null, dept: "Support" },
];

/** Role keys guessed from a designation's words, for designations the school already had. */
function guessRole(name: string, type: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("principal") && !n.includes("vice")) return "principal";
  if (n.includes("librarian")) return "librarian";
  if (n.includes("accountant")) return "accountant";
  if (n.includes("reception")) return "receptionist";
  if (n.includes("transport")) return "transport-in-charge";
  if (n.includes("administrator") || n.includes("admin")) return "school-admin";
  return type === "Teaching" ? "teacher" : null;
}

/** Makes the school's HR Settings on first use, from what is already on file. Safe to run twice. */
export async function ensureHrDefaults(tx: Tx, ctx: SchoolContext) {
  const setting = await tx.hrSetting.findUnique({ where: { schoolId: ctx.schoolId } });
  if (!setting) {
    const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { code: true } });
    await tx.hrSetting.create({ data: { schoolId: ctx.schoolId, staffIdPrefix: `${school?.code ?? "ST"}-ST-` } });
  }
  if ((await tx.designation.count({ where: { schoolId: ctx.schoolId } })) === 0) {
    const depts = await tx.department.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null } });
    const deptId = (name?: string) => depts.find((d) => d.name === name)?.id ?? null;
    const existing = await tx.staff.groupBy({ by: ["designation", "staffType", "departmentId"], where: { schoolId: ctx.schoolId }, _count: true });
    const rows = new Map<string, { staffType: string; defaultDepartmentId: string | null; defaultRoleKey: string | null }>();
    for (const d of DEFAULT_DESIGNATIONS) rows.set(d.name, { staffType: d.type, defaultDepartmentId: deptId(d.dept), defaultRoleKey: d.role });
    // The school's own designations already on staff records, with their most used department.
    for (const e of [...existing].sort((a, b) => b._count - a._count)) {
      if (!rows.has(e.designation)) rows.set(e.designation, { staffType: e.staffType, defaultDepartmentId: e.departmentId, defaultRoleKey: guessRole(e.designation, e.staffType) });
    }
    let order = 0;
    await tx.designation.createMany({
      data: [...rows.entries()].map(([name, r]) => ({ schoolId: ctx.schoolId, name, staffType: r.staffType, defaultDepartmentId: r.defaultDepartmentId, defaultRoleKey: r.defaultRoleKey, sortOrder: order++ })),
      skipDuplicates: true,
    });
  }
  const types = await tx.leaveType.findMany({ where: { schoolId: ctx.schoolId, forWhom: "staff" }, select: { id: true, name: true, code: true } });
  const rules = new Set((await tx.leaveTypeRule.findMany({ where: { schoolId: ctx.schoolId }, select: { leaveTypeId: true } })).map((r) => r.leaveTypeId));
  for (const t of types) {
    if (rules.has(t.id)) continue;
    const n = `${t.name} ${t.code}`.toLowerCase();
    const sensitive = /sick|medical|maternity|paternity|\bsl\b|\bml\b/.test(n);
    await tx.leaveTypeRule.create({
      data: { leaveTypeId: t.id, schoolId: ctx.schoolId, sensitive, documentRequired: /maternity/.test(n), halfDayAllowed: !/maternity|earned|\bel\b/.test(n) },
    });
  }
}

export async function hrSettings(tx: Tx, ctx: SchoolContext) {
  await ensureHrDefaults(tx, ctx);
  return tx.hrSetting.findUniqueOrThrow({ where: { schoolId: ctx.schoolId } });
}

export async function hrFeaturesOn(tx: Tx, ctx: SchoolContext): Promise<Set<HrFeature>> {
  const rows = await tx.schoolFeature.findMany({ where: { schoolId: ctx.schoolId, isOn: true, featureKey: { in: HR_FEATURES.map((f) => f.key) } } });
  return new Set(rows.map((r) => r.featureKey as HrFeature));
}

export async function setHrFeature(tx: Tx, ctx: SchoolContext, key: HrFeature, isOn: boolean) {
  const before = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } } });
  await tx.schoolFeature.upsert({
    where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } },
    create: { schoolId: ctx.schoolId, featureKey: key, isOn },
    update: { isOn },
  });
  await writeAudit(tx, ctx, { action: isOn ? "switched-on" : "switched-off", recordType: "School Feature", recordId: null, before: { key, isOn: before?.isOn ?? false }, after: { key, isOn } });
}

/** Staff ID like SPS-ST-042, from the HR Settings format and a running number that is never reused. */
export function formatStaffId(prefix: string, digits: number, n: number) {
  return `${prefix}${String(n).padStart(Math.max(1, Math.min(8, digits)), "0")}`;
}

/** Department heads, with the head's login, for leave routing (09 Done when 11). */
export async function headLoginFor(tx: Tx, departmentId: string | null): Promise<{ staffId: string; userLoginId: string; name: string } | null> {
  if (!departmentId) return null;
  const dept = await tx.department.findUnique({ where: { id: departmentId } });
  if (!dept?.headStaffId || dept.archivedAt) return null;
  const head = await tx.staff.findUnique({ where: { id: dept.headStaffId } });
  if (!head?.userLoginId || head.archivedAt || head.status !== "ACTIVE") return null;
  return { staffId: head.id, userLoginId: head.userLoginId, name: head.fullName };
}
