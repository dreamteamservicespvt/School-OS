// Self-test A (2026-11-12): report filter words said "All campus" (and would say "Main Campus campus").
import { describe, expect, it } from "vitest";
import { campusWords } from "@/lib/reports/filters";

describe("campusWords: the campus in a report's filter line", () => {
  it("says All campuses for every campus", () => expect(campusWords("All")).toBe("All campuses"));
  it("does not repeat the word campus", () => expect(campusWords("Main Campus")).toBe("Main Campus"));
  it("adds campus to a bare name", () => expect(campusWords("Kondapur Junior Wing")).toBe("Kondapur Junior Wing campus"));
  it("says nothing for a one-campus school", () => expect(campusWords(null)).toBeNull());
});
