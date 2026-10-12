// The lists on Concessions & Refunds (06 §2): concessions, scholarships and
// refunds with the student, who asked, who decided and the status. The page
// and its export read the same lists with the same filters.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import type { DayRange } from "../periods";
import { momentWhere } from "../periods";
import { formatRupees } from "../format";
import { classOfStudents } from "./dues";
import { concessionTypeLabel, CONCESSION_TYPES, percentWord } from "./words";

const ZERO = BigInt(0);

export type ConcessionFilter = { q?: string | null; status?: string | null; range?: DayRange | null; timeZone: string; scholarship?: boolean; ids?: string[] };

/** Ids of students whose name or admission number matches. */
async function studentsLike(tx: Tx, q: string) {
  const rows = await tx.student.findMany({ where: { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { admissionNo: { contains: q, mode: "insensitive" } }] }, select: { id: true }, take: 500 });
  return rows.map((r) => r.id);
}

async function people(tx: Tx, ids: (string | null)[]) {
  const want = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const rows = want.length ? await tx.userLogin.findMany({ where: { id: { in: want } }, select: { id: true, displayName: true } }) : [];
  return new Map(rows.map((r) => [r.id, r.displayName]));
}

async function names(tx: Tx, ids: string[]) {
  const rows = ids.length ? await tx.student.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, fullName: true, admissionNo: true } }) : [];
  return new Map(rows.map((r) => [r.id, r]));
}

export type ConcessionRow = {
  id: string;
  studentId: string;
  name: string;
  admissionNo: string;
  classLabel: string;
  createdAt: Date;
  type: string;
  typeLabel: string;
  scholarshipType: string | null;
  value: string;
  amountPaise: bigint;
  heads: string;
  period: { from: Date | null; to: Date | null };
  reason: string;
  note: string | null;
  askedBy: string;
  decidedBy: string | null;
  /** WAITING, APPLIED, REJECTED or TAKEN_OFF. */
  status: string;
  approvalId: string | null;
  documentFileId: string | null;
  automatic: boolean;
};

export async function concessionRows(tx: Tx, f: ConcessionFilter, take = 300) {
  const where: Prisma.ConcessionWhereInput = { ...(f.scholarship ? { type: "SCHOLARSHIP" as const } : {}), ...(f.ids ? { id: { in: f.ids } } : {}) };
  const q = f.q?.trim();
  if (q) {
    const types = CONCESSION_TYPES.filter((t) => t.label.toLowerCase().includes(q.toLowerCase())).map((t) => t.value);
    where.OR = [{ studentId: { in: await studentsLike(tx, q) } }, ...(types.length ? [{ type: { in: types } }] : []), { scholarshipType: { contains: q, mode: "insensitive" } }];
  }
  if (f.range) where.createdAt = momentWhere(f.range, f.timeZone);
  const all = { ...where };
  if (f.status === "WAITING") where.status = "WAITING";
  else if (f.status === "APPLIED") where.status = { in: ["APPLIED", "APPROVED"] };
  else if (f.status === "REJECTED") where.status = "REJECTED";
  const [list, total, count] = await Promise.all([
    tx.concession.findMany({ where, orderBy: { createdAt: "desc" }, take }),
    tx.concession.count({ where: all }),
    tx.concession.count({ where }),
  ]);
  const heads = await tx.feeHead.findMany({ where: { id: { in: [...new Set(list.flatMap((c) => c.feeHeadIds))] } }, select: { id: true, name: true } });
  const headName = new Map(heads.map((h) => [h.id, h.name]));
  const [who, kids, classes] = await Promise.all([
    people(tx, list.flatMap((c) => [c.requestedById, c.decidedById])),
    names(tx, list.map((c) => c.studentId)),
    classOfStudents(tx, [...new Set(list.map((c) => c.studentId))]),
  ]);
  const rows: ConcessionRow[] = list.map((c) => {
    const s = kids.get(c.studentId);
    const takenOff = c.status === "REJECTED" && c.archivedAt !== null;
    return {
      id: c.id,
      studentId: c.studentId,
      name: s?.fullName ?? "Student",
      admissionNo: s?.admissionNo ?? "",
      classLabel: classes.get(c.studentId)?.label ?? "",
      createdAt: c.createdAt,
      type: c.type,
      typeLabel: concessionTypeLabel(c.type),
      scholarshipType: c.scholarshipType,
      value: c.mode === "percent" ? percentWord(c.percentBp) : formatRupees(c.amountPaise),
      amountPaise: c.status === "APPLIED" ? c.appliedPaise : c.estimatedPaise,
      heads: c.type === "LATE_FEE_WAIVER" ? "Late fee" : c.feeHeadIds.length ? c.feeHeadIds.map((h) => headName.get(h) ?? "Fee head").join(", ") : "All fee heads",
      period: { from: c.periodFrom, to: c.periodTo },
      reason: c.reason,
      note: c.decisionNote,
      askedBy: (c.requestedById && who.get(c.requestedById)) || (c.bulkRuleId ? "Bulk discount rule" : "School OS"),
      decidedBy: c.status === "WAITING" ? null : c.decidedById ? (c.decidedById === c.requestedById && !c.approvalId ? "Within the limit" : who.get(c.decidedById) ?? null) : c.bulkRuleId ? "Rule" : null,
      status: takenOff ? "TAKEN_OFF" : c.status === "APPROVED" ? "APPLIED" : c.status,
      approvalId: c.approvalId,
      documentFileId: c.documentFileId,
      automatic: Boolean(c.bulkRuleId || c.paymentId),
    };
  });
  return { rows, total, count };
}

