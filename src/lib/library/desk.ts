// Issue & Return (13 §2): issue, return, renew and reserve at the desk.
// Issue is blocked over the member's limit, for a copy that is not available,
// for a blocked member and when unpaid fines are above the set amount. The
// due date fills from the loan days in Library Settings, moved off Sundays
// and School Calendar holidays when the setting is on. A late return records
// the fine at the set rate. Renewing is blocked while other members wait for
// the book and after the most renewals. A returned copy is kept for the
// first member in the book's queue, in the school's queue order.
import "server-only";

import type { BookCopy, BookIssue, Reservation } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { isWorkingDay, offDaySet } from "../staff/leave";
import { LibraryProblem } from "./problem";
import { librarySettings, type LibrarySettings } from "./settings";
import { memberByKey, memberFields, memberLoad, membersOf, whereMember, type Member } from "./members";
import { createFine, lostDefaultCharge } from "./fines";
import { reservationReadyMessage } from "./reminders";
import { BASE, books } from "./words";

const DAY = 86_400_000;
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
export const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Who has a copy now, in the words of the rules: "Meena, 7 B". */
export const holderWords = (m: Pick<Member, "firstName" | "short" | "kind">) => (m.kind === "STAFF" ? `${m.firstName} (staff)` : `${m.firstName}, ${m.short}`);

/** Loan days for this member and book: the book's category's, else the member type's. */
export async function loanDaysFor(tx: Tx, member: Pick<Member, "loanDays">, book: { categoryId: string | null }) {
  if (book.categoryId) {
    const c = await tx.libraryCategory.findFirst({ where: { id: book.categoryId }, select: { loanDays: true } });
    if (c?.loanDays) return c.loanDays;
  }
  return member.loanDays;
}

/** Moves a date forward to a school day (off Sundays, days off and School Calendar holidays). */
export async function nextSchoolDay(tx: Tx, ctx: SchoolContext, d: Date) {
  const holidays = await offDaySet(tx, ctx, d, addDays(d, 60));
  let out = d;
  for (let i = 0; i < 60 && !isWorkingDay(out, holidays); i++) out = addDays(out, 1);
  return out;
}

/** The due date the settings give: today plus the loan days, moved off holidays when the setting is on. */
export async function defaultDue(tx: Tx, ctx: SchoolContext, s: LibrarySettings, member: Pick<Member, "loanDays">, book: { categoryId: string | null }, today: Date) {
  const days = await loanDaysFor(tx, member, book);
  const plain = addDays(today, days);
  const due = s.moveDueOffHolidays ? await nextSchoolDay(tx, ctx, plain) : plain;
  return { due, days, moved: due.getTime() !== plain.getTime(), plain };
}

/** The late fine for a return on `on`: the rate per day after the days of grace, up to the most for one book. */
export function lateFine(s: Pick<LibrarySettings, "finePerDayPaise" | "maxFinePaise" | "graceDays">, dueOn: Date, on: Date) {
  const lateDays = Math.max(0, daysBetween(dueOn, on));
  const chargeable = Math.max(0, lateDays - s.graceDays);
  const raw = s.finePerDayPaise * BigInt(chargeable);
  const amountPaise = raw > s.maxFinePaise ? s.maxFinePaise : raw;
  return { lateDays, chargeable, amountPaise };
}

/**
 * Open issues that are overdue on a day: the one count the desk, the dashboard and the reports all use.
 * `lateMoreThan` days keeps only books more than that many days late (the Dashboard's "more than a week late"
 * card and the overdue report it opens, gap list G36).
 */
export const overdueWhere = (today: Date, lateMoreThan = 0) => ({ returnedAt: null, dueOn: { lt: new Date(today.getTime() - lateMoreThan * 86_400_000) } });

/**
 * Overdue as it stood at the end of a day in the past (the last day of a year
 * that is over, gap list G36): issued by then, late by then, and not yet
 * returned by then (still out, or brought back later).
 */
