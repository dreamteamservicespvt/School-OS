import { describe, expect, it } from "vitest";
import { matches } from "@/components/shell/search-box";

describe("search matching", () => {
  it("finds a page from the start of any word", () => {
    expect(matches("Fee Management", "fee")).toBe(true);
    expect(matches("Fee Management", "man fee")).toBe(true);
    expect(matches("Staff & HR Management", "hr")).toBe(true);
  });
  it("forgives one wrong letter in longer words", () => {
    expect(matches("Attendance Management", "attendence")).toBe(true);
    expect(matches("Library Management", "libary")).toBe(true);
  });
  it("does not match letters scattered through a name", () => {
    expect(matches("Staff & HR Management", "fee")).toBe(false);
    expect(matches("Settings", "xyz")).toBe(false);
  });
});