export type RefundRow = {
  id: string;
  studentId: string;
  name: string;
  classLabel: string;
  createdAt: Date;
  receipt: string;
  paymentId: string;
  paidPaise: bigint;
  amountPaise: bigint;
  reason: string;
  note: string | null;
  mode: string;
  reference: string | null;
  refundedOn: Date | null;
  askedBy: string;
  status: string;
  approvalId: string | null;
};

export async function refundRows(tx: Tx, f: ConcessionFilter, take = 300) {
  const where: Prisma.RefundWhereInput = f.ids ? { id: { in: f.ids } } : {};
  const q = f.q?.trim();
  if (q) {
    const receipts = await tx.receipt.findMany({ where: { number: { contains: q, mode: "insensitive" } }, select: { paymentId: true }, take: 50 });
    where.OR = [{ studentId: { in: await studentsLike(tx, q) } }, { paymentId: { in: receipts.map((r) => r.paymentId) } }];
  }
  if (f.range) where.createdAt = momentWhere(f.range, f.timeZone);
  const all = { ...where };
  if (f.status && ["WAITING", "APPROVED", "REJECTED", "REFUNDED"].includes(f.status)) where.status = f.status as Prisma.RefundWhereInput["status"];
  const [list, total, count] = await Promise.all([
    tx.refund.findMany({ where, orderBy: { createdAt: "desc" }, take }),
    tx.refund.count({ where: all }),
    tx.refund.count({ where }),
  ]);
  const payIds = [...new Set(list.map((r) => r.paymentId))];
  const [pays, receipts, who, kids, classes] = await Promise.all([
    tx.payment.findMany({ where: { id: { in: payIds } }, select: { id: true, amountPaise: true } }),
    tx.receipt.findMany({ where: { paymentId: { in: payIds } }, select: { paymentId: true, number: true } }),
    people(tx, list.map((r) => r.requestedById)),
    names(tx, list.map((r) => r.studentId)),
    classOfStudents(tx, [...new Set(list.map((r) => r.studentId))]),
  ]);
  const paid = new Map(pays.map((p) => [p.id, p.amountPaise]));
  const number = new Map(receipts.map((r) => [r.paymentId, r.number]));
  const rows: RefundRow[] = list.map((r) => ({
    id: r.id,
    studentId: r.studentId,
    name: kids.get(r.studentId)?.fullName ?? "Student",
    classLabel: classes.get(r.studentId)?.label ?? "",
    createdAt: r.createdAt,
    receipt: number.get(r.paymentId) ?? "Payment",
    paymentId: r.paymentId,
    paidPaise: paid.get(r.paymentId) ?? ZERO,
    amountPaise: r.amountPaise,
    reason: r.reason,
    note: r.decisionNote,
    mode: r.mode,
    reference: r.reference,
    refundedOn: r.refundedOn,
    askedBy: (r.requestedById && who.get(r.requestedById)) || "School OS",
    status: r.status,
    approvalId: r.approvalId,
  }));
  return { rows, total, count };
}

/** Scholarship types in use this year: how many students and how much. */
export async function scholarshipTypes(tx: Tx, academicYearId: string | null) {
  const rows = await tx.concession.groupBy({
    by: ["scholarshipType"],
    where: { type: "SCHOLARSHIP", status: "APPLIED", ...(academicYearId ? { academicYearId } : {}) },
    _count: { _all: true },
    _sum: { appliedPaise: true },
  });
  return rows.map((r) => ({ name: r.scholarshipType || "Scholarship", students: r._count._all, total: r._sum.appliedPaise ?? ZERO })).sort((a, b) => b.students - a.students);
}
