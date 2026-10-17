// Publishing a new fee structure version mid-year (06 §5 "Changing a structure
// already paid", rule 20; gap G09): a republish never charges a period twice,
// keeps concessions, moves or takes off late fees with their rows, and the
// school sees exactly what changes before it publishes. The invoice covers what
// is due now, or the rows ticked, never the whole year.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    requireCurrent,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/lib/flash", () => ({ flash: async () => undefined }));

import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { todayIn, addDays } from "@/lib/staff/dates";
import { dueStatus } from "@/lib/fees/dues";
import { openDraft, publishImpact, restoreImpact, restorePreviousVersion, saveFeeRow, addCharge } from "@/lib/fees/structure";
import { giveConcession } from "@/lib/fees/concessions";
import { addLateFees } from "@/lib/fees/late-fees";
import { createFeeInvoice } from "@/lib/fees/documents";
import { publishAction } from "@/app/(school)/fee-management/structure/actions";
import { invoiceAction } from "@/app/(school)/fee-management/ledger/[studentId]/actions";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const NOV = day("2026-11-01");
const ZERO = BigInt(0);
// The fixture's quarterly installments (defaultSchedule).
const Q1 = "Quarter 1 (Apr to Jun)", Q2 = "Quarter 2 (Jul to Sep)", Q3 = "Quarter 3 (Oct to Dec)", Q4 = "Quarter 4 (Jan to Mar)";

async function currentFor(f: FeeSchool, userId: string): Promise<Current> {
  const access = await accessIn(userId, f.school.id);
  return { ...access!, ctx: { schoolId: f.school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null } as unknown as Current;
}
const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};

/** A new draft of the class's tuition: the four quarters, with the amounts and Q3 date given. */
async function tuitionDraft(f: FeeSchool, ctx: SchoolContext, q: { q3?: number; q4?: number; q3Date?: string } = {}) {
  return withSchool(ctx, async (tx) => {
    const d = await openDraft(tx, ctx, f.year.id, f.cls.id);
    const item = await tx.feeStructureItem.findFirstOrThrow({ where: { structureId: d.id, feeHeadId: f.tuition.id, archivedAt: null } });
    const schedule = [
      { label: Q1, dueDate: day("2026-04-10"), amountPaise: R(6000) },
      { label: Q2, dueDate: day("2026-07-10"), amountPaise: R(6000) },
      { label: Q3, dueDate: day(q.q3Date ?? "2026-10-10"), amountPaise: R(q.q3 ?? 6000) },
      { label: Q4, dueDate: day("2027-01-10"), amountPaise: R(q.q4 ?? 6000) },
    ];
    await saveFeeRow(tx, ctx, d.id, { feeHeadId: f.tuition.id, frequency: "QUARTERLY", totalPaise: schedule.reduce((s, x) => s + x.amountPaise, ZERO), schedule }, item.id);
    return d;
  });
}

/** Publishes through the Fee Structure page's action, as the Principal (their change applies at once). */
async function publishAsPrincipal(f: FeeSchool, structureId: string, from: string) {
  who.current = await currentFor(f, f.principal.id);
  const r = await publishAction(null, form({ structureId, effectiveFrom: from, confirm: "on" }));
  if (!r?.ok) throw new Error(r?.message ?? "Publish failed");
  return r;
}

const rowsOf = (f: FeeSchool, studentId: string, label: string) =>
  withSchool(f.ctx, (tx) => tx.studentFeeDue.findMany({ where: { studentId, label, kind: "FEE" }, orderBy: { createdAt: "asc" } }));

