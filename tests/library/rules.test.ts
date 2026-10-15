// Library Management rules (13-library-management.md §5 "Rules and
// mistake-proofing" and §9 "Done when"), on a real database: the ISBN check,
// unique accession numbers, issue by card scan with the due date from the
// settings, the borrowing limit, a copy already out, late fines at the set
// rate (added to fees), renewals and reservations in queue order (also staff
// first), lost charges through Approvals, the TC clearance, the stock check,
// one overdue count everywhere, fine blocking, withdraw never deletes, and
// the catalogue import with Undo.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type Tx } from "@/lib/db";
import { decide } from "@/lib/approvals";
import { importKind, previewImport, runImport, undoImport, autoMatch } from "@/lib/importer";
import { runClearanceChecks } from "@/lib/students/clearance";
import { isbnValid, ISBN_INVALID } from "@/lib/library/isbn";
import { copyByCode, withdrawCopy } from "@/lib/library/catalogue";
import { issueBook, renewIssue, reserveBook, returnBook, overdueWhere } from "@/lib/library/desk";
import { createFine, markLostOrDamaged, syncFeeFines, waiveFine } from "@/lib/library/fines";
import { librarySettings, saveSettings } from "@/lib/library/settings";
import { memberByCode, setBlocked } from "@/lib/library/members";
import { closeSession, markMissingLost, scanCode, startSession, stillMissing, ON_SHELF } from "@/lib/library/stock";
import { overdueCount, overdueReport } from "@/lib/library/reports";
import { remindLibrarian } from "@/lib/library/reminders";
import { CATALOGUE_IMPORT } from "@/lib/library/import";
import "@/lib/library/handlers";
import "@/lib/library/clearance";
import { makeSchool } from "../helpers";
import { TODAY, addTestBook, as, desk, makeLibrarySchool, plus, staffMember, student, type LibFixture } from "./fixture";

