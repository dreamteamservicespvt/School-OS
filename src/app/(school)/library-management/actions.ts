"use server";

// Library Management's server actions (13 §2). Each checks the person's role
// on the server (requireAction, then what their page lets them do), runs
// inside the school's walls and answers in plain words.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/forms";
import { formatDate, formatRupees } from "@/lib/format";
import { canDecide, decide } from "@/lib/approvals";
import { libAction, inLibrary, problemState, need, str, id, optionalId, text, maybe, int, money, isoDate, on, LibraryProblem, type LibWork } from "@/lib/library/act";
import { memberByKey, setBlocked, setLimit } from "@/lib/library/members";
import { issueBook, returnBook, renewIssue, reserveBook, cancelReservation, holderWords } from "@/lib/library/desk";
import { addBook, addCopies, backOnShelf, splitAccessions, updateBook, withdrawCopy, type BookInput } from "@/lib/library/catalogue";
import { collectAtDesk, correctCharge, markLostOrDamaged, waiveFine } from "@/lib/library/fines";
import { sendFineToSalary, stopFineFromSalary } from "@/lib/library/salary";
import { calculateRun } from "@/lib/salary/payroll";
import { remindAllOverdue, remindIssue, remindLibrarian } from "@/lib/library/reminders";
import { closeSession, markMissingLost, scanCode, startSession, type ScanResult } from "@/lib/library/stock";
import { archiveCategory, saveCategory, saveSettings, librarySettings } from "@/lib/library/settings";
import { BASE, CLASS_LEVELS, FINE_REASON, books as bookWords } from "@/lib/library/words";

type S<T = unknown> = FormState<T>;

async function memberOf(w: LibWork, fd: FormData, key = "member") {
  const s = await librarySettings(w.tx, w.ctx);
  const m = await memberByKey(w.tx, w.ctx, s, str(fd, key));
  if (!m) throw new LibraryProblem("Scan the member's card or search for them first.", key);
  return m;
}

/* ---------- Issue & Return ---------- */

export type IssueDone = { title: string; accessionNo: string; member: string; memberKey: string; due: string; moved: boolean };

export async function issueAction(_p: S<IssueDone>, fd: FormData): Promise<S<IssueDone>> {
  return libAction("create", fd, async (w) => {
    need(w.can.desk, "issue books");
    const member = await memberOf(w, fd);
    const r = await issueBook(w.tx, w.ctx, { member, copyId: id(fd, "copyId", "copy"), dueOn: isoDate(fd, "dueOn", "Due date", { required: false }), dueReason: maybe(fd, "dueReason", "Reason", 200), today: w.today });
    return { title: r.copy.book.title, accessionNo: r.copy.accessionNo, member: member.name, memberKey: member.key, due: formatDate(r.dueOn, "UTC"), moved: r.dueMoved };
  }, (r) => ({ message: `“${r.title}” issued to ${r.member}. Due ${r.due}.` }));
}

export type ReturnDone = { title: string; accessionNo: string; member: string; memberKey: string; lateDays: number; fine: string | null; fineWhere: string | null; damage: string | null; damageWaiting: boolean; next: string | null };

export async function returnAction(_p: S<ReturnDone>, fd: FormData): Promise<S<ReturnDone>> {
  return libAction("edit", fd, async (w) => {
    need(w.can.desk, "return books");
    const damaged = str(fd, "condition") === "damaged";
    const r = await returnBook(w.tx, w.ctx, { copyId: id(fd, "copyId", "copy"), damaged, damageChargePaise: damaged ? money(fd, "charge", "Damage charge", { required: false }) : null, note: maybe(fd, "note", "Note", 300), today: w.today });
    return {
      title: r.copy.book.title, accessionNo: r.copy.accessionNo, member: r.member.name, memberKey: r.member.key, lateDays: r.fine.lateDays,
      fine: r.lateRow ? formatRupees(r.lateRow.amountPaise) : null,
      fineWhere: r.lateRow ? (r.lateRow.feeDueId ? "added to fees" : "to collect at the desk") : null,
      damage: r.damageRow ? formatRupees(r.damageRow.amountPaise) : null, damageWaiting: r.damageRow?.status === "WAITING",
      next: r.next ? holderWords(r.next.member) : null,
    };
  }, (r) => {
    const bits = [r.fine ? `fine ${r.fine} for ${r.lateDays} day${r.lateDays === 1 ? "" : "s"} late, ${r.fineWhere}` : null, r.damage ? (r.damageWaiting ? `damage charge ${r.damage} sent for approval` : `damage charge ${r.damage}`) : null].filter(Boolean);
    return { message: `“${r.title}” returned by ${r.member}${bits.length ? `: ${bits.join("; ")}` : ""}.${r.next ? ` Next in queue: ${r.next}. Keep copy ${r.accessionNo} at the desk.` : ""}` };
  });
}

