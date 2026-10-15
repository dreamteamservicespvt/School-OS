// Reports & Analytics (19-reports-analytics.md): who may open which report
// (fee, GST and PF/ESI reports refused to a teacher and open to the
// accountant; own-reach people see their own classes only), report totals
// equal to the modules' own totals, financial-year dates, early-warning flags
// (raised below the threshold, reviewed with a note, no fee signals for the
// Academic Head), heavy reports prepared in the background with a link, the
// UDISE check listing missing fields, and schedules sent only to people who
// may see the data.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { feesByClass } from "@/lib/fees/by-class";
import { classWise } from "@/lib/attendance/classwise";
import { saveClassAttendance } from "@/lib/attendance/marks";
import { reportAccess } from "@/lib/reports/access";
import { catalogueFor, entryAllowed, findEntry } from "@/lib/reports/catalogue";
import { readFilters, whenWords } from "@/lib/reports/filters";
import { makeRun, prepareReport, ReportProblem, runEntry, viewerOf } from "@/lib/reports/run";
import { flagScope, listFlags, refreshFlags, reviewFlag, WarningProblem } from "@/lib/reports/warnings";
import { checkReturn, findReturn } from "@/lib/reports/government";
import { CustomProblem, saveSchedule } from "@/lib/reports/custom";
import type { ReportViewer } from "@/lib/reports/types";
import { makeUser } from "../helpers";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "../fees/fixture";
import { accessFor, as, at, d, makeAttendanceSchool, TZ, type Fixture } from "../attendance/fixture";

const SETUP = { timeZone: TZ, weekStart: "monday" as const, calendar: {} };
const TODAY = d("2026-10-09");
const DAYS = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];

let fee: FeeSchool;
let feeTeacher: { id: string };
let att: Fixture;
let vp: { id: string };
let head: { id: string };

async function viewer(schoolId: string, userId: string): Promise<ReportViewer> {
  const v = await withSchool({ schoolId, userId }, (tx) => viewerOf(tx, userId, schoolId));
  if (!v) throw new Error("no access");
  return v;
}

beforeAll(async () => {
  fee = await makeFeeSchool();
  feeTeacher = await makeUser({ schools: [{ id: fee.school.id, roleKeys: ["class-teacher"] }], name: "Fee School Teacher" });
  // Ravi pays the first two quarters; Sita and Anil pay nothing.
  const rows = await dues(fee.ctx, fee.ravi.id);
  await collect(fee.ctx, { studentId: fee.ravi.id, dueIds: rows.slice(0, 2).map((r) => r.id), amountPaise: R(12000) });

  att = await makeAttendanceSchool("Reports Attendance School");
  await withSchool({ schoolId: att.school.id, userId: null }, (tx) => tx.role.updateMany({ where: { key: { in: ["vice-principal", "academic-head"] } }, data: { isEnabled: true } }));
  vp = await makeUser({ schools: [{ id: att.school.id, roleKeys: ["vice-principal"] }], name: "Vice Principal Person" });
  head = await makeUser({ schools: [{ id: att.school.id, roleKeys: ["academic-head"] }], name: "Academic Head Person" });
  // Five school days in 5 A: Aarav absent every day, the others present. 5 B is marked present on the last day.
  const accessA = await accessFor(att, att.teacherA.id);
  for (const day of DAYS) {
    await withSchool(as(att, att.teacherA.id), (tx) => saveClassAttendance(tx, as(att, att.teacherA.id), accessA, {
      sectionId: att.sectionA.id, date: d(day), periodNo: 0, timeZone: TZ, now: at(day, "09:00"),
      entries: att.studentsA.map((s, i) => ({ studentId: s.id, statusKey: i === 0 ? "absent" : "present" })),
    }));
  }
  const accessB = await accessFor(att, att.teacherB.id);
  await withSchool(as(att, att.teacherB.id), (tx) => saveClassAttendance(tx, as(att, att.teacherB.id), accessB, {
    sectionId: att.sectionB.id, date: d(DAYS[4]), periodNo: 0, timeZone: TZ, now: at(DAYS[4], "09:00"),
    entries: att.studentsB.map((s) => ({ studentId: s.id, statusKey: "present" })),
  }));
  await withSchool({ schoolId: att.school.id, userId: null }, (tx) => refreshFlags(tx, { schoolId: att.school.id, userId: null }, at(DAYS[4], "18:00")));
}, 180_000);

