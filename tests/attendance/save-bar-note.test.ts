// Take Attendance, phone: "Saving tells the parents of the N absent students..." sat in the Save bar's see-through
// top (a fade from the page colour to nothing) and was drawn over the next student's name (demo video, 17 Nov).
// The bar is solid behind its note and button now; only a separate strip above it fades.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("src/app/(school)/attendance-management/_components/take-sheet.tsx", "utf8");

function classesOf(testId: string): string[] {
  const m = src.match(new RegExp(`<\\w+ className="([^"]*)"[^>]*data-testid="${testId}"`));
  expect(m, `element with data-testid="${testId}"`).toBeTruthy();
  return m![1].split(/\s+/);
}

describe("Take Attendance save bar", () => {
  it("is solid behind the absent note and the Save button", () => {
    const bar = classesOf("save-bar");
    expect(bar).toContain("sticky");
    expect(bar).toContain("bg-bg");
    expect(bar.filter((c) => c.startsWith("bg-gradient") || /\/0$/.test(c))).toEqual([]);
  });

  it("gives the absent note its own row with its own background", () => {
    const note = classesOf("absent-note");
    expect(note).toContain("bg-surface");
    expect(note.some((c) => c.startsWith("absolute") || c === "fixed")).toBe(false);
  });
});