export async function renewAction(_p: S, fd: FormData): Promise<S> {
  let undo = "";
  return libAction("edit", fd, async (w) => {
    need(w.can.desk, "renew books");
    const r = await renewIssue(w.tx, w.ctx, id(fd, "issueId", "book"), w.today);
    undo = `${r.issue.id}~${r.issue.dueOn.toISOString().slice(0, 10)}~${r.issue.renewals}`;
    return { title: r.issue.copy.book.title, due: formatDate(r.dueOn, "UTC"), n: r.renewals };
  }, (r) => ({ message: `“${r.title}” renewed till ${r.due} (renewal ${r.n}).`, undo: { kind: "lib-renew", id: undo } }));
}

export async function reserveAction(_p: S, fd: FormData): Promise<S> {
  return libAction("create", fd, async (w) => {
    need(w.can.desk, "reserve books");
    const member = await memberOf(w, fd);
    const r = await reserveBook(w.tx, w.ctx, member, id(fd, "bookId", "book"));
    return { id: r.reservation.id, title: r.book.title, member: member.firstName, position: r.position };
  }, (r) => ({ message: `${r.member} is number ${r.position} in the queue for “${r.title}”. They are told when a copy is back.`, undo: { kind: "lib-reserve", id: r.id } }));
}

export async function cancelReservationAction(_p: S, fd: FormData): Promise<S> {
  return libAction("edit", fd, async (w) => {
    need(w.can.desk, "change reservations");
    const next = await cancelReservation(w.tx, w.ctx, id(fd, "reservationId", "reservation"), text(fd, "reason", "Reason", { min: 5, max: 200 }));
    return { next: next ? holderWords(next.member) : null };
  }, (r) => (r.next ? `Reservation cancelled. The copy is now kept for ${r.next}.` : "Reservation cancelled."));
}

export async function remindAction(_p: S, fd: FormData): Promise<S> {
  return libAction("edit", fd, async (w) => {
    need(w.can.desk, "send reminders");
    const r = await remindIssue(w.tx, w.ctx, id(fd, "issueId", "book"), w.today);
    if (r.status !== "sent") throw new LibraryProblem(`No reminder sent: ${r.note ?? "not possible now"}.`);
    return { who: r.member?.name ?? "the member", how: r.how };
  }, (r) => `Reminder sent ${r.how === "in the app" ? `to ${r.who} in the app` : `${r.how} of ${r.who}`}.`);
}

export async function remindAllAction(_p: S, fd: FormData): Promise<S> {
  return libAction("edit", fd, async (w) => {
    need(w.can.desk, "send reminders");
    return remindAllOverdue(w.tx, w.ctx, w.today);
  }, (r) => (r.total === 0 ? "Everyone overdue was already reminded today." : `${r.sent} reminder${r.sent === 1 ? "" : "s"} sent${r.skipped ? `; ${r.skipped} could not be sent (no phone or channel)` : ""}.`));
}

/** The Principal's or School Admin's Remind on the overdue watch: the librarian is told in the app. */
export async function remindLibrarianAction(_p: S, fd: FormData): Promise<S> {
  return libAction("view", fd, async (w) => {
    need(w.can.remind, "remind the librarian");
    const what = str(fd, "what");
    const words = what === "fines" ? "Please follow up on the library fines still due." : what === "approval" ? "Library charges are waiting for approval." : "Please follow up on the overdue library books and remind the members.";
    const n = await remindLibrarian(w.tx, w.ctx, `${w.current.user.displayName}: ${words}`, what === "fines" ? `${BASE}/fines` : `${BASE}?list=overdue`);
    if (n === 0) throw new LibraryProblem("There is no Librarian login to remind yet. Add one in Settings, Users & Permissions.");
    return n;
  }, (n) => `Reminder sent to the librarian${n === 1 ? "" : "s"}.`);
}

