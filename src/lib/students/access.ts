// Who may see which students, and which parts of a student's record
// (05-roles.md, 03 §1 "Used by"). Every page, action, search and export of
// this module goes through these, so the limits are the same everywhere.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { PermissionMap } from "../permissions";
import { PermissionDeniedError } from "../permissions";
import { ownSectionIds } from "../people";
import { currentYear } from "../academic/years";
import type { ResolvedSettings } from "./settings";

/** The parts of the signed-in person this module needs (Current satisfies it). */
export type Who = {
  ctx: SchoolContext;
  permissions: PermissionMap;
  roles: { key: string | null }[];
};

/**
 * View roles that follow students' progress (05-roles.md: Academic Head, Exam
 * In-charge). Every other view-only role (Accountant, Front Office, Librarian,
 * Gate Security...) opens Student Management only to look a student up.
 */
const ACADEMIC_VIEW_ROLES = new Set(["academic-head", "exam-in-charge", "vice-principal"]);
/** Roles that see the restricted fields (Aadhaar and other identifiers) in full. */
const RESTRICTED_ROLES = new Set(["school-admin", "principal"]);
/** The only role that reads confidential counselling notes (05-roles.md, Counsellor). */
export const COUNSELLOR_ROLE = "counsellor";

/**
 * What a role sees on a student's profile (05-roles.md notes; the approved
 * design's per-role profile, students.jsx TABS_BY_ROLE and profileRules).
 * Anything not allowed is left out of the page and is not read from the
 * database for it: hidden, never greyed out.
 */
export type ProfileView = {
  /** "profile": the tabbed profile. "pickup": photo and the approved pickup list (Front Office, Gate Security). "library": name, photo and class (Librarian). */
  mode: "profile" | "pickup" | "library";
  /** The profile tabs allowed, by key; null = every tab. */
  tabs: string[] | null;
  /** Date of birth, gender, blood group, category and the like. */
  personal: boolean;
  /** Home and permanent address. */
  address: boolean;
  /** Parents and guardians, with their phone numbers. */
  parents: boolean;
  emergency: boolean;
  /** Brothers and sisters at the school. */
  siblings: boolean;
  /** The approved pickup list on the profile. */
  pickup: boolean;
  /** Phone numbers anywhere on the page (Gate Security sees none). */
  phones: boolean;
};

const ALL_ON = { personal: true, address: true, parents: true, emergency: true, siblings: true, pickup: true, phones: true };
const FULL_VIEW: ProfileView = { mode: "profile", tabs: null, ...ALL_ON };
const view = (tabs: string[], on: Partial<Omit<ProfileView, "mode" | "tabs">>): ProfileView => ({
  mode: "profile", tabs, personal: false, address: false, parents: false, emergency: false, siblings: false, pickup: false, phones: true, ...on,
});
/** Roles that see the whole profile (the design's FULL_ROLES); anyone with Full in Student Management does too. */
const FULL_VIEW_ROLES = new Set(["principal", "school-admin", "vice-principal", "office-staff"]);
export const PROFILE_VIEWS: Record<string, ProfileView> = {
  accountant: view(["overview", "fees"], { parents: true }),
  teacher: view(["overview", "academics", "attendance", "exams", "behaviour"], { personal: true, parents: true, emergency: true }),
  "class-teacher": view(["overview", "academics", "attendance", "exams", "behaviour", "history"], { personal: true, address: true, parents: true, emergency: true, pickup: true }),
  "hostel-warden": view(["overview", "attendance"], { personal: true, address: true, parents: true, emergency: true }),
  counsellor: view(["overview", "attendance", "behaviour"], { personal: true, address: true, parents: true, emergency: true }),
  "academic-head": view(["overview", "academics", "attendance", "exams"], { personal: true }),
  "exam-in-charge": view(["overview", "academics", "attendance", "exams"], { personal: true }),
  "admission-counsellor": view(["overview"], { parents: true, siblings: true }),
  receptionist: { ...view([], {}), mode: "pickup", phones: true },
  "gate-security": { ...view([], {}), mode: "pickup", phones: false },
  librarian: { ...view([], {}), mode: "library", phones: false },
};
const MODE_RANK = { profile: 3, pickup: 2, library: 1 } as const;

/**
 * The profile view for someone holding these roles. A person with several
 * roles sees what any of them allows. A role the school made itself follows
 * its Student Management access: Full sees everything, view-only sees the
 * basic record, and Own sees what a teacher sees.
 */
export function profileView(roleKeys: string[], manage: boolean, lookupOnly: boolean): ProfileView {
  if (manage || roleKeys.some((k) => FULL_VIEW_ROLES.has(k))) return FULL_VIEW;
  const known = roleKeys.map((k) => PROFILE_VIEWS[k]).filter((v): v is ProfileView => Boolean(v));
  if (known.length === 0) return lookupOnly ? view(["overview"], { personal: true }) : PROFILE_VIEWS.teacher;
  const best = Math.max(...known.map((v) => MODE_RANK[v.mode]));
  const same = known.filter((v) => MODE_RANK[v.mode] === best);
  return {
    mode: same[0].mode,
    tabs: [...new Set(same.flatMap((v) => v.tabs ?? []))],
    personal: same.some((v) => v.personal),
    address: same.some((v) => v.address),
    parents: same.some((v) => v.parents),
    emergency: same.some((v) => v.emergency),
    siblings: same.some((v) => v.siblings),
    pickup: same.some((v) => v.pickup),
    phones: same.some((v) => v.phones),
  };
}

