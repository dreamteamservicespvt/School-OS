// Events (18 §2): plan an event with date, venue and audience; it shows on
// the School Calendar. Optional parts: registration with a seat limit,
// attendance, seating, a fee (one Student Fee Due per student per event,
// collected through Fee Management), volunteers and reminders. Cancelling
// tells the audience, removes unpaid fee rows and asks for refunds of paid
// ones through Fee Management (Approvals decides them).
import "server-only";

import type { Event, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { nextNumber } from "../sequences";
import { assertYearOpen } from "../academic/years";
import { addCharge, removeDue } from "../fees/structure";
import { refundable, requestRefund } from "../fees/refunds";
import { ensureFeeDefaults } from "../fees/settings";
import { MessagingProblem, notSentWords, sendMessage, type AudienceRule } from "../messaging";
import { EventsProblem, EventsWarning } from "./problem";
import { eventsSettings } from "./settings";
import { syncSourceEntry } from "./calendar";
import { tellSafely } from "./tell";
import { placeOrder, placesOf } from "./places";
import { AUDIENCE_KINDS, REMINDERS, classesWords, clock, dayOf, dmy, isoOf, longDay, timeSpan } from "./words";

const ZERO = BigInt(0);

/** Planned, Open for registration, Done (a past date) or Cancelled. */
export function eventStatus(e: Pick<Event, "status" | "date">, today: string): "PLANNED" | "OPEN" | "DONE" | "CANCELLED" {
  if (e.status === "CANCELLED") return "CANCELLED";
  if (isoOf(e.date) < today) return "DONE";
  return e.status === "OPEN" ? "OPEN" : "PLANNED";
}

export type EventInput = {
  name: string;
  type: string;
  date: string;
  startMin: number;
  endMin: number | null;
  venue: string | null;
  audienceKind: string;
  classIds: string[];
  registrationOn: boolean;
  seats: number | null;
  feePaise: bigint | null;
  reminder: string;
  description: string | null;
  /** Ask the parents for consent on Parent Link (a "yes" registers the child). */
  consentOn?: boolean;
  consentBy?: string | null;
  /**
   * One campus only (a school with more than one campus); null for every
   * campus. Left out, a new event is for every campus and a changed one keeps its campus.
   */
  campusId?: string | null;
};

async function classNames(tx: Tx, classIds: string[]) {
  if (!classIds.length) return [];
  const rows = await tx.schoolClass.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true, sortOrder: true }, orderBy: { sortOrder: "asc" } });
  return rows;
}

export async function audienceLabel(tx: Tx, kind: string, classIds: string[], campusName?: string | null) {
  if (kind === "classes") return classesWords((await classNames(tx, classIds)).map((c) => c.name));
  const label = AUDIENCE_KINDS.find((a) => a.value === kind)?.label ?? "Whole school";
  // One campus's event: "North Campus", "Parents, North Campus".
  if (campusName) return kind === "school" ? campusName : `${label}, ${campusName}`;
  return label;
}

/**
 * The academic years an event's students come from: its campus's year, or,
 * for an event of every campus, the year of each campus on the event's date
 * (a school with two campuses has two current years).
 */
export async function eventYearIds(tx: Tx, e: Pick<Event, "academicYearId" | "campusId" | "date">) {
  if (e.campusId) return [e.academicYearId];
  const years = await tx.academicYear.findMany({ where: { archivedAt: null, startDate: { lte: e.date }, endDate: { gte: e.date } }, select: { id: true } });
  return [...new Set([e.academicYearId, ...years.map((y) => y.id)])];
}

/** The fee head event fees are collected under (made the first time an event has a fee). */
async function eventFeeHead(tx: Tx, ctx: SchoolContext) {
  await ensureFeeDefaults(tx, ctx);
  const found = await tx.feeHead.findFirst({ where: { archivedAt: null, OR: [{ systemKey: "event-fees" }, { name: { equals: "Event fees", mode: "insensitive" } }] } });
  if (found) return found;
  return tx.feeHead.create({ data: { schoolId: ctx.schoolId, name: "Event fees", kind: "activity", systemKey: "event-fees", lateFeeApplies: false, createdById: ctx.userId } });
}