describe("Who may open which report", () => {
  it("refuses the fee defaulter, GST and PF/ESI reports to a teacher, and opens them to the accountant", async () => {
    const teacher = await viewer(fee.school.id, feeTeacher.id);
    const accountant = await viewer(fee.school.id, fee.accountant.id);
    for (const key of ["fe-defaulter", "fe-gst", "sa-pfesi"]) {
      const e = findEntry(key)!;
      expect(e, key).toBeTruthy();
      expect(entryAllowed(e, reportAccess(teacher), teacher), `teacher ${key}`).toBe(false);
      expect(entryAllowed(e, reportAccess(accountant), accountant), `accountant ${key}`).toBe(true);
    }
    expect(catalogueFor(reportAccess(teacher), teacher).some((e) => e.category === "Fees" || e.category === "Salary" || e.category === "Finance")).toBe(false);
    // The server refuses the run itself, not only the list.
    await expect(withSchool(teacher.ctx, async (tx) => {
      const e = findEntry("fe-defaulter")!;
      return runEntry(tx, teacher, e, await readFilters(tx, teacher.ctx, e, {}, SETUP, TODAY));
    })).rejects.toThrow(ReportProblem);
    const t = await withSchool(accountant.ctx, async (tx) => {
      const e = findEntry("fe-defaulter")!;
      return runEntry(tx, accountant, e, await readFilters(tx, accountant.ctx, e, {}, SETUP, TODAY));
    });
    expect(t.rows.length).toBeGreaterThan(0);
  });

  it("shows own-reach people their own classes only, and refuses another section", async () => {
    const teacher = await viewer(att.school.id, att.teacherA.id);
    expect(reportAccess(teacher).own).toBe(true);
    const e = findEntry("at-daily")!;
    const sp = { period: "custom", from: DAYS[4], to: DAYS[4] };
    const t = await withSchool(teacher.ctx, async (tx) => runEntry(tx, teacher, e, await readFilters(tx, teacher.ctx, e, sp, SETUP, TODAY)));
    expect(t.rows.map((r) => r.cls)).toEqual([expect.stringContaining("A")]);
    expect(t.totals?.roll).toBe(5);
    await expect(withSchool(teacher.ctx, async (tx) => runEntry(tx, teacher, e, await readFilters(tx, teacher.ctx, e, { ...sp, section: att.sectionB.id }, SETUP, TODAY)))).rejects.toThrow("own classes");
  });
});

describe("Report totals equal the modules' totals", () => {
  it("Fee collection by class adds up to Fees by class", async () => {
    const principal = await viewer(fee.school.id, fee.principal.id);
    const { t, by } = await withSchool(principal.ctx, async (tx) => {
      const e = findEntry("fe-collection")!;
      const f = await readFilters(tx, principal.ctx, e, {}, SETUP, TODAY);
      return {
        t: await runEntry(tx, principal, e, f),
        by: await feesByClass(tx, { userId: principal.user.id, see: "all", change: "all", roleKeys: ["principal"], sectionIds: null, yearId: fee.year.id }, TODAY),
      };
    });
    expect(t.totals?.overdue).toBe(by.totals.overdue);
    expect(by.totals.overdue).toBeGreaterThan(BigInt(0));
  });

  it("Daily attendance adds up to the class-wise attendance", async () => {
    const principal = await viewer(att.school.id, att.principal.id);
    const e = findEntry("at-daily")!;
    const { t, cw } = await withSchool(principal.ctx, async (tx) => ({
      t: await runEntry(tx, principal, e, await readFilters(tx, principal.ctx, e, { period: "custom", from: DAYS[0], to: DAYS[4] }, SETUP, TODAY)),
      cw: await classWise(tx, principal.ctx, { yearId: att.year.id, from: d(DAYS[0]), to: d(DAYS[4]), today: TODAY }),
    }));
    expect([t.totals?.present, t.totals?.absent, t.totals?.percent]).toEqual([cw.totals.present, cw.totals.absent, cw.totals.percent]);
    expect([cw.totals.present, cw.totals.absent]).toEqual([25, 5]);
  });

  it("money reports use the financial year: 2026-27 runs 01-04-2026 to 31-03-2027", async () => {
    const principal = await viewer(fee.school.id, fee.principal.id);
    const e = findEntry("fe-defaulter")!;
    const f = await withSchool(principal.ctx, (tx) => readFilters(tx, principal.ctx, e, {}, SETUP, TODAY));
    expect(f.fy?.name).toBe("2026-27");
    expect([f.fy?.startDate.toISOString().slice(0, 10), f.fy?.endDate.toISOString().slice(0, 10)]).toEqual(["2026-04-01", "2027-03-31"]);
    expect(whenWords(f, e)).toContain("01-04-2026 to 31-03-2027");
  });
});

