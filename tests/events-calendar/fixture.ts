// A small school for Events & Calendar tests: the Admission test school (this
// year 2026-27, a Principal, a Vice Principal, a Receptionist and a teacher)
// plus an Accountant, a Librarian (View: the School Calendar only) and a
// second class teacher. Class 1 A (class teacher: the teacher login) has
// Aarav (photo consent given) and Diya (no photo consent); Class 2 A (class
// teacher: Meena) has Kabir.
import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { evCan, evViewer } from "@/lib/events/access";
import type { EventInput } from "@/lib/events/events";
import { admissionSchool, day } from "../admission/fixtures";
import { makeUser } from "../helpers";

export { day };
/** "Today" for the rules: a Thursday in the school year. */
export const TODAY = "2026-10-15";

export async function makeEventsSchool(name = "Events Test School") {
  const a = await admissionSchool(name);
  const sid = a.school.id;
  const sys = { schoolId: sid, userId: null };
  const accountant = await makeUser({ schools: [{ id: sid, roleKeys: ["accountant"] }], name: "Accountant" });
  const librarian = await makeUser({ schools: [{ id: sid, roleKeys: ["librarian"] }], name: "Librarian" });
  const meenaLogin = await makeUser({ schools: [{ id: sid, roleKeys: ["class-teacher"] }], name: "Meena" });
  const ids = await withSchool(sys, async (tx) => {
    const campusId = a.school.campus.id;
    const staff = async (u: { id: string }, code: string, first: string, phone: string) =>
      tx.staff.create({ data: { schoolId: sid, campusId, staffCode: code, firstName: first, lastName: "Rao", fullName: `${first} Rao`, phone, designation: "Teacher", joiningDate: day("2020-06-01"), userLoginId: u.id } });
    const ravi = await staff(a.teacher, "T-1", "Ravi", "9876500201");
    const meena = await staff(meenaLogin, "T-2", "Meena", "9876500202");
    const s1 = await tx.section.create({ data: { schoolId: sid, classId: a.c1, academicYearId: a.yearId, name: "A", classTeacherId: ravi.id } });
    const s2 = await tx.section.create({ data: { schoolId: sid, classId: a.c2, academicYearId: a.yearId, name: "A", classTeacherId: meena.id } });
    const text = await tx.consentText.create({ data: { schoolId: sid, consentType: "photo", title: "Photos", version: 1, text: { en: "Photos of my child may be shared." } } });
    const mk = async (n: number, first: string, sectionId: string, classId: string, consent: boolean) => {
      const st = await tx.student.create({ data: { schoolId: sid, campusId, admissionNo: `EV-${n}`, firstName: first, lastName: "Sharma", fullName: `${first} Sharma`, status: "ACTIVE" } });
      await tx.enrolment.create({ data: { schoolId: sid, studentId: st.id, academicYearId: a.yearId, classId, sectionId, rollNo: n } });
      const g = await tx.guardian.create({ data: { schoolId: sid, name: `Parent of ${first}`, relationship: "Father", phone: `98490312${String(n).padStart(2, "0")}` } });
      await tx.studentGuardian.create({ data: { schoolId: sid, studentId: st.id, guardianId: g.id, relationship: "Father", isPrimary: true } });
      if (consent) await tx.consentRecord.create({ data: { schoolId: sid, guardianId: g.id, studentId: st.id, consentType: "photo", consentTextId: text.id, textVersion: 1, how: "admission-form", givenAt: new Date("2026-04-02T00:00:00Z") } });
      return st;
    };
    const aarav = await mk(1, "Aarav", s1.id, a.c1, true);
    const diya = await mk(2, "Diya", s1.id, a.c1, false);
    const kabir = await mk(3, "Kabir", s2.id, a.c2, true);
    return { ravi, meena, s1, s2, aarav, diya, kabir };
  });
  return { ...a, accountant, librarian, meenaLogin, ...ids };
}

export type EvFixture = Awaited<ReturnType<typeof makeEventsSchool>>;

export const as = (f: EvFixture, userId: string | null): SchoolContext => ({ schoolId: f.school.id, userId });

/** What a person may do in Events & Calendar, worked out as the pages and actions do. */
export async function evFor(f: EvFixture, userId: string) {
  const view = await accessIn(userId, f.school.id);
  if (!view) throw new Error("no access");
  const v = evViewer({ ...view, user: { id: userId } });
  return { v, can: evCan(v) };
}

export function eventInput(over: Partial<EventInput> = {}): EventInput {
  return {
    name: "Science trip", type: "Trip", date: "2026-11-03", startMin: 600, endMin: 720, venue: "Auditorium",
    audienceKind: "school", classIds: [], registrationOn: true, seats: null, feePaise: null, reminder: "none", description: null, ...over,
  };
}
