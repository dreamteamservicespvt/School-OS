// A school for checking that every Dashboard number matches the list it opens
// (01-dashboard.md §2 Actions, §5 "Tile numbers must match the list behind
// them"; gap list G36). Two campuses, each with its own year; students who are
// studying, one who left and one archived; today's attendance with a holiday
// tomorrow on the main campus; payments today (one cancelled, one partial, one
// cheque waiting); dues overdue (also for the student who left and the archived
// one); expenses waiting this financial year and last; staff of every status;
// enquiries, applications and approvals on both campuses.
import { randomUUID } from "node:crypto";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { ensureAttendanceDefaults } from "@/lib/attendance/settings";
import { ensureFeeDefaults } from "@/lib/fees/settings";
import { ensureFinanceDefaults } from "@/lib/finance/settings";
import type { Current } from "@/lib/current";
import { makeSchool, makeUser } from "../helpers";

export const day = (s: string) => new Date(`${s}T00:00:00Z`);
/** Monday 12 October 2026, 12:00 noon in India. */
export const NOW = new Date("2026-10-12T06:30:00Z");
export const TODAY = day("2026-10-12");
const R = (rupees: number) => BigInt(rupees * 100);

let phone = 7000000000 + Math.floor(Math.random() * 90000000);
const nextPhone = () => String(++phone);

