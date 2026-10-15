// Library members (13 Members & Cards): every active student and staff
// member borrows automatically, with the limit and loan days of Library
// Settings for their member type (students by class group). The card number
// is the number already on their ID card: the admission number for a
// student, the staff code for staff, so the ID card's barcode (or its QR,
// "SCHOOLCODE:number") works at the desk. A Library Member row is kept only
// for what differs: a changed limit or a block, each with a reason.
import "server-only";

import type { LibraryMember, LibraryMemberKind, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { currentYear } from "../academic/years";
import { LibraryProblem } from "./problem";
import type { LibrarySettings } from "./settings";
import type { MemberKey } from "./words";

export const ACTIVE_STUDENT = ["ACTIVE", "ADMITTED", "PROMOTED"] as const;
export const ACTIVE_STAFF = ["ACTIVE", "ON_LEAVE"] as const;

export type Member = {
  key: MemberKey;
  kind: LibraryMemberKind;
  studentId: string | null;
  staffId: string | null;
  name: string;
  firstName: string;
  /** Library card number: admission number or staff code. */
  cardNo: string;
  photoFileId: string | null;
  /** "Class 7 B" or the department and designation. */
  group: string;
  /** Short: "7 B" or "Staff". */
  short: string;
  level: string | null;
  sectionId: string | null;
  classId: string | null;
  userLoginId: string | null;
  departmentId: string | null;
  active: boolean;
  limit: number;
  limitChanged: { reason: string } | null;
  loanDays: number;
  blocked: { reason: string; at: Date } | null;
};

export const memberKey = (m: { studentId?: string | null; staffId?: string | null }): MemberKey => (m.studentId ? `S:${m.studentId}` : `T:${m.staffId}`);

export function parseMemberKey(raw: string | null | undefined): { kind: LibraryMemberKind; id: string } | null {
  const m = /^([ST]):([0-9a-f-]{36})$/i.exec(raw ?? "");
  if (!m) return null;
  return { kind: m[1].toUpperCase() === "S" ? "STUDENT" : "STAFF", id: m[2].toLowerCase() };
}

/** The member fields of a record (issue, reservation, fine) for one member. */
export const memberFields = (m: Pick<Member, "kind" | "studentId" | "staffId">) => ({ memberKind: m.kind, studentId: m.studentId, staffId: m.staffId });

/** Where a record belongs to one member. */
export const whereMember = (m: Pick<Member, "studentId" | "staffId">) => (m.studentId ? { studentId: m.studentId } : { staffId: m.staffId });

function rulesFor(s: LibrarySettings, kind: LibraryMemberKind, level: string | null) {
  if (kind === "STAFF") return { books: s.staffBooks, loanDays: s.staffLoanDays };
  const r = level ? s.rules.find((x) => x.level === level) : null;
  return r ? { books: r.books, loanDays: r.loanDays } : { books: s.studentBooks, loanDays: s.studentLoanDays };
}

type StudentRow = { id: string; fullName: string; firstName: string; admissionNo: string; photoFileId: string | null; status: string; archivedAt: Date | null };
type StaffRow = { id: string; fullName: string; firstName: string; staffCode: string; photoFileId: string | null; status: string; archivedAt: Date | null; designation: string; departmentId: string | null; userLoginId: string | null };

/** Builds members for many students and staff at once (lists, reports). */
export async function membersOf(tx: Tx, ctx: SchoolContext, s: LibrarySettings, ids: { studentIds?: string[]; staffIds?: string[] }): Promise<Map<string, Member>> {
  const studentIds = [...new Set(ids.studentIds ?? [])];
  const staffIds = [...new Set(ids.staffIds ?? [])];
  const out = new Map<string, Member>();
  if (!studentIds.length && !staffIds.length) return out;
  const year = studentIds.length ? await currentYear(tx, ctx) : null;
  const [students, staff, overrides] = await Promise.all([
    studentIds.length ? tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, fullName: true, firstName: true, admissionNo: true, photoFileId: true, status: true, archivedAt: true } }) : Promise.resolve([] as StudentRow[]),
    staffIds.length ? tx.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, fullName: true, firstName: true, staffCode: true, photoFileId: true, status: true, archivedAt: true, designation: true, departmentId: true, userLoginId: true } }) : Promise.resolve([] as StaffRow[]),
    tx.libraryMember.findMany({ where: { OR: [...(studentIds.length ? [{ studentId: { in: studentIds } }] : []), ...(staffIds.length ? [{ staffId: { in: staffIds } }] : [])] } }),
  ]);
  const enrol = year && students.length
    ? await tx.enrolment.findMany({ where: { studentId: { in: students.map((x) => x.id) }, academicYearId: year.id, archivedAt: null }, select: { studentId: true, sectionId: true, classId: true } })
    : [];
  const sectionIds = [...new Set(enrol.map((e) => e.sectionId))];
  const sections = sectionIds.length ? await tx.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true, schoolClass: { select: { name: true, level: true } } } }) : [];
  const deptIds = [...new Set(staff.map((x) => x.departmentId).filter((x): x is string => Boolean(x)))];
  const depts = deptIds.length ? await tx.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } }) : [];
  const ov = (f: (o: LibraryMember) => boolean) => overrides.find(f) ?? null;
  for (const st of students) {
    const e = enrol.find((x) => x.studentId === st.id);
    const sec = e ? sections.find((x) => x.id === e.sectionId) : null;
    const level = sec?.schoolClass.level ?? null;
    const o = ov((x) => x.studentId === st.id);
    const r = rulesFor(s, "STUDENT", level);
    const cls = sec ? `${sec.schoolClass.name.replace(/^class\s+/i, "")} ${sec.name}` : "";
    out.set(`S:${st.id}`, {
      key: `S:${st.id}`, kind: "STUDENT", studentId: st.id, staffId: null, name: st.fullName, firstName: st.firstName, cardNo: st.admissionNo, photoFileId: st.photoFileId,
      group: sec ? `Class ${cls}` : "Not in a class this year", short: cls || "Student", level, sectionId: e?.sectionId ?? null, classId: e?.classId ?? null, userLoginId: null, departmentId: null,
      active: !st.archivedAt && (ACTIVE_STUDENT as readonly string[]).includes(st.status) && Boolean(e),
      limit: o?.limitOverride ?? r.books, limitChanged: o?.limitOverride != null ? { reason: o.limitReason ?? "" } : null, loanDays: r.loanDays,
      blocked: o?.blockedAt ? { reason: o.blockReason ?? "", at: o.blockedAt } : null,
    });
  }
  for (const t of staff) {
    const o = ov((x) => x.staffId === t.id);
    const r = rulesFor(s, "STAFF", null);
    const dept = depts.find((d) => d.id === t.departmentId)?.name;
    out.set(`T:${t.id}`, {
      key: `T:${t.id}`, kind: "STAFF", studentId: null, staffId: t.id, name: t.fullName, firstName: t.firstName, cardNo: t.staffCode, photoFileId: t.photoFileId,
      group: [dept, t.designation].filter(Boolean).join(" · ") || "Staff", short: "Staff", level: null, sectionId: null, classId: null, userLoginId: t.userLoginId, departmentId: t.departmentId,
      active: !t.archivedAt && (ACTIVE_STAFF as readonly string[]).includes(t.status),
      limit: o?.limitOverride ?? r.books, limitChanged: o?.limitOverride != null ? { reason: o.limitReason ?? "" } : null, loanDays: r.loanDays,
      blocked: o?.blockedAt ? { reason: o.blockReason ?? "", at: o.blockedAt } : null,
    });
  }
  return out;
}

