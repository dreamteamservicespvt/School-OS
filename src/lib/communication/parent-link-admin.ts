// The school's Parent Link page (11-communication.md, Parent Link, school
// staff): summary figures, the links list with filters, one link's history,
// and choosing guardians by whole school, class or section. A person limited
// to one campus sees and manages only the links of guardians with a child at
// that campus (`campusId` below; none for the whole school).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { ListParams } from "../list";
import { currentYears } from "../academic/years";
import { OPEN_LINK } from "../students/guardian-access";
import { ParentLinkProblem } from "../parent-link/links";
import { joiningLabels } from "../parent-link/view";

import { inPeriod, PERIOD_FILTERS } from "./period";
export const LINK_FILTERS = ["status", "class", "section", "opened", ...PERIOD_FILTERS] as const;
const DAY = 86400_000;

/**
 * Guardians of students studying now, optionally only in some classes or
 * sections, or at one campus; never through a link with a custody restriction.
 * Each campus's current year (only the campus's when one is given).
 */
export async function guardianIdsIn(tx: Tx, ctx: SchoolContext, pick: { classIds?: string[]; sectionIds?: string[]; campusId?: string | null }) {
  const years = await currentYears(tx, ctx, pick.campusId ? [pick.campusId] : null);
  const narrow = Boolean(pick.classIds?.length || pick.sectionIds?.length);
  let studentIds: string[] | null = null;
  if (narrow) {
    if (!years.length) return [];
    const or: Prisma.EnrolmentWhereInput[] = [];
    if (pick.classIds?.length) or.push({ classId: { in: pick.classIds } });
    if (pick.sectionIds?.length) or.push({ sectionId: { in: pick.sectionIds } });
    const rows = await tx.enrolment.findMany({ where: { schoolId: ctx.schoolId, academicYearId: { in: years.map((y) => y.id) }, archivedAt: null, OR: or }, select: { studentId: true } });
    studentIds = rows.map((r) => r.studentId);
  }
  const links = await tx.studentGuardian.findMany({
    where: { schoolId: ctx.schoolId, ...OPEN_LINK, ...(studentIds ? { studentId: { in: studentIds } } : {}), guardian: { archivedAt: null }, student: { archivedAt: null, status: { in: ["ACTIVE", "ADMITTED"] }, ...(pick.campusId ? { campusId: pick.campusId } : {}) } },
    select: { guardianId: true },
  });
  return [...new Set(links.map((l) => l.guardianId))];
}

/** Every guardian with a child at the campus (any child on record, studying now or not). */
export async function campusGuardianIds(tx: Tx, ctx: SchoolContext, campusId: string) {
  const links = await tx.studentGuardian.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, student: { campusId, archivedAt: null } }, select: { guardianId: true } });
  return [...new Set(links.map((l) => l.guardianId))];
}

/** The links a person may see: every one, or those of their campus's guardians. */
export async function linkCampusWhere(tx: Tx, ctx: SchoolContext, campusId: string | null | undefined): Promise<Prisma.ParentLinkWhereInput> {
  return campusId ? { guardianId: { in: await campusGuardianIds(tx, ctx, campusId) } } : {};
}

/** Refuses the link of another campus's guardian for a person limited to one campus (the same words as a link not found). */
export async function assertLinkOnCampus(tx: Tx, ctx: SchoolContext, linkId: string, campusId: string | null | undefined) {
  if (!campusId) return;
  const l = await tx.parentLink.findFirst({ where: { id: linkId, schoolId: ctx.schoolId }, select: { guardianId: true } });
  const ok = l ? await tx.studentGuardian.findFirst({ where: { schoolId: ctx.schoolId, guardianId: l.guardianId, archivedAt: null, student: { campusId, archivedAt: null } }, select: { id: true } }) : null;
  if (!ok) throw new ParentLinkProblem("This link was not found.");
}

