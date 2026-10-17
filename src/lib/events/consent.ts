// Parent consent for events (mod-events.jsx EventDetail "Parent consent",
// apps.jsx ConsentCard on Parent Link). An event with registration can ask
// the parents of its audience for consent on Parent Link, with a reply-by
// date. A "yes" is confirmed with a one-time code to the guardian's
// registered mobile and registers the child (the event fee is then added to
// the child's fees); "not this time" is recorded as declined and charges
// nothing. The office can record an answer a parent gave in person. Every
// answer is kept and written to the audit log.
import "server-only";

import type { Event } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notSentWords, sendMessage } from "../messaging";
import { childrenOf as guardianChildren } from "../parent-link/consent";
import { checkCode, ParentLinkProblem, sendCode } from "../parent-link/links";
import { EventsProblem } from "./problem";
import { eligible, registerStudents, withdrawStudent } from "./events";
import { dayOf, isoOf, longDay, dmy } from "./words";
import { formatRupees } from "../format";

export type ConsentAnswer = "GIVEN" | "DECLINED";

/** The audience's students (this year) for an event that asks for consent. */
export async function consentAudience(tx: Tx, e: Event) {
  const rows = await tx.enrolment.findMany({ where: { academicYearId: e.academicYearId, archivedAt: null, status: "STUDYING", ...(e.audienceKind === "classes" ? { classId: { in: e.classIds } } : {}) }, select: { studentId: true }, take: 5000 });
  return rows.map((r) => r.studentId);
}

/** Given, waiting and declined for one event. */
export async function consentCounts(tx: Tx, e: Event) {
  const audience = await consentAudience(tx, e);
  const answers = await tx.eventConsent.findMany({ where: { eventId: e.id } });
  const given = answers.filter((a) => a.answer === "GIVEN").length;
  const declined = answers.filter((a) => a.answer === "DECLINED").length;
  const answered = new Set(answers.map((a) => a.studentId));
  const waiting = audience.filter((s) => !answered.has(s));
  return { given, declined, waiting: waiting.length, waitingIds: waiting, total: audience.length, answers };
}

function assertAsks(e: Event | null, today: string): asserts e is Event {
  if (!e || e.archivedAt) throw new EventsProblem("This event was not found.");
  if (e.status === "CANCELLED") throw new EventsProblem("This event is cancelled.");
  if (!e.consentOn) throw new EventsProblem("This event does not ask for parent consent.");
  if (isoOf(e.date) < today) throw new EventsProblem("This event is over.");
}

/** Records one answer for one student: "yes" registers the student (with the fee), "no" withdraws them if registered. */
export async function recordConsent(tx: Tx, ctx: SchoolContext, input: { eventId: string; studentId: string; answer: ConsentAnswer; guardianId: string | null; how: "parent-link" | "office"; parentLinkId?: string | null }, today: string) {
  const e = await tx.event.findFirst({ where: { id: input.eventId } });
  assertAsks(e, today);
  if (input.answer === "GIVEN" && e.consentBy && isoOf(e.consentBy) < today) throw new EventsProblem(`The reply-by date, ${dmy(isoOf(e.consentBy))}, has passed. Please call the school.`);
  const ok = await eligible(tx, e, [input.studentId]);
  if (!ok.has(input.studentId)) throw new EventsProblem(`This student is not in ${e.audienceLabel}.`);
  const before = await tx.eventConsent.findUnique({ where: { eventId_studentId: { eventId: e.id, studentId: input.studentId } } });
  if (before?.answer === input.answer) return { event: e, answer: input.answer, changed: false };
  const data = { answer: input.answer, how: input.how, guardianId: input.guardianId, parentLinkId: input.parentLinkId ?? null, recordedById: ctx.userId, answeredAt: new Date() };
  const row = before
    ? await tx.eventConsent.update({ where: { id: before.id }, data })
    : await tx.eventConsent.create({ data: { schoolId: ctx.schoolId, eventId: e.id, studentId: input.studentId, ...data } });
  const reg = await tx.eventRegistration.findFirst({ where: { eventId: e.id, studentId: input.studentId, withdrawnAt: null } });
  if (input.answer === "GIVEN" && !reg) await registerStudents(tx, ctx, e.id, [input.studentId], today);
  if (input.answer === "DECLINED" && reg) await withdrawStudent(tx, ctx, e.id, input.studentId, today);
  await writeAudit(tx, ctx, { action: input.answer === "GIVEN" ? "consent-given" : "consent-declined", recordType: "Event Consent", recordId: row.id, before: before ? { answer: before.answer } : undefined, after: { event: e.name, answer: input.answer, how: input.how === "office" ? "Recorded by the office" : "Parent Link, confirmed by a one-time code" } });
  return { event: e, answer: input.answer, changed: true };
}

