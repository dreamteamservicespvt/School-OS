// Who a message goes to (11-communication.md, Send Message, "Who"): parents,
// students or staff, narrowed by class, section, role or a saved group, or
// chosen one by one. Always limited to what the sender may reach.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { currentYear } from "../academic/years";
import { ownSectionIds, sectionLabel } from "../people";
import type { Reach } from "../permissions";

export const RECIPIENT_KINDS = [
  { key: "parents", label: "Parents" },
  { key: "students", label: "Students" },
  { key: "staff", label: "Staff" },
  { key: "teachers", label: "Teachers" },
  { key: "admins", label: "Admins" },
] as const;
export type RecipientKind = (typeof RECIPIENT_KINDS)[number]["key"];

/** Roles counted as "Admins" when choosing recipients (inferred). */
const ADMIN_ROLES = ["principal", "school-admin", "vice-principal", "office-staff"];

export type AudienceRule = {
  /** Groups: everyone of these kinds, narrowed by class, section or role. */
  kinds?: RecipientKind[];
  classIds?: string[];
  sectionIds?: string[];
  roleKeys?: string[];
  departmentIds?: string[];
  /** A saved Recipient Group. */
  groupId?: string;
  /** Father and mother both, not only the main contact. */
  allGuardians?: boolean;
  /** One by one. */
  guardianIds?: string[];
  /** The guardians of these students. */
  guardiansOf?: string[];
  /** The students themselves (they get app messages when they have a login). */
  studentIds?: string[];
  staffIds?: string[];
};

/** How far a sender may reach. "all" for the office; a teacher's own sections otherwise. */
export type Scope = { sectionIds: string[] | "all"; staff: boolean; label: string };

/** Office roles whose "Own" reach in Communication means parents of the whole school (05-roles.md: fee reminders, messages to parents). */
const PARENT_WIDE_ROLES = ["accountant", "receptionist", "office-staff", "admission-counsellor"];

export async function scopeFor(tx: Tx, ctx: SchoolContext, reach: Reach, roleKeys: string[]): Promise<Scope> {
  if (reach === "all") return { sectionIds: "all", staff: true, label: "Whole school" };
  if (roleKeys.some((k) => PARENT_WIDE_ROLES.includes(k))) return { sectionIds: "all", staff: false, label: "Parents and students of the whole school" };
  const year = await currentYear(tx, ctx);
  const sections = year ? await ownSectionIds(tx, ctx, year.id) : [];
  return { sectionIds: sections, staff: false, label: "Your own sections" };
}

export const SYSTEM_SCOPE: Scope = { sectionIds: "all", staff: true, label: "Whole school" };

export type StudentInfo = { id: string; name: string; classLabel: string; className: string; sectionName: string; sectionId: string; admissionNo: string; dateOfBirth: Date | null };

export type Candidate = {
  key: string;
  type: "guardian" | "student" | "staff";
  id: string;
  name: string;
  description: string;
  phone: string | null;
  email: string | null;
  userLoginId: string | null;
  language: string;
  optedOut: boolean;
  students: StudentInfo[];
  inScope: boolean;
};

type Enrolled = StudentInfo & { userLoginId: string | null };

async function enrolledStudents(tx: Tx, ctx: SchoolContext, where: { studentIds?: string[]; sectionIds?: string[]; classIds?: string[] }): Promise<Enrolled[]> {
  const year = await currentYear(tx, ctx);
  if (!year) return [];
  const enrolments = await tx.enrolment.findMany({
    where: {
      schoolId: ctx.schoolId,
      academicYearId: year.id,
      archivedAt: null,
      status: "STUDYING",
      ...(where.studentIds ? { studentId: { in: where.studentIds } } : {}),
      ...(where.sectionIds?.length || where.classIds?.length
        ? { OR: [...(where.sectionIds?.length ? [{ sectionId: { in: where.sectionIds } }] : []), ...(where.classIds?.length ? [{ classId: { in: where.classIds } }] : [])] }
        : {}),
      student: { archivedAt: null, status: { in: ["ACTIVE", "ADMITTED"] } },
    },
    select: { sectionId: true, student: { select: { id: true, fullName: true, admissionNo: true, userLoginId: true, dateOfBirth: true } } },
  });
  const sectionIds = [...new Set(enrolments.map((e) => e.sectionId))];
  const sections = await tx.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true, schoolClass: { select: { name: true, sortOrder: true } } } });
  const sec = new Map(sections.map((s) => [s.id, s]));
  return enrolments.map((e) => {
    const s = sec.get(e.sectionId);
    return {
      id: e.student.id,
      name: e.student.fullName,
      admissionNo: e.student.admissionNo,
      userLoginId: e.student.userLoginId,
      dateOfBirth: e.student.dateOfBirth,
      sectionId: e.sectionId,
      className: s?.schoolClass.name ?? "",
      sectionName: s?.name ?? "",
      classLabel: s ? sectionLabel(s.schoolClass.name, s.name) : "",
    };
  });
}

