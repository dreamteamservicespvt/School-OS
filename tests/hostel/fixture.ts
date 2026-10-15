// A small school for Hostel Management tests: the Admission test school (this
// year, a Principal, a Vice Principal, a Receptionist and a teacher) plus two
// boys' wardens, a girls' warden, an Accountant and a School Admin, with
// Hostel Management switched on. Class 1 has one section this year with four
// boys and two girls. The Boys' Hostel has rooms B-1 (Non-AC) and B-2 (AC),
// two beds each; the Girls' Hostel has room G-1 with two beds. A hostel fee
// plan of four quarters covers every room.
import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { hostelCan, hostelViewer } from "@/lib/hostel/access";
import { myHostelIds } from "@/lib/hostel/scope";
import { addHostel, saveFeePlan, setWardens } from "@/lib/hostel/settings";
import { addRoom } from "@/lib/hostel/rooms";
import { allocate } from "@/lib/hostel/allocation";
import { admissionSchool, day } from "../admission/fixtures";
import { makeUser } from "../helpers";

export { day };
export const TZ = "Asia/Kolkata";
/** The hostel's "today" in these tests: a Monday. */
export const TODAY = day("2026-10-12");
export const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
/** A moment on a day, as a clock time in India (UTC+5:30). */
export const ist = (iso: string, hh: number, mm = 0) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), hh, mm) - 330 * 60_000);
/** No hostel limit (the person works in every hostel). */
export const anyHostel = () => {};

export async function makeHostelSchool(name = "Hostel Test School") {
  const a = await admissionSchool(name);
  const sid = a.school.id;
  const sys = { schoolId: sid, userId: null };
  await withSchool(sys, (tx) => tx.role.updateMany({ where: { key: { in: ["hostel-warden", "accountant"] } }, data: { isEnabled: true } }));
  const warden = await makeUser({ schools: [{ id: sid, roleKeys: ["hostel-warden"] }], name: "Satish Warden" });
  const warden2 = await makeUser({ schools: [{ id: sid, roleKeys: ["hostel-warden"] }], name: "Mohan Assistant" });
  const gwarden = await makeUser({ schools: [{ id: sid, roleKeys: ["hostel-warden"] }], name: "Sunita Warden" });
  const accountant = await makeUser({ schools: [{ id: sid, roleKeys: ["accountant"] }], name: "Accountant" });
  const admin = await makeUser({ schools: [{ id: sid, roleKeys: ["school-admin"] }], name: "Admin Person" });

  const ids = await withSchool(sys, async (tx) => {
    await tx.schoolModule.upsert({ where: { schoolId_moduleKey: { schoolId: sid, moduleKey: "hostel-management" } }, create: { schoolId: sid, moduleKey: "hostel-management", isOn: true }, update: { isOn: true } });
    const campusId = a.school.campus.id;
    const section = await tx.section.create({ data: { schoolId: sid, classId: a.c1, academicYearId: a.yearId, name: "A" } });
    const kids: [string, string][] = [["Ravi", "Male"], ["Arjun", "Male"], ["Kiran", "Male"], ["Rahul", "Male"], ["Meena", "Female"], ["Sita", "Female"]];
    const students = [];
    for (const [i, [first, gender]] of kids.entries()) {
      const st = await tx.student.create({ data: { schoolId: sid, campusId, admissionNo: `ADM-20${i + 1}`, firstName: first, lastName: "Reddy", fullName: `${first} Reddy`, gender, status: "ACTIVE" } });
      await tx.enrolment.create({ data: { schoolId: sid, studentId: st.id, academicYearId: a.yearId, classId: a.c1, sectionId: section.id, rollNo: i + 1 } });
      const g = await tx.guardian.create({ data: { schoolId: sid, name: `Father of ${first}`, relationship: "Father", phone: `98480${String(10000 + i)}` } });
      await tx.studentGuardian.create({ data: { schoolId: sid, studentId: st.id, guardianId: g.id, relationship: "Father", isPrimary: true } });
      students.push(st);
    }
    const staff = (u: { id: string }, code: string, first: string, phone: string) =>
      tx.staff.create({ data: { schoolId: sid, campusId, staffCode: code, firstName: first, lastName: "Rao", fullName: `${first} Rao`, phone, designation: "Hostel Warden", joiningDate: day("2020-06-01"), userLoginId: u.id } });
    const wardenStaff = await staff(warden, "S-31", "Satish", "9876500131");
    const warden2Staff = await staff(warden2, "S-32", "Mohan", "9876500132");
    const gwardenStaff = await staff(gwarden, "S-33", "Sunita", "9876500133");
    const [ravi, arjun, kiran, rahul, meena, sita] = students;
    return { section, ravi, arjun, kiran, rahul, meena, sita, wardenStaff, warden2Staff, gwardenStaff };
  });

  const P: SchoolContext = { schoolId: sid, userId: admin.id };
  const setup = await withSchool(P, async (tx) => {
    const boys = await addHostel(tx, P, { name: "Boys' Hostel", gender: "BOYS", floors: ["Ground"], note: null });
    const girls = await addHostel(tx, P, { name: "Girls' Hostel", gender: "GIRLS", floors: ["Ground"], note: null });
    const b1 = await addRoom(tx, P, { hostelId: boys.id, floor: "Ground", roomNo: "B-1", beds: 2, roomType: "Non-AC" });
    const b2 = await addRoom(tx, P, { hostelId: boys.id, floor: "Ground", roomNo: "B-2", beds: 2, roomType: "AC" });
    const g1 = await addRoom(tx, P, { hostelId: girls.id, floor: "Ground", roomNo: "G-1", beds: 2, roomType: "Non-AC" });
    await setWardens(tx, P, boys.id, [{ staffId: ids.wardenStaff.id, title: "Warden" }, { staffId: ids.warden2Staff.id, title: "Assistant warden" }], TODAY);
    await setWardens(tx, P, girls.id, [{ staffId: ids.gwardenStaff.id, title: "Warden" }], TODAY);
    const planId = await saveFeePlan(tx, P, null, {
      academicYearId: a.yearId, name: "Hostel fees", hostelId: null, roomType: null, includesMess: true, note: null,
      installments: [
        { label: "Quarter 1", dueDate: day("2026-04-10"), amountPaise: BigInt(2400000) },
        { label: "Quarter 2", dueDate: day("2026-07-10"), amountPaise: BigInt(2400000) },
        { label: "Quarter 3", dueDate: day("2026-10-10"), amountPaise: BigInt(2400000) },
        { label: "Quarter 4", dueDate: day("2027-01-10"), amountPaise: BigInt(2400000) },
      ],
    });
    const beds = await tx.hostelBed.findMany({ include: { room: true }, orderBy: [{ room: { roomNo: "asc" } }, { bedNo: "asc" }] });
    const bed = (room: string, no: number) => beds.find((b) => b.room.roomNo === room && b.bedNo === no)!;
    return { boys, girls, b1, b2, g1, planId, bed };
  });
  return { ...a, warden, warden2, gwarden, accountant, admin, ...ids, ...setup };
}