/* ---------- Books ---------- */

function bookInput(fd: FormData): BookInput {
  const authors = str(fd, "authors").split(/[;\n]/).map((a) => a.trim()).filter(Boolean);
  return {
    title: text(fd, "title", "Title", { max: 300 }), authors, publisher: maybe(fd, "publisher", "Publisher", 120), isbn: maybe(fd, "isbn", "ISBN", 20),
    categoryId: optionalId(fd, "categoryId"), subject: maybe(fd, "subject", "Subject", 80), language: maybe(fd, "language", "Language", 40), edition: maybe(fd, "edition", "Edition", 40),
    pricePaise: money(fd, "price", "Price", { required: false }), shelf: maybe(fd, "shelf", "Shelf location", 30),
  };
}

export async function saveBookAction(_p: S<{ id: string }>, fd: FormData): Promise<S<{ id: string }>> {
  let created = false;
  let range = "";
  return libAction("create", fd, async (w) => {
    need(w.can.catalogue, "add or change books");
    const bookId = optionalId(fd, "bookId");
    const input = bookInput(fd);
    if (bookId) {
      const b = await updateBook(w.tx, w.ctx, bookId, input);
      return { id: b.id, title: b.title };
    }
    created = true;
    const r = await addBook(w.tx, w.ctx, { ...input, copies: int(fd, "copies", "Number of copies", 1), accessions: splitAccessions(str(fd, "accessions")), acquiredOn: w.today });
    range = r.copies.length === 1 ? `accession ${r.copies[0].accessionNo}` : `accessions ${r.copies[0].accessionNo} to ${r.copies[r.copies.length - 1].accessionNo}`;
    return { id: r.book.id, title: r.book.title };
  }, (r) => (created ? { message: `“${r.title}” added with ${range}.`, link: { href: `${BASE}/books/${r.id}?do=labels`, label: "Print labels" } } : `“${r.title}” saved.`));
}

export async function addCopiesAction(_p: S, fd: FormData): Promise<S> {
  return libAction("create", fd, async (w) => {
    need(w.can.catalogue, "add copies");
    const bookId = id(fd, "bookId", "book");
    const copies = await addCopies(w.tx, w.ctx, bookId, int(fd, "copies", "Number of copies", 1), splitAccessions(str(fd, "accessions")), w.today);
    return { bookId, list: copies.map((c) => c.accessionNo) };
  }, (r) => ({ message: `${r.list.length} cop${r.list.length === 1 ? "y" : "ies"} added: ${r.list.length > 3 ? `${r.list[0]} to ${r.list[r.list.length - 1]}` : r.list.join(", ")}.`, link: { href: `${BASE}/books/${r.bookId}?do=labels`, label: "Print labels" } }));
}

export async function withdrawCopyAction(_p: S, fd: FormData): Promise<S> {
  return libAction("archive", fd, async (w) => {
    need(w.can.catalogue, "withdraw copies");
    await withdrawCopy(w.tx, w.ctx, id(fd, "copyId", "copy"), text(fd, "reason", "Reason", { min: 5, max: 200 }));
  }, () => "Copy withdrawn. It stays in the book's history.");
}

export async function backOnShelfAction(_p: S, fd: FormData): Promise<S> {
  return libAction("edit", fd, async (w) => {
    need(w.can.catalogue, "change copies");
    await backOnShelf(w.tx, w.ctx, id(fd, "copyId", "copy"), text(fd, "reason", "Reason", { min: 5, max: 200 }));
  }, () => "Copy is back on the shelf.");
}