function inScopeSection(scope: Scope, sectionId: string) {
  return scope.sectionIds === "all" || scope.sectionIds.includes(sectionId);
}

const joinNames = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

async function guardiansFor(tx: Tx, ctx: SchoolContext, students: Enrolled[], all: boolean, onlyGuardianIds?: Set<string>): Promise<Map<string, Candidate>> {
  const links = await tx.studentGuardian.findMany({
    where: { schoolId: ctx.schoolId, studentId: { in: students.map((s) => s.id) }, archivedAt: null, guardian: { archivedAt: null } },
    select: { studentId: true, relationship: true, isPrimary: true, emergencyOrder: true, guardian: { select: { id: true, name: true, phone: true, email: true, language: true, optedOut: true } } },
  });
  const byStudent = new Map<string, typeof links>();
  for (const l of links) byStudent.set(l.studentId, [...(byStudent.get(l.studentId) ?? []), l]);
  const out = new Map<string, Candidate>();
  for (const st of students) {
    let chosen = byStudent.get(st.id) ?? [];
    if (onlyGuardianIds) chosen = chosen.filter((l) => onlyGuardianIds.has(l.guardian.id));
    else if (!all) {
      const main = [...chosen].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || (a.emergencyOrder ?? 99) - (b.emergencyOrder ?? 99))[0];
      chosen = main ? [main] : [];
    }
    for (const l of chosen) {
      const g = l.guardian;
      const c = out.get(g.id) ?? {
        key: `guardian:${g.id}`,
        type: "guardian" as const,
        id: g.id,
        name: g.name,
        description: "",
        phone: g.phone,
        email: g.email,
        userLoginId: null,
        language: g.language,
        optedOut: g.optedOut,
        students: [],
        inScope: false,
      };
      c.students.push(st);
      c.description = `${l.relationship} of ${joinNames(c.students.map((s) => `${s.name.split(" ")[0]}, ${s.classLabel.replace(/^Class /, "")}`))}`;
      out.set(g.id, c);
    }
  }
  return out;
}

async function staffCandidates(tx: Tx, ctx: SchoolContext, where: { staffIds?: string[]; teachersOnly?: boolean; roleKeys?: string[]; departmentIds?: string[] }): Promise<Candidate[]> {
  let loginFilter: string[] | null = null;
  if (where.roleKeys?.length) {
    const acc = await tx.schoolAccess.findMany({
      where: { schoolId: ctx.schoolId, archivedAt: null, roles: { some: { role: { key: { in: where.roleKeys }, isEnabled: true } } } },
      select: { userLoginId: true },
    });
    loginFilter = acc.map((a) => a.userLoginId);
  }
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { defaultLanguage: true } });
  const staff = await tx.staff.findMany({
    where: {
      schoolId: ctx.schoolId,
      archivedAt: null,
      status: { in: ["ACTIVE", "ON_LEAVE"] },
      ...(where.staffIds ? { id: { in: where.staffIds } } : {}),
      ...(where.teachersOnly ? { staffType: "Teaching" } : {}),
      ...(where.departmentIds?.length ? { departmentId: { in: where.departmentIds } } : {}),
      ...(loginFilter ? { userLoginId: { in: loginFilter } } : {}),
    },
    select: { id: true, fullName: true, designation: true, phone: true, email: true, userLoginId: true },
    orderBy: { fullName: "asc" },
  });
  return staff.map((s) => ({
    key: `staff:${s.id}`,
    type: "staff" as const,
    id: s.id,
    name: s.fullName,
    description: s.designation,
    phone: s.phone,
    email: s.email,
    userLoginId: s.userLoginId,
    language: school?.defaultLanguage ?? "en",
    optedOut: false,
    students: [],
    inScope: true,
  }));
}