export async function drillSchool() {
  const school = await makeSchool("Drill School");
  const sid = school.id;
  const make = (roleKeys: string[], name: string) => makeUser({ schools: [{ id: sid, roleKeys }], name });
  const users = {
    principal: (await make(["principal"], "Padma Principal")).id,
    accountant: (await make(["accountant"], "Arun Accountant")).id,
    northAdmin: (await make(["school-admin"], "Nalini North")).id,
    northAccountant: (await make(["accountant"], "Naresh North")).id,
    classTeacher: (await make(["class-teacher"], "Kamala Teacher")).id,
    receptionist: (await make(["receptionist"], "Rani Reception")).id,
  };
  const ctx: SchoolContext = { schoolId: sid, userId: users.principal };
  const run = <T>(fn: (tx: Tx) => Promise<T>) => withSchool(ctx, fn, { timeout: 120_000 });

  const made = await run(async (tx) => {
    const main = school.campus.id;
    const north = (await tx.campus.create({ data: { schoolId: sid, name: "North Campus" } })).id;
    await tx.schoolAccess.updateMany({ where: { schoolId: sid, userLoginId: { in: [users.northAdmin, users.northAccountant] } }, data: { scope: "CAMPUS", campusId: north } });
    const mainYear = await tx.academicYear.create({ data: { schoolId: sid, campusId: main, name: "2026-27", startDate: day("2026-04-01"), endDate: day("2027-03-31"), status: "ACTIVE" } });
    const northYear = await tx.academicYear.create({ data: { schoolId: sid, campusId: north, name: "2026-27", startDate: day("2026-06-01"), endDate: day("2027-05-31"), status: "ACTIVE" } });
    // Tomorrow is a holiday on the main campus only.
    await tx.calendarEntry.create({ data: { schoolId: sid, campusId: main, academicYearId: mainYear.id, type: "holiday", title: "Dussehra", startDate: day("2026-10-13"), endDate: day("2026-10-13") } });

    const staff = (campusId: string, name: string, over: Record<string, unknown> = {}) => tx.staff.create({ data: {
      schoolId: sid, campusId, staffCode: `S-${randomUUID().slice(0, 6)}`, firstName: name.split(" ")[0], lastName: name.split(" ")[1], fullName: name,
      phone: nextPhone(), designation: "Teacher", staffType: "Teaching", joiningDate: day("2020-06-01"), ...over,
    } });
    const st = {
      principal: await staff(main, "Padma Principal", { userLoginId: users.principal, designation: "Principal" }),
      teacher: await staff(main, "Kamala Teacher", { userLoginId: users.classTeacher }),
      mainOther: await staff(main, "Mohan Main"),
      onLeave: await staff(main, "Latha Leave", { status: "ON_LEAVE" }),
      resigned: await staff(main, "Ravi Resigned", { status: "RESIGNED" }),
      archived: await staff(main, "Arch Ived", { archivedAt: day("2026-09-01") }),
      northAdmin: await staff(north, "Nalini North", { userLoginId: users.northAdmin }),
      northOther: await staff(north, "Neel North"),
    };

    const mainClass = await tx.schoolClass.create({ data: { schoolId: sid, campusId: main, name: "Class 5", sortOrder: 5 } });
    const northClass = await tx.schoolClass.create({ data: { schoolId: sid, campusId: north, name: "Class 5", sortOrder: 5 } });
    const m5a = await tx.section.create({ data: { schoolId: sid, classId: mainClass.id, academicYearId: mainYear.id, name: "A", seats: 40, classTeacherId: st.teacher.id } });
    const m5b = await tx.section.create({ data: { schoolId: sid, classId: mainClass.id, academicYearId: mainYear.id, name: "B", seats: 40 } });
    const n5a = await tx.section.create({ data: { schoolId: sid, classId: northClass.id, academicYearId: northYear.id, name: "A", seats: 40, classTeacherId: st.northOther.id } });

    let adm = 0;
    const student = async (section: { id: string; classId: string; academicYearId: string }, campusId: string, name: string, over: { status?: "ACTIVE" | "TRANSFERRED"; leavingDate?: Date; archivedAt?: Date; enrolment?: "STUDYING" | "LEFT" } = {}) => {
      const s = await tx.student.create({ data: {
        schoolId: sid, campusId, admissionNo: `D-${++adm}-${randomUUID().slice(0, 4)}`, firstName: name.split(" ")[0], lastName: name.split(" ")[1], fullName: name,
        status: over.status ?? "ACTIVE", leavingDate: over.leavingDate ?? null, archivedAt: over.archivedAt ?? null, joiningDate: day("2026-06-10"),
      } });
      await tx.enrolment.create({ data: { schoolId: sid, studentId: s.id, academicYearId: section.academicYearId, classId: section.classId, sectionId: section.id, status: over.enrolment ?? "STUDYING", rollNo: adm } });
      const g = await tx.guardian.create({ data: { schoolId: sid, name: `Parent of ${name.split(" ")[0]}`, relationship: "Father", phone: nextPhone() } });
      await tx.studentGuardian.create({ data: { schoolId: sid, studentId: s.id, guardianId: g.id, relationship: "Father", isPrimary: true } });
      return { ...s, guardianId: g.id };
    };
    const kids = {
      a1: await student(m5a, main, "Aarav Sharma"),
      a2: await student(m5a, main, "Diya Reddy"),
      a3: await student(m5a, main, "Ishaan Kumar"),
      a4: await student(m5a, main, "Meera Iyer"),
      left: await student(m5a, main, "Lalit Left", { status: "TRANSFERRED", leavingDate: day("2026-09-01"), enrolment: "LEFT" }),
      gone: await student(m5a, main, "Archie Archived", { archivedAt: day("2026-09-15") }),
      b1: await student(m5b, main, "Bina Bose"),
      b2: await student(m5b, main, "Bala Murthy"),
      b3: await student(m5b, main, "Bhavya Rao"),
      n1: await student(n5a, north, "Neha Nair"),
      n2: await student(n5a, north, "Nikhil Naidu"),
      n3: await student(n5a, north, "Nisha Patel"),
    };

    // Data consent: given by Aarav's parent, given and then withdrawn by Diya's.
    const text = await tx.consentText.create({ data: { schoolId: sid, consentType: "data-processing", title: "Data consent", version: 1, text: { en: "We keep your child's data." } } });
    await tx.consentRecord.create({ data: { schoolId: sid, guardianId: kids.a1.guardianId, studentId: kids.a1.id, consentType: "data-processing", consentTextId: text.id, textVersion: 1, how: "office" } });
    await tx.consentRecord.create({ data: { schoolId: sid, guardianId: kids.a2.guardianId, studentId: kids.a2.id, consentType: "data-processing", consentTextId: text.id, textVersion: 1, how: "office", withdrawnAt: day("2026-10-01"), withdrawnHow: "office" } });

    // Today's attendance: 5 A marked (the student who left is marked too, and must not count), 5 B not marked, North marked.
    await ensureAttendanceDefaults(tx, ctx);
    const mark = (studentId: string, sectionId: string, yearId: string, statusKey: string) => tx.attendanceMark.create({ data: { schoolId: sid, academicYearId: yearId, studentId, sectionId, date: TODAY, statusKey } });
    await mark(kids.a1.id, m5a.id, mainYear.id, "present");
    await mark(kids.a2.id, m5a.id, mainYear.id, "present");
    await mark(kids.a3.id, m5a.id, mainYear.id, "absent");
    await mark(kids.a4.id, m5a.id, mainYear.id, "late");
    await mark(kids.left.id, m5a.id, mainYear.id, "absent");
    await mark(kids.n1.id, n5a.id, northYear.id, "present");
    await mark(kids.n2.id, n5a.id, northYear.id, "present");
    await mark(kids.n3.id, n5a.id, northYear.id, "absent");
    for (const [s, k] of [[st.principal, "present"], [st.teacher, "late"], [st.northAdmin, "present"], [st.resigned, "present"]] as const) {
      await tx.attendanceMark.create({ data: { schoolId: sid, staffId: s.id, date: TODAY, statusKey: k } });
    }

    // Attendance concerns: Ishaan (5 A) absent 3 days in a row, as is the student who left; Nisha (North) below the threshold.
    const flag = (studentId: string, kind: string, value: number) => tx.attendanceFlag.create({ data: { schoolId: sid, studentId, kind, value, raisedOn: day("2026-10-09") } });
    await flag(kids.a3.id, "absent-streak", 3);
    await flag(kids.left.id, "absent-streak", 5);
    await flag(kids.n3.id, "below-threshold", 62);
    await flag(kids.n3.id, "absent-streak", 3);

    // Fees: one head, dues per student; the first installment (1 July) is overdue.
    await ensureFeeDefaults(tx, ctx);
    await ensureFinanceDefaults(tx, ctx);
    const head = await tx.feeHead.create({ data: { schoolId: sid, name: "Tuition fee", kind: "tuition" } });
    const due = (s: { id: string }, yearId: string, label: string, date: string, amount: number, paid = 0) => tx.studentFeeDue.create({ data: {
      schoolId: sid, studentId: s.id, academicYearId: yearId, feeHeadId: head.id, label, dueDate: day(date), amountPaise: R(amount), paidPaise: R(paid), balancePaise: R(amount - paid),
    } });
    for (const k of [kids.a1, kids.a2, kids.a3, kids.left, kids.gone, kids.b1]) await due(k, mainYear.id, "Term 1", "2026-07-01", 6000, k === kids.a1 ? 6000 : 0);
    for (const k of [kids.a1, kids.a2, kids.b1, kids.b2]) await due(k, mainYear.id, "Term 2", "2026-10-20", 6000);
    await due(kids.a4, mainYear.id, "Term 1", "2026-09-01", 6000, 2000);
    for (const k of [kids.n1, kids.n2]) await due(k, northYear.id, "Term 1", "2026-08-01", 5000, k === kids.n1 ? 5000 : 0);

    const pay = (s: { id: string }, yearId: string, amount: number, over: Record<string, unknown> = {}) => tx.payment.create({ data: {
      schoolId: sid, studentId: s.id, academicYearId: yearId, amountPaise: R(amount), mode: "CASH", paidAt: NOW, paymentDate: TODAY, status: "POSTED", ...over,
    } });
    await pay(kids.a1, mainYear.id, 6000);
    await pay(kids.a4, mainYear.id, 2000, { isPartial: true, mode: "UPI" });
    await pay(kids.n1, northYear.id, 5000);
    await pay(kids.b2, mainYear.id, 1500, { status: "CANCELLED", cancelReason: "Wrong student", cancelledAt: NOW });
    await pay(kids.b3, mainYear.id, 3000, { status: "WAITING", mode: "CHEQUE", chequeNo: "123456", paymentDate: day("2026-03-20"), paidAt: day("2026-03-20") });
    await pay(kids.n2, northYear.id, 2500, { status: "WAITING", mode: "CHEQUE", chequeNo: "654321" });
    await pay(kids.a2, mainYear.id, 4000, { paymentDate: day("2026-10-10"), paidAt: day("2026-10-10") });

    // Expenses: two waiting this financial year, one waiting from last year, one approved.
    const fyNow = await tx.financialYear.create({ data: { schoolId: sid, name: "2026-27", startDate: day("2026-04-01"), endDate: day("2027-03-31") } });
    const fyLast = await tx.financialYear.create({ data: { schoolId: sid, name: "2025-26", startDate: day("2025-04-01"), endDate: day("2026-03-31") } });
    const expHead = await tx.accountHead.findFirstOrThrow({ where: { kind: "EXPENSE", systemKey: null }, orderBy: { code: "asc" } });
    let exp = 0;
    const expense = (fy: string, date: string, amount: number, status: "WAITING" | "APPROVED") => tx.expense.create({ data: { schoolId: sid, financialYearId: fy, number: `EXP-${++exp}`, date: day(date), accountHeadId: expHead.id, amountPaise: R(amount), status, note: `Expense ${exp}` } });
    await expense(fyNow.id, "2026-10-09", 1200, "WAITING");
    await expense(fyNow.id, "2026-10-12", 800, "WAITING");
    await expense(fyLast.id, "2026-03-25", 5000, "WAITING");
    await expense(fyNow.id, "2026-10-01", 900, "APPROVED");

    // Admissions: enquiries this week and applications waiting for a decision, on both campuses.
    const enquiry = (campusId: string, yearId: string, child: string, daysAgo: number) => tx.enquiry.create({ data: {
      schoolId: sid, campusId, academicYearId: yearId, childName: child, parentName: `Parent of ${child}`, phone: nextPhone(), source: "walk-in", firstSource: "walk-in",
      createdAt: new Date(NOW.getTime() - daysAgo * 86_400_000), nextFollowUpAt: new Date(NOW.getTime() - 3_600_000),
    } });
    await enquiry(main, mainYear.id, "Tara", 1);
    await enquiry(main, mainYear.id, "Uday", 3);
    await enquiry(main, mainYear.id, "Old Enquiry", 20);
    await enquiry(north, northYear.id, "Varun", 2);
    let app = 0;
    const application = (campusId: string, yearId: string, classId: string, name: string, stage: "DECISION" | "SUBMITTED") => tx.application.create({ data: {
      schoolId: sid, campusId, academicYearId: yearId, applicationNo: `APP-${++app}`, classId, firstName: name.split(" ")[0], fullName: name,
      dateOfBirth: day("2019-05-05"), gender: "Female", phone: nextPhone(), address: "Hyderabad", stage,
    } });
    await application(main, mainYear.id, mainClass.id, "Asha Main", "DECISION");
    await application(main, mainYear.id, mainClass.id, "Bindu Main", "DECISION");
    await application(main, mainYear.id, mainClass.id, "Chitra Main", "SUBMITTED");
    await application(north, northYear.id, northClass.id, "Nila North", "DECISION");

    // Approvals waiting for the Principal.
    for (const summary of ["Discount for Aarav", "Refund for Diya"]) {
      await tx.approval.create({ data: { schoolId: sid, type: "fee-discount", recordType: "Student", recordId: kids.a1.id, summary, askedById: users.accountant, currentApproverRole: "principal" } });
    }
    // A closed year before this one on the main campus (the Dashboard's year filter).
    const pastYear = await tx.academicYear.create({ data: { schoolId: sid, campusId: main, name: "2025-26", startDate: day("2025-04-01"), endDate: day("2026-03-31"), status: "CLOSED" } });
    // A student studying with no class yet this year (the Classes overview shows "not yet in a section").
    const unplaced = await tx.student.create({ data: { schoolId: sid, campusId: main, admissionNo: `D-U-${randomUUID().slice(0, 4)}`, firstName: "Uma", lastName: "Unplaced", fullName: "Uma Unplaced", status: "ACTIVE", joiningDate: day("2026-10-01") } });
    return { main, north, mainYear, northYear, mainClass, northClass, m5a, m5b, n5a, st, kids, head, fyNow, fyLast, pastYear, unplaced };
  });

  // The optional modules' cards (gap list G36): messages, library, hostel, store, leave and homework.
  const more = await run(async (tx) => {
    const { main, mainYear, mainClass, m5a, m5b, st, kids, fyNow, fyLast } = made;
    for (const moduleKey of ["library-management", "hostel-management", "inventory-management", "homework-learning"]) {
      await tx.schoolModule.upsert({ where: { schoolId_moduleKey: { schoolId: sid, moduleKey } }, create: { schoolId: sid, moduleKey, isOn: true }, update: { isOn: true } });
    }
    const hour = 3_600_000;

    // Messages: two not delivered this week (three people), one failed three weeks ago, one cancelled on purpose.
    const message = (title: string, at: Date) => tx.message.create({ data: { schoolId: sid, title, body: title, audienceLabel: "Parents", status: "SENT", channels: ["sms"], createdAt: at } });
    const person = (messageId: string, name: string, status: "FAILED" | "DELIVERED", failedAt: Date | null, failReason: string | null = null) => tx.messageRecipient.create({ data: {
      schoolId: sid, messageId, recipientType: "guardian", name, channel: "sms", address: nextPhone(), text: "Hello", status, failedAt, failReason,
    } });
    const m1 = await message("Fee reminder", new Date(NOW.getTime() - 48 * hour));
    await person(m1.id, "Parent A", "FAILED", new Date(NOW.getTime() - 24 * hour), "Number not reachable");
    await person(m1.id, "Parent B", "DELIVERED", null);
    const m2 = await message("Holiday notice", new Date(NOW.getTime() - 20 * 24 * hour));
    await person(m2.id, "Parent C", "FAILED", new Date(NOW.getTime() - 20 * 24 * hour), "Number not reachable");
    const m3 = await message("Cancelled one", new Date(NOW.getTime() - 72 * hour));
    await person(m3.id, "Parent D", "FAILED", new Date(NOW.getTime() - 72 * hour), "Cancelled before it was sent.");
    const m4 = await message("PTM invite", new Date(NOW.getTime() - 24 * hour));
    await person(m4.id, "Parent E", "FAILED", new Date(NOW.getTime() - 20 * hour), "Not sent: no channel could carry it");
    await person(m4.id, "Parent F", "FAILED", new Date(NOW.getTime() - 20 * hour), "Number not reachable");

    // Library: books 10 and 8 days late (more than a week), one 3 days late.
    const book = await tx.book.create({ data: { schoolId: sid, title: "Wings of Fire", authorText: "A. P. J. Abdul Kalam" } });
    const issue = async (n: number, student: { id: string }, dueDaysAgo: number) => {
      const copy = await tx.bookCopy.create({ data: { schoolId: sid, bookId: book.id, accessionNo: `ACC-${n}`, barcode: `BC-${n}-${randomUUID().slice(0, 4)}`, status: "ISSUED" } });
      await tx.bookIssue.create({ data: { schoolId: sid, copyId: copy.id, bookId: book.id, memberKind: "STUDENT", studentId: student.id, sectionId: m5a.id, issuedOn: new Date(TODAY.getTime() - (dueDaysAgo + 14) * 86_400_000), dueOn: new Date(TODAY.getTime() - dueDaysAgo * 86_400_000) } });
    };
    await issue(1, kids.a1, 10);
    await issue(2, kids.a2, 8);
    await issue(3, kids.a3, 3);

    // Hostel: two hostels; in the first one boarder is in, one is out on an outing pass, one has not arrived; one boarder in the second.
    const hostel = async (name: string, gender: "BOYS" | "GIRLS", beds: number) => {
      const h = await tx.hostel.create({ data: { schoolId: sid, name, gender } });
      const room = await tx.hostelRoom.create({ data: { schoolId: sid, hostelId: h.id, floor: "Ground", roomNo: `${name[0]}-1` } });
      const list = [];
      for (let b = 1; b <= beds; b++) list.push(await tx.hostelBed.create({ data: { schoolId: sid, hostelId: h.id, roomId: room.id, bedNo: b } }));
      return { h, room, beds: list };
    };
    const boys = await hostel("Boys' Hostel", "BOYS", 3);
    const girls = await hostel("Girls' Hostel", "GIRLS", 1);
    const bed = (x: Awaited<ReturnType<typeof hostel>>, i: number, student: { id: string }, checkedIn: boolean) => tx.bedAllocation.create({ data: {
      schoolId: sid, studentId: student.id, hostelId: x.h.id, roomId: x.room.id, bedId: x.beds[i].id, academicYearId: mainYear.id, startDate: day("2026-06-10"), status: "ACTIVE", checkedInAt: checkedIn ? day("2026-06-10") : null,
    } });
    await bed(boys, 0, kids.a1, true);
    await bed(boys, 1, kids.a3, true);
    await bed(boys, 2, kids.b2, false);
    await bed(girls, 0, kids.a2, true);
    await tx.gatePass.create({ data: { schoolId: sid, passNo: `GP-${randomUUID().slice(0, 6)}`, kind: "HOSTEL_OUTING", studentId: kids.a3.id, reason: "Family visit", timeOut: new Date(NOW.getTime() - 2 * hour), status: "OUT", outingType: "OUTING", fromAt: new Date(NOW.getTime() - 2 * hour), toAt: new Date(NOW.getTime() + 4 * hour), hostelId: boys.h.id, collectorName: "Father" } });

    // Store: vendor bills due in 3 days, in 20 days, 5 days ago (billed last financial year), and one paid.
    const vendor = await tx.vendor.create({ data: { schoolId: sid, name: "Sri Stationers" } });
    const expHead = await tx.accountHead.findFirstOrThrow({ where: { kind: "EXPENSE", systemKey: null }, orderBy: { code: "asc" } });
    let billNo = 0;
    const bill = async (fy: string, billDate: string, dueInDays: number, amount: number, paid: number) => {
      const e = await tx.expense.create({ data: { schoolId: sid, financialYearId: fy, number: `EXP-B${++billNo}`, date: day(billDate), accountHeadId: expHead.id, amountPaise: R(amount), paidPaise: R(paid), status: "APPROVED", note: "Vendor bill" } });
      await tx.purchaseInvoice.create({ data: { schoolId: sid, vendorId: vendor.id, billNo: `INV-${billNo}`, billDate: day(billDate), dueDate: new Date(TODAY.getTime() + dueInDays * 86_400_000), amountPaise: R(amount), expenseId: e.id } });
    };
    await bill(fyNow.id, "2026-10-01", 3, 1000, 0);
    await bill(fyNow.id, "2026-10-05", 20, 2000, 0);
    await bill(fyLast.id, "2026-03-01", -5, 3000, 500);
    await bill(fyNow.id, "2026-10-02", 2, 4000, 4000);

    // Leave: Mohan on approved leave today; Kamala's request still waiting.
    const casual = await tx.leaveType.create({ data: { schoolId: sid, forWhom: "staff", name: "Casual leave", code: "CL" } });
    await tx.leaveRequest.create({ data: { schoolId: sid, leaveTypeId: casual.id, staffId: st.mainOther.id, fromDate: day("2026-10-11"), toDate: day("2026-10-13"), days: 3, reason: "Wedding", status: "APPROVED" } });
    await tx.leaveRequest.create({ data: { schoolId: sid, leaveTypeId: casual.id, staffId: st.teacher.id, fromDate: TODAY, toDate: TODAY, days: 1, reason: "Doctor", status: "WAITING" } });

    // Homework: Kamala's in 5 A (two pieces to check); Mohan's four in 5 B (twelve pieces: piling up).
    const subject = await tx.subject.create({ data: { schoolId: sid, name: "English", code: "ENG" } });
    const homework = (section: { id: string }, teacherId: string, title: string) => tx.homework.create({ data: {
      schoolId: sid, academicYearId: mainYear.id, sectionId: section.id, classId: mainClass.id, subjectId: subject.id, teacherId, title, startDate: day("2026-10-07"), dueDate: day("2026-10-10"),
    } });
    const hw1 = await homework(m5a, st.teacher.id, "Essay: my village");
    for (const [k, status] of [[kids.a1, "SUBMITTED"], [kids.a2, "LATE"], [kids.a3, "ASSIGNED"], [kids.a4, "GRADED"]] as const) {
      await tx.submission.create({ data: { schoolId: sid, homeworkId: hw1.id, studentId: k.id, status } });
    }
    for (let i = 1; i <= 4; i++) {
      const hw = await homework(m5b, st.mainOther.id, `Grammar sheet ${i}`);
      for (const k of [kids.b1, kids.b2, kids.b3]) await tx.submission.create({ data: { schoolId: sid, homeworkId: hw.id, studentId: k.id, status: "SUBMITTED" } });
    }
    return { boys: boys.h, girls: girls.h, main };
  });

  const currentFor = async (userId: string): Promise<Current> => {
    const access = await accessIn(userId, sid);
    return { ...access!, ctx: { schoolId: sid, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null, support: null } as unknown as Current;
  };
  const who = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([k, id]) => [k, await currentFor(id)]))) as Record<keyof typeof users, Current>;
  return { school, ctx, users, who, run, ...made, ...more };
}

export type DrillSchool = Awaited<ReturnType<typeof drillSchool>>;
