// PTM booking by the parent on Parent Link (approved design: "Parents book a
// slot on Parent Link; the office can book for them"), and the student's
// homework % on the PTM meeting view. Against the real database: a parent
// sees only the teachers of their child's class and their free times, never
// a time in the break; books one slot per child per PTM (booking another
// moves it); one parent per slot; change and cancel until the day before;
// refused when the school switches it off, for a child not on their Parent
// Link, and once the meeting has started; every step audited and the teacher
// told.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { ParentLinkProblem } from "@/lib/parent-link/links";
import { bookSlot, performance, planPtm, saveNotes } from "@/lib/events/ptm";
import { bookOnParentLink, cancelOnParentLink, parentPtms } from "@/lib/events/ptm-parent";
import { saveEventsSettings } from "@/lib/events/settings";
import { TODAY, as, day, makeEventsSchool, type EvFixture } from "./fixture";

let f: EvFixture;
const P = () => as(f, f.principal.id);
const sys = () => as(f, null);
let ptmId = "";
const PTM_DAY = "2026-11-17";
let g: { aarav: string; diya: string; kabir: string };

const slotsOf = (staffId: string) => withSchool(P(), (tx) => tx.ptmSlot.findMany({ where: { ptmId, staffId }, orderBy: { startMin: "asc" } }));
const book = (guardianId: string, studentId: string, slotId: string, today = TODAY) =>
  withSchool(sys(), (tx) => bookOnParentLink(tx, sys(), { guardianId, studentId, slotId, today }));
const cancel = (guardianId: string, studentId: string, slotId: string, today = TODAY) =>
  withSchool(sys(), (tx) => cancelOnParentLink(tx, sys(), { guardianId, studentId, slotId, today }));

beforeAll(async () => {
  f = await makeEventsSchool("Events PTM Parent School");
  // 09:30 to 10:30, 10-minute slots, a break 10:00 to 10:10: five slots per teacher.
  ptmId = (await withSchool(P(), (tx) => planPtm(tx, P(), { date: PTM_DAY, classIds: [f.c1, f.c2], startMin: 570, endMin: 630, slotMinutes: 10, venue: "Hall", subjectTeachers: false, breakStartMin: 600, breakEndMin: 610 }, TODAY))).ptm.id;
  const links = await withSchool(P(), (tx) => tx.studentGuardian.findMany({ where: { studentId: { in: [f.aarav.id, f.diya.id, f.kabir.id] } } }));
  const of = (id: string) => links.find((l) => l.studentId === id)!.guardianId;
  g = { aarav: of(f.aarav.id), diya: of(f.diya.id), kabir: of(f.kabir.id) };
});