async function checkInput(tx: Tx, ctx: SchoolContext, input: EventInput, opts: { confirm?: boolean; ignoreId?: string; campusBefore?: string | null }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new EventsProblem("Give the event a name.", "name");
  if (name.length > 80) throw new EventsProblem("The name can be at most 80 characters.", "name");
  const s = await eventsSettings(tx, ctx);
  if (!input.type || input.type.length > 40) throw new EventsProblem("Choose the type.", "type");
  if (input.endMin != null && input.endMin <= input.startMin) throw new EventsProblem("The end time is before the start time.", "endTime");
  if (!AUDIENCE_KINDS.some((a) => a.value === input.audienceKind)) throw new EventsProblem("Choose the audience.", "audienceKind");
  if (input.audienceKind === "classes" && !input.classIds.length) throw new EventsProblem("Choose the classes.", "classIds");
  if (input.seats != null && (input.seats < 1 || input.seats > 100_000)) throw new EventsProblem("Seats is a number from 1 up.", "seats");
  if (input.feePaise != null && input.feePaise < ZERO) throw new EventsProblem("Enter the fee in rupees, like 1200.", "fee");
  if (input.feePaise != null && input.feePaise > ZERO && !input.registrationOn) throw new EventsProblem("A fee is charged to students who register. Switch registration on, or leave the fee empty.", "fee");
  if (!REMINDERS.some((r) => r.value === input.reminder)) throw new EventsProblem("Choose when the reminder goes.", "reminder");
  if (input.consentOn) {
    if (!input.registrationOn) throw new EventsProblem("Parent consent registers the child who gets a yes. Switch registration on too.", "consentOn");
    if (!["school", "classes"].includes(input.audienceKind)) throw new EventsProblem("Parent consent is asked for students: choose the whole school or some classes as the audience.", "audienceKind");
    if (input.consentBy && input.consentBy > input.date) throw new EventsProblem("The reply-by date is after the event. Pick a date before it.", "consentBy");
  }
  // One campus's event uses that campus's year and classes; an event of every campus reaches each campus (Parent Link, messages).
  const campusId = input.campusId === undefined ? opts.campusBefore ?? null : input.campusId;
  const campus = campusId ? await tx.campus.findFirst({ where: { id: campusId, archivedAt: null }, select: { id: true, name: true } }) : null;
  if (campusId && !campus) throw new EventsProblem("Choose the campus.", "campusId");
  if (campus && input.audienceKind === "classes") {
    const away = await tx.schoolClass.findMany({ where: { id: { in: input.classIds }, campusId: { not: campus.id } }, select: { name: true } });
    if (away.length) throw new EventsProblem(`${away.map((c) => c.name).join(", ")} ${away.length === 1 ? "is" : "are"} at another campus. Choose classes of ${campus.name}, or All campuses.`, "classIds");
  }
  const year = await tx.academicYear.findFirst({ where: { archivedAt: null, ...(campus ? { campusId: campus.id } : {}), startDate: { lte: dayOf(input.date) }, endDate: { gte: dayOf(input.date) } } });
  if (!year) throw new EventsProblem(campus ? `Pick a date inside the school year of ${campus.name}.` : "Pick a date inside the school year.", "date");
  await assertYearOpen(tx, year.id);
  // Two events in one venue at once: a warning (18 §5).
  if (input.venue && !opts.confirm) {
    const same = await tx.event.findMany({ where: { archivedAt: null, status: { not: "CANCELLED" }, date: dayOf(input.date), venue: input.venue, ...(opts.ignoreId ? { id: { not: opts.ignoreId } } : {}) } });
    const end = input.endMin ?? input.startMin + 60;
    const clash = same.find((o) => o.startMin < end && (o.endMin ?? o.startMin + 60) > input.startMin);
    if (clash) throw new EventsWarning(`${input.venue} is booked for the ${clash.name} on ${dmy(input.date)}, ${timeSpan(clash.startMin, clash.endMin)}. Change the venue or time, or save anyway.`, "venue-clash", "venue");
  }
  return { name, year, settings: s, campusId: campus?.id ?? null, campusName: campus?.name ?? null };
}

async function calendarFor(tx: Tx, ctx: SchoolContext, e: Event) {
  if (e.status === "CANCELLED" || e.archivedAt) return syncSourceEntry(tx, ctx, `event:${e.id}`, null);
  return syncSourceEntry(tx, ctx, `event:${e.id}`, {
    academicYearId: e.academicYearId, campusId: e.campusId, type: "event", title: e.name, date: isoOf(e.date),
    classIds: e.audienceKind === "classes" ? e.classIds : [], details: e.description,
  });
}

