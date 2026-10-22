// A request in Approvals whose record cannot be found (QA SEED-03). The demo
// seed made requests that pointed at no record ("Casual leave, Ravi Teja, 2
// days" with record type "Staff Leave"); approving one said "Approved. The
// person who asked has been told." while nothing moved. Now such a request is
// not approved or sent back for a change: the plain reason is shown and
// nothing changes. It can still be rejected, to take it off the list.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide, DecisionProblem, plainReason } from "@/lib/approvals";
import { bulkApprove } from "@/lib/approvals-inbox";
import { CHECKED_RECORD_TYPES, missingRecordWords } from "@/lib/approval-records";
import { makeSchool, makeUser } from "./helpers";

let school: Awaited<ReturnType<typeof makeSchool>>;
let principal: { id: string };
let teacher: { id: string };
const c = (userId: string | null) => ({ schoolId: school.id, userId });

beforeAll(async () => {
  school = await makeSchool("Missing Record School");
  principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Lakshmi Rao" });
  teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Ravi Teja" });
});

/** A request about a record that is not there, as the old demo seed made them. */
const askAboutNothing = (type: string, recordType: string, summary: string) =>
  withSchool(c(null), (tx) => tx.approval.create({ data: { schoolId: school.id, type, recordType, recordId: crypto.randomUUID(), summary, askedById: teacher.id, currentApproverRole: "principal", step: 1, history: [] } }));

const stateOf = (id: string) => withSchool(c(null), async (tx) => ({
  approval: await tx.approval.findUniqueOrThrow({ where: { id } }),
  told: await tx.notification.count({ where: { userLoginId: teacher.id, link: `/approvals/${id}` } }),
  audit: (await tx.auditLogEntry.findMany({ where: { recordType: "Approval", recordId: id } })).map((a) => a.action),
}));

describe("a request whose record cannot be found", () => {
  it("is not approved: the plain reason is shown, nothing changes and nobody is told", async () => {
    const a = await askAboutNothing("staff-leave", "Leave Request", "Casual leave: Ravi Teja, 21-10-2026 (1 day)");
    const refused = withSchool(c(principal.id), (tx) => decide(tx, c(principal.id), a.id, "approve", null));
    await expect(refused).rejects.toThrow(DecisionProblem);
    await expect(refused).rejects.toThrow("The leave request this request is about cannot be found in School OS, so it cannot be approved, and nothing was changed. Reject it with a reason to take it off the list.");
    const after = await stateOf(a.id);
    expect(after.approval).toMatchObject({ status: "WAITING", decidedById: null, decidedAt: null });
    expect(after.told).toBe(0);
    expect(after.audit).toEqual([]);
  });

  it("is not sent back for a change either", async () => {
    const a = await askAboutNothing("expense", "Expense", "Lab chemicals for Class 10 practicals");
    const refused = withSchool(c(principal.id), (tx) => decide(tx, c(principal.id), a.id, "ask-change", "Attach the bill, please."));
    await expect(refused).rejects.toThrow(/^The expense this request is about cannot be found in School OS, so it cannot be sent back for a change/);
    expect((await stateOf(a.id)).approval.status).toBe("WAITING");
  });

  it("the old demo row with record type \"Staff Leave\" is refused the same way", async () => {
    const a = await askAboutNothing("staff-leave", "Staff Leave", "Casual leave, Ravi Teja, 2 days");
    const e = await withSchool(c(principal.id), (tx) => decide(tx, c(principal.id), a.id, "approve", null)).catch((x: unknown) => x);
    expect(plainReason(e)).toMatch(/^The leave request this request is about cannot be found in School OS/);
    expect((await stateOf(a.id)).approval.status).toBe("WAITING");
  });

  it("can be rejected with a reason, which takes it off the list and tells the person who asked", async () => {
    const a = await askAboutNothing("refund", "Refund", "Refund of bus fee, Aarav Reddy (Class 6 A)");
    expect(await withSchool(c(principal.id), (tx) => decide(tx, c(principal.id), a.id, "reject", "This refund is not on record."))).toBe("REJECTED");
    const after = await stateOf(a.id);
    expect(after.approval).toMatchObject({ status: "REJECTED", decidedById: principal.id, decisionReason: "This refund is not on record." });
    expect(after.told).toBe(1);
    expect(after.audit).toEqual(["approval-reject"]);
  });

  it("bulk approve leaves it out and says why", async () => {
    const a = await askAboutNothing("concession", "Concession", "Sibling discount for Diya Sharma (Class 2 B)");
    const r = await bulkApprove(c(principal.id), [a.id]);
    expect(r.approved).toBe(0);
    expect(r.skipped).toEqual([{ summary: "Sibling discount for Diya Sharma (Class 2 B)", reason: expect.stringMatching(/^The concession this request is about cannot be found in School OS/) }]);
    expect((await stateOf(a.id)).approval.status).toBe("WAITING");
  });

  it("a record that is there is found", async () => {
    const student = await withSchool(c(null), (tx) => tx.student.create({ data: { schoolId: school.id, campusId: school.campus.id, admissionNo: `A${Date.now()}`, firstName: "Diya", fullName: "Diya Sharma" } }));
    expect(await withSchool(c(null), (tx) => missingRecordWords(tx, { recordType: "Student", recordId: student.id }))).toBeNull();
    expect(await withSchool(c(null), (tx) => missingRecordWords(tx, { recordType: "Student", recordId: crypto.randomUUID() }))).toBe("student");
    expect(await withSchool(c(null), (tx) => missingRecordWords(tx, { recordType: "Student", recordId: "not-an-id" }))).toBe("student");
  });
});

/** Every .ts file under a folder. */
function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? filesIn(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("every record type a module asks Approvals about is checked", () => {
  it("lists each recordType given to requestApproval() in src/", () => {
    const asked = new Set<string>();
    for (const file of filesIn(path.resolve("src"))) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/requestApproval\(/g)) {
        const call = text.slice(m.index, m.index + 400);
        const type = call.match(/recordType: "([^"]+)"/);
        if (type) asked.add(type[1]);
      }
    }
    expect(asked.size).toBeGreaterThan(20);
    expect([...asked].filter((t) => !CHECKED_RECORD_TYPES.includes(t))).toEqual([]);
  });
});
