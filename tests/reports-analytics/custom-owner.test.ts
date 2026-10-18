// Custom & Scheduled Reports (19 §2; G02): a saved custom report and a report
// schedule are changed only by the person who made them (the School Admin or
// Principal may too, for someone who has left). Before, only the page hid
// the buttons: anyone with full Reports could archive another person's report
// and stop its schedules.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type Tx } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import type { ReportViewer } from "@/lib/reports/types";
import { archiveCustom, mayChangeSchedule, setScheduleStatus } from "@/lib/reports/custom";
import { makeSchool, makeUser } from "../helpers";

let school: Awaited<ReturnType<typeof makeSchool>>;
let viewers: Record<"owner" | "other" | "admin", ReportViewer>;
const run = <T>(fn: (tx: Tx) => Promise<T>) => withSchool({ schoolId: school.id, userId: null }, fn);

beforeAll(async () => {
  school = await makeSchool("Custom Reports School");
  const make = async (roleKeys: string[], name: string) => {
    const u = await makeUser({ schools: [{ id: school.id, roleKeys }], name });
    const access = await accessIn(u.id, school.id);
    return { ...access!, ctx: { schoolId: school.id, userId: u.id }, user: { id: u.id, displayName: name } } as unknown as ReportViewer;
  };
  // Two Vice Principals (full Reports, no Settings) and a School Admin.
  await run((tx) => tx.role.updateMany({ where: { key: "vice-principal" }, data: { isEnabled: true } }));
  viewers = { owner: await make(["vice-principal"], "Owner"), other: await make(["vice-principal"], "Other"), admin: await make(["school-admin"], "Admin") };
});

async function makeReport() {
  return run(async (tx) => {
    const r = await tx.customReport.create({ data: { schoolId: school.id, name: `Report ${Math.random()}`, area: "students", columns: ["name"], ownerId: viewers.owner.user.id } });
    const s = await tx.reportSchedule.create({ data: { schoolId: school.id, reportKey: `c:${r.id}`, reportName: r.name, recipientIds: [viewers.owner.user.id], nextAt: new Date(), createdById: viewers.owner.user.id } });
    return { reportId: r.id, scheduleId: s.id };
  });
}

describe("only the person who made it changes a custom report or schedule", () => {
  it("refuses another person", async () => {
    const { reportId, scheduleId } = await makeReport();
    const as = (v: ReportViewer) => <T>(fn: (tx: Tx) => Promise<T>) => withSchool(v.ctx, fn);
    await expect(as(viewers.other)((tx) => archiveCustom(tx, viewers.other, reportId))).rejects.toThrow("Only the person who saved this report can archive it.");
    await expect(as(viewers.other)((tx) => setScheduleStatus(tx, viewers.other, scheduleId, "PAUSED"))).rejects.toThrow("Only the person who made this schedule");
    await expect(as(viewers.other)((tx) => mayChangeSchedule(tx, viewers.other, scheduleId))).rejects.toThrow("Only the person who made this schedule");
    const still = await run((tx) => tx.customReport.findUniqueOrThrow({ where: { id: reportId } }));
    expect(still.archivedAt).toBeNull();
    expect((await run((tx) => tx.reportSchedule.findUniqueOrThrow({ where: { id: scheduleId } }))).status).toBe("ACTIVE");
  });

  it("lets the owner, and the School Admin, do it", async () => {
    const a = await makeReport();
    await withSchool(viewers.owner.ctx, (tx) => setScheduleStatus(tx, viewers.owner, a.scheduleId, "PAUSED"));
    await withSchool(viewers.owner.ctx, (tx) => archiveCustom(tx, viewers.owner, a.reportId));
    expect((await run((tx) => tx.customReport.findUniqueOrThrow({ where: { id: a.reportId } }))).archivedAt).not.toBeNull();
    const b = await makeReport();
    await withSchool(viewers.admin.ctx, (tx) => archiveCustom(tx, viewers.admin, b.reportId));
    expect((await run((tx) => tx.customReport.findUniqueOrThrow({ where: { id: b.reportId } }))).archivedAt).not.toBeNull();
  });
});
