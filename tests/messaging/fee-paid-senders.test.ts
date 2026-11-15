// 15 Nov: the "Fee received" card shows "Paid by" and "Still due". "Send to parent again" did not fill
// them, so its message could not be built and the accountant was told nobody could be messaged.
// Every place that sends the fee-paid message must fill both (feePaidFacts, src/lib/fees/notify-parents.ts).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
});

describe("every fee-paid sender", () => {
  it("fills Paid by and Still due", () => {
    const missing: string[] = [];
    for (const f of files(path.resolve("src"))) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/rule: "fee-paid"/g)) {
        const call = text.slice(m.index, m.index + 900);
        if (!/feePaidFacts|payment_mode|\bfacts\b/.test(call)) missing.push(path.relative(path.resolve("src"), f));
      }
    }
    expect(missing).toEqual([]);
  }, 120_000);
});