export type HostelFixture = Awaited<ReturnType<typeof makeHostelSchool>>;

export const as = (f: HostelFixture, userId: string | null): SchoolContext => ({ schoolId: f.school.id, userId });

/** What a person may do in Hostel Management, worked out as the pages and actions do. */
export async function hostelFor(f: HostelFixture, userId: string) {
  const view = await accessIn(userId, f.school.id);
  if (!view) throw new Error("no access");
  const v = hostelViewer({ ...view, user: { id: userId } });
  const mine = await withSchool(as(f, userId), (tx) => myHostelIds(tx, as(f, userId), v));
  return { v, can: hostelCan(v), view, mine };
}

/** Gives a student a bed as the boys' warden (or the girls' warden for a girls' bed), checked in, with the hostel fees. */
export async function giveBed(f: HostelFixture, student: { id: string }, bedId: string, opts: { start?: Date; checkedIn?: boolean; fees?: boolean; now?: Date } = {}) {
  const bed = await withSchool(as(f, f.admin.id), (tx) => tx.hostelBed.findUniqueOrThrow({ where: { id: bedId } }));
  const ctx = as(f, bed.hostelId === f.girls.id ? f.gwarden.id : f.warden.id);
  return withSchool(ctx, (tx) => allocate(tx, ctx, {
    studentId: student.id, bedId, startDate: opts.start ?? TODAY, checkedIn: opts.checkedIn ?? true, feePlanId: opts.fees === false ? "none" : f.planId, note: null,
  }, { now: opts.now ?? ist("2026-10-12", 9), assertHostel: anyHostel }));
}
