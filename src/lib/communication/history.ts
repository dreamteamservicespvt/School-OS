// Message History: one line per send, with delivered, read and failed counts.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { ListParams } from "../list";
import { inPeriod, PERIOD_FILTERS } from "./period";
import { RULES } from "../messaging/automatic";
import { codeSender, isCodeMessage } from "../messaging/one-time-code";

export const HISTORY_FILTERS = ["channel", "status", "sender", "rule", "person", ...PERIOD_FILTERS] as const;

export const MESSAGE_STATUS_LABEL: Record<string, string> = { SCHEDULED: "Scheduled", QUEUED: "Sending", SENT: "Sent", CANCELLED: "Cancelled" };
export const DELIVERY_LABEL: Record<string, string> = { QUEUED: "Queued", SENDING: "Queued", SENT: "Sent", DELIVERED: "Delivered", READ: "Read", FAILED: "Failed" };

/** Teachers and office staff with their own scope see what they sent; full access sees everything. */
export function historyWhere(ctx: SchoolContext, full: boolean, p: ListParams, timeZone: string): Prisma.MessageWhereInput {
  const f = p.filters;
  const and: Prisma.MessageWhereInput[] = [{ schoolId: ctx.schoolId }];
  if (!full) and.push({ sentById: ctx.userId });
  if (p.q) and.push({ OR: [{ title: { contains: p.q, mode: "insensitive" } }, { body: { contains: p.q, mode: "insensitive" } }, { audienceLabel: { contains: p.q, mode: "insensitive" } }, { trigger: { contains: p.q, mode: "insensitive" } }] });
  if (f.channel) and.push({ channels: { has: f.channel } });
  if (f.status === "failed") and.push({ recipients: { some: { status: "FAILED" } } });
  else if (f.status) and.push({ status: f.status as Prisma.EnumMessageStatusFilter["equals"] });
  if (f.sender === "me") and.push({ sentById: ctx.userId });
  if (f.sender === "rules") and.push({ ruleKey: { not: null } });
  if (f.sender === "people") and.push({ ruleKey: null, sourceType: null });
  if (f.sender === "notices") and.push({ sourceType: "Notice" });
  if (f.rule) and.push({ ruleKey: f.rule });
  const when = inPeriod(f, timeZone);
  if (when) and.push({ createdAt: when });
  if (f.person && /^(guardian|student|staff):[0-9a-f-]{36}$/.test(f.person)) {
    const [type, id] = f.person.split(":");
    and.push({ recipients: { some: type === "guardian" ? { guardianId: id } : type === "student" ? { studentId: id } : { staffId: id } } });
  }
  return { AND: and };
}

/** testMode: recorded in test mode, so nobody received it; never counted as delivered (COMM-04). */
export type Counts = { total: number; delivered: number; read: number; failed: number; queued: number; backup: number; testMode: number };

/** A recipient whose message went to the test-mode provider: recorded, not sent. */
export const inTestMode = (r: { provider: string | null; status: string }) => r.provider === "sandbox" && r.status !== "FAILED" && r.status !== "QUEUED" && r.status !== "SENDING";

/** Delivered counts include read; each person counted once per channel row. Test mode is counted on its own. */
export async function countsFor(tx: Tx, ctx: SchoolContext, messageIds: string[]): Promise<Map<string, Counts>> {
  const rows = await tx.messageRecipient.groupBy({ by: ["messageId", "status", "isBackup", "provider"], where: { schoolId: ctx.schoolId, messageId: { in: messageIds } }, _count: { _all: true } });
  const out = new Map<string, Counts>();
  for (const id of messageIds) out.set(id, { total: 0, delivered: 0, read: 0, failed: 0, queued: 0, backup: 0, testMode: 0 });
  for (const r of rows) {
    const c = out.get(r.messageId)!;
    const n = r._count._all;
    if (r.isBackup) { c.backup += n; continue; }
    c.total += n;
    if (inTestMode(r)) { c.testMode += n; continue; }
    if (r.status === "DELIVERED" || r.status === "READ") c.delivered += n;
    if (r.status === "READ") c.read += n;
    if (r.status === "FAILED") c.failed += n;
    if (r.status === "QUEUED" || r.status === "SENDING") c.queued += n;
  }
  return out;
}

