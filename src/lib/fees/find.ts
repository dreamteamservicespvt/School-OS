// Finding a student at the fee counter and in the ledger picker: by name,
// admission number or parent phone, with what they owe now.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import { addDays } from "../staff/dates";
import { DUE_WINDOW_DAYS, classOfStudents } from "./dues";
import { studentScope, type FeeViewer } from "./access";

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

/** Students matching a search (name, admission number or parent phone), at most `take`. */
export async function findStudents(tx: Tx, viewer: FeeViewer, q: string, today: Date, take = 8): Promise<FoundStudent[]> {
  const text = q.trim();
  if (!text) return [];
  const digits = text.replace(/\D/g, "");
  const or: Prisma.StudentWhereInput[] = [
    { fullName: { contains: text, mode: "insensitive" } },
    { admissionNo: { contains: text, mode: "insensitive" } },
  ];
  if (digits.length >= 4) or.push({ guardians: { some: { archivedAt: null, guardian: { phone: { contains: digits } } } } });
  const rows = await tx.student.findMany({
    where: { archivedAt: null, AND: [studentScope(viewer), { OR: or }] },
    orderBy: [{ status: "asc" }, { fullName: "asc" }],
    take,
    select: { id: true },
  });
  return describeStudents(tx, viewer, rows.map((r) => r.id), today);
}

/** Students with the oldest overdue fees: most likely at the counter today. */
export async function mostOverdue(tx: Tx, viewer: FeeViewer, today: Date, take = 6): Promise<FoundStudent[]> {
  const where: Prisma.StudentFeeDueWhereInput = { state: "OPEN", balancePaise: { gt: 0 }, dueDate: { lt: today } };
  if (viewer.see !== "all") {
    const ids = (await tx.student.findMany({ where: studentScope(viewer), select: { id: true } })).map((s) => s.id);
    where.studentId = { in: ids };
  }
  const oldest = await tx.studentFeeDue.groupBy({ by: ["studentId"], where, _min: { dueDate: true }, _sum: { balancePaise: true }, orderBy: [{ _min: { dueDate: "asc" } }], take });
  return describeStudents(tx, viewer, oldest.map((o) => o.studentId), today);
}

/** Name, class, father, phone and dues for each student, in the order given. */
export async function describeStudents(tx: Tx, viewer: FeeViewer, ids: string[], today: Date): Promise<FoundStudent[]> {
  if (!ids.length) return [];
  const [students, classes, dues] = await Promise.all([
    tx.student.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, fullName: true, admissionNo: true, photoFileId: true,
        enrolments: { where: { archivedAt: null, ...(viewer.yearId ? { academicYearId: viewer.yearId } : {}) }, select: { rollNo: true }, take: 1, orderBy: { createdAt: "desc" } },
        guardians: { where: { archivedAt: null }, orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }], select: { relationship: true, guardian: { select: { name: true, phone: true } } } },
      },
    }),
    classOfStudents(tx, ids, viewer.yearId),
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