export async function markLostAction(_p: S, fd: FormData): Promise<S> {
  return libAction("edit", fd, async (w) => {
    need(w.can.catalogue || w.can.desk, "mark copies lost or damaged");
    const kind = str(fd, "kind") === "DAMAGED" ? "DAMAGED" : "LOST";
    const r = await markLostOrDamaged(w.tx, w.ctx, { copyId: id(fd, "copyId", "copy"), kind, chargePaise: money(fd, "charge", "Charge", { required: false }), note: maybe(fd, "note", "Note", 300), today: w.today });
    return { acc: r.copy.accessionNo, kind, member: r.member?.name ?? null, fine: r.fine, charge: r.charge };
  }, (r) => {
    const what = `Copy ${r.acc} marked ${r.kind === "LOST" ? "lost" : "damaged"}`;
    if (!r.fine) return `${what}.${r.member ? "" : " Nobody had it, so nothing is charged."}`;
    if (r.fine.status === "WAITING") return `${what}. ${formatRupees(r.fine.amountPaise)} charge needs approval and is added only when approved.`;
    return `${what}. ${formatRupees(r.fine.amountPaise)} ${FINE_REASON[r.kind as "LOST" | "DAMAGED"].toLowerCase()} charge ${r.fine.feeDueId ? `added to ${r.member}'s fees` : `due from ${r.member}`}.`;
  });
}

/* ---------- Members & Cards ---------- */

export async function blockAction(_p: S, fd: FormData): Promise<S> {
  let blocked = false;
  return libAction("edit", fd, async (w) => {
    need(w.can.members, "block or unblock members");
    const m = await memberOf(w, fd);
    blocked = str(fd, "blocked") === "1";
    await setBlocked(w.tx, w.ctx, m, blocked, text(fd, "reason", "Reason", { min: 5, max: 200 }));
    return m.name;
  }, (name) => (blocked ? `${name} is blocked. Books cannot be issued until unblocked.` : `${name} is unblocked.`));
}

export async function limitAction(_p: S, fd: FormData): Promise<S> {
  return libAction("edit", fd, async (w) => {
    need(w.can.members, "change limits");
    const m = await memberOf(w, fd);
    const raw = str(fd, "limit");
    const limit = raw === "" || raw === "settings" ? null : int(fd, "limit", "Books at a time");
    await setLimit(w.tx, w.ctx, m, limit, text(fd, "reason", "Reason", { min: 5, max: 200 }));
    return { name: m.name, limit };
  }, (r) => (r.limit === null ? `${r.name} now has the limit from Library Settings.` : `${r.name} can now have ${bookWords(r.limit)} at a time.`));
}

/* ---------- Fines ---------- */

export async function waiveAction(_p: S, fd: FormData): Promise<S> {
  return libAction("edit", fd, async (w) => {
    need(w.can.fines, "waive fines");
    await waiveFine(w.tx, w.ctx, id(fd, "fineId", "fine"), text(fd, "reason", "Reason", { min: 5, max: 200 }));
  }, () => "Fine waived. The reason is kept with it.");
}

export async function collectAction(_p: S, fd: FormData): Promise<S> {
  return libAction("create", fd, async (w) => {
    need(w.can.fines, "collect fines");
    const mode = str(fd, "mode");
    if (!["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"].includes(mode)) throw new LibraryProblem("Choose how it was paid.", "mode");
    return collectAtDesk(w.tx, w.ctx, id(fd, "fineId", "fine"), { mode: mode as "CASH", reference: maybe(fd, "reference", "Reference", 60), today: w.today });
  }, (r) => `${formatRupees(r.amountPaise)} collected from ${r.member?.name ?? "the member"}${r.receiptNo ? `. Receipt ${r.receiptNo}` : ""}.`);
}

/** A staff member's fine taken from their next salary (Salary Management) instead of at the desk. */
export async function fineToSalaryAction(_p: S, fd: FormData): Promise<S> {
  return libAction("edit", fd, async (w) => {
    need(w.can.fines, "send fines to salary");
    if (!w.current.modulesOn.has("salary-management")) throw new LibraryProblem("Salary Management is switched off for this school, so fines cannot be taken from salary. Collect it here.");
    return sendFineToSalary(w.tx, w.ctx, id(fd, "fineId", "fine"));
  }, (r) => `${formatRupees(r.fine.amountPaise)} will be taken from ${r.staff.fullName}’s next salary. It shows as paid when that salary is approved.`);
}

