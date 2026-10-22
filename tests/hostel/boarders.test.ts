// Boarders who are new to the school (gap list G38, part 1): a student just
// admitted, and one admitted for next year (their only class is in 2027-28,
// status Admitted until they join), whose application asked for the hostel,
// wait for a bed where the warden sees them, with the application it was
// asked on; the bed sheet finds them; the bed starts on the day they join and
// takes next year's hostel fee plan; a bed starting later cannot be "checked
// in now"; and once a bed is given the admission can no longer be undone.
import { beforeAll, describe, expect, it } from "vitest";
import type { Application } from "@prisma/client";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { createApplication, type ApplicationInput } from "@/lib/admission/applications";
import { DATA_CONSENT } from "@/lib/admission/consent";
import { confirmAdmission, undoAdmission } from "@/lib/admission/convert";
import { allocate, bedYears, studentsInfo, waitingForBed } from "@/lib/hostel/allocation";
import { openFeePlans, saveFeePlan } from "@/lib/hostel/settings";
import { bedStartFor, bedYearOf } from "@/lib/hostel/words";
import { applicationInput } from "../admission/fixtures";
import { TODAY, anyHostel, as, day, ist, makeHostelSchool, type HostelFixture } from "./fixture";

describe("new students get a hostel bed (G38)", () => {
  let f: HostelFixture;
  let counsellor: Awaited<ReturnType<HostelFixture["who"]>>;
  let nextPlanId = "";
  const run = <T,>(fn: (tx: Tx) => Promise<T>, ctx: SchoolContext = as(f, f.admin.id)) => withSchool(ctx, fn);
  let phoneN = 0;

  /** An application at the counter for a year, approved with data consent, asking for the hostel or not. */
  async function approved(yearId: string, over: Record<string, unknown>): Promise<Application> {
    const cctx = counsellor.ctx;
    const app = await withSchool(cctx, (tx) => createApplication(tx, cctx, counsellor.v, counsellor.s, applicationInput(yearId, f.c1, { phone: `95${String(30000000 + (++phoneN) * 7121).slice(0, 8)}`, ...over }) as ApplicationInput, { campusId: f.campusId, channel: "counter", force: true }));
    return run(async (tx) => {
      await tx.admissionConsent.create({ data: { schoolId: f.school.id, applicationId: app.id, consentType: DATA_CONSENT, version: 0, givenByName: "Parent", phone: app.phone, howGiven: "admission-form-counter", otpVerifiedAt: new Date() } });
      return tx.application.update({ where: { id: app.id }, data: { stage: "APPROVED", decidedAt: new Date(), papersException: "Papers checked at the counter (test)" } });
    });
  }
  const admit = (app: Application, on: string) => run((tx) => confirmAdmission(tx, counsellor.ctx, counsellor.v, app.id, { sectionId: null, admissionDate: day(on) }), counsellor.ctx);

  let nowStudent = { id: "", name: "" };
  let nextStudent = { id: "", name: "" };
  let nextApp: Application;

  beforeAll(async () => {
    f = await makeHostelSchool("Hostel New Boarders School");
    counsellor = await f.who(f.counsellor);
    // Next year's hostel fee plan, set in Hostel Settings before the year opens.
    nextPlanId = await run((tx) => saveFeePlan(tx, as(f, f.admin.id), null, {
      academicYearId: f.nextYearId, name: "Hostel fees 2027-28", hostelId: null, roomType: null, includesMess: true, note: null,
      installments: [
        { label: "Term 1", dueDate: day("2027-04-10"), amountPaise: BigInt(5000000) },
        { label: "Term 2", dueDate: day("2027-10-10"), amountPaise: BigInt(5000000) },
      ],
    }));
    // Admitted this year, joined last month, hostel needed.
    const a1 = await approved(f.yearId, { firstName: "Naveen", gender: "Male", preferences: { hostelNeeded: true } });
    const r1 = await admit(a1, "2026-09-15");
    nowStudent = { id: r1.student.id, name: r1.student.fullName };
    // Admitted for next year (Class 1 in 2027-28 only), joins 1 April 2027, hostel needed.
    nextApp = await approved(f.nextYearId, { firstName: "Vikram", gender: "Male", preferences: { hostelNeeded: true } });
    const r2 = await admit(nextApp, "2027-04-01");
    nextStudent = { id: r2.student.id, name: r2.student.fullName };
    // Admitted for next year without asking for the hostel: not waiting.
    await admit(await approved(f.nextYearId, { firstName: "Gopal", gender: "Male", preferences: {} }), "2027-04-01");
  }, 120_000);

  it("lists both on the warden's Waiting for a bed, with the application, the join day and the class year", async () => {
    const waiting = await run((tx) => waitingForBed(tx, as(f, f.warden.id)), as(f, f.warden.id));
    expect(waiting.map((w) => w.name).sort()).toEqual([nowStudent.name, nextStudent.name].sort());
    const next = waiting.find((w) => w.id === nextStudent.id)!;
    expect(next.status).toBe("ADMITTED");
    expect(next.applicationNo).toBe(nextApp.applicationNo);
    expect(next.joins?.toISOString().slice(0, 10)).toBe("2027-04-01");
    expect(next.years.map((y) => y.name)).toEqual(["2027-28"]);
    // The class shown is next year's, with the year's name.
    expect(next.classSection).toBe("1 A, 2027-28");
    expect(waiting.find((w) => w.id === nowStudent.id)!.classSection).toBe("1 A");
  });

  it("starts the bed of a student admitted for next year on the day the year starts, in that year", async () => {
    const years = (await run((tx) => bedYears(tx, [nextStudent.id, nowStudent.id])));
    expect(bedStartFor(years.get(nextStudent.id)!, "2027-04-01", "2026-10-12")).toBe("2027-04-01");
    expect(bedStartFor(years.get(nowStudent.id)!, "2026-09-15", "2026-10-12")).toBe("2026-10-12");
    expect(bedYearOf(years.get(nextStudent.id)!, "2027-04-01")?.name).toBe("2027-28");
    // Arriving a few days early still belongs to the year of the class.
    expect(bedYearOf(years.get(nextStudent.id)!, "2027-03-28")?.name).toBe("2027-28");
    // The bed sheet offers next year's plan too.
    const plans = await run((tx) => openFeePlans(tx, as(f, f.admin.id)));
    expect(plans.map((p) => [p.name, p.yearName])).toEqual(expect.arrayContaining([["Hostel fees", "2026-27"], ["Hostel fees 2027-28", "2027-28"]]));
  });

  it("gives a bed to a student admitted this year", async () => {
    const W = as(f, f.warden.id);
    const r = await run((tx) => allocate(tx, W, { studentId: nowStudent.id, bedId: f.bed("B-1", 1).id, startDate: TODAY, checkedIn: true, feePlanId: f.planId, note: null }, { now: ist("2026-10-12", 9), today: TODAY, assertHostel: anyHostel }), W);
    expect(r.allocation.academicYearId).toBe(f.yearId);
    expect(r.fees.rows).toBe(2);
  });

  it("gives a bed to a student admitted for next year, from 1 April 2027 with the 2027-28 fees, waiting for them", async () => {
    const W = as(f, f.warden.id);
    const give = (over: Partial<Parameters<typeof allocate>[2]>) => run((tx) => allocate(tx, W, { studentId: nextStudent.id, bedId: f.bed("B-1", 2).id, startDate: day("2027-04-01"), checkedIn: false, feePlanId: nextPlanId, note: null, ...over }, { now: ist("2026-10-12", 9), today: TODAY, assertHostel: anyHostel }), W);
    // This year's plan is not for a 2027-28 bed.
    await expect(give({ feePlanId: f.planId })).rejects.toThrow("“Hostel fees” is for 2026-27, and this bed is for 2027-28. Choose a 2027-28 plan, or No hostel fees.");
    // Not here yet, so not "checked in now".
    await expect(give({ checkedIn: true })).rejects.toThrow(/The bed starts on .*Turn off “Checked in now”/);
    const r = await give({});
    expect(r.allocation.academicYearId).toBe(f.nextYearId);
    expect(r.allocation.startDate.toISOString().slice(0, 10)).toBe("2027-04-01");
    expect(r.allocation.checkedInAt).toBeNull();
    expect(r.fees).toMatchObject({ rows: 2, total: BigInt(10000000) });
    const dues = await run((tx) => tx.studentFeeDue.findMany({ where: { studentId: nextStudent.id, label: { startsWith: "Hostel fee" } }, orderBy: { dueDate: "asc" } }));
    expect(dues.map((d) => [d.label, d.dueDate.toISOString().slice(0, 10), d.academicYearId])).toEqual([
      ["Hostel fee: Term 1", "2027-04-10", f.nextYearId],
      ["Hostel fee: Term 2", "2027-10-10", f.nextYearId],
    ]);
    // Off the waiting list now, and shown with next year's class on the residents list.
    const waiting = await run((tx) => waitingForBed(tx, W), W);
    expect(waiting).toEqual([]);
    expect((await run((tx) => studentsInfo(tx, W, [nextStudent.id]), W)).get(nextStudent.id)?.classSection).toBe("1 A, 2027-28");
  });

  it("refuses a bed from a day the student has no class in", async () => {
    const W = as(f, f.warden.id);
    const s = await admit(await approved(f.nextYearId, { firstName: "Sai", gender: "Male", preferences: { hostelNeeded: true } }), "2027-04-01");
    // Only a class in 2027-28: a bed from April 2028 belongs to no year of theirs.
    await expect(run((tx) => allocate(tx, W, { studentId: s.student.id, bedId: f.bed("B-2", 1).id, startDate: day("2028-05-01"), checkedIn: false, feePlanId: "none", note: null }, { now: ist("2026-10-12", 9), today: TODAY, assertHostel: anyHostel }), W))
      .rejects.toThrow("Sai's class is for 2027-28. Give the bed from a day in that year, or promote Sai first.");
  });

  it("refuses to undo an admission once the student has a hostel bed", async () => {
    await expect(run((tx) => undoAdmission(tx, counsellor.ctx, counsellor.v, nextApp.id), counsellor.ctx)).rejects.toThrow(/A hostel bed is already recorded for this student|a hostel bed/);
  });
});
