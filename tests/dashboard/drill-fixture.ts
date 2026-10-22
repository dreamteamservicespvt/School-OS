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
    return { main, north, mainYear, northYear, mainClass, northClass, m5a, m5b, n5a, st, kids, head, fyNow, fyLast };
  });

  const currentFor = async (userId: string): Promise<Current> => {
    const access = await accessIn(userId, sid);
    return { ...access!, ctx: { schoolId: sid, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null, support: null } as unknown as Current;
  };
  const who = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([k, id]) => [k, await currentFor(id)]))) as Record<keyof typeof users, Current>;
  return { school, ctx, users, who, run, ...made };
}

export type DrillSchool = Awaited<ReturnType<typeof drillSchool>>;
