// Messages from the library (13 §4, Notifications and 11 Communication):
// "your reserved book is ready", "due tomorrow" and overdue reminders. A
// student's parents get them through Communication, each on a channel that
// can carry it (WhatsApp, else SMS or email); staff get an app notification. The
// Principal's "Remind" tells the Librarian in the app.
import "server-only";

import type { BookCopy } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { notify } from "../notifications";
import { MessagingProblem, sendMessage } from "../messaging";
import { librarySettings } from "./settings";
import { membersOf, type Member } from "./members";
import { BASE } from "./words";

export type SendOutcome = { status: "sent" | "skipped"; how: string; note?: string };

/** One message to a member: their parents (students) or themselves in the app (staff). */
export async function messageMember(tx: Tx, ctx: SchoolContext, m: Member, text: string, opts: { trigger: string; key: string; source: { type: string; id: string } }): Promise<SendOutcome> {
  if (m.kind === "STAFF") {
    if (!m.userLoginId) return { status: "skipped", how: "app", note: `${m.name} has no School OS login` };
    await notify(tx, ctx, { to: m.userLoginId, type: "library", text, link: "/", groupKey: `library-${opts.trigger}`, mergedText: (n) => `${n} messages from the library` });
    return { status: "sent", how: "in the app" };
  }
  const base = { to: { guardiansOf: [m.studentId!] }, text, trigger: opts.trigger, source: opts.source, audienceLabel: `Parents of ${m.name}`, onNoCredits: "fail" as const };
  try {
    // Each parent on a channel that can carry it; when none can, it is kept as Not sent with the reason.
    const r = await sendMessage(tx, ctx, { ...base, channels: "preferred", idempotencyKey: `library:${opts.key}`, onNobody: "record" });
    if (r.queued > 0) return { status: "sent", how: "to the parents" };
    const why = r.skipped.find((g) => g.notSent)?.reason;
    return { status: "skipped", how: "message", note: why ?? "No parent with a phone number" };
  } catch (e) {
    if (e instanceof MessagingProblem) return { status: "skipped", how: "message", note: e.message.replace(/\.$/, "") };
    throw e;
  }
}

/** "Your reserved book is ready": sent when a returned copy is kept for the first member in the queue. */
export async function reservationReadyMessage(tx: Tx, ctx: SchoolContext, m: Member, copy: Pick<BookCopy, "id" | "accessionNo" | "bookId">, reservationId: string) {
  const book = await tx.book.findFirst({ where: { id: copy.bookId }, select: { title: true } });
  const text = m.kind === "STUDENT"
    ? `The library book ${m.firstName} reserved, “${book?.title ?? "the book"}”, is ready. Please ask ${m.firstName} to collect it from the library.`
    : `The library book you reserved, “${book?.title ?? "the book"}”, is ready at the desk.`;
  return messageMember(tx, ctx, m, text, { trigger: "Library: reserved book ready", key: `ready:${reservationId}`, source: { type: "Reservation", id: reservationId } });
}

/** One overdue (or due tomorrow) reminder for one issue, at most once a day. */
export async function remindIssue(tx: Tx, ctx: SchoolContext, issueId: string, today: Date, kind: "overdue" | "due-tomorrow" = "overdue"): Promise<SendOutcome & { member: Member | null }> {
  const issue = await tx.bookIssue.findFirst({ where: { id: issueId, returnedAt: null }, include: { copy: { include: { book: { select: { title: true } } } } } });
  if (!issue) return { status: "skipped", how: "message", note: "The book is already back", member: null };
  const s = await librarySettings(tx, ctx);
  const m = (await membersOf(tx, ctx, s, issue.studentId ? { studentIds: [issue.studentId] } : { staffIds: [issue.staffId!] })).values().next().value ?? null;
  if (!m) return { status: "skipped", how: "message", note: "Member not found", member: null };
  if (kind === "overdue" && issue.lastRemindedOn && issue.lastRemindedOn.getTime() === today.getTime()) return { status: "skipped", how: "message", note: "Already reminded today", member: m };
  const title = issue.copy.book.title;
  const due = formatDate(issue.dueOn, "UTC");
  const text = kind === "due-tomorrow"
    ? (m.kind === "STUDENT" ? `Reminder: ${m.firstName}'s library book “${title}” is due tomorrow (${due}).` : `Reminder: your library book “${title}” is due tomorrow (${due}).`)
    : (m.kind === "STUDENT" ? `${m.firstName}'s library book “${title}” was due on ${due}. Please send it back to the library. A late fine is added for each day.` : `Your library book “${title}” was due on ${due}. Please return it to the library.`);
  const r = await messageMember(tx, ctx, m, text, { trigger: kind === "due-tomorrow" ? "Library: due tomorrow" : "Library: overdue book", key: `${kind}:${issue.id}:${today.toISOString().slice(0, 10)}`, source: { type: "Book Issue", id: issue.id } });
  if (r.status === "sent" && kind === "overdue") {
    await tx.bookIssue.update({ where: { id: issue.id }, data: { lastRemindedOn: today } });
    await writeAudit(tx, ctx, { action: "reminded", recordType: "Book Issue", recordId: issue.id, after: { member: m.name, book: title, how: r.how } });
  }
  return { ...r, member: m };
}

