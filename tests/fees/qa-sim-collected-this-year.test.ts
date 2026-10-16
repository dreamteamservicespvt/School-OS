// QA (Chaitanya EM School audit), SIM-06: "Collected this year" on the
// Dashboard ("Fee collection") and on the Fee Dashboard showed different
// numbers under the same words (₹1.59 L of ₹1.05 Cr against ₹1.57 L of
// ₹1.07 Cr). Both now use the Fee Management definition (fees/by-class.ts):
// paid on the fees due so far (due up to 30 days ahead, plus anything older
// still unpaid). Money paid ahead for later installments is not in it.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { buildHome } from "@/lib/dashboard/compose";
import type { Current } from "@/lib/current";
import type { Panel } from "@/lib/dashboard/types";
import { feeViewer } from "@/lib/fees/access";
import { feeTiles } from "@/lib/fees/dashboard";
import { formatRupeesShort } from "@/lib/format";
import { todayIn } from "@/lib/staff/dates";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;

const viewer = async (userId: string): Promise<Current> => {
  const view = await accessIn(userId, f.school.id);
  return { ...view!, ctx: { schoolId: f.school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null } as unknown as Current;
};

beforeAll(async () => {
  f = await makeFeeSchool();
  // Ravi pays the whole year now, including the installment due in January (paid ahead).
  const rows = await dues(f.ctx, f.ravi.id);
  await collect(f.ctx, { studentId: f.ravi.id, dueIds: rows.map((r) => r.id), amountPaise: R(24000) });
}, 120_000);

describe("Collected this year", () => {
  it("SIM-06: the Dashboard's Fee collection says what the Fee Dashboard says", async () => {
    // QA (Chaitanya EM School audit), SIM-06: Dashboard ₹1.59 L of ₹1.05 Cr vs Fee Dashboard ₹1.57 L of ₹1.07 Cr.
    const now = new Date();
    const principal = await viewer(f.principal.id);
    const tz = await withSchool(f.pctx, (tx) => tx.school.findUniqueOrThrow({ where: { id: f.school.id }, select: { timeZone: true } }));
    const today = todayIn(tz.timeZone, now);
    const tiles = await withSchool(f.pctx, async (tx) => feeTiles(tx, await feeViewer(tx, f.pctx, principal), today));
    expect(tiles.year.due).toBeGreaterThan(BigInt(0));
    const home = await buildHome(principal, { now });
    const panels: Panel[] = [...home.panels.first, ...home.panels.main, ...home.panels.side];
    const chart = panels.find((p) => p.kind === "bars" && p.title === "Fee collection");
    expect(chart).toBeTruthy();
    // The Fee Dashboard tile: "Collected this year" ₹X, "of ₹Y due so far · Z%".
    const feeDashboard = `${formatRupeesShort(tiles.year.paid)} of ${formatRupeesShort(tiles.year.due)} due so far · ${Math.round(tiles.year.percent)}%`;
    expect((chart as { sub?: string }).sub).toBe(feeDashboard);
    // Paid ahead (January) is not in "collected this year" on either screen.
    expect(tiles.year.paid).toBeLessThan(R(24000));
  });
});