describe("Library Management rules", () => {
  let f: LibFixture;
  beforeAll(async () => {
    f = await makeLibrarySchool();
  });
  const ctx = () => desk(f);
  const run = <T,>(fn: (tx: Tx) => Promise<T>) => withSchool(ctx(), fn);

  it("accepts only ISBNs with a correct check digit (Done when 11)", async () => {
    expect(isbnValid("978-0-306-40615-7")).toBe(true);
    expect(isbnValid("0-306-40615-2")).toBe(true);
    expect(isbnValid("978-0-306-40615-8")).toBe(false);
    expect(isbnValid("0-306-40615-3")).toBe(false);
    expect(isbnValid("12345")).toBe(false);
    await expect(addTestBook(f, "Wrong ISBN", 1, { isbn: "978-0-306-40615-8" })).rejects.toThrow(ISBN_INVALID);
    const { book } = await addTestBook(f, "Right ISBN", 1, { isbn: "978 0 306 40615 7" });
    expect(book.isbn).toBe("9780306406157");
    // The same ISBN twice points to the book already there.
    await expect(addTestBook(f, "Same ISBN", 1, { isbn: "9780306406157" })).rejects.toThrow(/already in the library: “Right ISBN”/);
  });

  it("gives accession numbers in sequence and refuses one already used", async () => {
    const a = await addTestBook(f, "Numbered", 2);
    expect(a.copies.map((c) => c.accessionNo)).toHaveLength(2);
    expect(a.copies.every((c) => /^\d{5}$/.test(c.accessionNo))).toBe(true);
    await addTestBook(f, "Typed accession", 1, { accessions: ["OLD-77"] });
    await expect(addTestBook(f, "Typed again", 1, { accessions: ["old-77"] })).rejects.toThrow(/Accession old-77 already exists/);
    await expect(addTestBook(f, "Twice typed", 2, { accessions: ["T-1", "T-1"] })).rejects.toThrow("Accession T-1 is typed twice.");
  });

  it("issues by scanning the ID card and the book's barcode, with the due date from the settings (Done when 1)", async () => {
    const { copies } = await addTestBook(f, "Two Scans", 1);
    const result = await run(async (tx) => {
      const s = await librarySettings(tx, ctx());
      const member = await memberByCode(tx, ctx(), s, `${f.school.code}:ADM-101`);
      const copy = await copyByCode(tx, copies[0].barcode);
      return issueBook(tx, ctx(), { member: member!, copyId: copy!.id, today: TODAY });
    });
    expect(result.issue.studentId).toBe(f.meena.id);
    // Class 1 is a Middle class: 14 days.
    expect(result.dueOn.toISOString().slice(0, 10)).toBe("2026-10-26");
    // A different due date needs a reason.
    const other = await addTestBook(f, "Due Date Reason", 1);
    const meena = await student(f, f.meena);
    await expect(run((tx) => issueBook(tx, ctx(), { member: meena, copyId: other.copies[0].id, dueOn: plus(TODAY, 3), today: TODAY }))).rejects.toThrow(/Say why the due date is different/);
    const staff = await run(async (tx) => memberByCode(tx, ctx(), await librarySettings(tx, ctx()), "s-21"));
    expect(staff).toMatchObject({ kind: "STAFF", staffId: f.teacherStaff.id, limit: 5, loanDays: 30 });
  });

  it("blocks a fourth book for a student with a limit of 3 (Done when 2)", async () => {
    const ravi = await student(f, f.ravi);
    expect(ravi.limit).toBe(3);
    for (let i = 1; i <= 3; i++) {
      const b = await addTestBook(f, `Limit ${i}`, 1);
      await run((tx) => issueBook(tx, ctx(), { member: ravi, copyId: b.copies[0].id, today: TODAY }));
    }
    const fourth = await addTestBook(f, "Limit 4", 1);
    await expect(run((tx) => issueBook(tx, ctx(), { member: ravi, copyId: fourth.copies[0].id, today: TODAY }))).rejects.toThrow("Ravi has 3 of 3 books. Return a book first, or raise the limit with a reason.");
  });

  it("says who has a copy that is already out", async () => {
    const b = await addTestBook(f, "Already Out", 1);
    const sita = await student(f, f.sita);
    const arjun = await student(f, f.arjun);
    await run((tx) => issueBook(tx, ctx(), { member: sita, copyId: b.copies[0].id, today: TODAY }));
    await expect(run((tx) => issueBook(tx, ctx(), { member: arjun, copyId: b.copies[0].id, today: TODAY }))).rejects.toThrow(`Copy ${b.copies[0].accessionNo} is issued to Sita, 1 A.`);
  });

  it("records the fine at the set rate for a return 5 days late, and adds it to the student's fees (Done when 3)", async () => {
    const b = await addTestBook(f, "Late Book", 1);
    const kavya = await student(f, f.kavya);
    await run((tx) => issueBook(tx, ctx(), { member: kavya, copyId: b.copies[0].id, today: TODAY }));
    const back = await run((tx) => returnBook(tx, ctx(), { copyId: b.copies[0].id, damaged: false, today: plus(TODAY, 19) }));
    expect(back.fine).toMatchObject({ lateDays: 5, amountPaise: BigInt(1000) });
    expect(back.lateRow).toMatchObject({ reason: "LATE", lateDays: 5, amountPaise: BigInt(1000), status: "DUE" });
    expect(back.lateRow?.feeDueId).toBeTruthy();
    const due = await run((tx) => tx.studentFeeDue.findFirstOrThrow({ where: { id: back.lateRow!.feeDueId! } }));
    expect(due).toMatchObject({ studentId: f.kavya.id, amountPaise: BigInt(1000), balancePaise: BigInt(1000), kind: "CHARGE" });
    // Waiving the fine removes the fee row with the reason; nothing is deleted.
    await run((tx) => waiveFine(tx, ctx(), back.lateRow!.id, "First time late, parent called"));
    const after = await run((tx) => Promise.all([tx.libraryFine.findFirstOrThrow({ where: { id: back.lateRow!.id } }), tx.studentFeeDue.findFirstOrThrow({ where: { id: due.id } })]));
    expect(after[0].status).toBe("WAIVED");
    expect(after[1].state).toBe("REMOVED");
  });

  it("marks a fine paid once its fee row is paid in Fee Management", async () => {
    const b = await addTestBook(f, "Paid In Fees", 1);
    const kavya = await student(f, f.kavya);
    await run((tx) => issueBook(tx, ctx(), { member: kavya, copyId: b.copies[0].id, today: TODAY }));
    const back = await run((tx) => returnBook(tx, ctx(), { copyId: b.copies[0].id, damaged: false, today: plus(TODAY, 16) }));
    expect(back.lateRow?.amountPaise).toBe(BigInt(400));
    // The accountant collects it with the other fees: the fee row has nothing left to pay.
    await run((tx) => tx.studentFeeDue.update({ where: { id: back.lateRow!.feeDueId! }, data: { paidPaise: BigInt(400), balancePaise: BigInt(0) } }));
    expect(await run((tx) => syncFeeFines(tx, ctx()))).toBe(1);
    expect(await run((tx) => tx.libraryFine.findFirstOrThrow({ where: { id: back.lateRow!.id } }))).toMatchObject({ status: "PAID", paidHow: "fees" });
  });

  it("does not renew a reserved book, and keeps the returned copy for the first member in the queue (Done when 4)", async () => {
    const b = await addTestBook(f, "Wanted Book", 1);
    const meena = await student(f, f.meena);
    const rahul = await student(f, f.rahul);
    const arjun = await student(f, f.arjun);
    const issue = await run((tx) => issueBook(tx, ctx(), { member: meena, copyId: b.copies[0].id, today: TODAY }));
    const r = await run((tx) => reserveBook(tx, ctx(), rahul, b.book.id));
    expect(r.position).toBe(1);
    await expect(run((tx) => renewIssue(tx, ctx(), issue.issue.id, plus(TODAY, 2)))).rejects.toThrow("Reserved by 1 member. Please return the book so the next member can have it.");
    const back = await run((tx) => returnBook(tx, ctx(), { copyId: b.copies[0].id, damaged: false, today: plus(TODAY, 5) }));
    expect(back.next?.member.name).toBe("Rahul Reddy");
    const copy = await run((tx) => tx.bookCopy.findFirstOrThrow({ where: { id: b.copies[0].id } }));
    expect(copy.status).toBe("RESERVED");
    // Someone else cannot take the copy kept for Rahul.
    await expect(run((tx) => issueBook(tx, ctx(), { member: arjun, copyId: b.copies[0].id, today: plus(TODAY, 5) }))).rejects.toThrow("Next in queue: Rahul, 1 A.");
    await run((tx) => issueBook(tx, ctx(), { member: rahul, copyId: b.copies[0].id, today: plus(TODAY, 5) }));
    const res = await run((tx) => tx.reservation.findFirstOrThrow({ where: { id: r.reservation.id } }));
    expect(res.status).toBe("COLLECTED");
  });

  it("blocks a third renewal when the most is 2 (Done when 8)", async () => {
    const b = await addTestBook(f, "Renew Me", 1);
    const arjun = await student(f, f.arjun);
    const issue = await run((tx) => issueBook(tx, ctx(), { member: arjun, copyId: b.copies[0].id, today: TODAY }));
    const one = await run((tx) => renewIssue(tx, ctx(), issue.issue.id, plus(TODAY, 1)));
    expect(one.renewals).toBe(1);
    expect(one.dueOn.toISOString().slice(0, 10)).toBe("2026-10-27");
    expect((await run((tx) => renewIssue(tx, ctx(), issue.issue.id, plus(TODAY, 2)))).renewals).toBe(2);
    await expect(run((tx) => renewIssue(tx, ctx(), issue.issue.id, plus(TODAY, 3)))).rejects.toThrow("Already renewed 2 times. Please return the book.");
  });

  it("serves a staff reservation before an earlier student's when staff first is on (Done when 9)", async () => {
    const b = await addTestBook(f, "Staff First", 1);
    const sita = await student(f, f.sita);
    const arjun = await student(f, f.arjun);
    const kiran = await staffMember(f, f.teacherStaff);
    await run((tx) => issueBook(tx, ctx(), { member: sita, copyId: b.copies[0].id, today: TODAY }));
    await run((tx) => reserveBook(tx, ctx(), arjun, b.book.id));
    const staffRes = await run((tx) => reserveBook(tx, ctx(), kiran, b.book.id));
    expect(staffRes.position).toBe(2);
    await run((tx) => tx.librarySetting.update({ where: { schoolId: f.school.id }, data: { queueOrder: "staff-first" } }));
    const back = await run((tx) => returnBook(tx, ctx(), { copyId: b.copies[0].id, damaged: false, today: plus(TODAY, 3) }));
    expect(back.next?.member).toMatchObject({ kind: "STAFF", name: "Kiran Rao" });
    await run((tx) => tx.librarySetting.update({ where: { schoolId: f.school.id }, data: { queueOrder: "fcfs" } }));
  });

  it("sends a lost-book charge above the set amount to Approvals and adds it to fees only when approved (Done when 10)", async () => {
    const b = await addTestBook(f, "Costly Atlas", 1, { pricePaise: BigInt(80000) });
    const rahul = await student(f, f.rahul);
    await run((tx) => issueBook(tx, ctx(), { member: rahul, copyId: b.copies[0].id, today: TODAY }));
    const lost = await run((tx) => markLostOrDamaged(tx, ctx(), { copyId: b.copies[0].id, kind: "LOST", chargePaise: null, note: "Lost on the bus", today: plus(TODAY, 4) }));
    // Price ₹800 plus the ₹50 fee.
    expect(lost.charge).toBe(BigInt(85000));
    expect(lost.fine).toMatchObject({ status: "WAITING", feeDueId: null });
    const approval = await withSchool(as(f, f.principal.id), (tx) => tx.approval.findFirstOrThrow({ where: { id: lost.fine!.approvalId! } }));
    expect(approval).toMatchObject({ type: "library-charge", status: "WAITING", amountPaise: BigInt(85000) });
    expect(await run((tx) => tx.studentFeeDue.count({ where: { studentId: f.rahul.id, amountPaise: BigInt(85000) } }))).toBe(0);
    // The copy is archived as lost, never deleted, and the issue is closed.
    const copy = await run((tx) => tx.bookCopy.findFirstOrThrow({ where: { id: b.copies[0].id } }));
    expect(copy.status).toBe("LOST");
    await withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), approval.id, "approve", null));
    const fine = await run((tx) => tx.libraryFine.findFirstOrThrow({ where: { id: lost.fine!.id } }));
    expect(fine.status).toBe("DUE");
    expect(fine.feeDueId).toBeTruthy();
    expect(await run((tx) => tx.studentFeeDue.count({ where: { id: fine.feeDueId!, amountPaise: BigInt(85000) } }))).toBe(1);
    // A charge at or below the amount is due at once.
    const small = await addTestBook(f, "Cheap Comic", 1, { pricePaise: BigInt(4000) });
    // Rahul now owes ₹850, so he cannot borrow: Kavya has this one.
    const kavya = await student(f, f.kavya);
    await run((tx) => issueBook(tx, ctx(), { member: kavya, copyId: small.copies[0].id, today: TODAY }));
    const torn = await run((tx) => returnBook(tx, ctx(), { copyId: small.copies[0].id, damaged: true, damageChargePaise: BigInt(2000), note: "Cover torn", today: plus(TODAY, 2) }));
    expect(torn.damageRow).toMatchObject({ reason: "DAMAGED", status: "DUE", approvalId: null });
  });

  it("holds the TC while a book is not returned, until it is returned or marked lost and charged (Done when 5)", async () => {
    const b = await addTestBook(f, "Leaving Book", 1, { pricePaise: BigInt(10000) });
    const sita = await student(f, f.sita);
    const sitaOut = await run((tx) => tx.bookIssue.count({ where: { studentId: f.sita.id, returnedAt: null } }));
    await run((tx) => issueBook(tx, ctx(), { member: sita, copyId: b.copies[0].id, today: TODAY }));
    const lib = async () => (await run((tx) => runClearanceChecks(tx, ctx(), f.sita.id))).find((c) => c.name === "Library")!;
    expect(await lib()).toMatchObject({ clear: false, detail: `${sitaOut + 1} library books not returned` });
    // Return or mark lost the other books Sita has.
    const open = await run((tx) => tx.bookIssue.findMany({ where: { studentId: f.sita.id, returnedAt: null } }));
    for (const i of open) {
      if (i.copyId === b.copies[0].id) await run((tx) => markLostOrDamaged(tx, ctx(), { copyId: i.copyId, kind: "LOST", chargePaise: null, note: null, today: plus(TODAY, 1) }));
      else await run((tx) => returnBook(tx, ctx(), { copyId: i.copyId, damaged: false, today: plus(TODAY, 1) }));
    }
    // The ₹150 lost charge went to fees (Fees holds the TC until it is paid), so the Library check is clear.
    expect(await lib()).toMatchObject({ clear: true });
    // With the module switched off the check does not run.
    await run((tx) => tx.schoolModule.update({ where: { schoolId_moduleKey: { schoolId: f.school.id, moduleKey: "library-management" } }, data: { isOn: false } }));
    expect((await run((tx) => runClearanceChecks(tx, ctx(), f.sita.id))).find((c) => c.name === "Library")).toBeUndefined();
    await run((tx) => tx.schoolModule.update({ where: { schoolId_moduleKey: { schoolId: f.school.id, moduleKey: "library-management" } }, data: { isOn: true } }));
  });

  it("shows the same overdue count in the reports as on Issue & Return (Done when 7)", async () => {
    const b = await addTestBook(f, "Long Overdue", 2);
    const meena = await student(f, f.meena);
    const kiran = await staffMember(f, f.teacherStaff);
    await run((tx) => issueBook(tx, ctx(), { member: meena, copyId: b.copies[0].id, today: plus(TODAY, -40) }));
    await run((tx) => issueBook(tx, ctx(), { member: kiran, copyId: b.copies[1].id, today: plus(TODAY, -40) }));
    const [desk, reports, table] = await run(async (tx) => [
      await tx.bookIssue.count({ where: overdueWhere(TODAY) }),
      await overdueCount(tx, TODAY),
      await overdueReport(tx, ctx(), { from: null, to: null, today: TODAY, sectionIds: null }),
    ] as const);
    expect(desk).toBeGreaterThanOrEqual(2);
    expect(reports).toBe(desk);
    expect(table.rows).toHaveLength(desk);
    // The Principal's Remind tells the librarian in the app.
    const p = as(f, f.principal.id);
    expect(await withSchool(p, (tx) => remindLibrarian(tx, p, "Please follow up on the overdue books."))).toBe(1);
    const note = await withSchool(as(f, f.librarian.id), (tx) => tx.notification.findFirst({ where: { userLoginId: f.librarian.id, type: "library-remind" } }));
    expect(note?.text).toContain("overdue books");
  });

  it("stops issues for a blocked member and when fines due are above the set amount", async () => {
    const b = await addTestBook(f, "Blocked Test", 1, { pricePaise: BigInt(20000) });
    const arjun = await student(f, f.arjun);
    await run((tx) => setBlocked(tx, ctx(), arjun, true, "Tore pages of two books"));
    const blocked = await student(f, f.arjun);
    await expect(run((tx) => issueBook(tx, ctx(), { member: blocked, copyId: b.copies[0].id, today: TODAY }))).rejects.toThrow(/Arjun Reddy is blocked: Tore pages of two books/);
    await run((tx) => setBlocked(tx, ctx(), blocked, false, "Parent met the librarian"));
    // ₹120 due is above the ₹100 that stops issues.
    const free = await student(f, f.arjun);
    await run(async (tx) => createFine(tx, ctx(), await librarySettings(tx, ctx()), { member: free, reason: "DAMAGED", issueId: null, copyId: b.copies[0].id, bookId: b.book.id, lateDays: null, amountPaise: BigInt(12000), note: "Water damage", book: b.book }));
    await expect(run((tx) => issueBook(tx, ctx(), { member: free, copyId: b.copies[0].id, today: TODAY }))).rejects.toThrow(/fines due. Arjun can borrow again when the fines are paid or waived./);
  });

  it("withdraws a copy with a reason and never deletes library records", async () => {
    const b = await addTestBook(f, "Old Worn Book", 1);
    await expect(run((tx) => withdrawCopy(tx, ctx(), b.copies[0].id, "old"))).rejects.toThrow("Give a reason of at least 5 characters.");
    await run((tx) => withdrawCopy(tx, ctx(), b.copies[0].id, "Pages falling out"));
    const copy = await run((tx) => tx.bookCopy.findFirstOrThrow({ where: { id: b.copies[0].id } }));
    expect(copy).toMatchObject({ status: "WITHDRAWN", statusNote: "Pages falling out" });
    // The app's database role cannot delete.
    await expect(run((tx) => tx.bookCopy.delete({ where: { id: copy.id } }))).rejects.toThrow();
    await expect(run((tx) => tx.libraryFine.deleteMany({}))).rejects.toThrow();
    await expect(run((tx) => tx.bookIssue.deleteMany({}))).rejects.toThrow();
  });

  it("lists missing copies after a stock check, and marks them lost only after review (Done when 6)", async () => {
    const s = await run((tx) => startSession(tx, ctx(), "October 2026"));
    await expect(run((tx) => startSession(tx, ctx(), "Another one"))).rejects.toThrow(/still open/);
    const shelf = await run((tx) => tx.bookCopy.findMany({ where: { status: { in: ON_SHELF } }, orderBy: { accessionNo: "asc" } }));
    expect(shelf.length).toBeGreaterThan(3);
    const [miss1, miss2, ...found] = shelf;
    for (const c of found) await run((tx) => scanCode(tx, ctx(), s.id, c.barcode));
    expect((await run((tx) => scanCode(tx, ctx(), s.id, found[0].barcode))).kind).toBe("again");
    expect((await run((tx) => scanCode(tx, ctx(), s.id, "NOT-A-BOOK"))).kind).toBe("unknown");
    const closed = await run((tx) => closeSession(tx, ctx(), s.id));
    expect(closed).toMatchObject({ status: "CLOSED", expected: shelf.length, found: found.length, missing: 2, extra: 1 });
    const missing = await run((tx) => stillMissing(tx, s.id));
    expect(missing.map((c) => c.id).sort()).toEqual([miss1.id, miss2.id].sort());
    expect(await run((tx) => markMissingLost(tx, ctx(), s.id))).toBe(2);
    const after = await run((tx) => tx.bookCopy.findMany({ where: { id: { in: [miss1.id, miss2.id] } } }));
    expect(after.every((c) => c.status === "LOST")).toBe(true);
  });

  it("imports the catalogue from a spreadsheet, checking each row, and Undo archives the books", async () => {
    const kind = importKind(CATALOGUE_IMPORT)!;
    expect(kind).toBeTruthy();
    const headers = ["Title", "Author", "ISBN", "Category", "Copies", "Price"];
    const rows = [
      ["The Jungle Book", "Rudyard Kipling", "978-0-14-062104-4", "Fiction", "3", "250"],
      ["Bad ISBN", "Someone", "978-0-14-062104-5", "", "1", ""],
      ["", "No Title", "", "", "", ""],
      ["Space Atlas", "Ravi Kumar; Anita Desai", "", "Astronomy", "2", "abc"],
      ["Tenali Stories", "Unknown", "", "Telugu", "", "120"],
    ];
    const match = autoMatch(kind.columns, headers);
    const preview = await run((tx) => previewImport(tx, ctx(), kind, rows, match));
    expect(preview.good.map((g) => g.row.title)).toEqual(["The Jungle Book", "Tenali Stories"]);
    expect(preview.bad.map((b) => b.problems[0])).toEqual([ISBN_INVALID, "Title is empty.", "Price must be a number of rupees, like 275."]);
    const batch = await run((tx) => runImport(tx, ctx(), kind, "catalogue.csv", preview));
    expect(batch.added).toBe(2);
    const jungle = await run((tx) => tx.book.findFirstOrThrow({ where: { title: "The Jungle Book" }, include: { copies: true } }));
    expect(jungle.copies).toHaveLength(3);
    expect(jungle.pricePaise).toBe(BigInt(25000));
    await run((tx) => undoImport(tx, ctx(), batch.id));
    const undone = await run((tx) => tx.book.findFirstOrThrow({ where: { id: jungle.id }, include: { copies: true } }));
    expect(undone.archivedAt).not.toBeNull();
    expect(undone.copies.every((c) => c.status === "WITHDRAWN")).toBe(true);
  });

  it("keeps the next accession number from going back", async () => {
    const s = await run((tx) => librarySettings(tx, ctx()));
    const input = {
      rules: s.rules, studentBooks: s.studentBooks, studentLoanDays: s.studentLoanDays, staffBooks: s.staffBooks, staffLoanDays: s.staffLoanDays, moveDueOffHolidays: s.moveDueOffHolidays,
      finePerDayPaise: s.finePerDayPaise, maxFinePaise: s.maxFinePaise, graceDays: s.graceDays, blockFinesAbovePaise: s.blockFinesAbovePaise, finesToFees: s.finesToFees,
      lostCharge: "price-plus" as const, lostExtraPaise: s.lostExtraPaise, approvalAbovePaise: s.approvalAbovePaise, maxRenewals: s.maxRenewals, queueOrder: "fcfs" as const, labelType: "barcode" as const,
      accessionPrefix: "", accessionWidth: 5, remindDueTomorrow: true, remindOverdue: true, remindReservation: true,
    };
    await expect(run((tx) => saveSettings(tx, ctx(), { ...input, nextAccession: 1 }))).rejects.toThrow(/can only go up/);
    await expect(run((tx) => saveSettings(tx, ctx(), { ...input, maxFinePaise: BigInt(100), nextAccession: null }))).rejects.toThrow("The most fine for one book cannot be less than the fine for one day.");
    await run((tx) => saveSettings(tx, ctx(), { ...input, nextAccession: 5000 }));
    const { copies } = await addTestBook(f, "After Jump", 1);
    expect(copies[0].accessionNo).toBe("05000");
  });

  it("is switched off by default for a new school", async () => {
    const fresh = await makeSchool("Fresh School");
    const row = await withSchool({ schoolId: fresh.id, userId: null }, (tx) => tx.schoolModule.findFirst({ where: { moduleKey: "library-management" } }));
    expect(row?.isOn ?? false).toBe(false);
  });
});
