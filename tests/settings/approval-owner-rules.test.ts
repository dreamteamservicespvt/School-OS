// The owner's approval rules (12 Oct 2026) on top of Settings, Forms &
// Approvals: nobody decides their own request or one about themselves; HR
// never approves staff leave (head of department, then the Principal); only
// the Principal rejects an admission. Each is refused by the server.
import { beforeAll, describe, expect, it } from "vitest";
import type { Application } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { approvalsFor, canDecide, decide, escalateOverdue, mayReject, requestApproval } from "@/lib/approvals";
import { saveRule } from "@/lib/settings/approval-rules";
import { applyDecision } from "@/lib/admission/decision";
import { makeSchool, makeUser } from "../helpers";

let school: Awaited<ReturnType<typeof makeSchool>>;
let principal: { id: string };
let admin: { id: string };
let hr: { id: string };
let teacher: { id: string };
const c = (userId: string | null) => ({ schoolId: school.id, userId });

beforeAll(async () => {
  school = await makeSchool("Owner Rules School");
  await withSchool(c(null), (tx) => tx.role.updateMany({ where: { key: "hr" }, data: { isEnabled: true } }));
  principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Lakshmi Rao" });
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Suresh Kumar" });
  hr = await makeUser({ schools: [{ id: school.id, roleKeys: ["hr"] }], name: "Hema Latha" });
  teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Ravi Teja" });
});

const ask = (by: string, type: "staff-leave" | "admission" | "attendance-correction", extra: Partial<Parameters<typeof requestApproval>[2]> = {}) =>
  withSchool(c(by), (tx) => requestApproval(tx, c(by), { type, recordType: "Test", recordId: crypto.randomUUID(), summary: `${type} test`, ...extra }));

describe("nobody decides a request about themselves", () => {
  it("HR applying leave for the Principal: it goes to someone else, and the Principal is refused", async () => {
    const a = await ask(hr.id, "staff-leave", { aboutUserIds: [principal.id] });
    expect(a.currentApproverRole).toBe("school-admin");
    expect(a.aboutUserIds).toEqual([principal.id]);
    await expect(withSchool(c(principal.id), (tx) => decide(tx, c(principal.id), a.id, "approve", null))).rejects.toThrow("This request is about you");
    const mine = await withSchool(c(principal.id), async (tx) => tx.approval.findMany({ where: await approvalsFor(tx, c(principal.id), ["principal"]) }));
    expect(mine.some((x) => x.id === a.id)).toBe(false);
    await withSchool(c(admin.id), (tx) => decide(tx, c(admin.id), a.id, "approve", null));
  });
});

