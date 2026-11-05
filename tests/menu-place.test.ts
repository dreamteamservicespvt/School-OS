// Where a "..." menu opens (owner test 2026-11-05: the student profile's menu
// was cut off by its card and could not scroll). src/components/ui/floating.tsx
// draws it in front of the page at this place.
import { describe, expect, it } from "vitest";
import { placeMenu } from "@/lib/menu-place";

const viewport = { width: 390, height: 800 };

describe("placing a menu next to its button", () => {
  it("opens below the button, its right edge on the button's", () => {
    const p = placeMenu({ anchor: { top: 100, bottom: 140, left: 300, right: 340 }, menu: { width: 240, height: 300 }, viewport });
    expect(p).toEqual({ top: 146, left: 100, maxHeight: 646, up: false });
  });

  it("opens upward near the bottom of the screen when there is more room above", () => {
    const p = placeMenu({ anchor: { top: 700, bottom: 740, left: 300, right: 340 }, menu: { width: 240, height: 400 }, viewport });
    expect(p.up).toBe(true);
    expect(p.top).toBe(700 - 6 - 400);
  });

  it("scrolls inside when it is taller than the room it has, and never goes past the screen", () => {
    const p = placeMenu({ anchor: { top: 380, bottom: 420, left: 10, right: 50 }, menu: { width: 240, height: 2000 }, viewport });
    expect(p.maxHeight).toBeLessThan(800);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.left).toBe(8);
  });

  it("a menu aligned left stays inside a narrow screen", () => {
    const p = placeMenu({ anchor: { top: 100, bottom: 140, left: 300, right: 340 }, menu: { width: 240, height: 100 }, viewport, align: "left" });
    expect(p.left).toBe(390 - 8 - 240);
  });
});