describe("Early warnings", () => {
  it("raises an Act now flag for a student below the attendance threshold, only for the people who may see it", async () => {
    const principal = await viewer(att.school.id, att.principal.id);
    const { list } = await withSchool(principal.ctx, async (tx) => listFlags(tx, principal, reportAccess(principal), { status: "open", area: "all", q: "", raisedFrom: null, raisedTo: null }));
    const aarav = list.find((f) => f.studentId === att.studentsA[0].id);
    expect(aarav).toMatchObject({ area: "attendance", strength: "ACT_NOW", status: "NEW" });
    expect(aarav?.reason).toContain("threshold");
    expect(list.filter((f) => f.area === "attendance").map((f) => f.studentId)).toEqual([att.studentsA[0].id]);

    // The class teacher of 5 B sees none of 5 A's flags.
    const teacherB = await viewer(att.school.id, att.teacherB.id);
    const seenByB = await withSchool(teacherB.ctx, async (tx) => tx.riskFlag.count({ where: await flagScope(tx, teacherB, reportAccess(teacherB)) }));
    expect(seenByB).toBe(0);
  });

  it("gives the VP and Academic Head early warnings, the Academic Head without fee signals; leaders watch and remind", async () => {
    const a = reportAccess(await viewer(att.school.id, head.id));
    expect(a.warnings.on).toBe(true);
    expect(a.warnings.fees).toBe(false);
    const v = reportAccess(await viewer(att.school.id, vp.id));
    expect(v.warnings.on).toBe(true);
    expect(v.warnings.review).toBe("none");
    const ahScope = await withSchool({ schoolId: att.school.id, userId: head.id }, async (tx) => flagScope(tx, await viewer(att.school.id, head.id), a));
    expect(ahScope.area).toEqual({ in: ["attendance", "marks"] });
    // A teacher never gets fee signals either.
    expect(reportAccess(await viewer(fee.school.id, feeTeacher.id)).warnings.fees).toBe(false);
  });

  it("needs a note to review, and records the review", async () => {
    const teacher = await viewer(att.school.id, att.teacherA.id);
    const a = reportAccess(teacher);
    const flag = await withSchool(teacher.ctx, (tx) => tx.riskFlag.findFirstOrThrow({ where: { studentId: att.studentsA[0].id, closedAt: null } }));
    await expect(withSchool(teacher.ctx, (tx) => reviewFlag(tx, teacher, a, flag.id, { decision: "REVIEWED", note: " ", action: null }))).rejects.toThrow(WarningProblem);
    const r = await withSchool(teacher.ctx, (tx) => reviewFlag(tx, teacher, a, flag.id, { decision: "REVIEWED", note: "Spoke to the parent, he was unwell.", action: null }));
    expect(r.status).toBe("REVIEWED");
    const after = await withSchool(teacher.ctx, (tx) => tx.riskFlag.findUniqueOrThrow({ where: { id: flag.id }, include: { reviews: true } }));
    expect(after.reviews).toHaveLength(1);
    expect(after.reviews[0]).toMatchObject({ reviewerId: att.teacherA.id, note: "Spoke to the parent, he was unwell." });
    const audit = await withSchool(teacher.ctx, (tx) => tx.auditLogEntry.count({ where: { recordType: "Risk Flag", recordId: flag.id, action: "flag-reviewed" } }));
    expect(audit).toBe(1);
  });
});

describe("Heavy reports, government returns and schedules", () => {
  it("prepares a heavy report in the background and notifies the person with the link", async () => {
    const principal = await viewer(fee.school.id, fee.principal.id);
    const e = findEntry("fe-receipts")!;
    expect(e.heavy).toBe(true);
    const run = await withSchool(principal.ctx, (tx) => prepareReport(tx, principal, e, {}, "All classes", "csv"));
    const out = await withSchool({ schoolId: fee.school.id, userId: null }, (tx) => makeRun(tx, { schoolId: fee.school.id, userId: null }, run.id));
    expect(out).toMatchObject({ rows: expect.any(Number) });
    const { done, note } = await withSchool(principal.ctx, async (tx) => ({
      done: await tx.reportRun.findUniqueOrThrow({ where: { id: run.id } }),
      note: await tx.notification.findFirst({ where: { userLoginId: fee.principal.id, link: `/reports-analytics/runs/${run.id}` } }),
    }));
    expect(done.status).toBe("READY");
    expect(done.fileId).toBeTruthy();
    expect(note?.text).toContain("Report ready: Collection details");
  });

  it("lists the fields missing for the UDISE+ return, with the records", async () => {
    const ctx = { schoolId: att.school.id, userId: att.principal.id };
    const ret = findReturn("udise")!;
    const c = await withSchool(ctx, (tx) => checkReturn(tx, ctx, ret, ret.versions[0], { id: att.year.id, name: att.year.name }, null));
    const dob = c.problems.find((p) => p.text.startsWith("Date of birth missing"));
    expect(dob?.count).toBe(10);
    expect(dob?.records.map((r) => r.name)).toContain("Aarav Sharma");
    expect(c.problems.some((p) => p.text.includes("UDISE code"))).toBe(true);
  });

  it("sends a scheduled report only to people who may see its data", async () => {
    const principal = await viewer(fee.school.id, fee.principal.id);
    const input = { reportKey: "fe-defaulter", datePreset: "default", frequency: "WEEKLY", day: 1, timeMin: 480, format: "pdf" };
    await expect(withSchool(principal.ctx, (tx) => saveSchedule(tx, principal, { ...input, recipientIds: [fee.accountant.id, feeTeacher.id] }, null))).rejects.toThrow(CustomProblem);
    await expect(withSchool(principal.ctx, (tx) => saveSchedule(tx, principal, { ...input, recipientIds: [feeTeacher.id] }, null))).rejects.toThrow(/cannot see fees data/);
    const s = await withSchool(principal.ctx, (tx) => saveSchedule(tx, principal, { ...input, recipientIds: [fee.accountant.id] }, null));
    expect(s.recipientIds).toEqual([fee.accountant.id]);
    expect(s.nextAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
});
