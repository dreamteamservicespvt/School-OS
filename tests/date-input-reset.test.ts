// React 19 resets an action form once its save ends. The date and time boxes
// (src/components/ui/date-input.tsx) then go back to their defaultValue, which a refused save
// sets to what was typed. They read it from their hidden input, where React has already written
// it in the same commit; a copy kept by an effect was the first render's, so a refused save
// emptied a date of birth and put a leave's From and To back to today, and a leave was saved
// for the wrong days (layman tests LA1, LD1). This reads the file and fails when the boxes go
// back to keeping their own copy.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const file = fs.readFileSync(path.resolve(import.meta.dirname, "../src/components/ui/date-input.tsx"), "utf8");

describe("date and time boxes after a refused save", () => {
  it("take the value the form sends back, read from the hidden input at the reset", () => {
    const held = file.slice(file.indexOf("function useHeld("), file.indexOf("const isShown"));
    expect(held).toContain("dataset.resetTo");
    expect(held).toContain('"data-reset-to": value === undefined ? defaultValue : undefined');
    expect(held).not.toMatch(/latest\.current/);
  });

  it("put that value on every hidden input (date, time, date and time)", () => {
    const hidden = file.match(/<input ref=\{hidden\} type="hidden"[^>]*>/g) ?? [];
    expect(hidden.length).toBe(3);
    for (const h of hidden) expect(h).toContain("{...resetProps}");
  });

  it("send typed text that is not a date as it is, so the save is refused, never a quiet default (layman test LE3)", () => {
    expect(file).toMatch(/value=\{unreadable \|\| held\}/);
  });
});
