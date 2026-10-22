// Fees by class (owner's prototype changes of 13 Oct 2026): one per-class
// source for every fee total (the Fee Dashboard band, Fees by class, the
// class-wise Fee Report and the Dashboard's overdue card agree), "Ask the
// class teacher to follow up" as a real Communication message with an audit
// entry and no amounts, and the desk rules: the Principal never sits at the
// fee counter, and the Vice Principal (View) is refused collecting by the server.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { ALL_ROLE_TEMPLATES } from "@/lib/roles";
import { can, combineRoles } from "@/lib/permissions";
import { requireFeeStaff, type FeeViewer } from "@/lib/fees/access";
import { feesByClass, sectionFees } from "@/lib/fees/by-class";
import { feeTiles } from "@/lib/fees/dashboard";
import { FEE_REPORTS } from "@/lib/fees/reports";
import { askTeacherFollowUp, FOLLOW_UP_ACTION, followUpText } from "@/lib/fees/follow-up";
import { pageMode } from "@/lib/duty";
import { makeUser } from "../helpers";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;
let teacher: { id: string };
const TODAY = new Date("2026-10-05T00:00:00Z");

const full = (userId: string, roleKeys = ["principal"]): FeeViewer => ({ userId, see: "all", change: "all", roleKeys, sectionIds: null, yearId: f.year.id, yearIds: [f.year.id], campusId: null });

beforeAll(async () => {
  f = await makeFeeSchool();
  teacher = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["class-teacher"] }], name: "Class Teacher Person" });
  await withSchool(f.ctx, async (tx) => {
    const st = await tx.staff.create({ data: { schoolId: f.school.id, campusId: (await tx.campus.findFirstOrThrow()).id, staffCode: "CT-1", firstName: "Kavya", lastName: "Sree", fullName: "Kavya Sree", phone: "9876512345", designation: "Teacher", joiningDate: new Date("2020-06-01"), userLoginId: teacher.id } });
    await tx.section.update({ where: { id: f.a.id }, data: { classTeacherId: st.id } });
  });
  // Ravi pays Q1 and Q2 (due 10 Apr and 10 Jul); Sita and Anil pay nothing.
  const rows = await dues(f.ctx, f.ravi.id);
  await collect(f.ctx, { studentId: f.ravi.id, dueIds: rows.slice(0, 2).map((r) => r.id), amountPaise: R(12000) });
}, 120_000);