export async function createEvent(tx: Tx, ctx: SchoolContext, input: EventInput, opts: { confirm?: boolean } = {}) {
  const { name, year, campusId, campusName } = await checkInput(tx, ctx, input, opts);
  const n = await nextNumber(tx, ctx, `event-${year.startDate.getUTCFullYear()}`);
  const number = `EV-${String(year.startDate.getUTCFullYear()).slice(2)}-${String(n).padStart(3, "0")}`;
  const fee = input.feePaise && input.feePaise > ZERO ? input.feePaise : null;
  const head = fee ? await eventFeeHead(tx, ctx) : null;
  const e = await tx.event.create({
    data: {
      schoolId: ctx.schoolId, academicYearId: year.id, campusId, number, name, type: input.type, date: dayOf(input.date), startMin: input.startMin, endMin: input.endMin,
      venue: input.venue, audienceKind: input.audienceKind, classIds: input.audienceKind === "classes" ? input.classIds : [],
      audienceLabel: await audienceLabel(tx, input.audienceKind, input.classIds, campusName), registrationOn: input.registrationOn, seats: input.registrationOn ? input.seats : null,
      consentOn: Boolean(input.consentOn), consentBy: input.consentOn && input.consentBy ? dayOf(input.consentBy) : null,
      feePaise: fee, feeHeadId: head?.id ?? null, reminder: input.reminder, status: input.registrationOn ? "OPEN" : "PLANNED", description: input.description, createdById: ctx.userId,
    },
  });
  const entry = await calendarFor(tx, ctx, e);
  await tx.event.update({ where: { id: e.id }, data: { calendarEntryId: entry?.id ?? null } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Event", recordId: e.id, after: { number, name, type: input.type, date: dmy(input.date), venue: input.venue, audience: e.audienceLabel, fee: fee ? formatRupees(fee) : null } });
  return e;
}

export async function updateEvent(tx: Tx, ctx: SchoolContext, eventId: string, input: EventInput, opts: { confirm?: boolean; today: string }) {
  const before = await tx.event.findFirst({ where: { id: eventId, archivedAt: null } });
  if (!before) throw new EventsProblem("This event was not found.");
  if (before.status === "CANCELLED") throw new EventsProblem("This event is cancelled. Create a new event instead.");
  const { name, year, campusId, campusName } = await checkInput(tx, ctx, input, { confirm: opts.confirm, ignoreId: eventId, campusBefore: before.campusId });
  const fee = input.feePaise && input.feePaise > ZERO ? input.feePaise : null;
  const charged = await tx.eventRegistration.count({ where: { eventId, withdrawnAt: null, dueId: { not: null } } });
  if (charged && (fee ?? ZERO) !== (before.feePaise ?? ZERO)) throw new EventsProblem(`${charged} students already have the fee on their fees. The fee cannot change now.`, "fee");
  const active = await tx.eventRegistration.count({ where: { eventId, withdrawnAt: null } });
  if (!input.registrationOn && active) throw new EventsProblem(`${active} students are registered. Withdraw them first to switch registration off.`, "registrationOn");
  if (input.seats != null && active > input.seats) throw new EventsProblem(`${active} students are registered already. Seats cannot be fewer than that.`, "seats");
  const movedCampus = campusId !== before.campusId;
  if (movedCampus && active) throw new EventsProblem(`${active} students are registered. Withdraw them first to change the campus.`, "campusId");
  const head = fee && !before.feeHeadId ? await eventFeeHead(tx, ctx) : null;
  const e = await tx.event.update({
    where: { id: eventId },
    data: {
      name, type: input.type, date: dayOf(input.date), startMin: input.startMin, endMin: input.endMin, venue: input.venue, audienceKind: input.audienceKind,
      ...(movedCampus ? { campusId, academicYearId: year.id } : {}),
      classIds: input.audienceKind === "classes" ? input.classIds : [], audienceLabel: await audienceLabel(tx, input.audienceKind, input.classIds, campusName),
      registrationOn: input.registrationOn, seats: input.registrationOn ? input.seats : null, feePaise: fee, feeHeadId: before.feeHeadId ?? head?.id ?? null,
      consentOn: Boolean(input.consentOn), consentBy: input.consentOn && input.consentBy ? dayOf(input.consentBy) : null,
      reminder: input.reminder, status: input.registrationOn ? "OPEN" : "PLANNED", description: input.description, updatedById: ctx.userId,
      reminderSentAt: isoOf(before.date) !== input.date || before.reminder !== input.reminder ? null : before.reminderSentAt,
    },
  });
  await calendarFor(tx, ctx, e);
  await writeAudit(tx, ctx, {
    action: "changed", recordType: "Event", recordId: e.id,
    before: { name: before.name, date: dmy(isoOf(before.date)), time: clock(before.startMin), venue: before.venue, audience: before.audienceLabel },
    after: { name: e.name, date: dmy(input.date), time: clock(e.startMin), venue: e.venue, audience: e.audienceLabel },
  });
  const moved = isoOf(before.date) !== input.date || before.startMin !== input.startMin || before.venue !== input.venue;
  return { event: e, moved };
}

/* ---------- Audience and messages ---------- */

/** Who an event's messages go to: the registered students' guardians, or the audience. */
export async function audienceRule(tx: Tx, e: Event): Promise<AudienceRule> {
  if (e.registrationOn) {
    const regs = await tx.eventRegistration.findMany({ where: { eventId: e.id, withdrawnAt: null }, select: { studentId: true } });
    return { guardiansOf: regs.map((r) => r.studentId) };
  }
  // One campus's event reaches that campus only, as a notice for one campus does.
  const campusIds = e.campusId ? [e.campusId] : undefined;
  if (e.audienceKind === "classes") return { kinds: ["parents"], classIds: e.classIds, campusIds };
  if (e.audienceKind === "staff") return { kinds: ["staff"], campusIds };
  if (e.audienceKind === "alumni") {
    const alumni = await tx.student.findMany({ where: { archivedAt: null, status: { in: ["ALUMNI", "GRADUATED"] } }, select: { id: true }, take: 5000 });
    return { guardiansOf: alumni.map((a) => a.id) };
  }
  return { kinds: ["parents"], campusIds };
}

async function schoolName(tx: Tx, ctx: SchoolContext) {
  return (await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { name: true } }))?.name ?? "School";
}