describe("a new version mid-year with paid, part-paid and unpaid students", () => {
  let f: FeeSchool;
  const before: Record<string, string> = {};

  beforeAll(async () => {
    f = await makeFeeSchool();
    // Ravi pays Quarter 4 in advance in full, Sita part of it, Anil nothing.
    for (const [s, amount] of [[f.ravi, 6000], [f.sita, 2000]] as const) {
      const q4 = (await dues(f.ctx, s.id)).find((d) => d.label === Q4)!;
      before[s.id] = q4.id;
      await collect(f.ctx, { studentId: s.id, dueIds: [q4.id], amountPaise: R(amount) });
    }
    before[f.anil.id] = (await dues(f.ctx, f.anil.id)).find((d) => d.label === Q4)!.id;
  }, 120_000);

  it("shows the school exactly what changes for the date chosen, before publishing", async () => {
    const draft = await tuitionDraft(f, f.pctx, { q4: 7000 });
    const impact = await withSchool(f.pctx, (tx) => publishImpact(tx, draft.id, NOV, day("2026-10-18")));
    expect(impact).toMatchObject({ students: 2, rows: 1, added: 0, removed: 0, kept: 2, adjusted: 1, paidBelowRows: 1 });
    expect(impact.addedPaise).toBe(R(2000));
    expect(impact.takenOffPaise).toBe(ZERO);
    expect(impact.paidBelowPaise).toBe(R(1000));
    expect(impact.message).toBe("This updates 2 students' unpaid installments from November 2026. Paid rows are not changed.");
    expect(impact.details).toContain("₹2,000 added in all.");
    expect(impact.details.join(" ")).toMatch(/2 rows are kept because they are paid, part-paid or have a concession/);
    // Another date gives another answer: from February nothing in this year's Quarter 4 changes.
    const later = await withSchool(f.pctx, (tx) => publishImpact(tx, draft.id, day("2027-02-01")));
    expect(later.students).toBe(0);
  });

  it("never charges a paid or part-paid quarter twice; the unpaid part follows the new fee", async () => {
    const draft = await withSchool(f.pctx, (tx) => tx.feeStructure.findFirstOrThrow({ where: { classId: f.cls.id, status: "DRAFT", archivedAt: null } }));
    await publishAsPrincipal(f, draft.id, "2026-11-01");

    const ravi = await rowsOf(f, f.ravi.id, Q4);
    expect(ravi.filter((d) => d.state === "OPEN")).toHaveLength(1);
    expect(ravi[0]).toMatchObject({ id: before[f.ravi.id], state: "OPEN", amountPaise: R(6000), adjustmentPaise: ZERO, paidPaise: R(6000), balancePaise: ZERO, structureId: draft.id });

    const sita = await rowsOf(f, f.sita.id, Q4);
    expect(sita).toHaveLength(1);
    expect(sita[0]).toMatchObject({ id: before[f.sita.id], state: "OPEN", amountPaise: R(6000), adjustmentPaise: R(1000), paidPaise: R(2000), balancePaise: R(5000) });
    const adj = await withSchool(f.ctx, (tx) => tx.feeAdjustment.findMany({ where: { dueId: before[f.sita.id] } }));
    expect(adj.map((a) => [a.amountPaise, a.reason])).toEqual([[R(1000), "Fee structure version 2 from November 2026"]]);

    const anil = await rowsOf(f, f.anil.id, Q4);
    expect(anil.map((d) => [d.state, d.amountPaise])).toEqual([["REMOVED", R(6000)], ["OPEN", R(7000)]]);

    // Rows before the date never change, and nobody has a second row for any quarter.
    for (const s of [f.ravi, f.sita, f.anil]) {
      const open = (await dues(f.ctx, s.id)).filter((d) => d.kind === "FEE");
      expect(open.map((d) => d.label)).toEqual([Q1, Q2, Q3, Q4]);
      expect(open.slice(0, 3).every((d) => d.amountPaise === R(6000) && d.adjustmentPaise === ZERO)).toBe(true);
    }
    const audit = await withSchool(f.ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordId: draft.id, action: "published" } }));
    expect(audit.after).toMatchObject({ studentsUpdated: 2, rowsReplaced: 1, rowsKept: 2, rowsAdjusted: 1, added: "₹2,000" });
  });

  it("putting the old version back takes the difference off again, and a paid row still never changes", async () => {
    const v1 = await withSchool(f.pctx, (tx) => tx.feeStructure.findFirstOrThrow({ where: { classId: f.cls.id, version: 1 } }));
    const impact = await withSchool(f.pctx, (tx) => restoreImpact(tx, v1.id, NOV));
    expect(impact).toMatchObject({ students: 2, rows: 1, kept: 2, adjusted: 1, paidBelowRows: 0, paidAboveRows: 0 });
    expect(impact.takenOffPaise).toBe(R(2000));
    await withSchool(f.pctx, (tx) => restorePreviousVersion(tx, f.pctx, v1.id, NOV));

    const sita = (await rowsOf(f, f.sita.id, Q4))[0];
    expect(sita).toMatchObject({ state: "OPEN", adjustmentPaise: ZERO, balancePaise: R(4000) });
    const ravi = await rowsOf(f, f.ravi.id, Q4);
    expect(ravi).toHaveLength(1);
    expect(ravi[0]).toMatchObject({ balancePaise: ZERO, adjustmentPaise: ZERO });
    const anil = (await rowsOf(f, f.anil.id, Q4)).filter((d) => d.state === "OPEN");
    expect(anil.map((d) => d.amountPaise)).toEqual([R(6000)]);
  });
});

