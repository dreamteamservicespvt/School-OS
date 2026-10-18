// Finding a student at the fee counter and in the ledger picker (the one
// student search in ../students/find.ts), with what they owe now.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import { addDays } from "../staff/dates";
import { DUE_WINDOW_DAYS, classOfStudents } from "./dues";
import { studentScope, type FeeViewer } from "./access";
import { findStudents as findAnyStudents } from "../students/find";

const ZERO = BigInt(0);

export type FoundStudent = {
  id: string;
  name: string;
  admissionNo: string;
  photoFileId: string | null;
  classSection: string;
  rollNo: number | null;
  father: string | null;
  phone: string | null;
  /** Balance on rows due now or overdue. */
  due: bigint;
  overdue: boolean;
};

/**
 * Students matching a search, best first, at most `take`: the one student
 * search (name with one letter wrong, admission or roll number, parent name or
 * phone), every status, within the person's fee reach.
 */
export async function findStudents(tx: Tx, viewer: FeeViewer, q: string, today: Date, take = 8): Promise<FoundStudent[]> {
  if (!q.trim()) return [];
  // Roll numbers and classes of each campus's current year (studentScope carries the campus, when limited to one).
  const hits = await findAnyStudents(tx, q, { scope: studentScope(viewer), yearId: viewer.yearIds, statuses: "any", take });
  return describeStudents(tx, viewer, hits.map((h) => h.id), today);
}

/** Students with the oldest overdue fees: most likely at the counter today. */
export async function mostOverdue(tx: Tx, viewer: FeeViewer, today: Date, take = 6): Promise<FoundStudent[]> {
  const where: Prisma.StudentFeeDueWhereInput = { state: "OPEN", balancePaise: { gt: 0 }, dueDate: { lt: today } };
  // Own reach, or a person limited to one campus: only the students they may see.
  if (viewer.see !== "all" || viewer.campusId) {
    const ids = (await tx.student.findMany({ where: studentScope(viewer), select: { id: true } })).map((s) => s.id);
    where.studentId = { in: ids };
  }
  const oldest = await tx.studentFeeDue.groupBy({ by: ["studentId"], where, _min: { dueDate: true }, _sum: { balancePaise: true }, orderBy: [{ _min: { dueDate: "asc" } }], take });
  return describeStudents(tx, viewer, oldest.map((o) => o.studentId), today);
}

/**
 * Name, class, father, phone and dues for each student, in the order given.
 * The class is of the student's own campus's current year.
 */
export async function describeStudents(tx: Tx, viewer: FeeViewer, ids: string[], today: Date): Promise<FoundStudent[]> {
  if (!ids.length) return [];
  const [students, classes, dues] = await Promise.all([
    tx.student.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, fullName: true, admissionNo: true, photoFileId: true,
        enrolments: { where: { archivedAt: null, ...(viewer.yearIds.length ? { academicYearId: { in: viewer.yearIds } } : {}) }, select: { rollNo: true }, take: 1, orderBy: { createdAt: "desc" } },
        guardians: { where: { archivedAt: null }, orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }], select: { relationship: true, guardian: { select: { name: true, phone: true } } } },
      },
    }),
    classOfStudents(tx, ids, viewer.yearIds),
    tx.studentFeeDue.findMany({ where: { studentId: { in: ids }, state: "OPEN", balancePaise: { gt: 0 }, dueDate: { lte: addDays(today, DUE_WINDOW_DAYS) } }, select: { studentId: true, balancePaise: true, dueDate: true } }),
  ]);
  const out: FoundStudent[] = [];
  for (const id of ids) {
    const s = students.find((x) => x.id === id);
    if (!s) continue;
    const father = s.guardians.find((g) => /father/i.test(g.relationship))?.guardian ?? s.guardians[0]?.guardian ?? null;
    const mine = dues.filter((d) => d.studentId === id);
    out.push({
      id,
      name: s.fullName,
      admissionNo: s.admissionNo,
      photoFileId: s.photoFileId,
      classSection: classes.get(id)?.label ?? "No class this year",
      rollNo: s.enrolments[0]?.rollNo ?? null,
      father: father?.name ?? null,
      phone: father?.phone ?? null,
      due: mine.reduce((a, d) => a + d.balancePaise, ZERO),
      overdue: mine.some((d) => d.dueDate < today),
    });
  }
  return out;
}