/** Reminds the parents who have not answered yet (until the reply-by date). */
export async function remindConsent(tx: Tx, ctx: SchoolContext, eventId: string, today: string) {
  const e = await tx.event.findFirst({ where: { id: eventId } });
  assertAsks(e, today);
  if (e.consentBy && isoOf(e.consentBy) < today) throw new EventsProblem("The reply-by date has passed, so reminders have stopped.");
  const c = await consentCounts(tx, e);
  if (!c.waitingIds.length) throw new EventsProblem("Nobody is waiting: every parent has answered.");
  const school = (await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { name: true } }))?.name ?? "School";
  const r = await sendMessage(tx, ctx, {
    to: { guardiansOf: c.waitingIds }, channels: "preferred",
    text: consentText(e, school),
    trigger: `Event consent reminder: ${e.name}`, source: { type: "Event", id: e.id }, audienceLabel: `${e.audienceLabel}, waiting for consent`,
  });
  await tx.eventReminder.create({ data: { schoolId: ctx.schoolId, eventId: e.id, kind: "reminder", people: r.people, messageId: r.messageId, sentById: ctx.userId, note: "Consent reminder to parents who have not answered" } });
  await writeAudit(tx, ctx, { action: "consent-reminded", recordType: "Event", recordId: e.id, after: { parents: r.people } });
  return { ...r, missed: notSentWords(r) };
}

export function consentText(e: Pick<Event, "name" | "date" | "feePaise" | "consentBy">, school: string) {
  return `Dear Parent, please give consent for your child to join the ${e.name} on ${longDay(isoOf(e.date)).replace(/ \d{4}$/, "")}${e.feePaise ? `, fee ${formatRupees(e.feePaise)},` : ""} on your Parent Link${e.consentBy ? ` by ${longDay(isoOf(e.consentBy)).replace(/ \d{4}$/, "")}` : ""}. - ${school}`;
}

/* ---------- On Parent Link (no login) ---------- */

export type EventConsentDetail = { kind: "event"; eventId: string; studentId: string };

/** Step 1 of a "yes": a one-time code to the registered mobile. */
export async function askEventConsentCode(tx: Tx, ctx: SchoolContext, linkId: string, guardianId: string, eventId: string, studentId: string, today: string) {
  const mine = await guardianChildren(tx, ctx, guardianId);
  if (!mine.includes(studentId)) throw new ParentLinkProblem("Choose your child.");
  const e = await tx.event.findFirst({ where: { id: eventId } });
  try { assertAsks(e, today); } catch (err) { throw new ParentLinkProblem((err as Error).message); }
  if (e.consentBy && isoOf(e.consentBy) < today) throw new ParentLinkProblem("The reply-by date has passed. Please call the school.");
  const detail: EventConsentDetail = { kind: "event", eventId, studentId };
  return sendCode(tx, ctx, linkId, "consent", { detail });
}

/** Step 2: the right code records the "yes" and registers the child. */
export async function confirmEventConsent(tx: Tx, ctx: SchoolContext, linkId: string, guardianId: string, typed: string, today: string) {
  const check = await checkCode(tx, ctx, linkId, "consent", typed, null);
  if (!check.ok) return check;
  const d = check.code.detail as Partial<EventConsentDetail>;
  if (d.kind !== "event" || !d.eventId || !d.studentId) return { ok: false as const, message: "This code was sent for another form. Tap “Give consent” again." };
  const mine = await guardianChildren(tx, ctx, guardianId);
  if (!mine.includes(d.studentId)) return { ok: false as const, message: "Choose your child." };
  try {
    const r = await recordConsent(tx, ctx, { eventId: d.eventId, studentId: d.studentId, answer: "GIVEN", guardianId, how: "parent-link", parentLinkId: linkId }, today);
    return { ok: true as const, event: r.event };
  } catch (err) {
    if (err instanceof EventsProblem) return { ok: false as const, message: err.message };
    throw err;
  }
}

/** "Not this time": recorded without a code (nothing is charged). */
export async function declineOnParentLink(tx: Tx, ctx: SchoolContext, linkId: string, guardianId: string, eventId: string, studentId: string, today: string) {
  const mine = await guardianChildren(tx, ctx, guardianId);
  if (!mine.includes(studentId)) throw new ParentLinkProblem("Choose your child.");
  try {
    return await recordConsent(tx, ctx, { eventId, studentId, answer: "DECLINED", guardianId, how: "parent-link", parentLinkId: linkId }, today);
  } catch (err) {
    if (err instanceof EventsProblem) throw new ParentLinkProblem(err.message);
    throw err;
  }
}

/** The events asking this child's parent for consent now (Parent Link). */
export async function consentForms(tx: Tx, studentId: string, classId: string | null, today: string) {
  const events = await tx.event.findMany({
    where: { archivedAt: null, status: { not: "CANCELLED" }, consentOn: true, date: { gte: dayOf(today) }, OR: [{ audienceKind: { in: ["school", "parents"] } }, ...(classId ? [{ audienceKind: "classes", classIds: { has: classId } }] : [])] },
    orderBy: { date: "asc" }, take: 5,
  });
  const answers = events.length ? await tx.eventConsent.findMany({ where: { studentId, eventId: { in: events.map((e) => e.id) } } }) : [];
  return events.map((e) => ({ e, answer: (answers.find((a) => a.eventId === e.id)?.answer ?? null) as ConsentAnswer | null }));
}
