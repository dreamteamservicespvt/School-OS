// The fines list on Fines & Stock Check and its export: fines raised in the
// chosen dates, by status, reason and a search over the member, the book and
// the fine number. The page and the export share this filter.
import "server-only";

import type { LibraryFineReason, LibraryFineStatus, Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { momentWhere, type DayRange } from "@/lib/periods";

export const FINE_TABS = [
  { value: "", label: "Due" },
  { value: "WAITING", label: "Waiting approval" },
  { value: "PAID", label: "Paid" },
  { value: "WAIVED", label: "Waived" },
  { value: "NOT_APPROVED", label: "Not approved" },
  { value: "all", label: "All" },
] as const;

export type FinesFilter = { status: string; reason: string; q: string; range: DayRange | null };

export function readFinesFilter(get: (k: string) => string, range: DayRange | null): FinesFilter {
  const status = FINE_TABS.some((t) => t.value === get("status")) ? get("status") : "";
  const reason = ["LATE", "LOST", "DAMAGED"].includes(get("reason")) ? get("reason") : "";
  return { status, reason, q: get("q").trim().slice(0, 80), range };
}

export async function finesWhere(tx: Tx, f: FinesFilter, tz: string): Promise<Prisma.LibraryFineWhereInput> {
  const and: Prisma.LibraryFineWhereInput[] = [];
  if (f.status === "") and.push({ status: "DUE" });
  else if (f.status !== "all") and.push({ status: f.status as LibraryFineStatus });
  if (f.reason) and.push({ reason: f.reason as LibraryFineReason });
  if (f.range) and.push({ createdAt: momentWhere(f.range, tz) });
  const q = f.q;
  if (q) {
    const [students, staff, books] = await Promise.all([
      tx.student.findMany({ where: { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { admissionNo: { equals: q, mode: "insensitive" } }] }, select: { id: true }, take: 300 }),
      tx.staff.findMany({ where: { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { staffCode: { equals: q, mode: "insensitive" } }] }, select: { id: true }, take: 300 }),
      tx.book.findMany({ where: { title: { contains: q, mode: "insensitive" } }, select: { id: true }, take: 300 }),
    ]);
    and.push({ OR: [
      { fineNo: { equals: q, mode: "insensitive" } },
      ...(students.length ? [{ studentId: { in: students.map((x) => x.id) } }] : []),
      ...(staff.length ? [{ staffId: { in: staff.map((x) => x.id) } }] : []),
      ...(books.length ? [{ bookId: { in: books.map((x) => x.id) } }] : []),
    ] });
  }
  return and.length ? { AND: and } : {};
}
