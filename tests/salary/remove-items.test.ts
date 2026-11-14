// Owner, 14 Nov 2026: a teacher on ₹35,000 basic was shown about ₹52,000 (DA and HRA always added), and
// Special allowance removed in Salary Settings stayed in her structure. Percentage items are now chosen per
// person, and a removed component leaves every structure from the first month not yet approved.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { archiveComponent, components, linesFrom } from "@/lib/salary/settings";
import { dropComponentFromStructures, fromStored, saveStructure, structureFor } from "@/lib/salary/structures";
import { as, d, R, makeSalarySchool, type SalaryFixture } from "./fixture";

let f: SalaryFixture;
beforeAll(async () => { f = await makeSalarySchool("Salary Remove Items"); });

describe("percentage items per person", () => {
  it("leaves DA and HRA out when they are switched off, so basic ₹35,000 stays ₹35,000", async () => {
    const acc = as(f, f.accountant.id);
    await withSchool(acc, async (tx) => {
      const comps = await components(tx, acc);
      const basic = comps.find((c) => c.systemKey === "basic")!;
      const none = linesFrom(comps, new Map([[basic.id, R(35000)]]), new Set());
      expect(none.some((l) => l.calc === "PERCENT")).toBe(false);
      const row = await saveStructure(tx, acc, { staffId: f.staffA.id, effectiveFrom: d("2026-04-01"), lines: none, pfApplies: false, esiApplies: false, tdsPaise: R(0), reason: null });
      expect(row.grossPaise).toBe(R(35000));
      // Without a choice (import), every percentage item still applies: 35,000 + 20% DA + 30% HRA.
      expect(linesFrom(comps, new Map([[basic.id, R(35000)]])).filter((l) => l.calc === "PERCENT")).toHaveLength(2);
    });
  });
});

describe("a component removed in Salary Settings", () => {
  it("leaves the structures from the first open month and keeps the earlier version", async () => {
    const acc = as(f, f.accountant.id);
    await withSchool(acc, async (tx) => {
      const comps = await components(tx, acc);
      const basic = comps.find((c) => c.systemKey === "basic")!;
      const special = comps.find((c) => c.name === "Special allowance")!;
      await saveStructure(tx, acc, { staffId: f.staffB.id, effectiveFrom: d("2026-04-01"), lines: linesFrom(comps, new Map([[basic.id, R(20000)], [special.id, R(5000)]]), new Set()), pfApplies: false, esiApplies: false, tdsPaise: R(0), reason: null });
      await archiveComponent(tx, acc, special.id);
      const changed = await dropComponentFromStructures(tx, acc, special.id, special.name, d("2026-11-01"));
      expect(changed).toEqual([f.staffB.id]);
      const now = await structureFor(tx, f.staffB.id, d("2026-11-01"));
      expect(fromStored(now!.lines).some((l) => l.componentId === special.id)).toBe(false);
      expect(now!.grossPaise).toBe(R(20000));
      // October (before the change) still has it.
      const before = await structureFor(tx, f.staffB.id, d("2026-10-01"));
      expect(before!.grossPaise).toBe(R(25000));
    });
  });
});