describe("Fees by class", () => {
  it("adds up to the Fee Dashboard band, and the class-wise Fee Report shows the same rows", async () => {
    const v = full(f.principal.id);
    const { by, tiles, report } = await withSchool(f.pctx, async (tx) => ({
      by: await feesByClass(tx, v, TODAY),
      tiles: await feeTiles(tx, v, TODAY),
      report: await FEE_REPORTS.find((r) => r.key === "by-class")!.run(tx, f.pctx, { from: TODAY, to: TODAY, classId: null, feeHeadId: null, mode: null, collectorId: null, group: "day", today: TODAY }, v),
    }));
    const row = by.sections.find((s) => s.sectionId === f.a.id)!;
    // Three students, Q1 to Q3 due so far (Q3 falls due on 10 Oct, inside the 30-day window): ₹54,000.
    expect(row.students).toBe(3);
    expect(row.due).toBe(R(54000));
    expect(row.paid).toBe(R(12000));
    expect(row.overdue).toBe(R(24000));
    expect(row.notLate).toBe(R(18000));
    expect(row.pending).toBe(R(42000));
    expect([row.owe, row.overdueStudents]).toEqual([3, 2]);
    expect(row.teacher?.name).toBe("Kavya Sree");
    expect(tiles.pending).toBe(by.totals.notLate);
    expect(tiles.overdue).toBe(by.totals.overdue);
    expect(tiles.overdueStudents).toBe(by.totals.overdueStudents);
    expect(by.sections.reduce((a, s) => a + s.overdue, BigInt(0))).toBe(by.totals.overdue);
    expect(report.totals?.overdue).toBe(by.totals.overdue);
    expect(report.totals?.due).toBe(by.totals.due);
    expect(report.rows).toHaveLength(by.sections.length);
  });

  it("shows one class's students one by one, and a class teacher with Own reach sees only their own section", async () => {
    const s = await withSchool(f.pctx, (tx) => sectionFees(tx, full(f.principal.id), f.a.id, TODAY));
    expect(s?.students.map((x) => x.name).sort()).toEqual(["Anil Das", "Ravi Kumar", "Sita Rao"]);
    const ravi = s!.students.find((x) => x.name === "Ravi Kumar")!;
    expect([ravi.overdue, ravi.pending, ravi.daysLate]).toEqual([BigInt(0), R(6000), 0]);
    const sita = s!.students.find((x) => x.name === "Sita Rao")!;
    expect(sita.daysLate).toBe(178);
    const own: FeeViewer = { userId: teacher.id, see: "own", change: "none", roleKeys: ["class-teacher"], sectionIds: [], yearId: f.year.id, yearIds: [f.year.id], campusId: null };
    expect(await withSchool({ schoolId: f.school.id, userId: teacher.id }, (tx) => sectionFees(tx, own, f.a.id, TODAY))).toBeNull();
  });

  it("asks the class teacher to follow up: a Communication message with names only, and an audit entry", async () => {
    const r = await withSchool(f.pctx, (tx) => askTeacherFollowUp(tx, f.pctx, full(f.principal.id), { sectionId: f.a.id, today: TODAY }));
    expect(r).toMatchObject({ teacher: "Kavya Sree", students: 3 });
    const { msg, audit } = await withSchool(f.pctx, async (tx) => ({
      msg: await tx.message.findUniqueOrThrow({ where: { id: r.messageId }, include: { recipients: true } }),
      audit: await tx.auditLogEntry.findMany({ where: { action: FOLLOW_UP_ACTION, recordId: f.a.id } }),
    }));
    expect(msg.channels).toEqual(["app"]);
    expect(msg.body).toContain("Sita Rao");
    expect(msg.body).not.toMatch(/₹|\d{3,}/);
    expect(msg.recipients.some((x) => x.address === teacher.id)).toBe(true);
    expect(audit).toHaveLength(1);
  });

  it("refuses the follow-up to anyone without the whole school's fees", async () => {
    const own: FeeViewer = { userId: teacher.id, see: "own", change: "none", roleKeys: ["class-teacher"], sectionIds: [f.a.id], yearId: f.year.id, yearIds: [f.year.id], campusId: null };
    const tctx = { schoolId: f.school.id, userId: teacher.id };
    await expect(withSchool(tctx, (tx) => askTeacherFollowUp(tx, tctx, own, { sectionId: f.a.id, today: TODAY }))).rejects.toThrow(/whole school/);
  });

  it("keeps long name lists inside the message limit", () => {
    const names = Array.from({ length: 200 }, (_, i) => `Student Number ${i + 1}`);
    const t = followUpText("Class 5 A", names);
    expect(t.length).toBeLessThanOrEqual(1000);
    expect(t).toMatch(/and \d+ more\./);
  });
});

describe("Fee desk work by role", () => {
  const perms = (key: string) => combineRoles([ALL_ROLE_TEMPLATES.find((r) => r.key === key)!.permissions]);

  it("the Vice Principal (View) is refused collecting a fee by the server", () => {
    expect(can(perms("vice-principal"), "fee-management", "create")).toBe(false);
    expect(() => requireFeeStaff({ change: "none" }, "collect fees")).toThrow(/cannot do collect fees/);
  });

  it("the Principal and School Admin never get the Collect Fee page; the Accountant does", () => {
    expect(pageMode({ roles: [{ key: "principal" }] }, "fee-management", "collect")).toBe("hidden");
    expect(pageMode({ roles: [{ key: "school-admin" }] }, "fee-management", "collect")).toBe("hidden");
    expect(pageMode({ roles: [{ key: "principal" }] }, "fee-management", "defaulters")).toBe("view");
    expect(pageMode({ roles: [{ key: "accountant" }] }, "fee-management", "collect")).toBe("full");
    expect(pageMode({ roles: [{ key: "principal" }] }, "fee-management", "structure")).toBe("full");
  });
});
