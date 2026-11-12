// Issue 34B (owner decision 2026-11-12): no Transport in version 1 (blueprint README,
// "Decisions made"). Nothing switches it on for a school by default: not Add School in
// the console, not a school-type template. A school may still switch it on itself.
import { describe, expect, it } from "vitest";
import { SCHOOL_TEMPLATES } from "@/lib/settings/switch-rules";
import { defaultOptional, OPTIONAL_MODULES } from "@/lib/console/schools";

describe("Transport is off unless a school switches it on (34B)", () => {
  it("no school-type template switches Transport on", () => {
    for (const t of SCHOOL_TEMPLATES) expect(t.modulesOn, t.key).not.toContain("transport-management");
  });
  it("Add School neither offers nor defaults Transport", () => {
    expect(OPTIONAL_MODULES.map((m) => m.key)).not.toContain("transport-management");
    for (const type of ["Day school", "Boarding school", "Pre-school"]) expect(defaultOptional(type)).not.toContain("transport-management");
  });
});