/** Sends the audience a message about the event (reminder, change or cancellation) and logs it on the event. */
export async function messageAudience(tx: Tx, ctx: SchoolContext, e: Event, kind: "reminder" | "changed" | "cancelled", opts: { auto?: boolean } = {}) {
  const school = await schoolName(tx, ctx);
  const when = `${longDay(isoOf(e.date)).replace(/ \d{4}$/, "")}, ${timeSpan(e.startMin, e.endMin)}${e.venue ? `, ${e.venue}` : ""}`;
  const text = kind === "cancelled"
    ? `Dear Parent, the ${e.name} on ${longDay(isoOf(e.date)).replace(/ \d{4}$/, "")} is cancelled. ${e.cancelReason ?? ""}${e.feePaise ? " Paid fees will be refunded." : ""} - ${school}`
    : kind === "changed"
      ? `Dear Parent, the ${e.name} has changed: now on ${when}. - ${school}`
      : `Dear Parent, a reminder: ${e.name} on ${when}.${e.feePaise ? ` Fee ${formatRupees(e.feePaise)}, see your Parent Link.` : ""} - ${school}`;
  const to = await audienceRule(tx, e);
  if (to.guardiansOf && to.guardiansOf.length === 0) throw new EventsProblem("Nobody is registered yet, so there is no one to send this to.");
  const r = await sendMessage(tx, ctx, {
    to, channels: "preferred", text: text.replace(/\s+/g, " ").trim(), title: kind === "cancelled" ? `${e.name} cancelled` : e.name, trigger: kind === "reminder" ? `Event reminder: ${e.name}` : kind === "changed" ? `Event changed: ${e.name}` : `Event cancelled: ${e.name}`,
    source: { type: "Event", id: e.id }, audienceLabel: e.audienceLabel,
    idempotencyKey: opts.auto ? `event-reminder:${e.id}:${isoOf(e.date)}` : null,
    onNoCredits: opts.auto ? "fail" : "block",
    // The schedule has nobody to tell: when no channel can carry it, it is kept as Not sent (Message History, Dashboard).
    onNobody: opts.auto ? "record" : "block",
  });
  const missed = notSentWords(r);
  await tx.eventReminder.create({
    data: { schoolId: ctx.schoolId, eventId: e.id, kind, people: r.people, messageId: r.messageId, sentById: opts.auto ? null : ctx.userId, note: `${opts.auto ? "Automatic reminder" : kind === "reminder" ? "Reminder" : kind === "changed" ? "Change sent to the audience" : "Cancellation sent to the audience"}${missed ? `. ${missed}` : ""}`.slice(0, 500) },
  });
  if (kind === "reminder") await tx.event.update({ where: { id: e.id }, data: { reminderSentAt: new Date() } });
  await writeAudit(tx, ctx, { action: `message-${kind}`, recordType: "Event", recordId: e.id, after: { people: r.people, auto: Boolean(opts.auto) } });
  return { ...r, missed };
}

