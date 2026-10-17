// The issue history on Issue & Return and its export: issues in the chosen
// dates (by the day they were issued), with a search over the book, the copy
// and the member, and a status filter. The page and the export use this one
// filter so the file has exactly the rows on screen.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { dateWhere, type DayRange } from "@/lib/periods";
import { overdueWhere } from "@/lib/library/desk";
import { studentIdsForFilter } from "@/lib/students/find";

export const HISTORY_STATUS = [
  { value: "", label: "All" },
  { value: "out", label: "Out" },
  { value: "overdue", label: "Overdue" },
  { value: "returned", label: "Returned" },
] as const;

export async function historyWhere(tx: Tx, f: { range: DayRange | null; q: string; status: string; today: Date }): Promise<Prisma.BookIssueWhereInput> {
  const and: Prisma.BookIssueWhereInput[] = [];
  if (f.range) and.push({ issuedOn: dateWhere(f.range) });
  if (f.status === "out") and.push({ returnedAt: null });
  else if (f.status === "overdue") and.push(overdueWhere(f.today));
  else if (f.status === "returned") and.push({ returnedAt: { not: null } });
  const q = f.q.trim();
  if (q) {
    const [students, staff] = await Promise.all([
      studentIdsForFilter(tx, q).then((ids) => ids.map((id) => ({ id }))),
      tx.staff.findMany({ where: { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { staffCode: { equals: q, mode: "insensitive" } }] }, select: { id: true }, take: 300 }),
    ]);
    and.push({ OR: [
      { copy: { accessionNo: { equals: q, mode: "insensitive" } } },
      { copy: { book: { title: { contains: q, mode: "insensitive" } } } },
      ...(students.length ? [{ studentId: { in: students.map((s) => s.id) } }] : []),
      ...(staff.length ? [{ staffId: { in: staff.map((s) => s.id) } }] : []),
    ] });
  }
  return and.length ? { AND: and } : {};
}
