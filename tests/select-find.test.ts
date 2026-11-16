// Long lists (staff, books, items) get a "Type to find" box (layman loop 2): what the typed words match.
import { describe, expect, it } from "vitest";
import { matchesFind } from "@/components/ui/field";

describe("matchesFind", () => {
  it("finds a name by any part, ignoring case", () => {
    expect(matchesFind("Anjali Reddy (Principal)", "anj")).toBe(true);
    expect(matchesFind("Anjali Reddy (Principal)", "principal")).toBe(true);
    expect(matchesFind("Anjali Reddy (Principal)", "ravi")).toBe(false);
  });

  it("needs every typed word, in any order, and ignores dots", () => {
    expect(matchesFind("Ram Kumar", "kumar ram")).toBe(true);
    expect(matchesFind("Ram Kumar", "ram k")).toBe(true);
    expect(matchesFind("K. Saiveni", "k saiveni")).toBe(true);
    expect(matchesFind("Ram Kumar", "ram singh")).toBe(false);
  });
});
