// Approvals (00-global.md §3) and approval rules (Settings, Forms & Approvals):
// deciding, bulk approve, never approving your own request, and the rule
// summary in plain words.
import { beforeAll, describe, expect, it, vi } from "vitest";

// The purchases asked for here point at no real record: their follow-up only notes the decision.
const decided = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/approval-handlers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/approval-handlers")>();
  return { ...real, followUpOf: (type: string) => (type === "purchase" ? async (_tx: unknown, _ctx: unknown, _a: unknown, d: string) => { decided.push(d); } : real.followUpOf(type)) };
});

import { withSchool } from "@/lib/db";
import { decide, requestApproval, DecisionProblem } from "@/lib/approvals";
import { bulkApprove, canSeeApproval, inboxWhere, statusWords } from "@/lib/approvals-inbox";
import { ruleSummary, saveRule, useDefaultRule } from "@/lib/settings/approval-rules";
import { makeSchool, makeUser } from "../helpers";

let school: Awaited<ReturnType<typeof makeSchool>>;
let principal: { id: string };
let accountant: { id: string };
let teacher: { id: string };
let admin: { id: string };
const c = (userId: string) => ({ schoolId: school.id, userId });

beforeAll(async () => {
  school = await makeSchool("Approvals School");
  principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Lakshmi Rao" });
  accountant = await makeUser({ schools: [{ id: school.id, roleKeys: ["accountant"] }], name: "Priya Sharma" });
  teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Ravi Teja" });
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Suresh Kumar" });
});

const ask = (by: string, type: "refund" | "expense" | "purchase", amount: number | null, summary = `${type} ${amount}`) =>
  withSchool(c(by), (tx) => requestApproval(tx, c(by), { type, recordType: "Test", recordId: crypto.randomUUID(), summary, amountPaise: amount === null ? null : BigInt(amount * 100) }));

describe("the approval rule summary", () => {
  const names = { role: (k: string) => ({ accountant: "Accountant", principal: "Principal", "school-admin": "School Admin" })[k] ?? k, person: () => "Lakshmi Rao" };
  it("reads like the spec", () => {
    expect(ruleSummary("Refund", [{ approverRole: "accountant", upToPaise: "500000" }, { approverRole: "principal" }], 2, names))
      .toBe("Refunds: up to ₹5,000 the Accountant approves; above that, the Principal. Escalate after 2 days.");
  });
  it("covers one approver, a named person, tiers and escalation", () => {
    expect(ruleSummary("Expense", [{ approverRole: "principal" }], 1, names)).toBe("Expenses: the Principal approves. Escalate after 1 day.");
    expect(ruleSummary("Staff leave", [{ approverUserId: "x" }, { approverRole: "principal" }], 3, names)).toBe("Staff leave: Lakshmi Rao approves; if not decided in time, it moves to the Principal. Escalate after 3 days.");
    expect(ruleSummary("Purchase", [{ approverRole: "accountant", upToPaise: "500000" }, { approverRole: "principal", upToPaise: "5000000" }], 2, names))
      .toBe("Purchases: up to ₹5,000 the Accountant approves; up to ₹50,000, the Principal; above that, the Principal. Escalate after 2 days.");
  });
});

describe("Done when 6: refunds above ₹5,000 go to the Principal", () => {
  it("routes ₹6,000 to the Principal and ₹2,000 to the Accountant", async () => {
    const { summary } = await withSchool(c(admin.id), (tx) => saveRule(tx, c(admin.id), "refund", { steps: [{ approverRole: "accountant", upToPaise: "500000" }, { approverRole: "principal" }], escalateAfterDays: 2 }));
    expect(summary).toBe("Refunds: up to ₹5,000 the Accountant approves; above that, the Principal. Escalate after 2 days.");
    const big = await ask(teacher.id, "refund", 6000);
    const small = await ask(teacher.id, "refund", 2000);
    expect(big.currentApproverRole).toBe("principal");
    expect(small.currentApproverRole).toBe("accountant");
  });

  it("refuses a step with nobody to approve and limits that go down", async () => {
    await expect(withSchool(c(admin.id), (tx) => saveRule(tx, c(admin.id), "refund", { steps: [{ approverRole: "librarian" }], escalateAfterDays: 2 }))).rejects.toThrow("no active user has the Librarian role");
    await expect(withSchool(c(admin.id), (tx) => saveRule(tx, c(admin.id), "refund", { steps: [{ approverRole: "accountant", upToPaise: "500000" }, { approverRole: "principal", upToPaise: "100000" }], escalateAfterDays: 2 }))).rejects.toThrow(/higher than the step before/);
    await expect(withSchool(c(admin.id), (tx) => saveRule(tx, c(admin.id), "refund", { steps: [{ approverRole: "principal" }, { approverRole: "accountant", upToPaise: "100000" }], escalateAfterDays: 2 }))).rejects.toThrow(/must come before/);
    await expect(withSchool(c(admin.id), (tx) => saveRule(tx, c(admin.id), "refund", { steps: [{ approverRole: "principal" }], escalateAfterDays: 0 }))).rejects.toThrow(/between 1 and 30/);
  });

  it("can go back to the default rule", async () => {
    expect(await withSchool(c(admin.id), (tx) => useDefaultRule(tx, c(admin.id), "refund"))).toBe(true);
    const r = await ask(teacher.id, "refund", 2000);
    expect(r.currentApproverRole).toBe("principal");
  });
});

