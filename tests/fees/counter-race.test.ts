// Delivery audit 2026-10-31: the same counter payment sent twice at the same moment (double click
// that beats the button, or two tabs) must post once. With open rows the row lock does it; a student
// who owes nothing (advance only) had no row to lock, so both went through.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { collect, dues, feature, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;
beforeAll(async () => { f = await makeFeeSchool(); }, 120_000);

const posted = (studentId: string) => withSchool(f.ctx, async (tx) => {
  const list = await tx.payment.findMany({ where: { studentId, status: "POSTED" } });
  const receipts = await tx.receipt.findMany({ where: { paymentId: { in: list.map((p) => p.id) } } });
  return list.map((p) => ({ ...p, receipt: receipts.find((r) => r.paymentId === p.id) ?? null }));
});

describe("one counter payment sent twice at once", () => {
  it("posts once when the student has open rows", async () => {
    const open = await dues(f.ctx, f.ravi.id);
    const r = await Promise.allSettled([1, 2, 3].map(() => collect(f.ctx, { studentId: f.ravi.id, dueIds: [open[0].id], amountPaise: R(1000) })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const p = await posted(f.ravi.id);
    expect(p).toHaveLength(1);
    expect(p[0].receipt).not.toBeNull();
  });

  it("posts once when the student owes nothing and it is all advance", async () => {
    await feature(f.ctx, "fee-advance", true);
    const open = await dues(f.ctx, f.sita.id);
    const total = open.reduce((s, d) => s + d.balancePaise, BigInt(0));
    await collect(f.ctx, { studentId: f.sita.id, dueIds: open.map((d) => d.id), amountPaise: total });
    expect((await dues(f.ctx, f.sita.id)).filter((d) => d.balancePaise > BigInt(0))).toHaveLength(0);
    const r = await Promise.allSettled([1, 2].map(() => collect(f.ctx, { studentId: f.sita.id, dueIds: [], amountPaise: R(500) })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason?.message)).toMatch(/Collect again\?/);
    const advance = (await posted(f.sita.id)).filter((p) => p.amountPaise === R(500));
    expect(advance).toHaveLength(1);
    await feature(f.ctx, "fee-advance", false);
  });
});