export const overdueAsAt = (day: Date, lateMoreThan = 0) => ({
  issuedOn: { lte: day },
  dueOn: { lt: new Date(day.getTime() - lateMoreThan * 86_400_000) },
  OR: [{ returnedAt: null }, { returnedAt: { gte: new Date(day.getTime() + 86_400_000) } }],
});

/* ---------- The queue ---------- */

/** Members waiting for a book, in the school's queue order (first come first served, or staff first). */
export async function queueOf(tx: Tx, s: Pick<LibrarySettings, "queueOrder">, bookId: string) {
  const rows = await tx.reservation.findMany({ where: { bookId, status: "WAITING" }, orderBy: { reservedAt: "asc" } });
  if (s.queueOrder === "staff-first") return [...rows.filter((r) => r.memberKind === "STAFF"), ...rows.filter((r) => r.memberKind === "STUDENT")];
  return rows;
}

/**
 * When a copy becomes free, the first member in the book's queue gets it: the
 * copy is kept at the desk for them (Reserved) and they are told. Returns the
 * reservation, or null when nobody is waiting.
 */
export async function holdForQueue(tx: Tx, ctx: SchoolContext, copyId: string): Promise<(Reservation & { member: Member }) | null> {
  const copy = await tx.bookCopy.findFirst({ where: { id: copyId } });
  if (!copy || copy.status !== "AVAILABLE") return null;
  const s = await librarySettings(tx, ctx);
  const queue = await queueOf(tx, s, copy.bookId);
  for (const r of queue) {
    const member = await memberByKey(tx, ctx, s, r.studentId ? `S:${r.studentId}` : `T:${r.staffId}`);
    if (!member?.active) {
      await tx.reservation.update({ where: { id: r.id }, data: { status: "CANCELLED", closedAt: new Date(), closedReason: "No longer a member (left the school)" } });
      continue;
    }
    const held = await tx.reservation.update({ where: { id: r.id }, data: { status: "READY", copyId: copy.id, readyAt: new Date() } });
    await tx.bookCopy.update({ where: { id: copy.id }, data: { status: "RESERVED", statusAt: new Date(), statusNote: null } });
    await writeAudit(tx, ctx, { action: "reservation-ready", recordType: "Reservation", recordId: r.id, after: { copy: copy.accessionNo, member: member.name } });
    if (s.remindReservation) await reservationReadyMessage(tx, ctx, member, copy, held.id);
    return { ...held, member };
  }
  return null;
}

/* ---------- Issue ---------- */

export type IssueInput = { member: Member; copyId: string; dueOn?: Date | null; dueReason?: string | null; today: Date };