export async function linkListWhere(tx: Tx, ctx: SchoolContext, params: ListParams, now = new Date(), timeZone = "Asia/Kolkata", campusId?: string | null): Promise<Prisma.ParentLinkWhereInput> {
  const f = params.filters;
  const and: Prisma.ParentLinkWhereInput[] = [{ schoolId: ctx.schoolId }, await linkCampusWhere(tx, ctx, campusId)];
  if (f.status === "ACTIVE" || f.status === "REVOKED") and.push({ status: f.status });
  const when = inPeriod(f, timeZone);
  if (when) and.push({ createdAt: when });
  if (f.opened === "never") and.push({ lastOpenedAt: null });
  else if (f.opened === "30") and.push({ lastOpenedAt: { gte: new Date(now.getTime() - 30 * DAY) } });
  else if (f.opened === "not30") and.push({ OR: [{ lastOpenedAt: null }, { lastOpenedAt: { lt: new Date(now.getTime() - 30 * DAY) } }] });
  if (f.class || f.section) {
    const ids = await guardianIdsIn(tx, ctx, { classIds: f.class ? [f.class] : [], sectionIds: f.section ? [f.section] : [], campusId });
    and.push({ guardianId: { in: ids } });
  }
  if (params.q) {
    const digits = params.q.replace(/\D/g, "");
    const gs = await tx.guardian.findMany({ where: { schoolId: ctx.schoolId, OR: [{ name: { contains: params.q, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : [])] }, select: { id: true }, take: 500 });
    and.push({ guardianId: { in: gs.map((g) => g.id) } });
  }
  return { AND: and };
}

/** Links active and revoked, guardians who opened in the last 30 days, and who never opened (of one campus's guardians when one is given). */
export async function linkSummary(tx: Tx, ctx: SchoolContext, now = new Date(), campusId?: string | null) {
  const base = { schoolId: ctx.schoolId, ...(await linkCampusWhere(tx, ctx, campusId)) };
  const [active, revoked, opened30, never, all] = await Promise.all([
    tx.parentLink.count({ where: { ...base, status: "ACTIVE" } }),
    tx.parentLink.count({ where: { ...base, status: "REVOKED" } }),
    tx.parentLink.count({ where: { ...base, status: "ACTIVE", lastOpenedAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
    tx.parentLink.count({ where: { ...base, status: "ACTIVE", lastOpenedAt: null } }),
    guardianIdsIn(tx, ctx, { campusId }),
  ]);
  const withLink = await tx.parentLink.count({ where: { schoolId: ctx.schoolId, status: "ACTIVE", guardianId: { in: all } } });
  return { active, revoked, opened30, never, withoutLink: Math.max(0, all.length - withLink) };
}

/**
 * Each guardian's children with class and section, for the list. A child the
 * guardian has a custody restriction for is kept, marked `restricted`: the
 * office sees it, and that the child is not on the guardian's Parent Link.
 * campusId: only the children at that campus (a person limited to one campus).
 */
export async function childrenByGuardian(tx: Tx, ctx: SchoolContext, guardianIds: string[], campusId?: string | null) {
  const links = await tx.studentGuardian.findMany({ where: { schoolId: ctx.schoolId, guardianId: { in: guardianIds }, archivedAt: null, student: { archivedAt: null, ...(campusId ? { campusId } : {}) } }, include: { student: { select: { id: true, fullName: true } } } });
  const years = await currentYears(tx, ctx, campusId ? [campusId] : null);
  const enrolments = years.length ? await tx.enrolment.findMany({ where: { schoolId: ctx.schoolId, academicYearId: { in: years.map((y) => y.id) }, archivedAt: null, studentId: { in: links.map((l) => l.studentId) } } }) : [];
  const [classes, sections] = await Promise.all([
    tx.schoolClass.findMany({ where: { schoolId: ctx.schoolId, id: { in: enrolments.map((e) => e.classId) } }, select: { id: true, name: true } }),
    tx.section.findMany({ where: { schoolId: ctx.schoolId, id: { in: enrolments.map((e) => e.sectionId) } }, select: { id: true, name: true } }),
  ]);
  // A newly admitted child with a class only next year: "Joining Class 3 A in 2027-28" (PL-01).
  const joining = await joiningLabels(tx, ctx, [...new Set(links.map((l) => l.studentId))].filter((id) => !enrolments.some((e) => e.studentId === id)), years);
  const map = new Map<string, { id: string; name: string; classLabel: string; restricted: boolean }[]>();
  for (const l of links) {
    const e = enrolments.find((x) => x.studentId === l.studentId);
    const label = e ? `${classes.find((c) => c.id === e.classId)?.name ?? ""} ${sections.find((s) => s.id === e.sectionId)?.name ?? ""}`.trim() : joining.get(l.studentId) ?? "";
    map.set(l.guardianId, [...(map.get(l.guardianId) ?? []), { id: l.student.id, name: l.student.fullName, classLabel: label, restricted: Boolean(l.restriction) }]);
  }
  return map;
}

const HISTORY_WORDS: Record<string, string> = {
  created: "Created", sent: "Sent", opened: "Opened", revoked: "Revoked", reissued: "Reissued (new link made)",
  "phone-confirmed": "Phone confirmed with a one-time code", "code-sent": "One-time code sent", "code-wrong": "Wrong one-time code typed", "consent-given": "Consent given", "consent-withdrawn": "Consent withdrawn",
};

/** A link's history from the audit log: created, sent, each open with date, time and phone, revoked, reissued. */
export async function linkHistory(tx: Tx, ctx: SchoolContext, linkIds: string[], take = 200) {
  const rows = await tx.auditLogEntry.findMany({ where: { schoolId: ctx.schoolId, recordType: "Parent Link", recordId: { in: linkIds } }, orderBy: { at: "desc" }, take });
  const people = await tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.userLoginId).filter(Boolean) as string[] } }, select: { id: true, displayName: true } });
  return rows.map((r) => {
    const after = (r.after ?? {}) as Record<string, unknown>;
    const bits: string[] = [];
    if (typeof after.phone === "string") bits.push(after.phone);
    if (typeof after.channel === "string") bits.push(after.channel === "sms" ? "by SMS" : after.channel === "whatsapp" ? "by WhatsApp" : `by ${after.channel}`);
    if (typeof after.reason === "string") bits.push(`Reason: ${after.reason}`);
    return {
      id: r.id,
      at: r.at,
      what: HISTORY_WORDS[r.action] ?? r.action.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()),
      detail: bits.join(" · "),
      by: r.userLoginId ? people.find((p) => p.id === r.userLoginId)?.displayName ?? "Staff" : "Guardian",
      ip: r.ipAddress,
      messageId: typeof after.message === "string" ? after.message : null,
    };
  });
}

/** All links of a guardian, newest first, so history follows a reissued link. */
export async function guardianLinkIds(tx: Tx, ctx: SchoolContext, guardianId: string) {
  return (await tx.parentLink.findMany({ where: { schoolId: ctx.schoolId, guardianId }, select: { id: true }, orderBy: { createdAt: "desc" } })).map((l) => l.id);
}
