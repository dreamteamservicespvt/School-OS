// The main menu names each module exactly as the blueprint does (CLAUDE.md:
// "Module names ... must match the blueprint exactly"; docs/blueprint/README.md).
import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "@/components/shell/nav-config";
import { MODULES } from "@/lib/modules";

describe("main menu names", () => {
  it("uses the blueprint name of every module", () => {
    const shown = NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i.label]);
    const named = shown.map(([key]) => [key, MODULES.find((m) => m.key === key)?.name]);
    expect(shown).toEqual(named);
  });

  it("lists every module once", () => {
    const keys = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.key);
    expect([...keys].sort()).toEqual(MODULES.map((m) => m.key).sort());
  });
});