/* ---------- Registration and fees ---------- */

async function loadOpen(tx: Tx, eventId: string, today: string) {
  const e = await tx.event.findFirst({ where: { id: eventId, archivedAt: null } });
  if (!e) throw new EventsProblem("This event was not found.");
  if (e.status === "CANCELLED") throw new EventsProblem("This event is cancelled.");
  if (isoOf(e.date) < today) throw new EventsProblem("This event is over. Registrations are closed.");
  if (!e.registrationOn) throw new EventsProblem("Registration is off for this event. Everyone in the audience takes part.");
  return e;
}

/** Students who may register: the audience's classes this year (or alumni for an alumni event). */
export async function eligible(tx: Tx, e: Event, studentIds: string[]) {
  if (e.audienceKind === "alumni") {
    const rows = await tx.student.findMany({ where: { id: { in: studentIds }, archivedAt: null, status: { in: ["ALUMNI", "GRADUATED"] } }, select: { id: true } });
    return new Set(rows.map((r) => r.id));
  }
  const rows = await tx.enrolment.findMany({
    where: { studentId: { in: studentIds }, academicYearId: { in: await eventYearIds(tx, e) }, archivedAt: null, status: "STUDYING", ...(e.audienceKind === "classes" ? { classId: { in: e.classIds } } : {}) },
    select: { studentId: true },
  });
  return new Set(rows.map((r) => r.studentId));
}

/** Registers students (staff record it). With a fee, one fee row per student per event is added to their fees. */
export async function registerStudents(tx: Tx, ctx: SchoolContext, eventId: string, studentIds: string[], today: string) {
  const e = await loadOpen(tx, eventId, today);
  const wanted = [...new Set(studentIds)];
  if (!wanted.length) throw new EventsProblem("Choose the students to register.", "studentIds");
  const ok = await eligible(tx, e, wanted);
  const outside = wanted.filter((s) => !ok.has(s));
  if (outside.length === wanted.length) throw new EventsProblem(e.audienceKind === "alumni" ? "These students are not alumni of the school." : `These students are not in ${e.audienceLabel}.`, "studentIds");
  const existing = await tx.eventRegistration.findMany({ where: { eventId, studentId: { in: wanted } } });
  const active = await tx.eventRegistration.count({ where: { eventId, withdrawnAt: null } });
  const toAdd = wanted.filter((s) => ok.has(s) && !existing.some((x) => x.studentId === s && !x.withdrawnAt));
  if (e.seats != null && active + toAdd.length > e.seats) {
    const left = Math.max(0, e.seats - active);
    throw new EventsProblem(left ? `Only ${left} ${left === 1 ? "seat is" : "seats are"} left. Choose ${left} or fewer students.` : "All seats are taken.", "studentIds");
  }
  let added = 0;
  let charged = ZERO;
  for (const studentId of toAdd) {
    let dueId: string | null = null;
    if (e.feePaise && e.feePaise > ZERO && e.feeHeadId) {
      const due = await addCharge(tx, ctx, { studentId, feeHeadId: e.feeHeadId, amountPaise: e.feePaise, dueDate: e.date, label: e.name, reason: `Event fee ${e.number}`, academicYearId: e.academicYearId });
      dueId = due.id;
      charged += e.feePaise;
    }
    const prev = existing.find((x) => x.studentId === studentId);
    if (prev) await tx.eventRegistration.update({ where: { id: prev.id }, data: { withdrawnAt: null, withdrawnById: null, dueId, attended: null, seat: null, registeredById: ctx.userId } });
    else await tx.eventRegistration.create({ data: { schoolId: ctx.schoolId, eventId, studentId, dueId, registeredById: ctx.userId } });
    added++;
  }
  await writeAudit(tx, ctx, { action: "registered", recordType: "Event", recordId: e.id, after: { students: added, fees: charged > ZERO ? formatRupees(charged) : null, skipped: outside.length } });
  return { added, skipped: outside.length + (wanted.length - outside.length - toAdd.length), charged, event: e };
}

