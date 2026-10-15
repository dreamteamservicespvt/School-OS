// The members list on Members & Cards and its export: every active student
// (with a class this year) and every working staff member is a member
// automatically; blocked members are listed on their own. Each row has the
// limit, the books out and the fines due. The page and the export share this.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "@/lib/db";
import { currentYear } from "@/lib/academic/years";
import { ACTIVE_STAFF, ACTIVE_STUDENT, membersOf, type Member } from "@/lib/library/members";
import type { LibrarySettings } from "@/lib/library/settings";

export type MemberTab = "students" | "staff" | "blocked";
export type MembersFilter = { tab: MemberTab; q: string; sec: string };
export type MemberRow = Member & { out: number; overdue: number; finesPaise: bigint };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readMembersFilter(get: (k: string) => string): MembersFilter {
  const t = get("type");
  return { tab: t === "staff" || t === "blocked" ? t : "students", q: get("q").trim().slice(0, 80), sec: UUID.test(get("sec")) ? get("sec") : "" };
}

/** One page of members (or all of them for an export when take is null). */
export async function memberRows(tx: Tx, ctx: SchoolContext, s: LibrarySettings, f: MembersFilter, today: Date, page: { skip: number; take: number } | null) {
  let total = 0;
  let studentIds: string[] = [];
  let staffIds: string[] = [];
  const q = f.q;
  const pg = { skip: page?.skip ?? 0, take: page?.take ?? 20000 };
  if (f.tab === "students") {
    const year = await currentYear(tx, ctx);
    if (year) {
      const where: Prisma.EnrolmentWhereInput = {
        academicYearId: year.id, archivedAt: null, ...(f.sec ? { sectionId: f.sec } : {}),
        student: { archivedAt: null, status: { in: [...ACTIVE_STUDENT] }, ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { admissionNo: { contains: q, mode: "insensitive" } }] } : {}) },
      };
      total = await tx.enrolment.count({ where });
      const rows = await tx.enrolment.findMany({ where, orderBy: [{ student: { fullName: "asc" } }, { id: "asc" }], select: { studentId: true }, ...pg });
      studentIds = rows.map((r) => r.studentId);
    }
  } else if (f.tab === "staff") {
    const where: Prisma.StaffWhereInput = { archivedAt: null, status: { in: [...ACTIVE_STAFF] }, ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { staffCode: { contains: q, mode: "insensitive" } }] } : {}) };
    total = await tx.staff.count({ where });
    const rows = await tx.staff.findMany({ where, orderBy: [{ fullName: "asc" }, { id: "asc" }], select: { id: true }, ...pg });
    staffIds = rows.map((r) => r.id);
  } else {
    const where: Prisma.LibraryMemberWhereInput = { blockedAt: { not: null } };
    total = await tx.libraryMember.count({ where });
    const rows = await tx.libraryMember.findMany({ where, orderBy: { blockedAt: "desc" }, ...pg });
    studentIds = rows.map((r) => r.studentId).filter((x): x is string => Boolean(x));
    staffIds = rows.map((r) => r.staffId).filter((x): x is string => Boolean(x));
  }
  const map = await membersOf(tx, ctx, s, { studentIds, staffIds });
  const keys = [...studentIds.map((id) => `S:${id}`), ...staffIds.map((id) => `T:${id}`)];
  let members = keys.map((k) => map.get(k)).filter((m): m is Member => Boolean(m));
  if (f.tab === "blocked" && q) members = members.filter((m) => `${m.name} ${m.cardNo}`.toLowerCase().includes(q.toLowerCase()));
  const sIds = members.filter((m) => m.studentId).map((m) => m.studentId!);
  const tIds = members.filter((m) => m.staffId).map((m) => m.staffId!);
  const whoOr = [...(sIds.length ? [{ studentId: { in: sIds } }] : []), ...(tIds.length ? [{ staffId: { in: tIds } }] : [])];
  const [open, fines] = whoOr.length
    ? await Promise.all([
      tx.bookIssue.findMany({ where: { returnedAt: null, OR: whoOr }, select: { studentId: true, staffId: true, dueOn: true } }),
      tx.libraryFine.groupBy({ by: ["studentId", "staffId"], where: { status: "DUE", OR: whoOr }, _sum: { amountPaise: true } }),
    ])
    : [[], []];
  const rows: MemberRow[] = members.map((m) => {
    const mine = open.filter((i) => (m.studentId ? i.studentId === m.studentId : i.staffId === m.staffId));
    const fine = fines.find((x) => (m.studentId ? x.studentId === m.studentId : x.staffId === m.staffId));
    return { ...m, out: mine.length, overdue: mine.filter((i) => i.dueOn.getTime() < today.getTime()).length, finesPaise: fine?._sum.amountPaise ?? BigInt(0) };
  });
  return { total, rows };
}