/** Every check before a copy can be issued to a member; returns what the issue needs. */
export async function checkIssue(tx: Tx, ctx: SchoolContext, s: LibrarySettings, member: Member, copy: BookCopy & { book: { id: string; title: string; categoryId: string | null } }) {
  if (!member.active) throw new LibraryProblem(member.kind === "STUDENT" ? `${member.name} is not studying in the school this year, so books cannot be issued.` : `${member.name} no longer works in the school, so books cannot be issued.`);
  if (member.blocked) throw new LibraryProblem(`${member.name} is blocked: ${member.blocked.reason}. Unblock them on Members & Cards first.`, undefined, { href: `${BASE}/members?q=${encodeURIComponent(member.cardNo)}`, label: "Open Members & Cards" });
  if (copy.status === "ISSUED") {
    const open = await tx.bookIssue.findFirst({ where: { copyId: copy.id, returnedAt: null } });
    const holder = open ? await memberByKey(tx, ctx, s, open.studentId ? `S:${open.studentId}` : `T:${open.staffId}`) : null;
    if (holder && holder.key === member.key) throw new LibraryProblem(`Copy ${copy.accessionNo} is already issued to ${member.firstName}. Renew it instead.`, "copy");
    throw new LibraryProblem(`Copy ${copy.accessionNo} is issued to ${holder ? holderWords(holder) : "another member"}.`, "copy", { href: `${BASE}?member=${member.key}&reserve=${copy.bookId}`, label: "Reserve instead" });
  }
  let heldFor: Reservation | null = null;
  if (copy.status === "RESERVED") {
    heldFor = await tx.reservation.findFirst({ where: { copyId: copy.id, status: "READY" } });
    if (heldFor && !(heldFor.studentId === member.studentId && heldFor.staffId === member.staffId)) {
      const next = await memberByKey(tx, ctx, s, heldFor.studentId ? `S:${heldFor.studentId}` : `T:${heldFor.staffId}`);
      throw new LibraryProblem(`Copy ${copy.accessionNo} is kept for the first member in the queue. Next in queue: ${next ? holderWords(next) : "another member"}.`, "copy");
    }
  } else if (copy.status !== "AVAILABLE") {
    const what = { LOST: "marked lost", DAMAGED: "marked damaged", WITHDRAWN: "withdrawn" }[copy.status as "LOST" | "DAMAGED" | "WITHDRAWN"];
    throw new LibraryProblem(`Copy ${copy.accessionNo} is ${what}, so it cannot be issued.`, "copy");
  } else {
    // A free copy goes to the first member waiting for this book, if anyone is.
    const queue = await queueOf(tx, s, copy.bookId);
    if (queue.length && !queue.some((r, i) => i === 0 && r.studentId === member.studentId && r.staffId === member.staffId)) {
      const first = await memberByKey(tx, ctx, s, queue[0].studentId ? `S:${queue[0].studentId}` : `T:${queue[0].staffId}`);
      throw new LibraryProblem(`Members are waiting for this book. Next in queue: ${first ? holderWords(first) : "another member"}.`, "copy");
    }
  }
  if (copy.book.categoryId) {
    const cat = await tx.libraryCategory.findFirst({ where: { id: copy.book.categoryId }, select: { forLoan: true, name: true } });
    if (cat && !cat.forLoan) throw new LibraryProblem(`${cat.name} books are not lent. They can be read in the library.`, "copy");
  }
  const load = await memberLoad(tx, member);
  if (load.out.length >= member.limit) {
    throw new LibraryProblem(`${member.firstName} has ${load.out.length} of ${books(member.limit)}. Return a book first, or raise the limit with a reason.`, "member", { href: `${BASE}?mode=return&member=${member.key}`, label: "Return a book" });
  }
  if (s.blockFinesAbovePaise > BigInt(0) && load.finesDuePaise > s.blockFinesAbovePaise) {
    throw new LibraryProblem(`${formatRupees(load.finesDuePaise)} fines due. ${member.firstName} can borrow again when the fines are paid or waived.`, "member", { href: `${BASE}/fines?q=${encodeURIComponent(member.cardNo)}`, label: "Open fines" });
  }
  return { load, heldFor };
}