describe("PTM booking on Parent Link", () => {
  it("shows the parent only their child's teachers and the free times outside the break", async () => {
    const [p] = await withSchool(sys(), (tx) => parentPtms(tx, sys(), { studentId: f.aarav.id, today: TODAY }));
    expect(p.ptmId).toBe(ptmId);
    expect(p.open).toBe(true);
    expect(p.parentBooking).toBe(true);
    expect(p.breakWords).toMatch(/10:00/);
    expect(p.teachers.map((t) => t.staffId)).toEqual([f.ravi.id]);
    const times = p.teachers[0].free.map((s) => s.time);
    expect(times).toHaveLength(5);
    expect(times.some((t) => t.startsWith("10:00"))).toBe(false);
    expect(p.booked).toEqual([]);
  });

  it("books a free slot, audits it, tells the teacher, and marks it as booked on Parent Link", async () => {
    const [first] = await slotsOf(f.ravi.id);
    const r = await book(g.aarav, f.aarav.id, first.id);
    expect(r.changed).toBe(false);
    const slot = await withSchool(P(), (tx) => tx.ptmSlot.findUniqueOrThrow({ where: { id: first.id } }));
    expect(slot.studentId).toBe(f.aarav.id);
    expect(slot.guardianId).toBe(g.aarav);
    expect(slot.bookedVia).toBe("parent-link");
    const audit = await withSchool(P(), (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "PTM Slot", recordId: first.id, action: "booked-by-parent" } }));
    expect(audit.userLoginId).toBeNull();
    const told = await withSchool(as(f, f.teacher.id), (tx) => tx.notification.findFirst({ where: { userLoginId: f.teacher.id, type: "ptm-booking" } }));
    expect(told?.text).toMatch(/Parent of Aarav booked/);
    const [p] = await withSchool(sys(), (tx) => parentPtms(tx, sys(), { studentId: f.aarav.id, today: TODAY }));
    expect(p.booked).toHaveLength(1);
    expect(p.booked[0].byOffice).toBe(false);
    expect(p.canChange).toBe(true);
    expect(p.teachers[0].free.map((s) => s.id)).not.toContain(first.id);
  });

  it("keeps one parent per slot", async () => {
    const [first] = await slotsOf(f.ravi.id);
    await expect(book(g.diya, f.diya.id, first.id)).rejects.toThrow(/just taken by another parent/);
    // Two parents trying one free slot at the same moment: only one gets it.
    const free = (await slotsOf(f.ravi.id)).find((s) => !s.studentId)!;
    const other = (await slotsOf(f.ravi.id)).filter((s) => !s.studentId)[1];
    await book(g.diya, f.diya.id, other.id);
    const tries = await Promise.allSettled([book(g.diya, f.diya.id, free.id), book(g.aarav, f.aarav.id, free.id)]);
    expect(tries.filter((t) => t.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    const after = await withSchool(P(), (tx) => tx.ptmSlot.findUniqueOrThrow({ where: { id: free.id } }));
    expect([f.diya.id, f.aarav.id]).toContain(after.studentId);
    // Each child still has exactly one slot at this PTM.
    for (const id of [f.aarav.id, f.diya.id]) expect(await withSchool(P(), (tx) => tx.ptmSlot.count({ where: { ptmId, studentId: id } }))).toBe(1);
  });

  it("allows one booking per child: booking another time moves it, and the move is audited", async () => {
    const mine = await withSchool(P(), (tx) => tx.ptmSlot.findFirstOrThrow({ where: { ptmId, studentId: f.aarav.id } }));
    const free = (await slotsOf(f.ravi.id)).find((s) => !s.studentId)!;
    const r = await book(g.aarav, f.aarav.id, free.id);
    expect(r.changed).toBe(true);
    expect(await withSchool(P(), (tx) => tx.ptmSlot.count({ where: { ptmId, studentId: f.aarav.id } }))).toBe(1);
    expect((await withSchool(P(), (tx) => tx.ptmSlot.findUniqueOrThrow({ where: { id: mine.id } }))).studentId).toBeNull();
    expect(await withSchool(P(), (tx) => tx.auditLogEntry.count({ where: { recordId: free.id, action: "booking-changed-by-parent" } }))).toBe(1);
    // The same time again changes nothing.
    expect((await book(g.aarav, f.aarav.id, free.id)).unchanged).toBe(true);
  });

  it("never books a time inside the break", async () => {
    // A slot inside the break is never made; one left from before is still refused.
    const odd = await withSchool(P(), (tx) => tx.ptmSlot.create({ data: { schoolId: f.school.id, ptmId, staffId: f.ravi.id, startMin: 605 } }));
    await expect(book(g.kabir, f.kabir.id, odd.id)).rejects.toThrow(/break/);
    const [p] = await withSchool(sys(), (tx) => parentPtms(tx, sys(), { studentId: f.aarav.id, today: TODAY }));
    expect(p.teachers[0].free.map((s) => s.id)).not.toContain(odd.id);
  });

  it("refuses a teacher who does not meet the child's class, and a child not on the parent's link", async () => {
    const [free] = (await slotsOf(f.ravi.id)).filter((s) => !s.studentId && s.startMin !== 605);
    await expect(book(g.kabir, f.kabir.id, free.id)).rejects.toThrow(/does not meet parents/);
    await expect(book(g.kabir, f.aarav.id, free.id)).rejects.toThrow(/not on your Parent Link/);
    await expect(book(g.kabir, f.aarav.id, free.id)).rejects.toBeInstanceOf(ParentLinkProblem);
  });

  it("lets the parent cancel until the day before, and audits it; not on the day", async () => {
    const meena = (await slotsOf(f.meena.id))[0];
    await book(g.kabir, f.kabir.id, meena.id);
    await expect(book(g.kabir, f.kabir.id, (await slotsOf(f.meena.id))[1].id, PTM_DAY)).rejects.toThrow(/closed the day before/);
    await expect(cancel(g.kabir, f.kabir.id, meena.id, PTM_DAY)).rejects.toThrow(/closed the day before/);
    const [onDay] = await withSchool(sys(), (tx) => parentPtms(tx, sys(), { studentId: f.kabir.id, today: PTM_DAY }));
    expect(onDay.open).toBe(false);
    expect(onDay.canChange).toBe(false);
    expect(onDay.teachers).toEqual([]);
    await cancel(g.kabir, f.kabir.id, meena.id, "2026-11-16");
    expect((await withSchool(P(), (tx) => tx.ptmSlot.findUniqueOrThrow({ where: { id: meena.id } }))).studentId).toBeNull();
    expect(await withSchool(P(), (tx) => tx.auditLogEntry.count({ where: { recordId: meena.id, action: "booking-cancelled-by-parent" } }))).toBe(1);
    // Someone else's booking cannot be cancelled.
    const aarav = await withSchool(P(), (tx) => tx.ptmSlot.findFirstOrThrow({ where: { ptmId, studentId: f.aarav.id } }));
    await expect(cancel(g.diya, f.diya.id, aarav.id)).rejects.toThrow(/no longer there/);
  });

  it("does not change a booking once the meeting has started", async () => {
    const t = as(f, f.teacher.id);
    const diya = await withSchool(P(), (tx) => tx.ptmSlot.findFirstOrThrow({ where: { ptmId, studentId: f.diya.id } }));
    await withSchool(t, (tx) => saveNotes(tx, t, diya.id, { remarks: "Started", feedback: null, followUp: null, arrived: true }, PTM_DAY, { own: true }));
    await expect(cancel(g.diya, f.diya.id, diya.id)).rejects.toThrow(/already started/);
    const free = (await slotsOf(f.ravi.id)).find((s) => !s.studentId && s.startMin !== 605)!;
    await expect(book(g.diya, f.diya.id, free.id)).rejects.toThrow(/already started/);
  });

  it("sends the parent to the school when the office booked more than one meeting", async () => {
    // Office bookings with subject teachers can give a child two meetings at one PTM.
    const second = await withSchool(P(), (tx) => tx.ptmSlot.create({ data: { schoolId: f.school.id, ptmId, staffId: f.ravi.id, startMin: 630 } }));
    await withSchool(P(), (tx) => tx.ptmSlot.update({ where: { id: second.id }, data: { studentId: f.aarav.id, guardianId: g.aarav, bookedVia: "office" } }));
    const free = (await slotsOf(f.ravi.id)).find((s) => !s.studentId && s.startMin !== 605)!;
    await expect(book(g.aarav, f.aarav.id, free.id)).rejects.toThrow(/call the school/);
    const [p] = await withSchool(sys(), (tx) => parentPtms(tx, sys(), { studentId: f.aarav.id, today: TODAY }));
    expect(p.canChange).toBe(false);
    await withSchool(P(), (tx) => tx.ptmSlot.update({ where: { id: second.id }, data: { studentId: null, guardianId: null, bookedVia: null } }));
  });

  it("is refused when the school switches parent booking off; the office still books", async () => {
    await withSchool(P(), (tx) => saveEventsSettings(tx, P(), { ptmParentBooking: false }));
    const free = (await slotsOf(f.meena.id)).find((s) => !s.studentId)!;
    await expect(book(g.kabir, f.kabir.id, free.id)).rejects.toThrow(/school books PTM slots/);
    const [p] = await withSchool(sys(), (tx) => parentPtms(tx, sys(), { studentId: f.kabir.id, today: TODAY }));
    expect(p.parentBooking).toBe(false);
    expect(p.open).toBe(false);
    await withSchool(P(), (tx) => bookSlot(tx, P(), free.id, f.kabir.id, TODAY));
    expect((await withSchool(P(), (tx) => tx.ptmSlot.findUniqueOrThrow({ where: { id: free.id } }))).bookedVia).toBe("office");
    await withSchool(P(), (tx) => saveEventsSettings(tx, P(), { ptmParentBooking: true }));
  });
});