/** Takes one fee row back: removed when unpaid, a refund asked for (through Approvals) when paid. */
async function takeBackFee(tx: Tx, ctx: SchoolContext, e: Event, dueId: string, why: string) {
  const due = await tx.studentFeeDue.findFirst({ where: { id: dueId } });
  if (!due || due.state === "REMOVED") return { removed: false, refunds: 0 };
  if (due.paidPaise === ZERO) {
    await removeDue(tx, ctx, due.id, `${why} [${e.number}]`);
    return { removed: true, refunds: 0 };
  }
  const allocations = await tx.paymentAllocation.findMany({ where: { dueId: due.id, fromAdvance: false }, include: { payment: true } });
  let refunds = 0;
  for (const a of allocations) {
    if (a.payment.status !== "POSTED" || a.payment.broughtIn) continue;
    const max = await refundable(tx, a.paymentId);
    const amount = a.amountPaise < max ? a.amountPaise : max;
    if (amount <= ZERO) continue;
    const mode = ["CASH", "BANK_TRANSFER", "CHEQUE", "UPI"].includes(a.payment.mode) ? a.payment.mode : "BANK_TRANSFER";
    await requestRefund(tx, ctx, { paymentId: a.paymentId, amountPaise: amount, reason: `${why} [${e.number}]`, mode });
    refunds++;
  }
  return { removed: false, refunds };
}

export async function withdrawStudent(tx: Tx, ctx: SchoolContext, eventId: string, studentId: string, today: string) {
  const e = await loadOpen(tx, eventId, today);
  const reg = await tx.eventRegistration.findFirst({ where: { eventId, studentId, withdrawnAt: null } });
  if (!reg) throw new EventsProblem("This student is not registered.");
  const fee = reg.dueId ? await takeBackFee(tx, ctx, e, reg.dueId, `Withdrawn from ${e.name}`) : { removed: false, refunds: 0 };
  await tx.eventRegistration.update({ where: { id: reg.id }, data: { withdrawnAt: new Date(), withdrawnById: ctx.userId, seat: null } });
  const student = await tx.student.findFirst({ where: { id: studentId }, select: { fullName: true } });
  await writeAudit(tx, ctx, { action: "withdrawn", recordType: "Event Registration", recordId: reg.id, after: { student: student?.fullName, feeRemoved: fee.removed, refundsAsked: fee.refunds } });
  return { name: student?.fullName ?? "Student", ...fee };
}

/** Cancels an event: the audience is told, unpaid fee rows go, paid fees are refunded through Fee Management. */
export async function cancelEvent(tx: Tx, ctx: SchoolContext, eventId: string, reason: string, tell: boolean, today: string) {
  const e = await tx.event.findFirst({ where: { id: eventId, archivedAt: null } });
  if (!e) throw new EventsProblem("This event was not found.");
  if (e.status === "CANCELLED") throw new EventsProblem("This event is already cancelled.");
  if (isoOf(e.date) < today) throw new EventsProblem("This event is over and cannot be cancelled.");
  const why = reason.trim().replace(/\s+/g, " ");
  if (why.length < 5) throw new EventsProblem("Say why, in a few words. Parents see it.", "reason");
  const regs = await tx.eventRegistration.findMany({ where: { eventId, withdrawnAt: null, dueId: { not: null } } });
  let removed = 0;
  let refunds = 0;
  for (const r of regs) {
    const t = await takeBackFee(tx, ctx, e, r.dueId!, `Event cancelled: ${e.name}`);
    if (t.removed) removed++;
    refunds += t.refunds;
  }
  const updated = await tx.event.update({ where: { id: e.id }, data: { status: "CANCELLED", cancelReason: why, cancelledAt: new Date(), updatedById: ctx.userId } });
  await calendarFor(tx, ctx, updated);
  await writeAudit(tx, ctx, { action: "cancelled", recordType: "Event", recordId: e.id, before: { status: e.status }, after: { status: "CANCELLED", reason: why, feeRowsRemoved: removed, refundsAsked: refunds } });
  // Telling the audience never blocks the cancellation (ACADEMICS-21).
  const told = tell ? await tellSafely(() => messageAudience(tx, ctx, updated, "cancelled")) : null;
  return { event: updated, removed, refunds, told };
}

/* ---------- On the day ---------- */