/**
 * Turns an audience rule into the people in it, one Candidate per person
 * (brothers and sisters share one guardian, who is listed once). Each
 * candidate says whether the sender's scope reaches them.
 */
export async function resolveAudience(tx: Tx, ctx: SchoolContext, rule: AudienceRule, scope: Scope): Promise<Candidate[]> {
  let r = rule;
  if (rule.groupId) {
    const g = await tx.recipientGroup.findFirst({ where: { id: rule.groupId, schoolId: ctx.schoolId, archivedAt: null } });
    if (g) r = { ...(g.rule as AudienceRule), allGuardians: rule.allGuardians ?? (g.rule as AudienceRule).allGuardians };
  }
  const kinds = new Set(r.kinds ?? []);
  const guardians = new Map<string, Candidate>();
  const others: Candidate[] = [];

  const narrowed = Boolean(r.classIds?.length || r.sectionIds?.length);
  // Parents and students of classes or sections (or the whole school).
  if (kinds.has("parents") || kinds.has("students")) {
    const sectionIds = r.sectionIds?.length ? r.sectionIds : undefined;
    const classIds = r.classIds?.length ? r.classIds : undefined;
    let pool = await enrolledStudents(tx, ctx, narrowed ? { sectionIds, classIds } : {});
    // A teacher choosing "Parents" without a class gets their own sections only.
    if (!narrowed && scope.sectionIds !== "all") pool = pool.filter((s) => inScopeSection(scope, s.sectionId));
    if (kinds.has("parents")) for (const [id, c] of await guardiansFor(tx, ctx, pool, Boolean(r.allGuardians))) guardians.set(id, c);
    if (kinds.has("students")) {
      for (const s of pool) others.push(studentCandidate(s));
    }
  }
  // Guardians of chosen students.
  if (r.guardiansOf?.length) {
    const pool = await enrolledStudents(tx, ctx, { studentIds: r.guardiansOf });
    for (const [id, c] of await guardiansFor(tx, ctx, pool, Boolean(r.allGuardians))) {
      const have = guardians.get(id);
      if (have) for (const s of c.students) { if (!have.students.some((x) => x.id === s.id)) have.students.push(s); }
      else guardians.set(id, c);
    }
  }
  // Chosen guardians: with each of their children in the school.
  if (r.guardianIds?.length) {
    const links = await tx.studentGuardian.findMany({ where: { schoolId: ctx.schoolId, guardianId: { in: r.guardianIds }, archivedAt: null }, select: { studentId: true } });
    const pool = await enrolledStudents(tx, ctx, { studentIds: [...new Set(links.map((l) => l.studentId))] });
    const found = await guardiansFor(tx, ctx, pool, true, new Set(r.guardianIds));
    for (const [id, c] of found) if (!guardians.has(id)) guardians.set(id, c);
    // A guardian with no child studying this year is still a person the office may write to.
    const missing = r.guardianIds.filter((id) => !found.has(id) && !guardians.has(id));
    if (missing.length) {
      const rows = await tx.guardian.findMany({ where: { id: { in: missing }, archivedAt: null } });
      for (const g of rows) guardians.set(g.id, { key: `guardian:${g.id}`, type: "guardian", id: g.id, name: g.name, description: g.relationship, phone: g.phone, email: g.email, userLoginId: null, language: g.language, optedOut: g.optedOut, students: [], inScope: false });
    }
  }
  if (r.studentIds?.length) {
    for (const s of await enrolledStudents(tx, ctx, { studentIds: r.studentIds })) {
      if (!others.some((o) => o.key === `student:${s.id}`)) others.push(studentCandidate(s));
    }
  }
  // Staff.
  const staffKinds = ["staff", "teachers", "admins"].filter((k) => kinds.has(k as RecipientKind));
  if (staffKinds.length) {
    const roleKeys = kinds.has("admins") && !kinds.has("staff") && !kinds.has("teachers") ? [...ADMIN_ROLES, ...(r.roleKeys ?? [])] : r.roleKeys;
    const list = await staffCandidates(tx, ctx, { teachersOnly: kinds.has("teachers") && !kinds.has("staff") && !kinds.has("admins"), roleKeys, departmentIds: r.departmentIds });
    let extra: Candidate[] = [];
    if (kinds.has("teachers") && kinds.has("admins") && !kinds.has("staff")) {
      extra = await staffCandidates(tx, ctx, { roleKeys: ADMIN_ROLES });
    }
    for (const c of [...list, ...extra]) if (!others.some((o) => o.key === c.key)) others.push({ ...c, inScope: scope.staff });
  }
  if (r.staffIds?.length) {
    for (const c of await staffCandidates(tx, ctx, { staffIds: r.staffIds })) if (!others.some((o) => o.key === c.key)) others.push({ ...c, inScope: scope.staff });
  }

  for (const c of guardians.values()) c.inScope = c.students.length === 0 ? scope.sectionIds === "all" : c.students.some((s) => inScopeSection(scope, s.sectionId));
  for (const c of others) if (c.type === "student") c.inScope = c.students.every((s) => inScopeSection(scope, s.sectionId));
  return [...guardians.values(), ...others];
}