/** Stops taking a fine from salary, so it can be collected at the desk. */
export async function fineFromSalaryStopAction(_p: S, fd: FormData): Promise<S> {
  return libAction("edit", fd, async (w) => {
    need(w.can.fines, "change where fines are paid");
    return stopFineFromSalary(w.tx, w.ctx, id(fd, "fineId", "fine"), "To be collected at the library desk", (runId) => calculateRun(w.tx, w.ctx, runId, w.today));
  }, (r) => `${r.fine.fineNo} will not be taken from salary${r.run ? "; that salary was worked out again" : ""}. Collect it here.`);
}

export async function correctChargeAction(_p: S, fd: FormData): Promise<S> {
  return libAction("edit", fd, async (w) => {
    need(w.can.fines, "correct charges");
    const f = await correctCharge(w.tx, w.ctx, id(fd, "fineId", "fine"), money(fd, "amount", "Charge")!, text(fd, "note", "Reason", { min: 5, max: 200 }));
    return f;
  }, (f) => (f.status === "WAITING" ? `${formatRupees(f.amountPaise)} charge sent for approval again.` : `${formatRupees(f.amountPaise)} charge recorded${f.feeDueId ? " and added to fees" : ""}.`));
}

/** The approver decides a large charge right on the fines list (the same decision as in Approvals). */
export async function decideChargeAction(_p: S, fd: FormData): Promise<S> {
  let decision: "approve" | "reject" = "approve";
  return libAction("view", fd, async (w) => {
    const fine = await w.tx.libraryFine.findFirst({ where: { id: id(fd, "fineId", "fine") } });
    if (!fine?.approvalId || fine.status !== "WAITING") throw new LibraryProblem("This charge is not waiting for approval.");
    const approval = await w.tx.approval.findFirst({ where: { id: fine.approvalId } });
    if (!approval || !(await canDecide(w.tx, w.ctx, approval))) throw new LibraryProblem("This charge is waiting for someone else's approval.");
    decision = str(fd, "decision") === "reject" ? "reject" : "approve";
    await decide(w.tx, w.ctx, approval.id, decision, decision === "reject" ? text(fd, "note", "Reason", { min: 5, max: 300 }) : maybe(fd, "note", "Note", 300));
    return formatRupees(fine.amountPaise);
  }, (amt) => (decision === "approve" ? `Approved: ${amt} charge is now due.` : `Not approved: ${amt} charge is not added.`));
}

/* ---------- Stock check ---------- */

/** Starts a stock check and takes the librarian straight to its scan page. */
export async function startStockAction(_p: S<{ id: string }>, fd: FormData): Promise<S<{ id: string }>> {
  const r = await libAction("create", fd, async (w) => {
    need(w.can.fines, "run stock checks");
    const s = await startSession(w.tx, w.ctx, text(fd, "name", "Name", { min: 3, max: 80 }));
    return { id: s.id };
  }, () => "Stock check started. Scan every copy on the shelves.");
  // Outside libAction's try, so the redirect is not caught as a problem.
  if (r?.ok && r.data) redirect(`${BASE}/fines/stock/${r.data.id}`);
  return r;
}

/** One scan: quick, no toast (the scan page shows each code as it comes). */
export async function scanStockAction(_p: S<ScanResult>, fd: FormData): Promise<S<ScanResult>> {
  try {
    const r = await inLibrary("edit", async (w) => {
      need(w.can.fines, "run stock checks");
      return scanCode(w.tx, w.ctx, id(fd, "sessionId", "stock check"), str(fd, "code"));
    });
    revalidatePath(`${BASE}/fines`, "layout");
    return { ok: true, message: r.kind === "again" ? `${r.code} was already scanned.` : r.kind === "unknown" ? `${r.code} is not in the catalogue. Kept as extra.` : r.kind === "extra" ? `${r.code}: ${r.title}. Not expected on the shelf (${r.status?.toLowerCase()}).` : `${r.code}: ${r.title}`, data: r };
  } catch (e) {
    return problemState(e, fd) as S<ScanResult>;
  }
}