export async function markAttendance(tx: Tx, ctx: SchoolContext, eventId: string, present: string[], today: string) {
  const e = await tx.event.findFirst({ where: { id: eventId, archivedAt: null } });
  if (!e) throw new EventsProblem("This event was not found.");
  if (e.status === "CANCELLED") throw new EventsProblem("This event is cancelled.");
  if (isoOf(e.date) > today) throw new EventsProblem(`Attendance is marked on the day, ${dmy(isoOf(e.date))}.`);
  if (!e.registrationOn) throw new EventsProblem("Attendance is kept for events with registration.");
  const regs = await tx.eventRegistration.findMany({ where: { eventId, withdrawnAt: null } });
  if (!regs.length) throw new EventsProblem("Nobody is registered for this event.");
  const set = new Set(present);
  const now = new Date();
  for (const r of regs) {
    const attended = set.has(r.studentId);
    if (r.attended !== attended) await tx.eventRegistration.update({ where: { id: r.id }, data: { attended, markedAt: now, markedById: ctx.userId } });
  }
  const n = regs.filter((r) => set.has(r.studentId)).length;
  await writeAudit(tx, ctx, { action: "attendance", recordType: "Event", recordId: e.id, after: { present: n, of: regs.length } });
  return { present: n, of: regs.length, event: e };
}