describe("Homework % on the PTM meeting view", () => {
  it("counts homework handed in out of homework given this year, leaving out excused and future work", async () => {
    const where = { schoolId: f.school.id, academicYearId: f.yearId, sectionId: f.s1.id, classId: f.c1, subjectId: f.s1.id };
    await withSchool(P(), async (tx) => {
      const hw = async (start: string) => tx.homework.create({ data: { ...where, title: `HW ${start}`, startDate: day(start), dueDate: day(start) } });
      const sub = async (h: { id: string }, status: "SUBMITTED" | "LATE" | "GRADED" | "MISSING" | "ASSIGNED" | "EXCUSED") =>
        tx.submission.create({ data: { schoolId: f.school.id, homeworkId: h.id, studentId: f.aarav.id, status } });
      await sub(await hw("2026-09-01"), "SUBMITTED");
      await sub(await hw("2026-09-02"), "LATE");
      await sub(await hw("2026-09-03"), "GRADED");
      await sub(await hw("2026-09-04"), "MISSING");
      await sub(await hw("2026-09-05"), "EXCUSED");
      await sub(await hw("2026-12-01"), "ASSIGNED");
    });
    const perf = await withSchool(P(), (tx) => performance(tx, P(), f.aarav.id, f.yearId, TODAY));
    expect(perf.homework).toBe(75);
    // No homework given yet: shown as nothing rather than 0%.
    expect((await withSchool(P(), (tx) => performance(tx, P(), f.kabir.id, f.yearId, TODAY))).homework).toBeNull();
  });
});