export async function closeStockAction(_p: S, fd: FormData): Promise<S> {
  return libAction("edit", fd, async (w) => {
    need(w.can.fines, "close stock checks");
    return closeSession(w.tx, w.ctx, id(fd, "sessionId", "stock check"));
  }, (s) => `${s.name} closed: ${s.found} found, ${s.missing} missing, ${s.extra} extra.`);
}

export async function markMissingLostAction(_p: S, fd: FormData): Promise<S> {
  return libAction("edit", fd, async (w) => {
    need(w.can.fines, "mark missing copies lost");
    return markMissingLost(w.tx, w.ctx, id(fd, "sessionId", "stock check"));
  }, (n) => `${n} cop${n === 1 ? "y" : "ies"} marked lost.`);
}

/* ---------- Settings ---------- */

export async function saveSettingsAction(_p: S, fd: FormData): Promise<S> {
  return libAction("edit", fd, async (w) => {
    need(w.can.settings, "change Library Settings");
    const rules = CLASS_LEVELS.map((level) => ({ level, books: int(fd, `books-${level}`, `Books for ${level}`), loanDays: int(fd, `days-${level}`, `Loan days for ${level}`) }));
    const next = str(fd, "nextAccession");
    await saveSettings(w.tx, w.ctx, {
      rules,
      studentBooks: int(fd, "studentBooks", "Books for other students"), studentLoanDays: int(fd, "studentLoanDays", "Loan days for other students"),
      staffBooks: int(fd, "staffBooks", "Books for staff"), staffLoanDays: int(fd, "staffLoanDays", "Loan days for staff"),
      moveDueOffHolidays: on(fd, "moveDueOffHolidays"),
      finePerDayPaise: money(fd, "finePerDay", "Fine per day")!, maxFinePaise: money(fd, "maxFine", "Most fine for one book")!, graceDays: int(fd, "graceDays", "Days of grace"),
      blockFinesAbovePaise: money(fd, "blockAbove", "Block issues above")!, finesToFees: on(fd, "finesToFees"),
      lostCharge: str(fd, "lostCharge") === "price" ? "price" : "price-plus", lostExtraPaise: money(fd, "lostExtra", "Fee on top of the price", { required: false }) ?? BigInt(0),
      approvalAbovePaise: money(fd, "approvalAbove", "Needs approval above")!, maxRenewals: int(fd, "maxRenewals", "Most renewals"),
      queueOrder: str(fd, "queueOrder") === "staff-first" ? "staff-first" : "fcfs", labelType: (["qr", "rfid"].includes(str(fd, "labelType")) ? str(fd, "labelType") : "barcode") as "barcode",
      accessionPrefix: str(fd, "accessionPrefix"), accessionWidth: int(fd, "accessionWidth", "Digits"), nextAccession: next ? int(fd, "nextAccession", "Next accession number") : null,
      remindDueTomorrow: on(fd, "remindDueTomorrow"), remindOverdue: on(fd, "remindOverdue"), remindReservation: on(fd, "remindReservation"),
    });
  }, () => "Library Settings saved.");
}

export async function saveCategoryAction(_p: S, fd: FormData): Promise<S> {
  return libAction("edit", fd, async (w) => {
    need(w.can.settings, "change categories");
    const days = str(fd, "loanDays");
    const c = await saveCategory(w.tx, w.ctx, { id: optionalId(fd, "categoryId"), name: text(fd, "name", "Name", { min: 2, max: 60 }), shelf: maybe(fd, "shelf", "Shelf", 20), loanDays: days ? int(fd, "loanDays", "Loan days") : null, forLoan: str(fd, "forLoan") !== "no" });
    return c.name;
  }, (name) => `${name} saved.`);
}

export async function archiveCategoryAction(_p: S, fd: FormData): Promise<S> {
  return libAction("archive", fd, async (w) => {
    need(w.can.settings, "change categories");
    await archiveCategory(w.tx, w.ctx, id(fd, "categoryId", "category"));
  }, () => "Category removed from the list.");
}