describe("HR does not approve staff leave", () => {
  it("a rule step for HR cannot be saved for staff leave, but can for other requests", async () => {
    await expect(withSchool(c(admin.id), (tx) => saveRule(tx, c(admin.id), "staff-leave", { steps: [{ approverRole: "hr", approverUserId: null, upToPaise: null }], escalateAfterDays: 2 })))
      .rejects.toThrow(/does not approve staff leave/);
    await withSchool(c(admin.id), (tx) => saveRule(tx, c(admin.id), "attendance-correction", { steps: [{ approverRole: "hr", approverUserId: null, upToPaise: null }, { approverRole: "principal", approverUserId: null, upToPaise: null }], escalateAfterDays: 2 }));
  });

  it("an older rule naming HR is passed over: the leave goes to the Principal", async () => {
    await withSchool(c(null), (tx) => tx.approvalRule.create({ data: { schoolId: school.id, requestType: "staff-leave", steps: [{ approverRole: "hr" }, { approverRole: "principal" }], escalateAfterDays: 1 } }));
    const a = await ask(teacher.id, "staff-leave", { aboutUserIds: [teacher.id] });
    expect(a.currentApproverRole).toBe("principal");
  });

  it("a staff leave waiting on HR (from before this rule) is not HR's to decide", async () => {
    const a = await ask(teacher.id, "staff-leave");
    const stuck = await withSchool(c(null), (tx) => tx.approval.update({ where: { id: a.id }, data: { currentApproverRole: "hr", currentApproverId: null } }));
    expect(await withSchool(c(hr.id), (tx) => canDecide(tx, c(hr.id), stuck))).toBe(false);
    await expect(withSchool(c(hr.id), (tx) => decide(tx, c(hr.id), a.id, "approve", null))).rejects.toThrow(/waiting for someone else/);
    const waiting = await withSchool(c(hr.id), async (tx) => tx.approval.findMany({ where: await approvalsFor(tx, c(hr.id), ["hr"]) }));
    expect(waiting.some((x) => x.id === a.id)).toBe(false);
  });

  it("escalation from the head of department skips HR and reaches the Principal", async () => {
    const a = await ask(teacher.id, "staff-leave", { firstApproverId: admin.id });
    expect(a.currentApproverId).toBe(admin.id);
    await withSchool(c(null), (tx) => tx.approval.update({ where: { id: a.id }, data: { history: [{ at: "2026-01-01T00:00:00.000Z", by: teacher.id, action: "asked" }] } }));
    await withSchool(c(null), (tx) => escalateOverdue(tx, c(null)));
    const after = await withSchool(c(null), (tx) => tx.approval.findUniqueOrThrow({ where: { id: a.id } }));
    expect(after.currentApproverRole).toBe("principal");
  });
});

describe("HR decides staff attendance corrections first", () => {
  it("routes to HR, unless the correction is about HR", async () => {
    const forTeacher = await ask(admin.id, "attendance-correction", { firstApproverRole: "hr", aboutUserIds: [teacher.id] });
    expect(forTeacher.currentApproverRole).toBe("hr");
    await withSchool(c(hr.id), (tx) => decide(tx, c(hr.id), forTeacher.id, "approve", null));
    const forHr = await ask(admin.id, "attendance-correction", { firstApproverRole: "hr", aboutUserIds: [hr.id] });
    expect(forHr.currentApproverRole).not.toBe("hr");
    await expect(withSchool(c(hr.id), (tx) => decide(tx, c(hr.id), forHr.id, "approve", null))).rejects.toThrow("This request is about you");
  });
});

describe("only the Principal rejects an admission", () => {
  it("the School Admin may approve but not reject; the Principal may reject", async () => {
    await withSchool(c(admin.id), (tx) => saveRule(tx, c(admin.id), "admission", { steps: [{ approverRole: "school-admin", approverUserId: null, upToPaise: null }], escalateAfterDays: 2 }));
    const a = await ask(teacher.id, "admission");
    expect(a.currentApproverRole).toBe("school-admin");
    expect(await withSchool(c(admin.id), (tx) => mayReject(tx, c(admin.id), "admission"))).toBe(false);
    expect(await withSchool(c(principal.id), (tx) => mayReject(tx, c(principal.id), "admission"))).toBe(true);
    expect(await withSchool(c(admin.id), (tx) => mayReject(tx, c(admin.id), "staff-leave"))).toBe(true);
    await expect(withSchool(c(admin.id), (tx) => decide(tx, c(admin.id), a.id, "reject", "No seats left this year"))).rejects.toThrow(/Only the Principal can reject admission requests/);
    const still = await withSchool(c(null), (tx) => tx.approval.findUniqueOrThrow({ where: { id: a.id } }));
    expect(still.status).toBe("WAITING");
  });

  it("the Admission Decision page refuses a rejection by anyone but the Principal", async () => {
    const app = { id: crypto.randomUUID(), stage: "DECISION" } as Application;
    await expect(withSchool(c(admin.id), (tx) => applyDecision(tx, c(admin.id), app, "reject", "Not enough seats"))).rejects.toThrow(/Only the Principal/);
  });
});
