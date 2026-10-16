// The rules of Events & Calendar (18 §5 and "Done when"), against the real
// database: a venue clash warns; an event fee is charged once per student,
// goes when a student withdraws, and a cancelled event removes unpaid fees
// and asks for refunds of paid ones through Fee Management; a holiday on a
// day with attendance warns first (A11); a PTM is never on a holiday or a
// weekend; one parent per slot, one slot per teacher per student, and a
// teacher books only their own slots; an album visible to staff only needs a
// confirmation to publish; photos with students without photo consent, and
// untagged photos, never leave the staff pages.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { EventsProblem, EventsWarning } from "@/lib/events/problem";
import { cancelEvent, createEvent, registerStudents, withdrawStudent } from "@/lib/events/events";
import { addEntry, notWorkingDay } from "@/lib/events/calendar";
import { bookSlot, cancelPtm, planPtm, saveNotes } from "@/lib/events/ptm";
import { createAlbum, publishAlbum, sharedItems, tagMedia } from "@/lib/events/gallery";
import { saveEventsSettings } from "@/lib/events/settings";
import { collectPayment } from "@/lib/fees/collect";
import { TODAY, as, day, eventInput, makeEventsSchool, type EvFixture } from "./fixture";

let f: EvFixture;
const P = () => as(f, f.principal.id);
const R = (rupees: number) => BigInt(rupees * 100);

beforeAll(async () => {
  f = await makeEventsSchool("Events Rules School");
});

describe("events", () => {
  it("warns when two events share a venue at the same time, and saves anyway when confirmed", async () => {
    await withSchool(P(), (tx) => createEvent(tx, P(), eventInput({ name: "Quiz", date: "2026-11-04", venue: "Library hall", registrationOn: false })));
    await expect(withSchool(P(), (tx) => createEvent(tx, P(), eventInput({ name: "Debate", date: "2026-11-04", startMin: 660, venue: "Library hall", registrationOn: false })))).rejects.toBeInstanceOf(EventsWarning);
    const later = await withSchool(P(), (tx) => createEvent(tx, P(), eventInput({ name: "Debate", date: "2026-11-04", startMin: 780, endMin: 840, venue: "Library hall", registrationOn: false })));
    expect(later.number).toMatch(/^EV-26-\d{3}$/);
    const forced = await withSchool(P(), (tx) => createEvent(tx, P(), eventInput({ name: "Chess", date: "2026-11-04", startMin: 600, venue: "Library hall", registrationOn: false }), { confirm: true }));
    expect(forced.name).toBe("Chess");
    // The event is on the School Calendar.
    const entry = await withSchool(P(), (tx) => tx.calendarEntry.findFirst({ where: { source: `event:${forced.id}` } }));
    expect(entry?.type).toBe("event");
  });

  it("charges an event fee once per student, through Fee Management, and takes it back on withdrawal", async () => {
    const e = await withSchool(P(), (tx) => createEvent(tx, P(), eventInput({ name: "Zoo trip", venue: null, feePaise: R(500) })));
    const first = await withSchool(P(), (tx) => registerStudents(tx, P(), e.id, [f.aarav.id, f.diya.id], TODAY));
    expect(first.added).toBe(2);
    const again = await withSchool(P(), (tx) => registerStudents(tx, P(), e.id, [f.aarav.id], TODAY));
    expect(again.added).toBe(0);
    const dues = await withSchool(P(), (tx) => tx.studentFeeDue.findMany({ where: { studentId: f.aarav.id, label: "Zoo trip" } }));
    expect(dues).toHaveLength(1);
    expect(dues[0].amountPaise).toBe(R(500));
    expect(dues[0].kind).toBe("CHARGE");
    const w = await withSchool(P(), (tx) => withdrawStudent(tx, P(), e.id, f.diya.id, TODAY));
    expect(w.removed).toBe(true);
    const gone = await withSchool(P(), (tx) => tx.studentFeeDue.findFirst({ where: { studentId: f.diya.id, label: "Zoo trip" } }));
    expect(gone?.state).toBe("REMOVED");
  });

  it("respects the seat limit", async () => {
    const e = await withSchool(P(), (tx) => createEvent(tx, P(), eventInput({ name: "Planetarium", venue: null, seats: 1 })));
    await expect(withSchool(P(), (tx) => registerStudents(tx, P(), e.id, [f.aarav.id, f.kabir.id], TODAY))).rejects.toThrow(/Only 1 seat is left/);
  });

  it("cancelling an event removes unpaid fees and asks for a refund of paid ones (paid money is never deleted)", async () => {
    const e = await withSchool(P(), (tx) => createEvent(tx, P(), eventInput({ name: "Museum visit", venue: null, feePaise: R(300) })));
    await withSchool(P(), (tx) => registerStudents(tx, P(), e.id, [f.aarav.id, f.kabir.id], TODAY));
    const due = await withSchool(P(), (tx) => tx.studentFeeDue.findFirstOrThrow({ where: { studentId: f.kabir.id, label: "Museum visit" } }));
    const acc = as(f, f.accountant.id);
    await withSchool(acc, (tx) => collectPayment(tx, acc, { roleKeys: ["accountant"] }, {
      studentId: f.kabir.id, dueIds: [due.id], amountPaise: R(300), mode: "CASH", reference: null, chequeNo: null, chequeBank: null, chequeDate: null, paidAt: null, note: null,
      discountPaise: BigInt(0), discountReason: null, waiveDueIds: [], waiveReason: null, confirmDuplicate: true,
    }), { timeout: 60_000 });
    await expect(withSchool(P(), (tx) => cancelEvent(tx, P(), e.id, "no", false, TODAY))).rejects.toThrow(/Say why/);
    // The Vice Principal cancels; the refund waits for the Principal in Approvals.
    const vp = as(f, f.vp.id);
    const r = await withSchool(vp, (tx) => cancelEvent(tx, vp, e.id, "Museum closed for repairs", false, TODAY), { timeout: 60_000 });
    expect(r.removed).toBe(1);
    expect(r.refunds).toBe(1);
    await withSchool(P(), async (tx) => {
      expect((await tx.studentFeeDue.findFirstOrThrow({ where: { studentId: f.aarav.id, label: "Museum visit" } })).state).toBe("REMOVED");
      expect(await tx.payment.count({ where: { studentId: f.kabir.id } })).toBe(1);
      const refund = await tx.refund.findFirst({ where: { reason: { contains: `[${e.number}]` } } });
      expect(refund?.amountPaise).toBe(R(300));
      expect(await tx.calendarEntry.count({ where: { source: `event:${e.id}`, archivedAt: null } })).toBe(0);
    });
  });
});

