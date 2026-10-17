// An event for one campus (18 Events & Calendar; 11 Parent Link): in a
// school with two campuses an event can be for every campus or for one, as a
// notice can. One campus's event, its consent form and that campus's holidays
// show on Parent Link only for children of that campus, and its messages go
// to that campus only; an event for every campus reaches both, and a child of
// either campus can join it. The second campus's year starts later.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { createEvent, messageAudience, registerStudents, updateEvent, type EventInput } from "@/lib/events/events";
import { recordConsent } from "@/lib/events/consent";
import { loadGuardianView } from "@/lib/parent-link/view";
import { loadSections } from "@/lib/parent-link/render";
import { makeCommSchool } from "../communication/fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
let north: { campusId: string; yearId: string; classId: string; fatherId: string; nehaId: string };

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const soon = (days: number) => iso(new Date(Date.now() + days * DAY));
const input = (name: string, extra: Partial<EventInput> = {}): EventInput => ({
  name, type: "Celebration", date: soon(10), startMin: 600, endMin: 720, venue: null, audienceKind: "school", classIds: [],
  registrationOn: false, seats: null, feePaise: null, reminder: "none", description: null, ...extra,
});
const make = (i: EventInput) => withSchool(s.ctx, (tx) => createEvent(tx, s.ctx, i));
type EventsData = { events: { name: string }[]; holidays: { title: string }[]; consents: { name: string }[] };
const eventsOnParentLink = (guardianId: string) => withSchool(s.ctx, async (tx) => {
  const view = await loadGuardianView(tx, s.ctx, { linkId: randomUUID(), guardianId, childId: null, token: "t", preview: true });
  const data = (await loadSections(tx, s.ctx, view!)).find((x) => x.def.key === "events")?.data as EventsData | undefined;
  return { events: data?.events.map((e) => e.name) ?? [], holidays: data?.holidays.map((h) => h.title) ?? [], consents: data?.consents.map((c) => c.name) ?? [] };
});
const recipients = (messageId: string | null | undefined) => withSchool(s.ctx, async (tx) => (await tx.messageRecipient.findMany({ where: { messageId: messageId! }, select: { name: true } })).map((r) => r.name).sort());

beforeAll(async () => {
  s = await makeCommSchool();
  north = await withSchool(s.ctx, async (tx) => {
    const schoolId = s.school.id;
    const campus = await tx.campus.create({ data: { schoolId, name: "North Campus" } });
    const year = await tx.academicYear.create({ data: { schoolId, campusId: campus.id, name: "2026-27 North", startDate: new Date("2026-06-01"), endDate: new Date("2027-04-30"), status: "ACTIVE" } });
    const cls = await tx.schoolClass.create({ data: { schoolId, campusId: campus.id, name: "Class 5", sortOrder: 5 } });
    const sec = await tx.section.create({ data: { schoolId, classId: cls.id, academicYearId: year.id, name: "A" } });
    const father = await tx.guardian.create({ data: { schoolId, name: "North Father", relationship: "Father", phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, language: "en" } });
    const neha = await tx.student.create({ data: { schoolId, campusId: campus.id, admissionNo: `N${randomUUID().slice(0, 6)}`, firstName: "Neha", fullName: "Neha Singh" } });
    await tx.enrolment.create({ data: { schoolId, studentId: neha.id, academicYearId: year.id, classId: cls.id, sectionId: sec.id } });
    await tx.studentGuardian.create({ data: { schoolId, studentId: neha.id, guardianId: father.id, relationship: "Father", isPrimary: true } });
    // A holiday at North only, and one for the whole school.
    for (const [title, campusId, yearId] of [["North foundation day", campus.id, year.id], ["Diwali", null, s.year.id]] as const) {
      await tx.calendarEntry.create({ data: { schoolId, campusId, academicYearId: yearId, type: "holiday", title, startDate: new Date(`${soon(12)}T00:00:00Z`), endDate: new Date(`${soon(12)}T00:00:00Z`), attendanceOn: false } });
    }
    return { campusId: campus.id, yearId: year.id, classId: cls.id, fatherId: father.id, nehaId: neha.id };
  });
});

