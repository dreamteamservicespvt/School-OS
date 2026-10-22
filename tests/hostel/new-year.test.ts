// Boarders and a new academic year (gap list G38, part 2; 15 §2 "hostel fees
// follow the same pattern as A12 for transport", inferred): nothing waits
// while the old year is active; opening the new year tells each hostel's
// wardens; the review shows each boarder with what will happen and why some
// cannot go (left the school, no plan for the room in the new year); carrying
// over keeps the same bed (and check-in) and adds the new year's hostel fees
// once, never twice; a warden carries over their own hostel only; boarders
// not coming back are checked out on the old year's last day with nothing of
// the new year charged; a boarder who leaves the school during the year stops
// being charged after their last day, even when the hostel check was waived.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { openYear } from "@/lib/academic/lifecycle";
import { carryOver, carryOverRows, checkOutAtYearEnd, noticeNewYear } from "@/lib/hostel/carry";
import { saveFeePlan } from "@/lib/hostel/settings";
import { completeLeaving, startLeaving } from "@/lib/students/leaving";
import "@/lib/hostel/clearance";
import { as, day, giveBed, ist, makeHostelSchool, type HostelFixture } from "./fixture";

describe("boarders carried over into a new academic year (G38)", () => {
  let f: HostelFixture;
  const bed: Record<string, string> = {};
  const run = <T,>(fn: (tx: Tx) => Promise<T>, ctx: SchoolContext = as(f, f.admin.id)) => withSchool(ctx, fn);
  const hostelDues = (studentId: string, yearId: string) => run((tx) => tx.studentFeeDue.findMany({ where: { studentId, academicYearId: yearId, label: { startsWith: "Hostel fee" }, state: "OPEN" }, orderBy: { dueDate: "asc" } }));

  beforeAll(async () => {
    f = await makeHostelSchool("Hostel New Year School");
    const at = day("2026-06-01");
    bed.ravi = (await giveBed(f, f.ravi, f.bed("B-1", 1).id, { start: at })).allocation.id;
    bed.arjun = (await giveBed(f, f.arjun, f.bed("B-1", 2).id, { start: at })).allocation.id;
    bed.kiran = (await giveBed(f, f.kiran, f.bed("B-2", 1).id, { start: at, fees: false })).allocation.id;
    bed.rahul = (await giveBed(f, f.rahul, f.bed("B-2", 2).id, { start: at })).allocation.id;
    bed.meena = (await giveBed(f, f.meena, f.bed("G-1", 1).id, { start: at })).allocation.id;
    bed.sita = (await giveBed(f, f.sita, f.bed("G-1", 2).id, { start: at })).allocation.id;
    await run(async (tx) => {
      // Promoted into Class 2 A of 2027-28: everyone but Arjun (not promoted yet) and Rahul, who withdrew.
      const sec = await tx.section.findFirstOrThrow({ where: { classId: f.c2, academicYearId: f.nextYearId } });
      for (const [i, s] of [f.ravi, f.kiran, f.meena, f.sita].entries()) {
        await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: s.id, academicYearId: f.nextYearId, classId: f.c2, sectionId: sec.id, rollNo: i + 1 } });
      }
      await tx.student.update({ where: { id: f.rahul.id }, data: { status: "WITHDRAWN" } });
    }, { schoolId: f.school.id, userId: null });
  }, 120_000);

  it("has nothing to carry over while the old year is still the active one", async () => {
    expect(await run((tx) => carryOverRows(tx, null))).toEqual([]);
  });

  it("tells each hostel's wardens when the new year opens, and shows why some cannot go yet", async () => {
    const pr = as(f, f.principal.id);
    const n = await run(async (tx) => noticeNewYear(tx, pr, (await openYear(tx, pr, f.nextYearId, "keep")).year), pr);
    expect(n).toBe(6);
    const note = await run((tx) => tx.notification.findFirst({ where: { userLoginId: f.warden.id, text: { contains: "boarder" } } }), as(f, f.warden.id));
    expect(note?.text).toBe("2027-28 is open: 4 boarders to carry over into the new year. Review them in Allocation.");
    const gnote = await run((tx) => tx.notification.findFirst({ where: { userLoginId: f.gwarden.id, text: { contains: "boarder" } } }), as(f, f.gwarden.id));
    expect(gnote?.text).toBe("2027-28 is open: 2 boarders to carry over into the new year. Review them in Allocation.");

    const rows = await run((tx) => carryOverRows(tx, null));
    const of = (id: string) => rows.find((r) => r.allocation.id === id)!;
    // No 2027-28 hostel fee plan yet: boarders who pay hostel fees wait for it; Kiran (no hostel fees) can go.
    expect(of(bed.ravi).blocked).toBe("No 2027-28 hostel fee plan for this room yet. The Accountant or Principal adds it in Hostel Settings, Hostel fees.");
    expect(of(bed.kiran)).toMatchObject({ blocked: null, plan: null, newClass: "2 A" });
    expect(of(bed.rahul).blocked).toBe("Not studying here now. Check out at year end.");
    expect(of(bed.ravi).fromYear.name).toBe("2026-27");
    expect(of(bed.ravi).toYear.name).toBe("2027-28");
  });

  it("carries a warden's own boarders over, keeping the bed and adding the 2027-28 fees once", async () => {
    await run((tx) => saveFeePlan(tx, as(f, f.admin.id), null, {
      academicYearId: f.nextYearId, name: "Hostel fees 2027-28", hostelId: null, roomType: null, includesMess: true, note: null,
      installments: [
        { label: "Term 1", dueDate: day("2027-04-10"), amountPaise: BigInt(5000000) },
        { label: "Term 2", dueDate: day("2027-10-10"), amountPaise: BigInt(5000000) },
      ],
    }));
    const W = as(f, f.warden.id);
    const mine = [f.boys.id];
    const rows = await run((tx) => carryOverRows(tx, mine), W);
    expect(rows.map((r) => r.name).sort()).toEqual(["Arjun Reddy", "Kiran Reddy", "Rahul Reddy", "Ravi Reddy"]);
    // Arjun pays hostel fees but is not promoted yet: the 2027-28 fees go with his class, so he waits.
    expect(rows.find((r) => r.allocation.id === bed.arjun)?.blocked).toBe("No class in 2027-28 yet. Promote Arjun first; the 2027-28 hostel fees go with the class.");
    expect(rows.find((r) => r.allocation.id === bed.ravi)?.plan?.name).toBe("Hostel fees 2027-28");
    // The girls' boarders are not this warden's.
    await expect(run((tx) => carryOver(tx, W, [bed.meena], mine), W)).rejects.toThrow("These boarders were carried over or checked out already. Refresh the page.");

    const before = await run((tx) => tx.bedAllocation.findUniqueOrThrow({ where: { id: bed.ravi } }));
    const r = await run((tx) => carryOver(tx, W, [bed.ravi, bed.arjun, bed.kiran, bed.rahul], mine), W);
    expect(r).toMatchObject({ carried: 2, feeRows: 2, feePaise: BigInt(10000000), year: "2027-28" });
    expect(r.skipped.map((x) => x.name).sort()).toEqual(["Arjun Reddy", "Rahul Reddy"]);
    const after = await run((tx) => tx.bedAllocation.findUniqueOrThrow({ where: { id: bed.ravi } }));
    expect(after).toMatchObject({ status: "ACTIVE", bedId: before.bedId, startDate: before.startDate, academicYearId: f.nextYearId });
    expect(after.checkedInAt).toEqual(before.checkedInAt);
    expect((await hostelDues(f.ravi.id, f.nextYearId)).map((d) => [d.label, d.dueDate.toISOString().slice(0, 10)])).toEqual([["Hostel fee: Term 1", "2027-04-10"], ["Hostel fee: Term 2", "2027-10-10"]]);
    // Last year's hostel fees are as they were.
    expect((await hostelDues(f.ravi.id, f.yearId)).length).toBe(4);
    expect(await hostelDues(f.kiran.id, f.nextYearId)).toEqual([]);
    expect(await run((tx) => tx.auditLogEntry.count({ where: { recordType: "Bed Allocation", recordId: bed.ravi, action: "carried-over" } }))).toBe(1);

    // Never twice.
    await expect(run((tx) => carryOver(tx, W, [bed.ravi, bed.kiran], mine), W)).rejects.toThrow("These boarders were carried over or checked out already. Refresh the page.");
    expect((await hostelDues(f.ravi.id, f.nextYearId)).length).toBe(2);
    expect((await run((tx) => carryOverRows(tx, mine), W)).map((x) => x.allocation.id).sort()).toEqual([bed.arjun, bed.rahul].sort());
    // Once promoted, Arjun goes too.
    await run(async (tx) => {
      const sec = await tx.section.findFirstOrThrow({ where: { classId: f.c2, academicYearId: f.nextYearId } });
      await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: f.arjun.id, academicYearId: f.nextYearId, classId: f.c2, sectionId: sec.id, rollNo: 9 } });
    }, { schoolId: f.school.id, userId: null });
    expect(await run((tx) => carryOver(tx, W, [bed.arjun], mine), W)).toMatchObject({ carried: 1, feeRows: 2 });
    expect((await hostelDues(f.arjun.id, f.nextYearId)).length).toBe(2);
  });

  it("checks out boarders not coming back on the old year's last day, with nothing of the new year charged", async () => {
    const W = as(f, f.warden.id);
    const r = await run((tx) => checkOutAtYearEnd(tx, W, [bed.rahul], [f.boys.id], ist("2027-04-02", 9)), W);
    expect(r).toMatchObject({ done: 1, year: "2027-28" });
    const a = await run((tx) => tx.bedAllocation.findUniqueOrThrow({ where: { id: bed.rahul } }));
    expect(a).toMatchObject({ status: "CHECKED_OUT", endReason: "Not staying in the hostel in 2027-28" });
    expect(a.endDate?.toISOString().slice(0, 10)).toBe("2027-03-31");
    expect(await hostelDues(f.rahul.id, f.nextYearId)).toEqual([]);
    const G = as(f, f.gwarden.id);
    await run((tx) => checkOutAtYearEnd(tx, G, [bed.meena], [f.girls.id], ist("2027-04-02", 9)), G);
    expect(await hostelDues(f.meena.id, f.nextYearId)).toEqual([]);
  });

  it("stops the hostel fees of a boarder who leaves the school after their last day, even with the hostel check waived", async () => {
    const G = as(f, f.gwarden.id);
    await run((tx) => carryOver(tx, G, [bed.sita], [f.girls.id]), G);
    expect((await hostelDues(f.sita.id, f.nextYearId)).length).toBe(2);
    const P = as(f, f.principal.id);
    await run(async (tx) => {
      const req = await startLeaving(tx, P, { studentId: f.sita.id, type: "TRANSFER", reason: "Family moved to Pune", lastDate: day("2027-04-20"), destinationSchool: "Pune Public School" });
      await completeLeaving(tx, P, req.id, day("2027-04-20"));
    }, P);
    const a = await run((tx) => tx.bedAllocation.findUniqueOrThrow({ where: { id: bed.sita } }));
    expect(a.status).toBe("CHECKED_OUT");
    expect(a.endDate?.toISOString().slice(0, 10)).toBe("2027-04-20");
    expect(a.endReason).toBe("Left the school: Family moved to Pune");
    // Term 1 (due 10 April) stays due; Term 2 (October) is no longer charged.
    expect((await hostelDues(f.sita.id, f.nextYearId)).map((d) => d.label)).toEqual(["Hostel fee: Term 1"]);
  });
});