describe("the School Calendar", () => {
  it("warns before making a day with attendance a holiday (A11), and saves when confirmed", async () => {
    await withSchool(P(), (tx) => tx.attendanceMark.create({ data: { schoolId: f.school.id, academicYearId: f.yearId, studentId: f.aarav.id, sectionId: f.s1.id, date: day("2026-10-12"), statusKey: "P" } }));
    const input = { title: "Rain holiday", type: "holiday", from: "2026-10-12", attendanceOn: false };
    await expect(withSchool(P(), (tx) => addEntry(tx, P(), input, { today: TODAY }))).rejects.toBeInstanceOf(EventsWarning);
    const saved = await withSchool(P(), (tx) => addEntry(tx, P(), input, { today: TODAY, confirm: true }));
    expect(saved.attendanceOn).toBe(false);
    expect(await withSchool(P(), (tx) => notWorkingDay(tx, P(), "2026-10-12", null))).toMatch(/Rain holiday/);
  });

  it("knows the weekends: Sunday always, the second Saturday when the school says so", async () => {
    expect(await withSchool(P(), (tx) => notWorkingDay(tx, P(), "2026-11-01", null))).not.toBeNull();
    expect(await withSchool(P(), (tx) => notWorkingDay(tx, P(), "2026-11-14", null))).toBeNull();
    await withSchool(P(), (tx) => saveEventsSettings(tx, P(), { secondSaturdayOff: true }));
    expect(await withSchool(P(), (tx) => notWorkingDay(tx, P(), "2026-11-14", null))).not.toBeNull();
    await withSchool(P(), (tx) => saveEventsSettings(tx, P(), { secondSaturdayOff: false }));
  });
});

