import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { ListParams } from "../list";

import { inPeriod, PERIOD_FILTERS } from "./period";
export const NOTICE_FILTERS = ["status", "priority", ...PERIOD_FILTERS] as const;

export function noticeWhere(ctx: SchoolContext, full: boolean, p: ListParams, timeZone = "Asia/Kolkata"): Prisma.NoticeWhereInput {
  const and: Prisma.NoticeWhereInput[] = [{ schoolId: ctx.schoolId }];
  if (!full) and.push({ createdById: ctx.userId });
  if (p.q) and.push({ OR: [{ title: { contains: p.q, mode: "insensitive" } }, { body: { contains: p.q, mode: "insensitive" } }, { audienceLabel: { contains: p.q, mode: "insensitive" } }] });
  if (p.filters.status) and.push({ status: p.filters.status as Prisma.EnumNoticeStatusFilter["equals"] });
  else if (!p.archived) and.push({ status: { not: "ARCHIVED" } });
  if (p.filters.priority) and.push({ priority: p.filters.priority as Prisma.EnumNoticePriorityFilter["equals"] });
  const when = inPeriod(p.filters, timeZone);
  if (when) and.push({ createdAt: when });
  return { AND: and };
}

/** Read (staff and students) and seen (parents) counts per notice. */
export async function noticeCounts(tx: Tx, ids: string[]) {
  const [reads, acks, seen] = await Promise.all([
    tx.noticeAcknowledgement.groupBy({ by: ["noticeId"], where: { noticeId: { in: ids } }, _count: { _all: true } }),
    tx.noticeAcknowledgement.groupBy({ by: ["noticeId"], where: { noticeId: { in: ids }, acknowledgedAt: { not: null } }, _count: { _all: true } }),
    tx.noticeGuardianView.groupBy({ by: ["noticeId"], where: { noticeId: { in: ids } }, _count: { _all: true } }),
  ]);
  const get = (rows: { noticeId: string; _count: { _all: number } }[], id: string) => rows.find((r) => r.noticeId === id)?._count._all ?? 0;
  return new Map(ids.map((id) => [id, { read: get(reads, id), acknowledged: get(acks, id), seen: get(seen, id) }]));
}