function studentCandidate(s: Enrolled): Candidate {
  return {
    key: `student:${s.id}`,
    type: "student",
    id: s.id,
    name: s.name,
    description: `Student, ${s.classLabel}`,
    phone: null,
    email: null,
    userLoginId: s.userLoginId,
    language: "en",
    optedOut: false,
    students: [s],
    inScope: true,
  };
}

/** Words for an audience: "Parents of Class 5 A and Class 5 B". */
export async function describeAudience(tx: Tx, ctx: SchoolContext, rule: AudienceRule): Promise<string> {
  if (rule.groupId) {
    const g = await tx.recipientGroup.findFirst({ where: { id: rule.groupId, schoolId: ctx.schoolId } });
    if (g) return `Group: ${g.name}`;
  }
  const parts: string[] = [];
  const kinds = (rule.kinds ?? []).map((k) => RECIPIENT_KINDS.find((x) => x.key === k)?.label ?? k);
  if (kinds.length) {
    let where = "";
    if (rule.sectionIds?.length) {
      const s = await tx.section.findMany({ where: { id: { in: rule.sectionIds } }, select: { name: true, schoolClass: { select: { name: true, sortOrder: true } } } });
      where = s.sort((a, b) => a.schoolClass.sortOrder - b.schoolClass.sortOrder || a.name.localeCompare(b.name)).map((x) => sectionLabel(x.schoolClass.name, x.name)).join(", ");
    }
    if (rule.classIds?.length) {
      const c = await tx.schoolClass.findMany({ where: { id: { in: rule.classIds } }, select: { name: true, sortOrder: true }, orderBy: { sortOrder: "asc" } });
      where = [where, c.map((x) => x.name).join(", ")].filter(Boolean).join(", ");
    }
    if (rule.roleKeys?.length) {
      const roles = await tx.role.findMany({ where: { schoolId: ctx.schoolId, key: { in: rule.roleKeys } }, select: { name: true } });
      where = [where, roles.map((x) => x.name).join(", ")].filter(Boolean).join(", ");
    }
    parts.push(`${joinNames(kinds)}${where ? ` of ${where}` : " (whole school)"}`);
  }
  const counts: string[] = [];
  if (rule.guardianIds?.length) counts.push(`${rule.guardianIds.length} chosen parent${rule.guardianIds.length === 1 ? "" : "s"}`);
  if (rule.guardiansOf?.length) counts.push(`parents of ${rule.guardiansOf.length} student${rule.guardiansOf.length === 1 ? "" : "s"}`);
  if (rule.studentIds?.length) counts.push(`${rule.studentIds.length} student${rule.studentIds.length === 1 ? "" : "s"}`);
  if (rule.staffIds?.length) counts.push(`${rule.staffIds.length} staff member${rule.staffIds.length === 1 ? "" : "s"}`);
  if (counts.length) parts.push(joinNames(counts));
  return parts.join("; ") || "Nobody chosen";
}