describe("PTM", () => {
  let ptmId = "";
  const plan = (date: string) => ({ date, classIds: [f.c1, f.c2], startMin: 570, endMin: 630, slotMinutes: 10, venue: null, subjectTeachers: false });

  it("is never planned on a holiday or a Sunday", async () => {
    await withSchool(P(), (tx) => addEntry(tx, P(), { title: "Diwali", type: "holiday", from: "2026-11-09", attendanceOn: false }, { today: TODAY }));
    await expect(withSchool(P(), (tx) => planPtm(tx, P(), plan("2026-11-09"), TODAY))).rejects.toThrow(/Diwali/);
    await expect(withSchool(P(), (tx) => planPtm(tx, P(), plan("2026-11-08"), TODAY))).rejects.toBeInstanceOf(EventsProblem);
  });

  it("makes slots for each class teacher", async () => {
    const r = await withSchool(P(), (tx) => planPtm(tx, P(), plan("2026-11-10"), TODAY));
    expect(r.teachers).toBe(2);
    expect(r.slots).toBe(12);
    ptmId = r.ptm.id;
  });

  it("gives one parent per slot and one slot per teacher per student", async () => {
    const slots = await withSchool(P(), (tx) => tx.ptmSlot.findMany({ where: { ptmId, staffId: f.ravi.id }, orderBy: { startMin: "asc" } }));
    await withSchool(P(), (tx) => bookSlot(tx, P(), slots[0].id, f.aarav.id, TODAY));
    await expect(withSchool(P(), (tx) => bookSlot(tx, P(), slots[0].id, f.diya.id, TODAY))).rejects.toThrow(/Slot taken by Aarav's parent/);
    await expect(withSchool(P(), (tx) => bookSlot(tx, P(), slots[1].id, f.aarav.id, TODAY))).rejects.toThrow(/already has a slot/);
    // Ravi does not teach Kabir's class.
    await expect(withSchool(P(), (tx) => bookSlot(tx, P(), slots[1].id, f.kabir.id, TODAY))).rejects.toThrow(/does not teach/);
    // Two bookings of one free slot at the same moment: only one wins.
    const results = await Promise.allSettled([
      withSchool(P(), (tx) => bookSlot(tx, P(), slots[2].id, f.diya.id, TODAY)),
      withSchool(P(), (tx) => bookSlot(tx, P(), slots[2].id, f.diya.id, TODAY)),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await withSchool(P(), (tx) => tx.ptmSlot.count({ where: { ptmId, studentId: f.diya.id } }))).toBe(1);
  });

  it("lets a teacher book and write notes only at their own slots", async () => {
    const t = as(f, f.teacher.id);
    const meenaSlot = await withSchool(P(), (tx) => tx.ptmSlot.findFirstOrThrow({ where: { ptmId, staffId: f.meena.id, studentId: null } }));
    await expect(withSchool(t, (tx) => bookSlot(tx, t, meenaSlot.id, f.kabir.id, TODAY, { own: true }))).rejects.toThrow(/another teacher's slot/);
    const mine = await withSchool(P(), (tx) => tx.ptmSlot.findFirstOrThrow({ where: { ptmId, staffId: f.ravi.id, studentId: f.aarav.id } }));
    await expect(withSchool(t, (tx) => saveNotes(tx, t, mine.id, { remarks: "Good", feedback: null, followUp: null, arrived: true }, TODAY, { own: true }))).rejects.toThrow(/on the day/);
    const n = await withSchool(t, (tx) => saveNotes(tx, t, mine.id, { remarks: "Reads well", feedback: null, followUp: null, arrived: true }, "2026-11-10", { own: true }));
    expect(n.note.remarks).toBe("Reads well");
  });

  it("cancels a PTM with bookings even when the parents cannot be messaged (ACADEMICS-21)", async () => {
    const r = await withSchool(P(), (tx) => cancelPtm(tx, P(), ptmId, "Heavy rain warning for the whole district", TODAY));
    expect(r.told?.people).toBe(0);
    expect(r.told?.problem).toBeTruthy();
    expect((await withSchool(P(), (tx) => tx.ptm.findUniqueOrThrow({ where: { id: ptmId } }))).archivedAt).not.toBeNull();
  });
});

describe("Gallery and photo consent", () => {
  it("does not publish a staff-only album without a confirmation", async () => {
    const al = await withSchool(P(), (tx) => createAlbum(tx, P(), { name: "Sports day", eventId: null, date: "2026-10-10", visibleTo: "STAFF", classIds: [], consentRule: "OUT" }));
    expect(al.number).toBe("AL-01");
    await withSchool(P(), (tx) => tx.mediaItem.create({ data: { schoolId: f.school.id, albumId: al.id, fileId: f.aarav.id } }));
    await expect(withSchool(P(), (tx) => publishAlbum(tx, P(), al.id, false))).rejects.toThrow(/Visible to staff only/);
    expect((await withSchool(P(), (tx) => publishAlbum(tx, P(), al.id, true))).status).toBe("PUBLISHED");
  });

  it("leaves out untagged photos and photos with students without photo consent", async () => {
    const al = await withSchool(P(), (tx) => createAlbum(tx, P(), { name: "Annual day", eventId: null, date: "2026-10-11", visibleTo: "EVERYONE", classIds: [], consentRule: "OUT" }));
    const mk = () => withSchool(P(), (tx) => tx.mediaItem.create({ data: { schoolId: f.school.id, albumId: al.id, fileId: f.kabir.id } }));
    const [ok, mixed, untagged, empty] = [await mk(), await mk(), await mk(), await mk()];
    await withSchool(P(), (tx) => tagMedia(tx, P(), ok.id, [{ studentId: f.aarav.id, x: 0.3, y: 0.3 }], false));
    const t = await withSchool(P(), (tx) => tagMedia(tx, P(), mixed.id, [{ studentId: f.aarav.id, x: 0.3, y: 0.3 }, { studentId: f.diya.id, x: 0.6, y: 0.3 }], false));
    expect(t.missing).toBe(1);
    await withSchool(P(), (tx) => tagMedia(tx, P(), empty.id, [], true));
    const shared = await withSchool(P(), async (tx) => sharedItems(tx, P(), await tx.album.findUniqueOrThrow({ where: { id: al.id } })));
    expect(shared.items.map((i) => i.mediaId).sort()).toEqual([ok.id, empty.id].sort());
    expect(shared.leftOut).toBe(1);
    expect(shared.untagged).toBe(1);
    expect(untagged.id).toBeTruthy();
    // A consent withdrawn later applies to photos already published.
    await withSchool(P(), (tx) => tx.consentRecord.updateMany({ where: { studentId: f.aarav.id }, data: { withdrawnAt: new Date() } }));
    const after = await withSchool(P(), async (tx) => sharedItems(tx, P(), await tx.album.findUniqueOrThrow({ where: { id: al.id } })));
    expect(after.items.map((i) => i.mediaId)).toEqual([empty.id]);
  });
});