export async function memberByKey(tx: Tx, ctx: SchoolContext, s: LibrarySettings, key: string | null | undefined): Promise<Member | null> {
  const k = parseMemberKey(key);
  if (!k) return null;
  const map = await membersOf(tx, ctx, s, k.kind === "STUDENT" ? { studentIds: [k.id] } : { staffIds: [k.id] });
  return map.values().next().value ?? null;
}

/**
 * The member on a scanned card or a typed number: the admission number, the
 * staff code, or the ID card's QR ("SCHOOLCODE:number").
 */
export async function memberByCode(tx: Tx, ctx: SchoolContext, s: LibrarySettings, raw: string): Promise<Member | null> {
  let code = raw.trim();
  if (!code) return null;
  const qr = /^([^:\s]+):(.+)$/.exec(code);
  if (qr) code = qr[2].trim();
  const student = await tx.student.findFirst({ where: { admissionNo: { equals: code, mode: "insensitive" }, archivedAt: null }, select: { id: true } });
  if (student) return memberByKey(tx, ctx, s, `S:${student.id}`);
  const staff = await tx.staff.findFirst({ where: { staffCode: { equals: code, mode: "insensitive" }, archivedAt: null }, select: { id: true } });
  if (staff) return memberByKey(tx, ctx, s, `T:${staff.id}`);
  return null;
}

