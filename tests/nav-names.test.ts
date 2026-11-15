// The main menu shows each module's short label (owner decision 13, 15 Nov 2026: "Attendance",
// "Fees", "Students"), while module names, page titles and records keep the blueprint's full
// names (CLAUDE.md: "Module names ... must match the blueprint exactly"; docs/blueprint/README.md).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "@/components/shell/nav-config";
import { MODULES } from "@/lib/modules";

const README = readFileSync(path.resolve(import.meta.dirname, "../docs/blueprint/README.md"), "utf8");

describe("main menu names", () => {
  it("uses the short label of every module", () => {
    const shown = NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i.label]);
    const named = shown.map(([key]) => [key, MODULES.find((m) => m.key === key)?.short]);
    expect(shown).toEqual(named);
  });

  it("keeps the labels short and plain", () => {
    for (const m of MODULES) {
      expect(m.short.length, m.key).toBeLessThanOrEqual(14);
      expect(m.short, m.key).not.toMatch(/Management/);
    }
    expect(MODULES.find((m) => m.key === "attendance-management")?.short).toBe("Attendance");
    expect(MODULES.find((m) => m.key === "fee-management")?.short).toBe("Fees");
    expect(MODULES.find((m) => m.key === "student-management")?.short).toBe("Students");
    expect(new Set(MODULES.map((m) => m.short)).size).toBe(MODULES.length);
  });

  it("keeps the blueprint's full module names, in menu order", () => {
    const listed = README.match(/\*\*The 20 modules, in menu order:\*\* (.+)\./)?.[1] ?? "";
    const names = listed.split(", ").map((n) => n.replace(/ \*\(optional\)\*$/, ""));
    expect(MODULES.map((m) => m.name)).toEqual(names);
  });

  it("lists every module once", () => {
    const keys = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.key);
    expect([...keys].sort()).toEqual(MODULES.map((m) => m.key).sort());
  });
});