describe("concessions survive a new version", () => {
  let f: FeeSchool;

  beforeAll(async () => {
    f = await makeFeeSchool();
    await withSchool(f.ctx, (tx) => tx.feeSetting.update({ where: { schoolId: f.school.id }, data: { concessionLimitPaise: R(100000) } }));
  }, 120_000);

  it("keeps the concession on its row and adds only the change in the fee; a fully waived row stays waived", async () => {
    const q4 = async (id: string) => (await dues(f.ctx, id)).find((d) => d.label === Q4)!;
    const anilQ4 = await q4(f.anil.id);
    const sitaQ4 = await q4(f.sita.id);
    await withSchool(f.ctx, async (tx) => {
      await giveConcession(tx, f.ctx, { studentId: f.anil.id, type: "SIBLING", mode: "amount", amountPaise: R(1000), percentBp: 0, feeHeadIds: [], dueIds: [anilQ4.id], periodFrom: null, periodTo: null, reason: "Brother in Class 8" });
      await giveConcession(tx, f.ctx, { studentId: f.sita.id, type: "SCHOLARSHIP", mode: "percent", amountPaise: ZERO, percentBp: 10000, feeHeadIds: [], dueIds: [sitaQ4.id], periodFrom: null, periodTo: null, reason: "Full scholarship for Quarter 4" });
    });
    const draft = await tuitionDraft(f, f.pctx, { q4: 7000 });
    const impact = await withSchool(f.pctx, (tx) => publishImpact(tx, draft.id, NOV));
    expect(impact).toMatchObject({ kept: 2, adjusted: 1, rows: 1, paidBelowRows: 1 });
    await publishAsPrincipal(f, draft.id, "2026-11-01");

    const anil = await rowsOf(f, f.anil.id, Q4);
    expect(anil).toHaveLength(1);
    expect(anil[0]).toMatchObject({ id: anilQ4.id, state: "OPEN", concessionPaise: R(1000), adjustmentPaise: R(1000), balancePaise: R(6000) });
    const lines = await withSchool(f.ctx, (tx) => tx.concessionLine.findMany({ where: { dueId: { in: [anilQ4.id, sitaQ4.id] } } }));
    expect(lines).toHaveLength(2);
    const sita = await rowsOf(f, f.sita.id, Q4);
    expect(sita).toHaveLength(1);
    expect(sita[0]).toMatchObject({ id: sitaQ4.id, state: "OPEN", concessionPaise: R(6000), balancePaise: ZERO });
    // Ravi had no concession: his row moved to the new fee.
    expect((await rowsOf(f, f.ravi.id, Q4)).filter((d) => d.state === "OPEN").map((d) => d.amountPaise)).toEqual([R(7000)]);
  });
});

describe("late fees on rows a new version replaces", () => {
  let f: FeeSchool;
  const LATE_DAY = day("2026-10-20");

  beforeAll(async () => {
    f = await makeFeeSchool();
    await withSchool(f.ctx, async (tx) => {
      await tx.feeSetting.update({ where: { schoolId: f.school.id }, data: { lateFeeOn: true, lateFeeType: "flat", lateFeePaise: R(200), graceDays: 0 } });
      await addLateFees(tx, f.ctx, LATE_DAY);
    });
  }, 120_000);

  const lateOn = (studentId: string) => withSchool(f.ctx, async (tx) => {
    const late = await tx.studentFeeDue.findMany({ where: { studentId, kind: "LATE_FEE", state: "OPEN" } });
    const parents = await tx.studentFeeDue.findMany({ where: { id: { in: late.map((l) => l.parentDueId!) } } });
    return late.map((l) => parents.find((p) => p.id === l.parentDueId)!).map((p) => `${p.label.slice(0, 9)} ${p.state}`).sort();
  });

  it("moves the late fee to the new row, so the late fee is never added twice", async () => {
    expect(await lateOn(f.anil.id)).toEqual(["Quarter 1 OPEN", "Quarter 2 OPEN", "Quarter 3 OPEN"]);
    const draft = await tuitionDraft(f, f.pctx, { q3: 6500 });
    const impact = await withSchool(f.pctx, (tx) => publishImpact(tx, draft.id, day("2026-10-01"), LATE_DAY));
    expect(impact).toMatchObject({ students: 3, rows: 3, lateFeesMoved: 3, lateFeesRemoved: 0 });
    expect(impact.details.join(" ")).toMatch(/before today, so installments already overdue change too/);
    await publishAsPrincipal(f, draft.id, "2026-10-01");
    await withSchool(f.ctx, (tx) => addLateFees(tx, f.ctx, LATE_DAY));
    expect(await lateOn(f.anil.id)).toEqual(["Quarter 1 OPEN", "Quarter 2 OPEN", "Quarter 3 OPEN"]);
    const q3 = (await rowsOf(f, f.anil.id, Q3)).filter((d) => d.state === "OPEN");
    expect(q3.map((d) => d.amountPaise)).toEqual([R(6500)]);
  });

  it("takes an unpaid late fee off when the new row is due later", async () => {
    const draft = await tuitionDraft(f, f.pctx, { q3: 6500, q3Date: "2026-10-25" });
    const impact = await withSchool(f.pctx, (tx) => publishImpact(tx, draft.id, day("2026-10-01")));
    expect(impact).toMatchObject({ lateFeesMoved: 0, lateFeesRemoved: 3 });
    expect(impact.takenOffPaise).toBe(R(600));
    await publishAsPrincipal(f, draft.id, "2026-10-01");
    await withSchool(f.ctx, (tx) => addLateFees(tx, f.ctx, LATE_DAY));
    expect(await lateOn(f.anil.id)).toEqual(["Quarter 1 OPEN", "Quarter 2 OPEN"]);
    const removed = await withSchool(f.ctx, (tx) => tx.studentFeeDue.count({ where: { studentId: f.anil.id, kind: "LATE_FEE", state: "REMOVED" } }));
    expect(removed).toBe(1);
  });
});

