// One campus (src/lib/campus.ts) in Approvals: a request about a record that
// belongs to one campus (a student's leave or certificate, a concession, a
// payment, a staff member's leave or exit, a payroll month...) is seen and
// decided only by approvers of that campus or of the whole school. A request
// about something of no campus (an expense, a purchase, a notice for everyone)
// stays open to every approver, as before.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "./db";
import { campusLimitOf } from "./staff/campus-logins";

type Ref = { id: string; recordType: string; recordId: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Each record type's campus, read for many records at once: record id -> campus id. */
const RESOLVERS: Record<string, (tx: Tx, ids: string[]) => Promise<Map<string, string | null>>> = {
  Student: async (tx, ids) => new Map((await tx.student.findMany({ where: { id: { in: ids } }, select: { id: true, campusId: true } })).map((r) => [r.id, r.campusId])),
  Application: async (tx, ids) => new Map((await tx.application.findMany({ where: { id: { in: ids } }, select: { id: true, campusId: true } })).map((r) => [r.id, r.campusId])),
  "Payroll Run": async (tx, ids) => new Map((await tx.payrollRun.findMany({ where: { id: { in: ids } }, select: { id: true, campusId: true } })).map((r) => [r.id, r.campusId])),
  Certificate: (tx, ids) => viaStudents(tx, tx.certificate.findMany({ where: { id: { in: ids } }, select: { id: true, studentId: true } })),
  Concession: (tx, ids) => viaStudents(tx, tx.concession.findMany({ where: { id: { in: ids } }, select: { id: true, studentId: true } })),
  Payment: (tx, ids) => viaStudents(tx, tx.payment.findMany({ where: { id: { in: ids } }, select: { id: true, studentId: true } })),
  Refund: (tx, ids) => viaStudents(tx, tx.refund.findMany({ where: { id: { in: ids } }, select: { id: true, studentId: true } })),
  "Transport Assignment": (tx, ids) => viaStudents(tx, tx.transportAssignment.findMany({ where: { id: { in: ids } }, select: { id: true, studentId: true } })),
  "Gate Pass": (tx, ids) => viaStudents(tx, tx.gatePass.findMany({ where: { id: { in: ids } }, select: { id: true, studentId: true } })),
  "Marks Moderation": (tx, ids) => viaStudents(tx, tx.marksModeration.findMany({ where: { id: { in: ids } }, select: { id: true, studentId: true } })),
  "Clearance Check": async (tx, ids) => viaStudents(tx, (await tx.studentClearanceCheck.findMany({ where: { id: { in: ids } }, select: { id: true, request: { select: { studentId: true } } } })).map((r) => ({ id: r.id, studentId: r.request.studentId }))),
  "Exit Case": (tx, ids) => viaStaff(tx, tx.exitCase.findMany({ where: { id: { in: ids } }, select: { id: true, staffId: true } })),
  "Salary Advance": (tx, ids) => viaStaff(tx, tx.salaryAdvance.findMany({ where: { id: { in: ids } }, select: { id: true, staffId: true } })),
  "Leave Request": async (tx, ids) => {
    const rows = await tx.leaveRequest.findMany({ where: { id: { in: ids } }, select: { id: true, studentId: true, staffId: true } });
    const [students, staff] = await Promise.all([
      viaStudents(tx, rows.filter((r) => r.studentId).map((r) => ({ id: r.id, studentId: r.studentId! }))),
      viaStaff(tx, rows.filter((r) => !r.studentId && r.staffId).map((r) => ({ id: r.id, staffId: r.staffId! }))),
    ]);
    return new Map([...students, ...staff]);
  },
  "Fee Structure": async (tx, ids) => {
    const rows = await tx.feeStructure.findMany({ where: { id: { in: ids } }, select: { id: true, classId: true } });
    const classes = new Map((await tx.schoolClass.findMany({ where: { id: { in: rows.map((r) => r.classId) } }, select: { id: true, campusId: true } })).map((c) => [c.id, c.campusId]));
    return new Map(rows.map((r) => [r.id, classes.get(r.classId) ?? null]));
  },
  "Attendance Correction": async (tx, ids) => {
    const rows = await tx.attendanceCorrection.findMany({ where: { id: { in: ids } }, select: { id: true, sectionId: true } });
    const sections = await tx.section.findMany({ where: { id: { in: rows.map((r) => r.sectionId).filter((x): x is string => Boolean(x)) } }, select: { id: true, schoolClass: { select: { campusId: true } } } });
    const of = new Map(sections.map((s) => [s.id, s.schoolClass.campusId]));
    return new Map(rows.map((r) => [r.id, r.sectionId ? of.get(r.sectionId) ?? null : null]));
  },
};

async function viaStudents(tx: Tx, rows: Promise<{ id: string; studentId: string | null }[]> | { id: string; studentId: string | null }[]) {
  const list = await rows;
  const students = new Map((await tx.student.findMany({ where: { id: { in: list.map((r) => r.studentId).filter((x): x is string => Boolean(x)) } }, select: { id: true, campusId: true } })).map((s) => [s.id, s.campusId]));
  return new Map(list.map((r) => [r.id, r.studentId ? students.get(r.studentId) ?? null : null]));
}

async function viaStaff(tx: Tx, rows: Promise<{ id: string; staffId: string }[]> | { id: string; staffId: string }[]) {
  const list = await rows;
  const staff = new Map((await tx.staff.findMany({ where: { id: { in: list.map((r) => r.staffId) } }, select: { id: true, campusId: true } })).map((s) => [s.id, s.campusId]));
  return new Map(list.map((r) => [r.id, staff.get(r.staffId) ?? null]));
}

/** The approval ids, of those given, that are about a record of another campus than `campusId`. */
export async function otherCampusApprovals(tx: Tx, campusId: string, refs: Ref[]): Promise<string[]> {
  const byType = new Map<string, Ref[]>();
  for (const r of refs) if (RESOLVERS[r.recordType] && UUID.test(r.recordId)) byType.set(r.recordType, [...(byType.get(r.recordType) ?? []), r]);
  const out: string[] = [];
  for (const [type, list] of byType) {
    const campus = await RESOLVERS[type](tx, list.map((r) => r.recordId));
    for (const r of list) {
      const c = campus.get(r.recordId);
      if (c && c !== campusId) out.push(r.id);
    }
  }
  return out;
}

/**
 * A where-clause on Approval narrowed for a person limited to one campus:
 * requests about another campus's records are left out. Unchanged for the
 * whole school.
 */
export async function approvalsOnCampus(tx: Tx, ctx: SchoolContext, where: Prisma.ApprovalWhereInput): Promise<Prisma.ApprovalWhereInput> {
  const limit = await campusLimitOf(tx, ctx);
  if (!limit) return where;
  const refs = await tx.approval.findMany({ where, select: { id: true, recordType: true, recordId: true } });
  const others = await otherCampusApprovals(tx, limit, refs);
  return others.length ? { AND: [where, { id: { notIn: others } }] } : where;
}

/** Is this request about another campus's record, for the person in `ctx`? */
export async function approvalOffCampus(tx: Tx, ctx: SchoolContext, a: Ref): Promise<boolean> {
  const limit = await campusLimitOf(tx, ctx);
  return Boolean(limit) && (await otherCampusApprovals(tx, limit!, [a])).length > 0;
}