/** Members by name, admission number or staff code (the desk's search). */
export async function searchMembers(tx: Tx, ctx: SchoolContext, s: LibrarySettings, q: string, take = 8): Promise<Member[]> {
  const t = q.trim();
  if (t.length < 2) return [];
  const [students, staff] = await Promise.all([
    tx.student.findMany({ where: { archivedAt: null, status: { in: [...ACTIVE_STUDENT] }, OR: [{ fullName: { contains: t, mode: "insensitive" } }, { admissionNo: { contains: t, mode: "insensitive" } }] }, select: { id: true }, orderBy: { fullName: "asc" }, take }),
    tx.staff.findMany({ where: { archivedAt: null, status: { in: [...ACTIVE_STAFF] }, OR: [{ fullName: { contains: t, mode: "insensitive" } }, { staffCode: { contains: t, mode: "insensitive" } }] }, select: { id: true }, orderBy: { fullName: "asc" }, take }),
  ]);
  const map = await membersOf(tx, ctx, s, { studentIds: students.map((x) => x.id), staffIds: staff.map((x) => x.id) });
  return [...map.values()].slice(0, take);
}

/** Books out and unpaid fines for a member: the member panel and the limit check. */
export async function memberLoad(tx: Tx, m: Pick<Member, "studentId" | "staffId">) {
  const [out, fines] = await Promise.all([
    tx.bookIssue.findMany({ where: { ...whereMember(m), returnedAt: null }, orderBy: { dueOn: "asc" }, include: { copy: { select: { accessionNo: true, book: { select: { id: true, title: true } } } } } }),
    tx.libraryFine.aggregate({ where: { ...whereMember(m), status: "DUE" }, _sum: { amountPaise: true } }),
  ]);
  return { out, finesDuePaise: fines._sum.amountPaise ?? BigInt(0) };
}

/* ---------- Limits and blocks ---------- */

async function overrideRow(tx: Tx, ctx: SchoolContext, m: Member) {
  const existing = await tx.libraryMember.findFirst({ where: whereMember(m) });
  if (existing) return existing;
  return tx.libraryMember.create({ data: { schoolId: ctx.schoolId, ...memberFields(m), updatedById: ctx.userId } });
}

function needReason(reason: string) {
  if (reason.trim().length < 5) throw new LibraryProblem("Give a reason of at least 5 characters.", "reason");
}

export async function setBlocked(tx: Tx, ctx: SchoolContext, m: Member, blocked: boolean, reason: string) {
  needReason(reason);
  const row = await overrideRow(tx, ctx, m);
  if (blocked && row.blockedAt) throw new LibraryProblem(`${m.name} is already blocked.`);
  if (!blocked && !row.blockedAt) throw new LibraryProblem(`${m.name} is not blocked.`);
  const data: Prisma.LibraryMemberUpdateInput = blocked
    ? { blockedAt: new Date(), blockReason: reason.trim(), blockedById: ctx.userId, updatedById: ctx.userId }
    : { blockedAt: null, blockReason: null, blockedById: null, updatedById: ctx.userId };
  await tx.libraryMember.update({ where: { id: row.id }, data });
  await writeAudit(tx, ctx, { action: blocked ? "blocked" : "unblocked", recordType: "Library Member", recordId: row.id, before: { member: m.name, blocked: Boolean(row.blockedAt), reason: row.blockReason }, after: { blocked, reason: reason.trim() } });
}

/** Changes one member's limit with a reason; null goes back to the settings' limit. */
export async function setLimit(tx: Tx, ctx: SchoolContext, m: Member, limit: number | null, reason: string) {
  needReason(reason);
  if (limit !== null && (!Number.isInteger(limit) || limit < 0 || limit > 30)) throw new LibraryProblem("The limit must be a whole number from 0 to 30.", "limit");
  const row = await overrideRow(tx, ctx, m);
  await tx.libraryMember.update({ where: { id: row.id }, data: { limitOverride: limit, limitReason: limit === null ? null : reason.trim(), updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "changed-limit", recordType: "Library Member", recordId: row.id, before: { member: m.name, limit: m.limit }, after: { limit: limit ?? "from settings", reason: reason.trim() } });
}
