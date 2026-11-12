// Self-test B4 (2026-11-12): tapping a box that already held 11 and pressing 1, 8 gave 1118.
import { describe, expect, it } from "vitest";
import { keypadValue } from "@/lib/exams/keypad";

describe("Marks Entry number keys", () => {
  it("the first key in a box just chosen replaces the mark", () => {
    expect(keypadValue("11", "1", { fresh: true, absent: false })).toBe("1");
    expect(keypadValue("1", "8", { fresh: false, absent: false })).toBe("18");
  });
  it("delete on a box just chosen clears it; later it removes one digit", () => {
    expect(keypadValue("65", "del", { fresh: true, absent: false })).toBe("");
    expect(keypadValue("65", "del", { fresh: false, absent: false })).toBe("6");
  });
  it("half marks and absent codes", () => {
    expect(keypadValue("7", ".5", { fresh: false, absent: false })).toBe("7.5");
    expect(keypadValue("7.5", ".5", { fresh: false, absent: false })).toBeUndefined();
    expect(keypadValue("40", ".5", { fresh: true, absent: false })).toBe("0.5");
    expect(keypadValue("AB", "4", { fresh: false, absent: true })).toBe("4");
    expect(keypadValue("40", "AB", { fresh: false, absent: false })).toBe("AB");
  });
  it("never longer than 5 characters", () => {
    expect(keypadValue("12.25", "5", { fresh: false, absent: false })).toBe("12.25");
  });
});