/** Seats in rows, in class and roll order: A-1, A-2... (large events). */
export async function assignSeats(tx: Tx, ctx: SchoolContext, eventId: string, perRow: number) {
  if (!Number.isInteger(perRow) || perRow < 2 || perRow > 60) throw new EventsProblem("Seats in a row is a number from 2 to 60.", "perRow");
  const e = await tx.event.findFirst({ where: { id: eventId, archivedAt: null } });
  if (!e || e.status === "CANCELLED") throw new EventsProblem("This event was not found, or it is cancelled.");
  const regs = await tx.eventRegistration.findMany({ where: { eventId, withdrawnAt: null } });
  if (!regs.length) throw new EventsProblem("Nobody is registered yet.");
  const places = await placesOf(tx, regs.map((r) => r.studentId), e.academicYearId);
  const sorted = [...regs].sort((a, b) => placeOrder(places.get(a.studentId), places.get(b.studentId)));
  const rowName = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(64 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`);
  for (let i = 0; i < sorted.length; i++) {
    await tx.eventRegistration.update({ where: { id: sorted[i].id }, data: { seat: `${rowName(Math.floor(i / perRow))}-${(i % perRow) + 1}` } });
  }
  await writeAudit(tx, ctx, { action: "seats", recordType: "Event", recordId: e.id, after: { students: sorted.length, perRow } });
  return { seated: sorted.length, rows: Math.ceil(sorted.length / perRow) };
}

export async function addVolunteer(tx: Tx, ctx: SchoolContext, eventId: string, v: { kind: string; personId: string | null; name: string; duty: string }) {
  const e = await tx.event.findFirst({ where: { id: eventId, archivedAt: null } });
  if (!e || e.status === "CANCELLED") throw new EventsProblem("This event was not found, or it is cancelled.");
  if (!["staff", "student", "parent", "other"].includes(v.kind)) throw new EventsProblem("Choose who is helping.", "kind");
  const duty = v.duty.trim().replace(/\s+/g, " ");
  if (duty.length < 3) throw new EventsProblem("Say what they will do, like “First aid”.", "duty");
  if (duty.length > 120) throw new EventsProblem("The duty can be at most 120 characters.", "duty");
  let name = v.name.trim().replace(/\s+/g, " ");
  if (v.kind === "staff" && v.personId) name = (await tx.staff.findFirst({ where: { id: v.personId }, select: { fullName: true } }))?.fullName ?? name;
  if (v.kind === "student" && v.personId) name = (await tx.student.findFirst({ where: { id: v.personId }, select: { fullName: true } }))?.fullName ?? name;
  if (name.length < 2) throw new EventsProblem("Enter the name.", "name");
  const row = await tx.eventVolunteer.create({ data: { schoolId: ctx.schoolId, eventId, kind: v.kind, personId: v.personId, name: name.slice(0, 120), duty, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "volunteer-added", recordType: "Event", recordId: e.id, after: { name: row.name, duty } });
  return row;
}

export async function removeVolunteer(tx: Tx, ctx: SchoolContext, volunteerId: string) {
  const v = await tx.eventVolunteer.findFirst({ where: { id: volunteerId, archivedAt: null } });
  if (!v) throw new EventsProblem("This volunteer was not found.");
  await tx.eventVolunteer.update({ where: { id: v.id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "volunteer-removed", recordType: "Event", recordId: v.eventId, before: { name: v.name, duty: v.duty } });
  return v;
}

/* ---------- Payments (read by the events team and the Accountant) ---------- */

export type EventMoney = { charged: bigint; collected: bigint; due: bigint; dueStudents: number; paidStudents: number; refunded: bigint };

/** Each event's fee money, from its Student Fee Due rows and the refunds asked for it. */
export async function eventMoney(tx: Tx, events: Pick<Event, "id" | "number">[]): Promise<Map<string, EventMoney>> {
  const out = new Map<string, EventMoney>();
  if (!events.length) return out;
  const regs = await tx.eventRegistration.findMany({ where: { eventId: { in: events.map((e) => e.id) }, dueId: { not: null } }, select: { eventId: true, dueId: true } });
  const dues = regs.length ? await tx.studentFeeDue.findMany({ where: { id: { in: regs.map((r) => r.dueId!) } }, select: { id: true, amountPaise: true, paidPaise: true, balancePaise: true, state: true } }) : [];
  const refunds = await tx.refund.findMany({ where: { status: { in: ["WAITING", "APPROVED", "REFUNDED"] }, OR: events.map((e) => ({ reason: { contains: `[${e.number}]` } })) }, select: { amountPaise: true, reason: true, status: true } });
  for (const e of events) {
    const mine = new Set(regs.filter((r) => r.eventId === e.id).map((r) => r.dueId));
    const ds = dues.filter((d) => mine.has(d.id));
    const open = ds.filter((d) => d.state === "OPEN");
    const m: EventMoney = {
      charged: open.reduce((a, d) => a + d.amountPaise, ZERO),
      collected: ds.reduce((a, d) => a + d.paidPaise, ZERO),
      due: open.reduce((a, d) => a + (d.balancePaise > ZERO ? d.balancePaise : ZERO), ZERO),
      dueStudents: open.filter((d) => d.balancePaise > ZERO).length,
      paidStudents: open.filter((d) => d.balancePaise <= ZERO && d.amountPaise > ZERO).length,
      refunded: refunds.filter((r) => r.reason.includes(`[${e.number}]`)).reduce((a, r) => a + r.amountPaise, ZERO),
    };
    out.set(e.id, m);
  }
  return out;
}

/** Each registration's fee state: Paid, Due or (with no row) nothing. */
export async function feeStates(tx: Tx, dueIds: string[]) {
  const dues = dueIds.length ? await tx.studentFeeDue.findMany({ where: { id: { in: dueIds } }, select: { id: true, balancePaise: true, paidPaise: true, state: true } }) : [];
  return new Map(dues.map((d) => [d.id, d.state === "REMOVED" ? "Removed" : d.balancePaise <= ZERO ? "Paid" : d.paidPaise > ZERO ? "Part paid" : "Due"] as const));
}

/* ---------- Automatic reminders ---------- */

/** When an event's automatic reminder is due, in the school's time (hour of the day). */
function reminderDay(e: Pick<Event, "date" | "reminder">) {
  const d = isoOf(e.date);
  if (e.reminder === "2d") return { day: isoOf(new Date(dayOf(d).getTime() - 2 * 86_400_000)), hour: 18 };
  if (e.reminder === "morning") return { day: d, hour: 7 };
  return { day: isoOf(new Date(dayOf(d).getTime() - 86_400_000)), hour: 18 };
}

/** Sends the reminders that are due (run by a schedule; safe to run twice). */
export async function sendDueReminders(tx: Tx, ctx: SchoolContext, today: string, hour: number) {
  const events = await tx.event.findMany({
    where: { archivedAt: null, status: { not: "CANCELLED" }, reminder: { not: "none" }, reminderSentAt: null, date: { gte: dayOf(today), lte: dayOf(isoOf(new Date(dayOf(today).getTime() + 3 * 86_400_000))) } },
  });
  let sent = 0;
  for (const e of events) {
    const r = reminderDay(e);
    if (r.day > today || (r.day === today && hour < r.hour)) continue;
    try {
      await messageAudience(tx, ctx, e, "reminder", { auto: true });
      sent++;
    } catch (err) {
      // One event's problem never stops the other reminders (or the PTM reminders after them).
      if (!(err instanceof EventsProblem) && !(err instanceof MessagingProblem)) throw err;
      await tx.event.update({ where: { id: e.id }, data: { reminderSentAt: new Date() } });
      await tx.eventReminder.create({ data: { schoolId: ctx.schoolId, eventId: e.id, kind: "reminder", people: 0, messageId: null, sentById: null, note: `Automatic reminder not sent: ${err.message}`.slice(0, 500) } });
    }
  }
  return sent;
}

export type EventWhere = Prisma.EventWhereInput;
