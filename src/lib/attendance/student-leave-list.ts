// The Student Leave list (05 §2) for the page and its export: the same
// filters (status, class, type, dates, search) and the same reach (class
// teachers and teachers see their own sections only).
import "server-only";

import type { LeaveStatus, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { DayRange } from "../periods";
import { dateWhere } from "../periods";
import { UUID_RE } from "../staff/act";
import type { AttendanceAccess } from "./access";
import { registerChoices } from "./register";
import { canDecideStudentLeave, quotaFor, quotaText, studentLeaveTypes } from "./student-leave";
import { studentIdsForFilter } from "../students/find";

export const LEAVE_STATUSES = ["WAITING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type LeaveFilters = { q?: string; section?: string; type?: string; range?: DayRange | null; status: string; skip?: number; take?: number };

/** Students in this person's reach for student leave: everyone (null) or their sections' students. */
async function studentsInReach(tx: Tx, access: AttendanceAccess) {
  if (access.studentLeave === "all") return null;
  if (!access.yearId) return [];
  const sections = access.studentLeave === "own" ? access.classSections : [];
  return (await tx.enrolment.findMany({ where: { sectionId: { in: sections }, academicYearId: access.yearId, archivedAt: null }, select: { studentId: true } })).map((e) => e.studentId);
}

export async function studentLeaveList(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, f: LeaveFilters) {
  const [types, sections, inReach] = await Promise.all([studentLeaveTypes(tx, ctx), registerChoices(tx, access), studentsInReach(tx, access)]);
  const sectionStudents = f.section && UUID_RE.test(f.section)
    ? (await tx.enrolment.findMany({ where: { sectionId: f.section, archivedAt: null }, select: { studentId: true } })).map((e) => e.studentId)
    : null;
  const nameMatch = f.q
    ? await studentIdsForFilter(tx, f.q)
    : null;
  const lists = [inReach, sectionStudents, nameMatch].filter((x): x is string[] => x !== null);
  const ids = lists.length ? lists.reduce((a, b) => a.filter((x) => b.includes(x))) : null;
  const range = f.range ? dateWhere(f.range) : null;
  const base: Prisma.LeaveRequestWhereInput = {
    studentId: ids ? { in: ids } : { not: null },
    archivedAt: null,
    ...(f.type && UUID_RE.test(f.type) ? { leaveTypeId: f.type } : {}),
    // Leave that touches any day of the chosen period.
    ...(range ? { fromDate: { lte: range.lte }, toDate: { gte: range.gte } } : {}),
  };
  const where: Prisma.LeaveRequestWhereInput = { ...base, ...((LEAVE_STATUSES as readonly string[]).includes(f.status) ? { status: f.status as LeaveStatus } : {}) };
  const [rows, total, counts] = await Promise.all([
    tx.leaveRequest.findMany({ where, orderBy: [{ fromDate: "desc" }, { createdAt: "desc" }], skip: f.skip, take: f.take }),
    tx.leaveRequest.count({ where }),
    tx.leaveRequest.groupBy({ by: ["status"], where: base, _count: true }),
  ]);
  return { rows, total, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>, types, sections, ...(await describe(tx, ctx, access, rows)) };
}

/** Names, classes and who recorded and decided, for a set of leave rows. */
export async function describe(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, rows: { id: string; studentId: string | null; recordedById: string | null; decidedById: string | null; status: string; leaveTypeId: string; fromDate: Date }[]) {
  const studentIds = [...new Set(rows.map((r) => r.studentId!).filter(Boolean))];
  const [students, enrolments, users, types] = await Promise.all([
    tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, fullName: true, admissionNo: true, photoFileId: true } }),
    tx.enrolment.findMany({ where: { studentId: { in: studentIds }, archivedAt: null, ...(access.yearId ? { academicYearId: access.yearId } : {}) }, select: { studentId: true, sectionId: true, rollNo: true } }),
    tx.userLogin.findMany({ where: { id: { in: rows.flatMap((r) => [r.recordedById, r.decidedById]).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
    tx.leaveType.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.leaveTypeId))] } }, select: { id: true, name: true } }),
  ]);
  const secs = await tx.section.findMany({ where: { id: { in: enrolments.map((e) => e.sectionId) } }, include: { schoolClass: { select: { name: true } } } });
  const secName = new Map(secs.map((s) => [s.id, `${s.schoolClass.name} ${s.name}`]));
  const decidable = new Set<string>();
  for (const r of rows) if (r.status === "WAITING" && (await canDecideStudentLeave(tx, ctx, access, r as never))) decidable.add(r.id);
  return {
    decidable,
    students: new Map(students.map((s) => [s.id, s])),
    classOf: new Map(enrolments.map((e) => [e.studentId, secName.get(e.sectionId) ?? ""])),
    rollOf: new Map(enrolments.map((e) => [e.studentId, e.rollNo])),
    users: new Map(users.map((u) => [u.id, u.displayName])),
    typeNames: new Map(types.map((t) => [t.id, t.name])),
  };
}

/** One leave request with what its detail sheet shows, or null when it is out of reach. */
export async function studentLeaveDetail(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, id: string) {
  if (!UUID_RE.test(id)) return null;
  const r = await tx.leaveRequest.findFirst({ where: { id, archivedAt: null, studentId: { not: null } } });
  if (!r) return null;
  const inReach = await studentsInReach(tx, access);
  if (inReach && !inReach.includes(r.studentId!)) return null;
  const d = await describe(tx, ctx, access, [r]);
  const quota = await quotaFor(tx, ctx, r.studentId!, r.leaveTypeId, r.fromDate, { ignoreRequestId: r.id });
  const approval = r.approvalId ? await tx.approval.findUnique({ where: { id: r.approvalId }, select: { id: true, currentApproverId: true } }).catch(() => null) : null;
  const waitingFor = approval?.currentApproverId ? (await tx.userLogin.findUnique({ where: { id: approval.currentApproverId }, select: { displayName: true } }))?.displayName ?? null : null;
  return { r, ...d, quota: quota ? quotaText(quota) : null, waitingFor };
}