export async function issueBook(tx: Tx, ctx: SchoolContext, input: IssueInput) {
  const s = await librarySettings(tx, ctx);
  const copy = await tx.bookCopy.findFirst({ where: { id: input.copyId }, include: { book: { select: { id: true, title: true, categoryId: true } } } });
  if (!copy) throw new LibraryProblem("This copy was not found. Scan the barcode again.", "copy");
  const member = input.member;
  const { heldFor } = await checkIssue(tx, ctx, s, member, copy);
  const def = await defaultDue(tx, ctx, s, member, copy.book, input.today);
  let dueOn = def.due;
  let dueChangedReason: string | null = null;
  if (input.dueOn && input.dueOn.getTime() !== def.due.getTime()) {
    if (input.dueOn.getTime() <= input.today.getTime()) throw new LibraryProblem("The due date must be after today.", "dueOn");
    if (daysBetween(input.today, input.dueOn) > 180) throw new LibraryProblem("The due date can be at most 180 days away.", "dueOn");
    const reason = (input.dueReason ?? "").trim();
    if (reason.length < 5) throw new LibraryProblem(`The settings give ${formatDate(def.due, "UTC")}. Say why the due date is different (at least 5 characters).`, "dueReason");
    dueOn = input.dueOn;
    dueChangedReason = reason;
  }
  // Changed by the same moment as another desk? Only one issue wins.
  const changed = await tx.bookCopy.updateMany({ where: { id: copy.id, status: copy.status }, data: { status: "ISSUED", statusAt: new Date(), statusNote: null } });
  if (changed.count === 0) throw new LibraryProblem(`Copy ${copy.accessionNo} was just issued at another desk. Scan another copy.`, "copy");
  const issue = await tx.bookIssue.create({
    data: {
      schoolId: ctx.schoolId, copyId: copy.id, bookId: copy.bookId, ...memberFields(member), sectionId: member.sectionId,
      issuedOn: input.today, dueOn, dueChangedReason, issuedById: ctx.userId,
    },
  });
  // The member's reservation for this book is collected.
  const mine = heldFor ?? (await tx.reservation.findFirst({ where: { bookId: copy.bookId, ...whereMember(member), status: { in: ["WAITING", "READY"] } } }));
  if (mine) {
    await tx.reservation.update({ where: { id: mine.id }, data: { status: "COLLECTED", closedAt: new Date(), issueId: issue.id, copyId: copy.id } });
    if (mine.copyId && mine.copyId !== copy.id) {
      // A different copy was kept for them: it goes back for the next member.
      await tx.bookCopy.update({ where: { id: mine.copyId }, data: { status: "AVAILABLE", statusAt: new Date() } });
      await holdForQueue(tx, ctx, mine.copyId);
    }
  }
  await writeAudit(tx, ctx, {
    action: "issued", recordType: "Book Issue", recordId: issue.id,
    after: { book: copy.book.title, copy: copy.accessionNo, member: `${member.name} (${member.cardNo})`, due: formatDate(dueOn, "UTC"), dueChanged: dueChangedReason },
  });
  return { issue, copy, dueOn, dueMoved: def.moved && !dueChangedReason };
}

/* ---------- Return ---------- */

export type ReturnInput = { copyId: string; damaged: boolean; damageChargePaise?: bigint | null; note?: string | null; today: Date };

export async function openIssueOf(tx: Tx, copyId: string) {
  return tx.bookIssue.findFirst({ where: { copyId, returnedAt: null } });
}

export async function returnBook(tx: Tx, ctx: SchoolContext, input: ReturnInput) {
  const s = await librarySettings(tx, ctx);
  const copy = await tx.bookCopy.findFirst({ where: { id: input.copyId }, include: { book: true } });
  if (!copy) throw new LibraryProblem("This copy was not found. Scan the barcode again.", "copy");
  const issue = await openIssueOf(tx, copy.id);
  if (!issue) throw new LibraryProblem(`Copy ${copy.accessionNo} is not issued to anyone, so there is nothing to return.`, "copy");
  const member = await memberByKey(tx, ctx, s, issue.studentId ? `S:${issue.studentId}` : `T:${issue.staffId}`);
  if (!member) throw new LibraryProblem("The member of this issue was not found.");
  const fine = lateFine(s, issue.dueOn, input.today);
  const closed = await tx.bookIssue.updateMany({
    where: { id: issue.id, returnedAt: null },
    data: { returnedOn: input.today, returnedAt: new Date(), returnedById: ctx.userId, outcome: input.damaged ? "DAMAGED" : "RETURNED", lateDays: fine.lateDays },
  });
  if (closed.count === 0) throw new LibraryProblem(`Copy ${copy.accessionNo} was just returned at another desk.`, "copy");
  await tx.bookCopy.update({ where: { id: copy.id }, data: { status: input.damaged ? "DAMAGED" : "AVAILABLE", statusAt: new Date(), statusNote: input.damaged ? input.note?.trim() || "Damaged when returned" : null } });
  await writeAudit(tx, ctx, {
    action: "returned", recordType: "Book Issue", recordId: issue.id,
    before: { due: formatDate(issue.dueOn, "UTC") },
    after: { book: copy.book.title, copy: copy.accessionNo, member: member.name, lateDays: fine.lateDays, condition: input.damaged ? "Damaged" : "Good" },
  });
  const lateRow = fine.amountPaise > BigInt(0)
    ? await createFine(tx, ctx, s, { member, reason: "LATE", issueId: issue.id, copyId: copy.id, bookId: copy.bookId, lateDays: fine.lateDays, amountPaise: fine.amountPaise, note: `${fine.lateDays} day${fine.lateDays === 1 ? "" : "s"} late`, book: copy.book })
    : null;
  let damageRow = null;
  if (input.damaged) {
    const charge = input.damageChargePaise ?? lostDefaultCharge(s, copy.book, "DAMAGED");
    if (charge > BigInt(0)) damageRow = await createFine(tx, ctx, s, { member, reason: "DAMAGED", issueId: issue.id, copyId: copy.id, bookId: copy.bookId, lateDays: null, amountPaise: charge, note: input.note?.trim() || null, book: copy.book });
  }
  const next = input.damaged ? null : await holdForQueue(tx, ctx, copy.id);
  return { issue, copy, member, fine, lateRow, damageRow, next };
}