/**
 * Who sent a message, in words: an automatic rule ("Rule: Absent today"), a notice,
 * School OS for a one-time code ("School OS (sign-in)", QA SEC-01), or the person.
 */
export function senderWords(m: { ruleKey: string | null; sourceType: string | null; sentById: string | null; messageType: string; trigger: string | null }, names: Map<string, string>): string {
  if (m.ruleKey) return `Rule: ${RULES.find((r) => r.key === m.ruleKey)?.label ?? m.ruleKey}`;
  if (isCodeMessage(m)) return codeSender(m);
  if (m.sourceType === "Notice") return "Notice";
  return names.get(m.sentById ?? "") ?? "School";
}

export async function senderNames(tx: Tx, ids: (string | null)[]) {
  const list = [...new Set(ids.filter(Boolean) as string[])];
  const users = list.length ? await tx.userLogin.findMany({ where: { id: { in: list } }, select: { id: true, displayName: true } }) : [];
  return new Map(users.map((u) => [u.id, u.displayName]));
}

const NONE = "00000000-0000-0000-0000-000000000000";
const nonEmpty = (ids: string[]) => (ids.length ? ids : [NONE]);

/** The students, their guardians and the staff of one campus, for the campus limits below. */
async function campusPeople(tx: Tx, ctx: SchoolContext, campusId: string) {
  const [students, links, staff] = await Promise.all([
    tx.student.findMany({ where: { schoolId: ctx.schoolId, campusId }, select: { id: true } }),
    tx.studentGuardian.findMany({ where: { schoolId: ctx.schoolId, student: { campusId } }, select: { guardianId: true } }),
    tx.staff.findMany({ where: { schoolId: ctx.schoolId, campusId }, select: { id: true } }),
  ]);
  return { students: nonEmpty(students.map((s) => s.id)), guardians: nonEmpty([...new Set(links.map((l) => l.guardianId))]), staff: nonEmpty(staff.map((s) => s.id)) };
}

/** A recipient row about someone of the campus (a parent of one of its students, a student or a staff member). */
const aboutCampus = (p: Awaited<ReturnType<typeof campusPeople>>): Prisma.MessageRecipientWhereInput => ({ OR: [{ studentId: { in: p.students } }, { guardianId: { in: p.guardians } }, { staffId: { in: p.staff } }] });
/** A recipient row about nobody of any campus (a School OS login, a typed address). */
const aboutNobody: Prisma.MessageRecipientWhereInput = { studentId: null, guardianId: null, staffId: null };

/**
 * For a person limited to one campus: the messages about their campus. A
 * message that went only to another campus's parents, students or staff is
 * left out; one they sent, or one to nobody of any campus, stays. {} for the
 * whole school. Used with historyWhere() by Message History and its export.
 */
export async function messageCampusWhere(tx: Tx, ctx: SchoolContext, campusId: string | null | undefined): Promise<Prisma.MessageWhereInput> {
  if (!campusId) return {};
  const p = await campusPeople(tx, ctx, campusId);
  return { OR: [...(ctx.userId ? [{ sentById: ctx.userId }] : []), { recipients: { some: aboutCampus(p) } }, { recipients: { every: aboutNobody } }] };
}

/** For a person limited to one campus: the people of one message who are of their campus (or of no campus). {} for the whole school. */
export async function recipientCampusWhere(tx: Tx, ctx: SchoolContext, campusId: string | null | undefined): Promise<Prisma.MessageRecipientWhereInput> {
  if (!campusId) return {};
  return { OR: [aboutCampus(await campusPeople(tx, ctx, campusId)), aboutNobody] };
}
