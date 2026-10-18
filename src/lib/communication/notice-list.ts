import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { ListParams } from "../list";
import { noticeOnCampus, readAudience } from "./notices";
import { OPEN_LINK } from "../students/guardian-access";

import { inPeriod, PERIOD_FILTERS } from "./period";
export const NOTICE_FILTERS = ["group", "status", "priority", ...PERIOD_FILTERS] as const;

/** The Notice Board's three views: on the board now, waiting to go out, and the archive. */
export const NOTICE_GROUPS = {
  current: ["PUBLISHED"],
  waiting: ["WAITING_APPROVAL", "SCHEDULED", "DRAFT"],
  archive: ["EXPIRED", "ARCHIVED"],
} as const;
export type NoticeGroup = keyof typeof NOTICE_GROUPS;

export function noticeWhere(ctx: SchoolContext, full: boolean, p: ListParams, timeZone = "Asia/Kolkata"): Prisma.NoticeWhereInput {
  const and: Prisma.NoticeWhereInput[] = [{ schoolId: ctx.schoolId }];
  if (!full) and.push({ createdById: ctx.userId });
  if (p.q) and.push({ OR: [{ title: { contains: p.q, mode: "insensitive" } }, { body: { contains: p.q, mode: "insensitive" } }, { audienceLabel: { contains: p.q, mode: "insensitive" } }] });
  const group = p.filters.group as NoticeGroup | undefined;
  if (p.filters.status) and.push({ status: p.filters.status as Prisma.EnumNoticeStatusFilter["equals"] });
  else if (group && group in NOTICE_GROUPS) and.push({ status: { in: [...NOTICE_GROUPS[group]] } });
  else if (!p.archived) and.push({ status: { not: "ARCHIVED" } });
  if (p.filters.priority) and.push({ priority: p.filters.priority as Prisma.EnumNoticePriorityFilter["equals"] });
  const when = inPeriod(p.filters, timeZone);
  if (when) and.push({ createdAt: when });
  return { AND: and };
}

/**
 * For a person limited to one campus: leaves out the notices for other campuses
 * only (a notice with no campus is for the whole school and stays). {} for the
 * whole school. Used with noticeWhere() by the Notice Board list and its export.
 */
export async function noticeCampusWhere(tx: Tx, ctx: SchoolContext, campusId: string | null | undefined): Promise<Prisma.NoticeWhereInput> {
  if (!campusId) return {};
  const rows = await tx.notice.findMany({ where: { schoolId: ctx.schoolId }, select: { id: true, audience: true, createdById: true } });
  const hidden = rows.filter((n) => !noticeOnCampus(n, campusId, ctx.userId)).map((n) => n.id);
  return hidden.length ? { id: { notIn: hidden } } : {};
}

/**
 * Read (staff and students) and seen (parents) counts per notice. A notice
 * for some campuses counts only parents of a child at one of them (never
 * through a link with a custody restriction), so a view from another campus
 * is not counted.
 */
export async function noticeCounts(tx: Tx, notices: { id: string; audience: unknown }[]) {
  const ids = notices.map((n) => n.id);
  const [reads, acks, seen] = await Promise.all([
    tx.noticeAcknowledgement.groupBy({ by: ["noticeId"], where: { noticeId: { in: ids } }, _count: { _all: true } }),
    tx.noticeAcknowledgement.groupBy({ by: ["noticeId"], where: { noticeId: { in: ids }, acknowledgedAt: { not: null } }, _count: { _all: true } }),
    tx.noticeGuardianView.groupBy({ by: ["noticeId"], where: { noticeId: { in: ids } }, _count: { _all: true } }),
  ]);
  const get = (rows: { noticeId: string; _count: { _all: number } }[], id: string) => rows.find((r) => r.noticeId === id)?._count._all ?? 0;
  const campusSeen = await seenInCampus(tx, notices);
  return new Map(ids.map((id) => [id, { read: get(reads, id), acknowledged: get(acks, id), seen: campusSeen.get(id) ?? get(seen, id) }]));
}

/** "Seen by" for notices with campuses: views by parents of a child at one of the notice's campuses. */
async function seenInCampus(tx: Tx, notices: { id: string; audience: unknown }[]) {
  const campusesOf = new Map(notices.map((n) => [n.id, readAudience(n.audience).campusIds] as const).filter(([, c]) => c.length));
  const out = new Map<string, number>([...campusesOf.keys()].map((id) => [id, 0]));
  if (!campusesOf.size) return out;
  const views = await tx.noticeGuardianView.findMany({ where: { noticeId: { in: [...campusesOf.keys()] } }, select: { noticeId: true, guardianId: true } });
  if (!views.length) return out;
  const links = await tx.studentGuardian.findMany({ where: { guardianId: { in: [...new Set(views.map((v) => v.guardianId))] }, ...OPEN_LINK, student: { archivedAt: null } }, select: { guardianId: true, student: { select: { campusId: true } } } });
  const campusesOfGuardian = new Map<string, Set<string>>();
  for (const l of links) campusesOfGuardian.set(l.guardianId, (campusesOfGuardian.get(l.guardianId) ?? new Set()).add(l.student.campusId));
  for (const v of views) {
    const theirs = campusesOfGuardian.get(v.guardianId);
    if (theirs && campusesOf.get(v.noticeId)!.some((c) => theirs.has(c))) out.set(v.noticeId, out.get(v.noticeId)! + 1);
  }
  return out;
}