/* ---------- Renew ---------- */

export async function renewIssue(tx: Tx, ctx: SchoolContext, issueId: string, today: Date) {
  const s = await librarySettings(tx, ctx);
  const issue = await tx.bookIssue.findFirst({ where: { id: issueId }, include: { copy: { include: { book: true } } } });
  if (!issue || issue.returnedAt) throw new LibraryProblem("This book is not out any more.");
  const waiting = await tx.reservation.count({ where: { bookId: issue.bookId, status: "WAITING" } });
  if (waiting > 0) throw new LibraryProblem(`Reserved by ${waiting} member${waiting === 1 ? "" : "s"}. Please return the book so the next member can have it.`);
  if (issue.renewals >= s.maxRenewals) {
    throw new LibraryProblem(s.maxRenewals === 0 ? "Renewals are switched off in Library Settings. Please return the book." : `Already renewed ${s.maxRenewals} time${s.maxRenewals === 1 ? "" : "s"}. Please return the book.`);
  }
  if (issue.dueOn.getTime() < today.getTime()) {
    const late = daysBetween(issue.dueOn, today);
    throw new LibraryProblem(`This book is ${late} day${late === 1 ? "" : "s"} late. Return it (the fine is worked out), then issue it again.`);
  }
  const member = await memberByKey(tx, ctx, s, issue.studentId ? `S:${issue.studentId}` : `T:${issue.staffId}`);
  if (!member) throw new LibraryProblem("The member of this issue was not found.");
  if (member.blocked) throw new LibraryProblem(`${member.name} is blocked: ${member.blocked.reason}. Please return the book.`);
  const def = await defaultDue(tx, ctx, s, member, issue.copy.book, today);
  const dueOn = def.due.getTime() > issue.dueOn.getTime() ? def.due : issue.dueOn;
  const changed = await tx.bookIssue.updateMany({ where: { id: issue.id, renewals: issue.renewals, returnedAt: null }, data: { dueOn, renewals: issue.renewals + 1 } });
  if (changed.count === 0) throw new LibraryProblem("This issue was just changed at another desk. Look again.");
  await writeAudit(tx, ctx, { action: "renewed", recordType: "Book Issue", recordId: issue.id, before: { due: formatDate(issue.dueOn, "UTC"), renewals: issue.renewals }, after: { due: formatDate(dueOn, "UTC"), renewals: issue.renewals + 1, member: member.name, book: issue.copy.book.title } });
  return { issue, dueOn, renewals: issue.renewals + 1, member };
}

/* ---------- Reserve ---------- */

