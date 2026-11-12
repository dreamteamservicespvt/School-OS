// Self-test A (2026-11-12): A13, the pre-send check named 1 of 6 staff with no salary structure
// (5 were added after the last calculation); A5, saving an adjustment moved net pay by more than
// the adjustment with no word why.
import { describe, expect, it } from "vitest";
import { alsoChangedNote, staffWithoutStructure } from "@/lib/salary/words";

describe("staffWithoutStructure", () => {
  const lines = [
    { staffId: "vani", flags: ["No salary structure"] },
    { staffId: "ravi", flags: ["Adjustment added"] },
  ];
  it("counts the run's flagged lines and staff added since the last calculation", () => {
    const r = staffWithoutStructure(lines, ["vani", "ramesh", "venkat", "lakshmi", "saroja", "mallesh"]);
    expect(r.all).toEqual(["vani", "ramesh", "venkat", "lakshmi", "saroja", "mallesh"]);
    expect(r.notYetInRun).toEqual(["ramesh", "venkat", "lakshmi", "saroja", "mallesh"]);
  });
  it("names nobody twice and leaves out staff who have a line with a structure", () => {
    expect(staffWithoutStructure(lines, ["vani", "ravi"]).all).toEqual(["vani", "ravi"].filter((x) => x === "vani"));
  });
  it("is empty when everyone has a structure", () => expect(staffWithoutStructure([{ staffId: "a", flags: [] }], []).all).toEqual([]));
});

describe("alsoChangedNote", () => {
  const rupees = (p: bigint) => `₹${Number(p) / 100}`;
  it("says how much else moved net pay and why", () => {
    expect(alsoChangedNote(BigInt(62000), "12-11-2026", rupees)).toBe("Net pay also went up by ₹620 because attendance and leave up to 12-11-2026 were brought in.");
    expect(alsoChangedNote(BigInt(-50000), "12-11-2026", rupees)).toBe("Net pay also went down by ₹500 because attendance and leave up to 12-11-2026 were brought in.");
  });
  it("says nothing when nothing else changed", () => expect(alsoChangedNote(BigInt(0), "12-11-2026", rupees)).toBeNull());
});
