// Bus places carry over into a new academic year (inferred, with a review
// step): nothing waits while the old year is active; opening the new year
// tells the Transport In-charge; the review shows each place with what will
// happen and why some cannot go; carrying over keeps the route, stop and
// type from the new year's first day with a new bus pass and the new year's
// fees (once), and ends last year's place the day before; places not coming
// back end at year end; only the Transport In-charge (Full) does it.
import { beforeAll, describe, expect, it } from "vitest";
import type { Tx } from "@/lib/db";
import { withSchool } from "@/lib/db";
import { openYear } from "@/lib/academic/lifecycle";
import { assignStudents, routeSeats } from "@/lib/transport/places";
import { carryOver, carryOverRows, endAtYearEnd, noticeNewYear } from "@/lib/transport/carry";
import { placesView } from "@/lib/transport/views";
import { as, d, makeTransportSchool, trFor, type TrFixture } from "./fixture";

describe("carrying bus places over to a new academic year", () => {
  let f: TrFixture;
  let nextId = "";
  const place: Record<string, string> = {};
  const run = <T,>(fn: (tx: Tx) => Promise<T>, ctx = f.ctx) => withSchool(ctx, fn);
  const placeOf = (studentId: string) => run((tx) => tx.transportAssignment.findFirstOrThrow({ where: { studentId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } }));

  beforeAll(async () => {
    f = await makeTransportSchool("Transport Carry Over School");
    const s = f.students;
    const at = d("2026-06-01");
    const give = (i: number, routeId: string, stopId: string, type = "TWO_WAY") => run((tx) => assignStudents(tx, f.ctx, { studentIds: [s[i].id], routeId, stopId, type, fromDate: at, reason: null }, at));
    await give(0, f.route1.id, f.stop1.id);
    await give(1, f.route1.id, f.stop2.id);
    await give(2, f.route1.id, f.stop1.id, "PICKUP_ONLY");
    await give(3, f.route2.id, f.stop3.id);
    await give(4, f.route2.id, f.stop3.id);
    await give(5, f.route2.id, f.stop3.id);
    for (let i = 0; i < 6; i++) place[i] = (await placeOf(s[i].id)).id;
    // The new year, with Class 6 A; four students promoted into it.
    nextId = await run(async (tx) => {
      const y = await tx.academicYear.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, name: "2027-28", startDate: d("2027-04-01"), endDate: d("2028-03-31"), status: "UPCOMING" } });
      const cls = await tx.schoolClass.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, name: "Class 6", sortOrder: 6 } });
      const sec = await tx.section.create({ data: { schoolId: f.school.id, classId: cls.id, academicYearId: y.id, name: "A" } });
      for (const i of [0, 1, 3, 5]) await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: s[i].id, academicYearId: y.id, classId: cls.id, sectionId: sec.id, rollNo: i + 1 } });
      // Rohan left the school; Vasanth Nagar's fee went up for the new year.
      await tx.student.update({ where: { id: s[4].id }, data: { status: "TRANSFERRED" } });
      await tx.stop.update({ where: { id: f.stop2.id }, data: { feeTwoWayPaise: BigInt(170000) } });
      return y.id;
    }, f.sys);
  });

  it("has nothing to carry over while last year is still the active one", async () => {
    expect(await run((tx) => carryOverRows(tx))).toEqual([]);
  });

  it("tells the Transport In-charge when the new year is opened, and reviews every place", async () => {
    const pr = as(f, f.principal.id);
    const n = await run(async (tx) => {
      const r = await openYear(tx, pr, nextId, "keep");
      return noticeNewYear(tx, pr, r.year);
    }, pr);
    expect(n).toBe(6);
    const note = await run((tx) => tx.notification.findFirst({ where: { userLoginId: f.incharge.id, text: { contains: "bus places to carry over" } } }), as(f, f.incharge.id));
    expect(note?.text).toBe("2027-28 is open: 6 bus places to carry over. Review them in Student Transport.");

    const rows = await run((tx) => carryOverRows(tx));
    const by = (i: number) => rows.find((r) => r.place.id === place[i])!;
    expect(by(0)).toMatchObject({ blocked: null, note: null, newClass: "6 A", newFeePaise: BigInt(180000) });
    expect(by(1).newFeePaise).toBe(BigInt(170000));
    expect(by(2)).toMatchObject({ blocked: null, note: "No class in 2027-28 yet (not promoted)." });
    expect(by(4).blocked).toBe("Not studying here now. End the place at year end.");
    expect(by(0).toYear.name).toBe("2027-28");
    expect(by(0).fromYear.name).toBe("2026-27");
  });

  it("carries the ticked places over with new passes and the new year's fees, once", async () => {
    const r = await run((tx) => carryOver(tx, f.ctx, [place[0], place[1], place[4]]));
    expect(r.carried).toBe(2);
    expect(r.skipped).toEqual([{ name: "Rohan Das", why: "Not studying here now. End the place at year end." }]);
    expect(r.feeRows).toBeGreaterThan(0);

    const old = await run((tx) => tx.transportAssignment.findUniqueOrThrow({ where: { id: place[1] } }));
    expect(old.toDate).toEqual(d("2027-03-31"));
    expect(old.endReason).toBe("Carried over to 2027-28");
    const fresh = await run((tx) => tx.transportAssignment.findFirstOrThrow({ where: { studentId: f.students[1].id, academicYearId: nextId } }));
    expect(fresh).toMatchObject({ routeId: f.route1.id, stopId: f.stop2.id, type: "TWO_WAY", fromDate: d("2027-04-01"), toDate: null, status: "ACTIVE", monthlyFeePaise: BigInt(170000) });
    expect(fresh.busPassNo).toMatch(/^BP\/2027-28\/\d{4}$/);
    const dues = await run((tx) => tx.studentFeeDue.findMany({ where: { studentId: f.students[1].id, academicYearId: nextId, state: "OPEN" } }));
    expect(dues.length).toBeGreaterThan(0);
    expect(dues.every((x) => x.label.startsWith("Transport"))).toBe(true);
    const audit = await run((tx) => tx.auditLogEntry.findFirst({ where: { recordType: "Transport Assignment", recordId: fresh.id, action: "carried-over" } }));
    expect(audit).not.toBeNull();

    // Not twice: the carried places are no longer waiting, and asking again is refused.
    const left = (await run((tx) => carryOverRows(tx))).map((x) => x.place.id);
    expect(left).not.toContain(place[0]);
    expect(left).not.toContain(place[1]);
    await expect(run((tx) => carryOver(tx, f.ctx, [place[0], place[1]]))).rejects.toThrow("These places were carried over or changed already. Refresh the page.");
    const before = dues.length;
    expect((await run((tx) => tx.studentFeeDue.findMany({ where: { studentId: f.students[1].id, academicYearId: nextId, state: "OPEN" } }))).length).toBe(before);
  });

  it("counts a carried student's seat once", async () => {
    const seats = await run((tx) => routeSeats(tx, d("2027-03-31"), [f.route1.id]));
    expect(seats.get(f.route1.id)?.used).toBe(3);
  });

  it("lists a carried student once, on today's place, with next year's place beside it", async () => {
    const today = d("2027-03-31");
    const all = await run((tx) => placesView(tx, today, { routeId: null, show: "all", q: "", range: null }));
    const mine = all.filter((r) => r.p.studentId === f.students[1].id);
    expect(mine).toHaveLength(1);
    expect(mine[0].p.id).toBe(place[1]);
    expect(mine[0].next?.fromDate).toEqual(d("2027-04-01"));
    const later = await run((tx) => placesView(tx, today, { routeId: null, show: "future", q: "", range: null }));
    expect(later.filter((r) => r.p.studentId === f.students[1].id).map((r) => r.p.academicYearId)).toEqual([nextId]);
  });

  it("ends places not coming back at year end", async () => {
    const r = await run((tx) => endAtYearEnd(tx, f.ctx, [place[2], place[4]]));
    expect(r.ended).toBe(2);
    const p2 = await run((tx) => tx.transportAssignment.findUniqueOrThrow({ where: { id: place[2] } }));
    expect(p2.toDate).toEqual(d("2027-03-31"));
    expect(p2.endReason).toBe("Not carried over to 2027-28");
    const left = (await run((tx) => carryOverRows(tx))).map((x) => x.place.id).sort();
    expect(left).toEqual([place[3], place[5]].sort());
  });

  it("refuses a closed stop until a new stop is given", async () => {
    await run((tx) => tx.stop.update({ where: { id: f.stop3.id }, data: { archivedAt: new Date() } }), f.sys);
    await expect(run((tx) => carryOver(tx, f.ctx, [place[3]]))).rejects.toThrow("Meera Iyer: The stop is closed. Give a new stop instead.");
  });

  it("is the Transport In-charge's work: others cannot carry places over", async () => {
    expect((await trFor(f, f.incharge.id)).can.students).toBe(true);
    for (const who of [f.vp, f.teacher, f.accountant, f.rameshLogin]) expect((await trFor(f, who.id)).can.students).toBe(false);
  });
});