describe("fee invoice", () => {
  let f: FeeSchool;
  const today = todayIn("Asia/Kolkata");

  beforeAll(async () => {
    f = await makeFeeSchool();
    // One charge due yesterday and one far ahead, so the test does not depend on today's date.
    await withSchool(f.ctx, async (tx) => {
      await addCharge(tx, f.ctx, { studentId: f.sita.id, feeHeadId: f.tuition.id, amountPaise: R(500), dueDate: addDays(today, -1), label: "Lost library book", reason: "Book not returned" });
      await addCharge(tx, f.ctx, { studentId: f.sita.id, feeHeadId: f.tuition.id, amountPaise: R(900), dueDate: addDays(today, 200), label: "Next year's trip", reason: "Trip booked early" });
    });
  }, 120_000);

  it("covers only what is due now when no rows are chosen, never the whole year", async () => {
    const open = (await dues(f.ctx, f.sita.id)).filter((d) => d.balancePaise > ZERO);
    const dueNow = open.filter((d) => ["DUE", "OVERDUE"].includes(dueStatus(d, today)));
    const doc = await withSchool(f.ctx, (tx) => createFeeInvoice(tx, f.ctx, f.sita.id, []));
    expect(doc.totalPaise).toBe(dueNow.reduce((s, d) => s + d.balancePaise, ZERO));
    const ids = (doc.details as { dueIds: string[] }).dueIds;
    expect(ids).toContain(open.find((d) => d.label === "Lost library book")!.id);
    expect(ids).not.toContain(open.find((d) => d.label === "Next year's trip")!.id);
  });

  it("the Fee invoice sheet makes an invoice for exactly the ticked rows, with their late fees", async () => {
    await withSchool(f.ctx, async (tx) => {
      await tx.feeSetting.update({ where: { schoolId: f.school.id }, data: { lateFeeOn: true, lateFeeType: "flat", lateFeePaise: R(150), graceDays: 0 } });
      await addLateFees(tx, f.ctx, today);
    });
    const open = (await dues(f.ctx, f.sita.id)).filter((d) => d.balancePaise > ZERO);
    const book = open.find((d) => d.label === "Lost library book")!;
    const trip = open.find((d) => d.label === "Next year's trip")!;
    const late = open.find((d) => d.kind === "LATE_FEE" && d.parentDueId === book.id)!;
    expect(late).toBeTruthy();
    who.current = await currentFor(f, f.accountant.id);
    const r = await invoiceAction(null, form({ studentId: f.sita.id, dueId: [book.id, trip.id] }));
    expect(r?.ok).toBe(true);
    const doc = await withSchool(f.ctx, (tx) => tx.feeDocument.findFirstOrThrow({ where: { studentId: f.sita.id, kind: "invoice" }, orderBy: { createdAt: "desc" } }));
    expect(doc.totalPaise).toBe(R(500 + 900 + 150));
    expect((doc.details as { dueIds: string[] }).dueIds.sort()).toEqual([book.id, trip.id, late.id].sort());
    // Nothing ticked: refused, nothing made.
    const none = await invoiceAction(null, form({ studentId: f.sita.id }));
    expect(none?.ok).toBe(false);
  });
});