describe("deciding", () => {
  it("approve, reject with a reason, ask for change and withdraw", async () => {
    const a1 = await ask(teacher.id, "purchase", 100);
    await withSchool(c(principal.id), (tx) => decide(tx, c(principal.id), a1.id, "approve", null));
    const a2 = await ask(teacher.id, "purchase", 200);
    await expect(withSchool(c(principal.id), (tx) => decide(tx, c(principal.id), a2.id, "reject", "no"))).rejects.toThrow(/at least 5 characters/);
    await withSchool(c(principal.id), (tx) => decide(tx, c(principal.id), a2.id, "reject", "Not in this year's budget"));
    const a3 = await ask(teacher.id, "purchase", 300);
    await withSchool(c(principal.id), (tx) => decide(tx, c(principal.id), a3.id, "ask-change", "Attach the bill please"));
    const a4 = await ask(teacher.id, "purchase", 400);
    await expect(withSchool(c(principal.id), (tx) => decide(tx, c(principal.id), a4.id, "withdraw", null))).rejects.toThrow(/Only the person who asked/);
    await withSchool(c(teacher.id), (tx) => decide(tx, c(teacher.id), a4.id, "withdraw", null));
    expect(decided).toEqual(["approve", "reject", "ask-change", "withdraw"]);

    const rows = await withSchool(c(principal.id), (tx) => tx.approval.findMany({ where: { id: { in: [a1.id, a2.id, a3.id, a4.id] } } }));
    const words = Object.fromEntries(rows.map((r) => [r.id, statusWords(r.status, r.history).label]));
    expect(words).toEqual({ [a1.id]: "Approved", [a2.id]: "Rejected", [a3.id]: "Sent back for a change", [a4.id]: "Withdrawn" });
    // Decided twice: refused.
    await expect(withSchool(c(principal.id), (tx) => decide(tx, c(principal.id), a1.id, "approve", null))).rejects.toThrow(/already decided/);
    // The asker is told the decision and the reason.
    const told = await withSchool(c(teacher.id), (tx) => tx.notification.findFirst({ where: { userLoginId: teacher.id, link: `/approvals/${a2.id}` } }));
    expect(told?.text).toContain("Reason: Not in this year's budget");
  });

  it("nobody approves their own request, not even the Principal", async () => {
    const own = await ask(principal.id, "purchase", 500);
    // It went to someone else (the School Admin), never back to the Principal.
    expect(own.currentApproverRole).not.toBe("principal");
    await expect(withSchool(c(principal.id), (tx) => decide(tx, c(principal.id), own.id, "approve", null))).rejects.toThrow("Nobody can approve their own request");
    const mine = await withSchool(c(principal.id), async (tx) => tx.approval.findMany({ where: await inboxWhere(tx, c(principal.id), ["principal"], "mine") }));
    expect(mine.some((a) => a.id === own.id)).toBe(false);
  });

  it("someone else's request is not theirs to decide", async () => {
    const r = await ask(teacher.id, "purchase", 600);
    await expect(withSchool(c(accountant.id), (tx) => decide(tx, c(accountant.id), r.id, "approve", null))).rejects.toThrow(DecisionProblem);
    expect(canSeeApproval(r, c(accountant.id), ["accountant"])).toBe(false);
    expect(canSeeApproval(r, c(teacher.id), ["teacher"])).toBe(true);
    expect(canSeeApproval(r, c(admin.id), ["school-admin"])).toBe(true);
  });
});

describe("bulk approve", () => {
  it("approves what it may and says why the rest were skipped", async () => {
    const a = await ask(teacher.id, "purchase", 10, "Chalk boxes");
    const b = await ask(teacher.id, "purchase", 20, "Dusters");
    const own = await ask(principal.id, "purchase", 30, "Principal's own request");
    const result = await bulkApprove(c(principal.id), [a.id, b.id, own.id, a.id]);
    expect(result.approved).toBe(2);
    expect(result.skipped).toEqual([{ summary: "Principal's own request", reason: "Nobody can approve their own request." }]);
    const after = await withSchool(c(principal.id), (tx) => tx.approval.findMany({ where: { id: { in: [a.id, b.id] } } }));
    expect(after.every((x) => x.status === "APPROVED")).toBe(true);
  });
});

describe("the inbox views", () => {
  it("waiting for me, asked by me, and all I may see", async () => {
    const r = await ask(teacher.id, "expense", 1000, "Science lab glassware");
    // Expenses up to ₹5,000 go to the Accountant by default.
    expect(r.currentApproverRole).toBe("accountant");
    const ids = async (user: string, roles: string[], view: "mine" | "asked" | "all") =>
      (await withSchool(c(user), async (tx) => tx.approval.findMany({ where: await inboxWhere(tx, c(user), roles, view) }))).map((x) => x.id);
    expect(await ids(accountant.id, ["accountant"], "mine")).toContain(r.id);
    expect(await ids(teacher.id, ["teacher"], "asked")).toContain(r.id);
    expect(await ids(teacher.id, ["teacher"], "mine")).not.toContain(r.id);
    expect(await ids(principal.id, ["principal"], "all")).toContain(r.id);
    const accountantAll = await ids(accountant.id, ["accountant"], "all");
    expect(accountantAll).toContain(r.id);
    expect(accountantAll.length).toBeLessThan((await ids(principal.id, ["principal"], "all")).length);
  });
});