describe("an event for one campus", () => {
  it("belongs to that campus's year and says so; classes of another campus are refused", async () => {
    const e = await make(input("North sports meet", { campusId: north.campusId }));
    expect(e.campusId).toBe(north.campusId);
    expect(e.academicYearId).toBe(north.yearId);
    expect(e.audienceLabel).toBe("North Campus");
    await expect(make(input("Main class picnic", { campusId: s.school.campus.id, audienceKind: "classes", classIds: [north.classId] }))).rejects.toThrow(/Class 5 is at another campus/);
  });

  it("shows on Parent Link only for that campus's children, with its holidays; an event of every campus shows for both", async () => {
    await make(input("Main campus fete", { campusId: s.school.campus.id }));
    await make(input("Annual Day"));
    const northSees = await eventsOnParentLink(north.fatherId);
    const mainSees = await eventsOnParentLink(s.father.id);
    expect(northSees.events).toEqual(expect.arrayContaining(["North sports meet", "Annual Day"]));
    expect(northSees.events).not.toContain("Main campus fete");
    expect(mainSees.events).toEqual(expect.arrayContaining(["Main campus fete", "Annual Day"]));
    expect(mainSees.events).not.toContain("North sports meet");
    expect(northSees.holidays.sort()).toEqual(["Diwali", "North foundation day"]);
    expect(mainSees.holidays).toEqual(["Diwali"]);
  });

  it("asks for consent only the parents of that campus; an every-campus trip asks both, and a North child can join it", async () => {
    const mainTrip = await make(input("Main zoo trip", { campusId: s.school.campus.id, registrationOn: true, consentOn: true }));
    const allTrip = await make(input("Science museum trip", { registrationOn: true, consentOn: true }));
    expect((await eventsOnParentLink(s.father.id)).consents).toEqual(expect.arrayContaining(["Main zoo trip", "Science museum trip"]));
    const northConsents = (await eventsOnParentLink(north.fatherId)).consents;
    expect(northConsents).toContain("Science museum trip");
    expect(northConsents).not.toContain("Main zoo trip");
    // Neha (North) can say yes to the trip of every campus, though it was made in another campus's year; not to Main's own trip.
    const today = soon(0);
    await withSchool(s.ctx, (tx) => recordConsent(tx, s.ctx, { eventId: allTrip.id, studentId: north.nehaId, answer: "GIVEN", guardianId: north.fatherId, how: "office" }, today));
    expect(await withSchool(s.ctx, (tx) => tx.eventRegistration.count({ where: { eventId: allTrip.id, studentId: north.nehaId, withdrawnAt: null } }))).toBe(1);
    await expect(withSchool(s.ctx, (tx) => recordConsent(tx, s.ctx, { eventId: mainTrip.id, studentId: north.nehaId, answer: "GIVEN", guardianId: north.fatherId, how: "office" }, today))).rejects.toThrow(/not in/);
  });

  it("sends its messages to that campus only", async () => {
    const e = await make(input("North parents meeting", { campusId: north.campusId, audienceKind: "parents" }));
    expect(e.audienceLabel).toBe("Parents, North Campus");
    const r = await withSchool(s.ctx, (tx) => messageAudience(tx, s.ctx, e, "reminder"));
    expect(await recipients(r.messageId)).toEqual(["North Father"]);
    const all = await make(input("Sports day for everyone"));
    const r2 = await withSchool(s.ctx, (tx) => messageAudience(tx, s.ctx, all, "reminder"));
    expect(await recipients(r2.messageId)).toContain("North Father");
    expect(await recipients(r2.messageId)).toContain("Srinivas Kumar");
  });

  it("keeps its campus when changed without one, and cannot move campus once students are registered", async () => {
    const e = await make(input("North quiz", { campusId: north.campusId, registrationOn: true }));
    const kept = await withSchool(s.ctx, (tx) => updateEvent(tx, s.ctx, e.id, input("North quiz final", { registrationOn: true }), { today: soon(0) }));
    expect(kept.event.campusId).toBe(north.campusId);
    await withSchool(s.ctx, (tx) => registerStudents(tx, s.ctx, e.id, [north.nehaId], soon(0)));
    await expect(withSchool(s.ctx, (tx) => updateEvent(tx, s.ctx, e.id, input("North quiz final", { registrationOn: true, campusId: null }), { today: soon(0) }))).rejects.toThrow(/Withdraw them first to change the campus/);
  });
});
