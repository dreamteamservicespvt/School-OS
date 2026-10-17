// Notice Board (11-communication.md, Notice Board): circulars and notices for
// chosen roles, classes or campuses, with approval when the school's rule
// says so, a publish time, an expiry date, read acknowledgement, and "Seen by"
// for parents (Parent Link opens and WhatsApp read receipts). A notice for
// one campus reaches only that campus everywhere: the message, Parent Link,
// the student's profile, the notice board and the seen count; a notice with
// no campus is for the whole school.
import "server-only";

import type { NoticePriority, NoticeStatus, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { enqueue } from "../jobs";
import { notify } from "../notifications";
import { requestApproval } from "../approvals";
import { currentYears } from "../academic/years";
import { OPEN_LINK } from "../students/guardian-access";
import { sectionLabel } from "../people";
import { sendMessage, MessagingProblem } from "../messaging/send";
import { channelSetups } from "../messaging/channels";
import { messageSettings } from "../messaging/settings";
import { ensureReadyTemplates, templateByKey } from "../messaging/templates";
import type { Scope } from "../messaging/recipients";

export const NOTICE_CHANNELS = [
  { key: "board", label: "Notice board" },
  { key: "app", label: "App notification" },
  { key: "parent-link", label: "Parent Link" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
] as const;
export type NoticeChannel = (typeof NOTICE_CHANNELS)[number]["key"];

export const STATUS_LABEL: Record<NoticeStatus, string> = {
  DRAFT: "Draft",
  WAITING_APPROVAL: "Waiting for approval",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  EXPIRED: "Expired",
  ARCHIVED: "Archived",
};
export const PRIORITY_LABEL: Record<NoticePriority, string> = { NORMAL: "Normal", HIGH: "High", CRITICAL: "Critical" };
/** The word typed to publish a Critical notice (inferred). */
export const CRITICAL_WORD = "CRITICAL";
/** Expires 30 days after publishing unless set (inferred). */
export const DEFAULT_EXPIRY_DAYS = 30;

export type NoticeAudience = { parents: boolean; students: boolean; staff: boolean; roleKeys: string[]; classIds: string[]; sectionIds: string[]; campusIds: string[] };

export function readAudience(v: unknown): NoticeAudience {
  const a = (v ?? {}) as Partial<NoticeAudience>;
  const arr = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []);
  return { parents: Boolean(a.parents), students: Boolean(a.students), staff: Boolean(a.staff), roleKeys: arr(a.roleKeys), classIds: arr(a.classIds), sectionIds: arr(a.sectionIds), campusIds: arr(a.campusIds) };
}

export class NoticeProblem extends Error {}

export async function describeNoticeAudience(tx: Tx, ctx: SchoolContext, a: NoticeAudience) {
  const who: string[] = [];
  if (a.parents) who.push("Parents");
  if (a.students) who.push("Students");
  let where = "";
  if (a.sectionIds.length || a.classIds.length) {
    const secs = a.sectionIds.length ? await tx.section.findMany({ where: { id: { in: a.sectionIds } }, select: { name: true, schoolClass: { select: { name: true, sortOrder: true } } } }) : [];
    const classes = a.classIds.length ? await tx.schoolClass.findMany({ where: { id: { in: a.classIds } }, select: { name: true, sortOrder: true }, orderBy: { sortOrder: "asc" } }) : [];
    where = [...classes.map((c) => c.name), ...secs.sort((x, y) => x.schoolClass.sortOrder - y.schoolClass.sortOrder || x.name.localeCompare(y.name)).map((s) => sectionLabel(s.schoolClass.name, s.name))].join(", ");
  }
  const parts: string[] = [];
  if (who.length) parts.push(`${who.join(" and ")} of ${where || "the whole school"}`);
  if (a.staff) {
    if (a.roleKeys.length) {
      const roles = await tx.role.findMany({ where: { schoolId: ctx.schoolId, key: { in: a.roleKeys } }, select: { name: true } });
      parts.push(`Staff: ${roles.map((r) => r.name).join(", ")}`);
    } else parts.push("All staff");
  }
  if (a.campusIds.length) {
    const campuses = await tx.campus.findMany({ where: { id: { in: a.campusIds } }, select: { name: true } });
    parts.push(`at ${campuses.map((c) => c.name).join(", ")}`);
  }
  return parts.join("; ") || "Nobody chosen";
}

/** This year of each campus in the audience (every campus when none is chosen). */
const audienceYearIds = async (tx: Tx, ctx: SchoolContext, a: NoticeAudience) => (await currentYears(tx, ctx, a.campusIds)).map((y) => y.id);

/** Sections the audience covers this year (null: the whole school). */
async function audienceSectionIds(tx: Tx, ctx: SchoolContext, a: NoticeAudience): Promise<string[] | null> {
  if (!a.sectionIds.length && !a.classIds.length && !a.campusIds.length) return null;
  const yearIds = await audienceYearIds(tx, ctx, a);
  if (!yearIds.length) return [];
  const rows = await tx.section.findMany({
    where: {
      schoolId: ctx.schoolId,
      academicYearId: { in: yearIds },
      archivedAt: null,
      ...(a.sectionIds.length || a.classIds.length ? { OR: [{ id: { in: a.sectionIds } }, { classId: { in: a.classIds } }] } : {}),
      ...(a.campusIds.length ? { schoolClass: { campusId: { in: a.campusIds } } } : {}),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Logins of the staff and students in the audience (for the board, app notification and read count). */
export async function audienceLogins(tx: Tx, ctx: SchoolContext, a: NoticeAudience): Promise<string[]> {
  const out = new Set<string>();
  if (a.staff) {
    let roleUsers: string[] | null = null;
    if (a.roleKeys.length) {
      const acc = await tx.schoolAccess.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, roles: { some: { role: { key: { in: a.roleKeys } } } } }, select: { userLoginId: true } });
      roleUsers = acc.map((x) => x.userLoginId);
    }
    const staff = await tx.staff.findMany({
      where: { schoolId: ctx.schoolId, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, userLoginId: roleUsers ? { in: roleUsers } : { not: null }, ...(a.campusIds.length ? { campusId: { in: a.campusIds } } : {}) },
      select: { userLoginId: true },
    });
    for (const s of staff) if (s.userLoginId) out.add(s.userLoginId);
  }
  if (a.students) {
    const sectionIds = await audienceSectionIds(tx, ctx, a);
    const yearIds = await audienceYearIds(tx, ctx, a);
    if (yearIds.length) {
      const rows = await tx.enrolment.findMany({ where: { schoolId: ctx.schoolId, academicYearId: { in: yearIds }, archivedAt: null, status: "STUDYING", ...(sectionIds ? { sectionId: { in: sectionIds } } : {}), student: { userLoginId: { not: null }, archivedAt: null } }, select: { student: { select: { userLoginId: true } } } });
      for (const r of rows) if (r.student.userLoginId) out.add(r.student.userLoginId);
    }
  }
  return [...out];
}

/** Every guardian (father and mother) of the students in the audience, but never through a link with a custody restriction. */
export async function audienceGuardianIds(tx: Tx, ctx: SchoolContext, a: NoticeAudience): Promise<string[]> {
  if (!a.parents) return [];
  const sectionIds = await audienceSectionIds(tx, ctx, a);
  const yearIds = await audienceYearIds(tx, ctx, a);
  if (!yearIds.length) return [];
  const enrolled = await tx.enrolment.findMany({ where: { schoolId: ctx.schoolId, academicYearId: { in: yearIds }, archivedAt: null, status: "STUDYING", ...(sectionIds ? { sectionId: { in: sectionIds } } : {}), student: { archivedAt: null } }, select: { studentId: true } });
  const links = await tx.studentGuardian.findMany({ where: { schoolId: ctx.schoolId, studentId: { in: enrolled.map((e) => e.studentId) }, ...OPEN_LINK, guardian: { archivedAt: null } }, select: { guardianId: true } });
  return [...new Set(links.map((l) => l.guardianId))];
}

export type NoticeInput = {
  title: string;
  body: string;
  attachmentFileIds: string[];
  audience: NoticeAudience;
  priority: NoticePriority;
  channels: NoticeChannel[];
  publishAt: Date | null;
  expiresOn: Date | null;
  askAck: boolean;
};

/** Checks a notice against the sender's scope: a teacher writes only to their own sections' parents and students. */
export function checkNoticeScope(input: NoticeInput, scope: Scope) {
  if (scope.sectionIds === "all") {
    if (input.audience.staff && !scope.staff) throw new NoticeProblem("Your role cannot send notices to staff. Ask the office.");
    return;
  }
  if (input.audience.staff) throw new NoticeProblem("Your role cannot send notices to staff. Ask the office.");
  if (input.audience.classIds.length) throw new NoticeProblem("Choose your own sections, not whole classes.");
  if (!input.audience.sectionIds.length) throw new NoticeProblem("Choose your own sections for this notice.");
  const allowed = new Set(scope.sectionIds);
  if (input.audience.sectionIds.some((id) => !allowed.has(id))) throw new NoticeProblem("You can send notices only to your own sections. Other classes are not offered.");
}

/** Does this notice need the principal's approval first? (Message Settings, from Forms & Approvals; inferred default: notices to parents.) */
export async function needsApproval(tx: Tx, ctx: SchoolContext, a: NoticeAudience, senderHasFullAccess: boolean) {
  if (senderHasFullAccess) return false;
  const { noticeApproval } = await messageSettings(tx, ctx);
  return noticeApproval === "all" || (noticeApproval === "parents" && a.parents);
}

export const PUBLISH_JOB = "notice:publish";

/** Saves a notice as a draft, sends it for approval, schedules it or publishes it now. */
export async function saveNotice(tx: Tx, ctx: SchoolContext, input: NoticeInput, opts: { id?: string | null; action: "draft" | "publish"; fullAccess: boolean; criticalConfirmed: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  if (input.priority === "CRITICAL" && opts.action === "publish" && !opts.criticalConfirmed) {
    throw new NoticeProblem(`Type ${CRITICAL_WORD} to pin this on every chosen parent's Parent Link.`);
  }
  if (!input.audience.parents && !input.audience.students && !input.audience.staff) throw new NoticeProblem("Choose who the notice is for: parents, students or staff.");
  const audienceLabel = await describeNoticeAudience(tx, ctx, input.audience);
  const channels = [...new Set<NoticeChannel>(["board", ...input.channels, ...(input.audience.parents ? (["parent-link"] as NoticeChannel[]) : [])])];
  const data = {
    title: input.title,
    body: input.body,
    attachmentFileIds: input.attachmentFileIds,
    audience: input.audience as unknown as Prisma.InputJsonValue,
    audienceLabel,
    priority: input.priority,
    channels,
    publishAt: input.publishAt,
    expiresOn: input.expiresOn,
    askAck: input.askAck,
    updatedById: ctx.userId,
  };
  let notice;
  if (opts.id) {
    const before = await tx.notice.findFirst({ where: { id: opts.id, schoolId: ctx.schoolId } });
    if (!before) throw new NoticeProblem("This notice was not found.");
    if (before.status !== "DRAFT") throw new NoticeProblem(`This notice is ${STATUS_LABEL[before.status].toLowerCase()}, so it cannot be changed. Archive it and make a new one.`);
    notice = await tx.notice.update({ where: { id: before.id }, data });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Notice", recordId: notice.id, before: { title: before.title, audience: before.audienceLabel, priority: before.priority }, after: { title: notice.title, audience: audienceLabel, priority: notice.priority } });
  } else {
    notice = await tx.notice.create({ data: { ...data, schoolId: ctx.schoolId, createdById: ctx.userId } });
    await writeAudit(tx, ctx, { action: "created", recordType: "Notice", recordId: notice.id, after: { title: notice.title, audience: audienceLabel, priority: notice.priority } });
  }
  if (opts.action === "draft") return { notice, outcome: "draft" as const };

  if (await needsApproval(tx, ctx, input.audience, opts.fullAccess)) {
    const approval = await requestApproval(tx, ctx, { type: "notice", recordType: "Notice", recordId: notice.id, summary: `Notice: ${notice.title} (${audienceLabel})` });
    notice = await tx.notice.update({ where: { id: notice.id }, data: { status: "WAITING_APPROVAL", approvalId: approval.id } });
    return { notice, outcome: "approval" as const };
  }
  return goLive(tx, ctx, notice.id, now);
}

/** Publishes now, or schedules for the publish time. */
export async function goLive(tx: Tx, ctx: SchoolContext, noticeId: string, now = new Date()) {
  const notice = await tx.notice.findUniqueOrThrow({ where: { id: noticeId } });
  if (notice.publishAt && notice.publishAt.getTime() > now.getTime() + 30_000) {
    const n = await tx.notice.update({ where: { id: notice.id }, data: { status: "SCHEDULED" } });
    await enqueue(tx, ctx, PUBLISH_JOB, `notice-publish:${n.id}:${n.publishAt!.getTime()}`, { noticeId: n.id }, n.publishAt!);
    await writeAudit(tx, ctx, { action: "scheduled", recordType: "Notice", recordId: n.id, after: { publishAt: n.publishAt!.toISOString() } });
    return { notice: n, outcome: "scheduled" as const };
  }
  const n = await publishNotice(tx, ctx, notice.id, now);
  return { notice: n, outcome: "published" as const };
}

/**
 * Publishing: on the board, an app notification to staff and students in the
 * audience, on the chosen parents' Parent Link, and by WhatsApp, SMS or email
 * to parents when chosen. Safe to run twice: only a Scheduled, Draft or
 * approved notice is published, once.
 */
export async function publishNotice(tx: Tx, ctx: SchoolContext, noticeId: string, now = new Date()) {
  const notice = await tx.notice.findUniqueOrThrow({ where: { id: noticeId } });
  if (notice.status === "PUBLISHED" || notice.status === "ARCHIVED" || notice.status === "EXPIRED") return notice;
  const audience = readAudience(notice.audience);
  const logins = await audienceLogins(tx, ctx, audience);
  const guardians = await audienceGuardianIds(tx, ctx, audience);
  const expiresOn = notice.expiresOn ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + DEFAULT_EXPIRY_DAYS));
  const changed = await tx.notice.updateMany({
    where: { id: notice.id, status: { in: ["DRAFT", "SCHEDULED", "WAITING_APPROVAL"] } },
    data: { status: "PUBLISHED", publishedAt: now, expiresOn, staffCount: logins.length, guardianCount: guardians.length },
  });
  if (changed.count === 0) return notice;

  if (notice.channels.includes("app")) {
    for (const to of logins) {
      await notify(tx, ctx, {
        to,
        type: "notice",
        text: `${notice.priority === "CRITICAL" ? "Critical notice: " : notice.priority === "HIGH" ? "Important notice: " : "New notice: "}${notice.title}`,
        link: `/communication/notices/${notice.id}`,
        groupKey: "notice",
        mergedText: (n) => `${n} new notices on the notice board`,
      });
    }
  }

  let messageId: string | null = null;
  const messageChannels = (["whatsapp", "sms", "email"] as const).filter((c) => notice.channels.includes(c));
  if (audience.parents && messageChannels.length) {
    await ensureReadyTemplates(tx, ctx);
    const setups = await channelSetups(tx, ctx);
    const usable = messageChannels.filter((c) => setups[c].isOn);
    const templates: Record<string, string> = {};
    for (const c of usable) {
      if (c === "email") continue;
      const t = await templateByKey(tx, ctx, "notice", c);
      if (t) templates[c] = t.id;
    }
    const channels = usable.filter((c) => c === "email" || templates[c]);
    if (channels.length) {
      try {
        const sent = await sendMessage(tx, ctx, {
          to: { kinds: ["parents"], classIds: audience.classIds, sectionIds: audience.sectionIds, campusIds: audience.campusIds },
          channels,
          templates,
          title: notice.title,
          text: `${notice.title}\n\n${notice.body}`.slice(0, 1000),
          values: { title: notice.title, message: notice.body.slice(0, 600) },
          trigger: `Notice: ${notice.title}`,
          source: { type: "Notice", id: notice.id },
          attachmentFileIds: notice.attachmentFileIds,
          onNoCredits: "fail",
          emergency: notice.priority === "CRITICAL",
          idempotencyKey: `notice:${notice.id}`,
          // Parents no channel can carry it to are kept as Not sent in Message History, not lost.
          onNobody: "record",
        });
        messageId = sent.messageId;
      } catch (e) {
        if (!(e instanceof MessagingProblem)) throw e;
        // The notice is still published on the board and Parent Link; the problem is logged for the office.
        await writeAudit(tx, ctx, { action: "notice-message-not-sent", recordType: "Notice", recordId: notice.id, after: { reason: e.message } });
      }
    }
  }
  const published = await tx.notice.update({ where: { id: notice.id }, data: { messageId } });
  await writeAudit(tx, ctx, { action: "published", recordType: "Notice", recordId: notice.id, before: { status: notice.status }, after: { status: "PUBLISHED", staff: logins.length, guardians: guardians.length, message: messageId } });
  return published;
}

/** Notices past their expiry date move to Expired by themselves (hourly). */
export async function expireNotices(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const today = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: school.timeZone }).format(now)}T00:00:00Z`);
  const due = await tx.notice.findMany({ where: { schoolId: ctx.schoolId, status: "PUBLISHED", expiresOn: { lt: today } }, select: { id: true } });
  if (!due.length) return 0;
  await tx.notice.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { status: "EXPIRED" } });
  for (const d of due) await writeAudit(tx, ctx, { action: "expired", recordType: "Notice", recordId: d.id, after: { status: "EXPIRED" } });
  return due.length;
}

export async function archiveNotice(tx: Tx, ctx: SchoolContext, noticeId: string) {
  const n = await tx.notice.findFirst({ where: { id: noticeId, schoolId: ctx.schoolId } });
  if (!n) throw new NoticeProblem("This notice was not found.");
  if (n.status === "ARCHIVED") throw new NoticeProblem("This notice is already archived.");
  if (n.status === "WAITING_APPROVAL") throw new NoticeProblem("This notice is waiting for approval. Withdraw the request in Approvals first.");
  await tx.notice.update({ where: { id: n.id }, data: { status: "ARCHIVED", archivedAt: new Date(), updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Notice", recordId: n.id, before: { status: n.status }, after: { status: "ARCHIVED" } });
  return n;
}

/** Brings back an archived notice as it was (Undo). */
export async function restoreNotice(tx: Tx, ctx: SchoolContext, noticeId: string, status: NoticeStatus) {
  const n = await tx.notice.findFirst({ where: { id: noticeId, schoolId: ctx.schoolId, status: "ARCHIVED" } });
  if (!n) return;
  await tx.notice.update({ where: { id: n.id }, data: { status, archivedAt: null } });
  await writeAudit(tx, ctx, { action: "restored", recordType: "Notice", recordId: n.id, before: { status: "ARCHIVED" }, after: { status } });
}

/** A staff member or student opened a notice (and may tap "I have read this"). */
export async function markRead(tx: Tx, ctx: SchoolContext, noticeId: string, acknowledge: boolean) {
  if (!ctx.userId) return;
  const now = new Date();
  await tx.noticeAcknowledgement.upsert({
    where: { noticeId_userLoginId: { noticeId, userLoginId: ctx.userId } },
    create: { schoolId: ctx.schoolId, noticeId, userLoginId: ctx.userId, readAt: now, acknowledgedAt: acknowledge ? now : null },
    update: acknowledge ? { acknowledgedAt: now } : {},
  });
  if (acknowledge) await writeAudit(tx, ctx, { action: "acknowledged", recordType: "Notice", recordId: noticeId });
}

/** A guardian saw a notice on Parent Link (first time only). */
export async function markSeenByGuardian(tx: Tx, ctx: SchoolContext, noticeId: string, guardianId: string) {
  await tx.noticeGuardianView.upsert({
    where: { noticeId_guardianId: { noticeId, guardianId } },
    create: { schoolId: ctx.schoolId, noticeId, guardianId, via: "parent-link" },
    update: {},
  });
}

/** Notices a person with a login sees on the board: Critical first, then High, then Normal. */
export async function boardFor(tx: Tx, ctx: SchoolContext, userLoginId: string, roleKeys: string[], opts: { all?: boolean } = {}) {
  const notices = await tx.notice.findMany({ where: { schoolId: ctx.schoolId, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 300 });
  const staff = await tx.staff.findFirst({ where: { schoolId: ctx.schoolId, userLoginId, archivedAt: null }, select: { campusId: true } });
  const student = await tx.student.findFirst({ where: { schoolId: ctx.schoolId, userLoginId, archivedAt: null }, select: { id: true, campusId: true } });
  let studentSection: { sectionId: string; classId: string; campusId: string } | null = null;
  if (student) {
    // The student's class this year, in their own campus's year.
    const years = await currentYears(tx, ctx);
    const enrolments = years.length ? await tx.enrolment.findMany({ where: { studentId: student.id, academicYearId: { in: years.map((y) => y.id) } }, select: { sectionId: true, classId: true, academicYearId: true } }) : [];
    const campusOf = (e: { academicYearId: string }) => years.find((y) => y.id === e.academicYearId)?.campusId ?? student.campusId;
    const e = enrolments.find((x) => campusOf(x) === student.campusId) ?? enrolments[0];
    studentSection = e ? { sectionId: e.sectionId, classId: e.classId, campusId: campusOf(e) } : null;
  }
  const rank: Record<NoticePriority, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2 };
  return notices
    .filter((n) => {
      if (opts.all) return true;
      const a = readAudience(n.audience);
      if (n.createdById === userLoginId) return true;
      if (a.staff && staff && (!a.roleKeys.length || a.roleKeys.some((k) => roleKeys.includes(k))) && (!a.campusIds.length || a.campusIds.includes(staff.campusId))) return true;
      if (a.students && studentSection && (!a.campusIds.length || a.campusIds.includes(studentSection.campusId)) && ((!a.sectionIds.length && !a.classIds.length) || a.sectionIds.includes(studentSection.sectionId) || a.classIds.includes(studentSection.classId))) return true;
      return false;
    })
    .sort((x, y) => rank[x.priority] - rank[y.priority] || (y.publishedAt?.getTime() ?? 0) - (x.publishedAt?.getTime() ?? 0));
}

/**
 * Notices for a guardian's children on Parent Link (and on a student's
 * profile), newest first; Critical ones separately for pinning. A notice for
 * some campuses is shown only for a child of one of them; within it, for the
 * child's class or section when the notice names some.
 */
export async function noticesForGuardian(tx: Tx, ctx: SchoolContext, children: { sectionId: string | null; classId: string | null; campusId: string | null }[]) {
  const notices = await tx.notice.findMany({ where: { schoolId: ctx.schoolId, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 200 });
  return notices.filter((n) => {
    const a = readAudience(n.audience);
    if (!a.parents || !n.channels.includes("parent-link")) return false;
    // The same child must be in the campus and in the class or section.
    return children.some((c) => {
      if (a.campusIds.length && !(c.campusId && a.campusIds.includes(c.campusId))) return false;
      if (!a.sectionIds.length && !a.classIds.length) return true;
      return Boolean((c.sectionId && a.sectionIds.includes(c.sectionId)) || (c.classId && a.classIds.includes(c.classId)));
    });
  });
}

/** Guardians in a notice's audience who have not seen it (Parent Link or WhatsApp read). */
export async function unseenGuardianIds(tx: Tx, ctx: SchoolContext, noticeId: string) {
  const n = await tx.notice.findFirstOrThrow({ where: { id: noticeId, schoolId: ctx.schoolId } });
  const all = await audienceGuardianIds(tx, ctx, readAudience(n.audience));
  const seen = new Set((await tx.noticeGuardianView.findMany({ where: { noticeId }, select: { guardianId: true } })).map((v) => v.guardianId));
  return { notice: n, ids: all.filter((g) => !seen.has(g)) };
}

/** Resend to parents who have not seen it, by the same or another channel (decided 9 October 2026). */
export async function noticeResendInput(tx: Tx, ctx: SchoolContext, noticeId: string, channel: "whatsapp" | "sms" | "email"): Promise<import("../messaging/send").SendInput> {
  const { notice, ids } = await unseenGuardianIds(tx, ctx, noticeId);
  if (notice.status !== "PUBLISHED") throw new NoticeProblem("Only a published notice can be sent again.");
  if (!ids.length) throw new NoticeProblem("Every parent has seen this notice. There is nothing to resend.");
  await ensureReadyTemplates(tx, ctx);
  const t = channel === "email" ? null : await templateByKey(tx, ctx, "notice", channel);
  if (channel !== "email" && !t) throw new NoticeProblem(`There is no ${channel === "sms" ? "SMS" : "WhatsApp"} notice template. Add one in Message Templates.`);
  return {
    to: { guardianIds: ids },
    channels: [channel],
    templates: t ? { [channel]: t.id } : undefined,
    title: notice.title,
    text: `${notice.title}\n\n${notice.body}`.slice(0, 1000),
    values: { title: notice.title, message: notice.body.slice(0, 600) },
    trigger: `Notice resent to parents who have not seen it: ${notice.title}`,
    source: { type: "Notice", id: notice.id },
    emergency: notice.priority === "CRITICAL",
    audienceLabel: `Parents who have not seen "${notice.title}"`,
  };
}

/** Remind staff and students who have not tapped "I have read this" (inferred). */
export async function remindUnacknowledged(tx: Tx, ctx: SchoolContext, noticeId: string) {
  const n = await tx.notice.findFirstOrThrow({ where: { id: noticeId, schoolId: ctx.schoolId } });
  if (!n.askAck || n.status !== "PUBLISHED") throw new NoticeProblem("This notice does not ask for acknowledgement.");
  const logins = await audienceLogins(tx, ctx, readAudience(n.audience));
  const done = new Set((await tx.noticeAcknowledgement.findMany({ where: { noticeId, acknowledgedAt: { not: null } }, select: { userLoginId: true } })).map((a) => a.userLoginId));
  const todo = logins.filter((l) => !done.has(l));
  if (!todo.length) throw new NoticeProblem("Everyone has acknowledged this notice.");
  for (const to of todo) await notify(tx, ctx, { to, type: "notice", text: `Reminder: please read and acknowledge "${n.title}"`, link: `/communication/notices/${n.id}` });
  await writeAudit(tx, ctx, { action: "reminded", recordType: "Notice", recordId: n.id, after: { people: todo.length } });
  return todo.length;
}