/** Remind every overdue member not reminded today. */
export async function remindAllOverdue(tx: Tx, ctx: SchoolContext, today: Date) {
  const rows = await tx.bookIssue.findMany({ where: { returnedAt: null, dueOn: { lt: today }, OR: [{ lastRemindedOn: null }, { lastRemindedOn: { lt: today } }] }, select: { id: true }, orderBy: { dueOn: "asc" }, take: 500 });
  let sent = 0;
  let skipped = 0;
  for (const r of rows) {
    const out = await remindIssue(tx, ctx, r.id, today);
    if (out.status === "sent") sent++;
    else skipped++;
  }
  return { sent, skipped, total: rows.length };
}

/** Logins of the Librarians (and school-made roles that run the library desk). */
export async function librarianLogins(tx: Tx, ctx: SchoolContext) {
  const rows = await tx.schoolAccess.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, userLogin: { status: "ACTIVE", archivedAt: null }, roles: { some: { role: { key: "librarian", isEnabled: true, archivedAt: null } } } },
    select: { userLoginId: true },
  });
  return [...new Set(rows.map((r) => r.userLoginId))];
}

/** The Principal's (or School Admin's) "Remind": the Librarian is told in the app. */
export async function remindLibrarian(tx: Tx, ctx: SchoolContext, text: string, link = BASE) {
  const to = (await librarianLogins(tx, ctx)).filter((id) => id !== ctx.userId);
  for (const id of to) await notify(tx, ctx, { to: id, type: "library-remind", text, link, groupKey: "library-remind", mergedText: (n) => `${n} reminders about the library` });
  await writeAudit(tx, ctx, { action: "reminded-librarian", recordType: "Library", recordId: ctx.schoolId, after: { text, people: to.length } });
  return to.length;
}

/**
 * The daily library reminders (Library Settings, Reminders): due tomorrow,
 * then the day after the due date and weekly after that, for every school
 * with the library switched on.
 */
export async function dailyReminders(tx: Tx, ctx: SchoolContext, today: Date) {
  const s = await librarySettings(tx, ctx);
  let sent = 0;
  if (s.remindDueTomorrow) {
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const due = await tx.bookIssue.findMany({ where: { returnedAt: null, dueOn: tomorrow }, select: { id: true }, take: 1000 });
    for (const d of due) if ((await remindIssue(tx, ctx, d.id, today, "due-tomorrow")).status === "sent") sent++;
  }
  if (s.remindOverdue) {
    const late = await tx.bookIssue.findMany({ where: { returnedAt: null, dueOn: { lt: today } }, select: { id: true, dueOn: true, lastRemindedOn: true }, take: 1000 });
    for (const l of late) {
      const daysLate = Math.round((today.getTime() - l.dueOn.getTime()) / 86_400_000);
      const sinceLast = l.lastRemindedOn ? Math.round((today.getTime() - l.lastRemindedOn.getTime()) / 86_400_000) : null;
      if (daysLate === 1 || (sinceLast === null && daysLate >= 1) || (sinceLast !== null && sinceLast >= 7)) {
        if ((await remindIssue(tx, ctx, l.id, today)).status === "sent") sent++;
      }
    }
  }
  return sent;
}