export async function reserveBook(tx: Tx, ctx: SchoolContext, member: Member, bookId: string) {
  const s = await librarySettings(tx, ctx);
  const book = await tx.book.findFirst({ where: { id: bookId, archivedAt: null } });
  if (!book) throw new LibraryProblem("This book was not found.");
  if (!member.active) throw new LibraryProblem(`${member.name} is not a library member now.`);
  if (member.blocked) throw new LibraryProblem(`${member.name} is blocked: ${member.blocked.reason}. Unblock them on Members & Cards first.`);
  if (book.categoryId) {
    const cat = await tx.libraryCategory.findFirst({ where: { id: book.categoryId }, select: { forLoan: true, name: true } });
    if (cat && !cat.forLoan) throw new LibraryProblem(`${cat.name} books are not lent, so they cannot be reserved.`);
  }
  const free = await tx.bookCopy.findFirst({ where: { bookId, status: "AVAILABLE" }, select: { accessionNo: true } });
  if (free) throw new LibraryProblem(`Copy ${free.accessionNo} is on the shelf. Issue it instead of reserving.`);
  const has = await tx.bookIssue.findFirst({ where: { bookId, ...whereMember(member), returnedAt: null } });
  if (has) throw new LibraryProblem(`${member.firstName} already has this book.`);
  const already = await tx.reservation.findFirst({ where: { bookId, ...whereMember(member), status: { in: ["WAITING", "READY"] } } });
  if (already) throw new LibraryProblem(`${member.firstName} is already in the queue for this book.`);
  const r = await tx.reservation.create({ data: { schoolId: ctx.schoolId, bookId, ...memberFields(member), createdById: ctx.userId } });
  const queue = await queueOf(tx, s, bookId);
  const position = queue.findIndex((x) => x.id === r.id) + 1;
  await writeAudit(tx, ctx, { action: "reserved", recordType: "Reservation", recordId: r.id, after: { book: book.title, member: member.name, position } });
  return { reservation: r, position, book };
}

export async function cancelReservation(tx: Tx, ctx: SchoolContext, id: string, reason: string) {
  if (reason.trim().length < 5) throw new LibraryProblem("Give a reason of at least 5 characters.", "reason");
  const r = await tx.reservation.findFirst({ where: { id } });
  if (!r || !["WAITING", "READY"].includes(r.status)) throw new LibraryProblem("This reservation is not open any more.");
  await tx.reservation.update({ where: { id }, data: { status: "CANCELLED", closedAt: new Date(), closedReason: reason.trim() } });
  await writeAudit(tx, ctx, { action: "cancelled", recordType: "Reservation", recordId: id, before: { status: r.status }, after: { reason: reason.trim() } });
  if (r.status === "READY" && r.copyId) {
    await tx.bookCopy.update({ where: { id: r.copyId }, data: { status: "AVAILABLE", statusAt: new Date() } });
    return holdForQueue(tx, ctx, r.copyId);
  }
  return null;
}

/* ---------- Reading the desk ---------- */

/** Open reservations of a book, in queue order, with the members. */
export async function queueWithMembers(tx: Tx, ctx: SchoolContext, s: LibrarySettings, bookId: string) {
  const ready = await tx.reservation.findMany({ where: { bookId, status: "READY" }, orderBy: { readyAt: "asc" } });
  const waiting = await queueOf(tx, s, bookId);
  const all = [...ready, ...waiting];
  const members = await membersOf(tx, ctx, s, { studentIds: all.map((r) => r.studentId).filter((x): x is string => Boolean(x)), staffIds: all.map((r) => r.staffId).filter((x): x is string => Boolean(x)) });
  return all.map((r) => ({ ...r, member: members.get(r.studentId ? `S:${r.studentId}` : `T:${r.staffId}`) ?? null }));
}

/** Members for many issues (lists). */
export async function issueMembers(tx: Tx, ctx: SchoolContext, s: LibrarySettings, rows: Pick<BookIssue, "studentId" | "staffId">[]) {
  return membersOf(tx, ctx, s, { studentIds: rows.map((r) => r.studentId).filter((x): x is string => Boolean(x)), staffIds: rows.map((r) => r.staffId).filter((x): x is string => Boolean(x)) });
}

export { iso as isoDay };
