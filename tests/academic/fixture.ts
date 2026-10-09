// A small school for Academic Management tests: an active year 2026-27,
// two classes with sections, three subjects, four teachers (one with a
// login), eight periods a day Monday to Saturday, and a published Time Table.
import { randomUUID } from "node:crypto";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import type { Current } from "@/lib/current";
import { makeSchool, makeUser } from "../helpers";

export const d = (s: string) => new Date(`${s}T00:00:00Z`);

export async function academicSchool() {
  const school = await makeSchool("Academic Test School");
  const principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }] });
  const teacherUser = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
  const ctx: SchoolContext = { schoolId: school.id, userId: principal.id };
  const campusId = school.campus.id;

  const data = await withSchool(ctx, async (tx) => {
    const year = await tx.academicYear.create({ data: { schoolId: school.id, campusId, name: "2026-27", startDate: d("2026-04-01"), endDate: d("2027-03-31"), status: "ACTIVE" } });
    const slots = [] as { number: number; s: string; e: string }[];
    for (let n = 1; n <= 8; n++) {
      const start = 8 * 60 + 45 + (n - 1) * 40;
      const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      slots.push({ number: n, s: hm(start), e: hm(start + 40) });
      await tx.periodSlot.create({ data: { schoolId: school.id, campusId, number: n, label: `Period ${n}`, startTime: hm(start), endTime: hm(start + 40) } });
    }
    const staff = [] as { id: string; fullName: string }[];
    for (const [i, name] of ["Asha Rao", "Kiran Das", "Meera Pillai", "Vikram Shah"].entries()) {
      const [first, last] = name.split(" ");
      staff.push(await tx.staff.create({ data: { schoolId: school.id, campusId, staffCode: `T-${i}-${randomUUID().slice(0, 4)}`, firstName: first, lastName: last, fullName: name, phone: `90000000${i}0`, designation: "Teacher", staffType: "Teaching", joiningDate: d("2020-06-01"), userLoginId: i === 0 ? teacherUser.id : undefined } }));
    }
    const [c5, c6] = await Promise.all(["Class 5", "Class 6"].map((name, i) => tx.schoolClass.create({ data: { schoolId: school.id, campusId, name, sortOrder: i + 1 } })));
    const s5a = await tx.section.create({ data: { schoolId: school.id, classId: c5.id, academicYearId: year.id, name: "A", seats: 40, classTeacherId: staff[0].id, room: "101" } });
    const s5b = await tx.section.create({ data: { schoolId: school.id, classId: c5.id, academicYearId: year.id, name: "B", seats: 40, room: "102" } });
    const s6a = await tx.section.create({ data: { schoolId: school.id, classId: c6.id, academicYearId: year.id, name: "A", seats: 40, room: "103" } });
    const subjects: Record<string, string> = {};
    for (const [code, name, ppw] of [["MAT", "Mathematics", 6], ["ENG", "English", 5], ["SCI", "Science", 4]] as const) {
      const s = await tx.subject.create({ data: { schoolId: school.id, code, name } });
      subjects[code] = s.id;
      for (const c of [c5, c6]) await tx.subjectClass.create({ data: { schoolId: school.id, subjectId: s.id, classId: c.id, periodsPerWeek: ppw } });
    }
    // Asha: Maths in 5 A and 5 B. Kiran: English everywhere. Meera: Science everywhere. Vikram: Maths in 6 A.
    const alloc = async (staffId: string, sectionId: string, code: string) => tx.teacherAllocation.create({ data: { schoolId: school.id, academicYearId: year.id, staffId, sectionId, subjectId: subjects[code], fromDate: d("2026-04-01") } });
    await alloc(staff[0].id, s5a.id, "MAT"); await alloc(staff[0].id, s5b.id, "MAT"); await alloc(staff[3].id, s6a.id, "MAT");
    for (const s of [s5a, s5b, s6a]) { await alloc(staff[1].id, s.id, "ENG"); await alloc(staff[2].id, s.id, "SCI"); }

    // Published Time Table: on Monday period 1, Asha in 5 A, Kiran in 5 B, Meera in 6 A.
    const version = await tx.timetableVersion.create({ data: { schoolId: school.id, academicYearId: year.id, campusId, name: "Time Table 2026-27", status: "PUBLISHED", effectiveFrom: d("2026-06-01"), publishedAt: d("2026-05-30") } });
    const put = (sectionId: string, day: number, n: number, code: string, staffId: string) =>
      tx.timetablePeriod.create({ data: { schoolId: school.id, versionId: version.id, sectionId, dayOfWeek: day, periodNo: n, startTime: slots[n - 1].s, endTime: slots[n - 1].e, subjectId: subjects[code], staffId } });
    for (const day of [1, 2, 3, 4, 5]) {
      await put(s5a.id, day, 1, "MAT", staff[0].id);
      await put(s5b.id, day, 1, "ENG", staff[1].id);
      await put(s6a.id, day, 1, "SCI", staff[2].id);
      await put(s5a.id, day, 2, "ENG", staff[1].id);
      await put(s5b.id, day, 2, "MAT", staff[0].id);
      await put(s6a.id, day, 2, "MAT", staff[3].id);
    }
    return { year, staff, c5, c6, s5a, s5b, s6a, subjects, version };
  });

  const currentFor = async (userId: string): Promise<Current> => {
    const access = await accessIn(userId, school.id);
    return { ...access!, ctx: { schoolId: school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null } as unknown as Current;
  };
  return { school, campusId, ctx, principal, teacherUser, ...data, currentFor, run: <T>(fn: (tx: Tx) => Promise<T>) => withSchool(ctx, fn, { timeout: 60_000 }) };
}