export type StudentAbilities = {
  /** Which students: every student, or only their own (sections taught, cases given). */
  reach: "all" | "own" | "none";
  /** Add, edit, change status, link guardians, certificates, promotion, leaving. */
  manage: boolean;
  /** Report incidents and add notes (teachers for their own students). */
  contribute: boolean;
  /** Only a student's basic details: the accountant, front office, librarian. */
  lookupOnly: boolean;
  seeRestricted: boolean;
  seeBehaviour: boolean;
  seeDocuments: boolean;
  /** Counselling cases (when switched on): roles in Student Settings. */
  seeCounselling: boolean;
  /** Confidential counselling notes: the Counsellor role only. */
  seeCounsellingNotes: boolean;
  exportList: boolean;
  /** What the Student Profile and the lists show this person. */
  view: ProfileView;
  /** Parents & Guardians and the parent column of the Student List. */
  seeParents: boolean;
  roleKeys: string[];
};

export function abilities(who: Who, settings?: Pick<ResolvedSettings, "counsellingOn" | "counsellingRoles">): StudentAbilities {
  const access = who.permissions["student-management"];
  const roleKeys = who.roles.map((r) => r.key).filter((k): k is string => Boolean(k));
  const reach = access?.see ?? "none";
  const change = access?.change ?? "none";
  // View-only people see a student's basic record; the academic view roles also see behaviour and documents.
  const lookupOnly = reach !== "none" && change === "none" && !roleKeys.some((k) => ACADEMIC_VIEW_ROLES.has(k));
  const manage = change === "all";
  const pv = profileView(roleKeys, manage, lookupOnly);
  const counsellingAllowed = Boolean(settings?.counsellingOn) && (roleKeys.includes(COUNSELLOR_ROLE) || roleKeys.some((k) => settings?.counsellingRoles.includes(k)));
  return {
    reach,
    manage,
    contribute: change !== "none",
    lookupOnly,
    seeRestricted: roleKeys.some((k) => RESTRICTED_ROLES.has(k)),
    seeBehaviour: reach !== "none" && !lookupOnly && (pv.tabs === null || pv.tabs.includes("behaviour")),
    seeDocuments: reach !== "none" && !lookupOnly && (pv.tabs === null || pv.tabs.includes("documents")),
    seeCounselling: counsellingAllowed,
    seeCounsellingNotes: Boolean(settings?.counsellingOn) && roleKeys.includes(COUNSELLOR_ROLE),
    // Exporting the list is for people who see every student; "own" roles (teachers) do not export (05-roles).
    exportList: reach === "all",
    view: pv,
    seeParents: reach !== "none" && pv.mode === "profile" && pv.parents,
    roleKeys,
  };
}

/**
 * The limit on Student rows for this person. With "own" reach: students
 * enrolled this year in the sections they teach or are class teacher of, and
 * students whose counselling cases are given to them.
 */
export async function studentScope(tx: Tx, who: Who, yearId?: string | null): Promise<Prisma.StudentWhereInput> {
  const a = abilities(who);
  if (a.reach === "none") return { id: { in: [] } };
  if (a.reach === "all") return {};
  const year = yearId ?? (await currentYear(tx, who.ctx))?.id;
  const sections = year ? await ownSectionIds(tx, who.ctx, year) : [];
  const cases = who.ctx.userId
    ? await tx.counsellingCase.findMany({ where: { counsellorId: who.ctx.userId, archivedAt: null }, select: { studentId: true } })
    : [];
  const or: Prisma.StudentWhereInput[] = [];
  if (sections.length && year) or.push({ enrolments: { some: { academicYearId: year, sectionId: { in: sections }, archivedAt: null } } });
  if (cases.length) or.push({ id: { in: cases.map((c) => c.studentId) } });
  return or.length ? { OR: or } : { id: { in: [] } };
}

export class StudentNotFound extends Error {
  constructor() {
    super("This student was not found, or is not one of your students.");
    this.name = "StudentNotFound";
  }
}

/** Throws unless the person may see this student. Returns the student. */
export async function loadVisibleStudent(tx: Tx, who: Who, studentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) throw new StudentNotFound();
  const scope = await studentScope(tx, who);
  const student = await tx.student.findFirst({ where: { AND: [{ id: studentId }, scope] } });
  if (!student) throw new StudentNotFound();
  return student;
}

/** For actions: the person must be able to change student records (Full). */
export function requireManage(who: Who) {
  if (!abilities(who).manage) throw new PermissionDeniedError("student-management");
}

/** Notes marked private show only to the chosen roles and to the person who wrote them. */
export function noteVisible(note: { visibleToRoles: string[]; authorId: string | null }, who: Who) {
  if (note.visibleToRoles.length === 0) return true;
  if (note.authorId && note.authorId === who.ctx.userId) return true;
  const keys = who.roles.map((r) => r.key);
  return note.visibleToRoles.some((k) => keys.includes(k));
}
