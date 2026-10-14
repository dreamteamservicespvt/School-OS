// Fee structure changes after the year starts (owner's prototype changes of
// 14 Oct 2026): the Principal's own change applies at once (they approve fee
// changes); anyone else's goes to the Principal in Approvals and changes no
// student's fees until it is approved. Paid rows never change, nothing is
// deleted, and every step is in the Audit Log.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import "@/lib/approval-handlers";
import { askToPublish, openDraft, publishNeedsApproval, publishStructure, saveFeeHead, saveFeeRow, waitingApproval } from "@/lib/fees/structure";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;
const TODAY = new Date("2026-10-05T00:00:00Z");
const NOV = new Date("2026-11-01T00:00:00Z");

async function labDraft(ctx: FeeSchool["ctx"]) {
  return withSchool(ctx, async (tx) => {
    const lab = await tx.feeHead.findFirst({ where: { name: "Lab fee" } }) ?? await saveFeeHead(tx, ctx, { name: "Lab fee", kind: "other", taxable: false, gstRateBp: null, sacCode: null, bankAccountId: null, lateFeeApplies: false });
    const draft = await openDraft(tx, ctx, f.year.id, f.cls.id);
    await saveFeeRow(tx, ctx, draft.id, { feeHeadId: lab.id, frequency: "YEARLY", totalPaise: R(3000), schedule: [{ label: "Lab fee", dueDate: new Date("2026-11-10T00:00:00Z"), amountPaise: R(3000) }] });
    return { draft, lab };
  });
}

beforeAll(async () => {
  f = await makeFeeSchool();
  // Ravi pays Q1 tuition, so one row is paid before any change.
  const rows = await dues(f.ctx, f.ravi.id);
  await collect(f.ctx, { studentId: f.ravi.id, dueIds: [rows[0].id], amountPaise: R(6000) });
}, 120_000);

describe("Fee structure changes after the year starts", () => {
  it("needs the Principal's approval for anyone else, never for the Principal, and not before the year starts", async () => {
    const { draft } = await labDraft(f.ctx);
    await withSchool(f.ctx, async (tx) => {
      expect(await publishNeedsApproval(tx, draft.id, TODAY, ["accountant"])).toBe(true);
      expect(await publishNeedsApproval(tx, draft.id, TODAY, ["school-admin"])).toBe(true);
      expect(await publishNeedsApproval(tx, draft.id, TODAY, ["principal"])).toBe(false);
      expect(await publishNeedsApproval(tx, draft.id, new Date("2026-03-01T00:00:00Z"), ["accountant"])).toBe(false);
    });
  });

  it("an Accountant's change waits in Approvals, is locked, and changes no fees until the Principal approves", async () => {
    const draft = await withSchool(f.ctx, (tx) => tx.feeStructure.findFirstOrThrow({ where: { classId: f.cls.id, status: "DRAFT", archivedAt: null } }));
    const before = await dues(f.ctx, f.sita.id);
    const asked = await withSchool(f.ctx, (tx) => askToPublish(tx, f.ctx, draft.id, NOV, "Science lab opened in November"));
    expect(asked.impact.students).toBe(3);
    expect((await dues(f.ctx, f.sita.id)).map((d) => d.id)).toEqual(before.map((d) => d.id));
    // A waiting draft stays as it was sent.
    const lab = await withSchool(f.ctx, (tx) => tx.feeHead.findFirstOrThrow({ where: { name: "Lab fee" } }));
    await expect(withSchool(f.ctx, (tx) => saveFeeRow(tx, f.ctx, draft.id, { feeHeadId: lab.id, frequency: "YEARLY", totalPaise: R(5000), schedule: [{ label: "Lab fee", dueDate: new Date("2026-11-10T00:00:00Z"), amountPaise: R(5000) }] })))
      .rejects.toThrow(/waiting for the Principal/);
    // Nobody approves their own request.
    await expect(withSchool(f.ctx, (tx) => decide(tx, f.ctx, asked.approvalId, "approve", null))).rejects.toThrow(/own request/);

    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, asked.approvalId, "approve", null));
    const { s, sita, ravi, audit, waiting } = await withSchool(f.pctx, async (tx) => ({
      s: await tx.feeStructure.findUniqueOrThrow({ where: { id: draft.id } }),
      sita: await tx.studentFeeDue.findMany({ where: { studentId: f.sita.id } }),
      ravi: await tx.studentFeeDue.findMany({ where: { studentId: f.ravi.id } }),
      audit: await tx.auditLogEntry.findMany({ where: { recordId: draft.id, action: { in: ["asked-to-publish", "published"] } }, orderBy: { at: "asc" } }),
      waiting: await waitingApproval(tx, draft.id),
    }));
    expect(s.status).toBe("PUBLISHED");
    expect(s.publishedById).toBe(f.principal.id);
    expect(s.effectiveFrom?.toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(waiting).toBeNull();
    // Sita gets the lab fee; her January tuition row moved to the new version (the old one kept as Removed, never deleted).
    expect(sita.some((d) => d.label === "Lab fee" && d.state === "OPEN")).toBe(true);
    expect(sita.filter((d) => d.state === "REMOVED").map((d) => d.dueDate.toISOString().slice(0, 10))).toEqual(["2027-01-10"]);
    // Ravi's paid row is untouched.
    const paid = ravi.filter((d) => d.paidPaise > BigInt(0));
    expect(paid).toHaveLength(1);
    expect(paid[0].state).toBe("OPEN");
    expect(audit.map((a) => a.action)).toEqual(["asked-to-publish", "published"]);
  });

  it("the Principal's own change applies at once, audited, with paid rows intact", async () => {
    const { draft } = await withSchool(f.pctx, async (tx) => {
      const d = await openDraft(tx, f.pctx, f.year.id, f.cls.id);
      const tuition = await tx.feeHead.findFirstOrThrow({ where: { name: "Tuition fee" } });
      const items = await tx.feeStructureItem.findMany({ where: { structureId: d.id, archivedAt: null } });
      const t = items.find((i) => i.feeHeadId === tuition.id)!;
      await saveFeeRow(tx, f.pctx, d.id, { feeHeadId: tuition.id, frequency: "QUARTERLY", totalPaise: R(25000), schedule: [
        { label: "Quarter 1", dueDate: new Date("2026-04-10T00:00:00Z"), amountPaise: R(6000) },
        { label: "Quarter 2", dueDate: new Date("2026-07-10T00:00:00Z"), amountPaise: R(6000) },
        { label: "Quarter 3", dueDate: new Date("2026-10-10T00:00:00Z"), amountPaise: R(6000) },
        { label: "Quarter 4", dueDate: new Date("2027-01-10T00:00:00Z"), amountPaise: R(7000) },
      ] }, t.id);
      return { draft: d };
    });
    await withSchool(f.pctx, async (tx) => {
      expect(await publishNeedsApproval(tx, draft.id, TODAY, ["principal"])).toBe(false);
      await publishStructure(tx, f.pctx, draft.id, NOV);
    });
    const { ravi, audit } = await withSchool(f.pctx, async (tx) => ({
      ravi: await tx.studentFeeDue.findMany({ where: { studentId: f.ravi.id, state: "OPEN" } }),
      audit: await tx.auditLogEntry.findFirst({ where: { recordId: draft.id, action: "published" } }),
    }));
    expect(ravi.find((d) => d.dueDate.toISOString().startsWith("2027-01-10") && d.label.startsWith("Quarter 4"))?.amountPaise).toBe(R(7000));
    expect(ravi.filter((d) => d.paidPaise > BigInt(0))).toHaveLength(1);
    expect(audit).not.toBeNull();
  });
});
