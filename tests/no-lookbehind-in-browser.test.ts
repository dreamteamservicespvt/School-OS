// Code review 15 Nov: a regex lookbehind ((?<= or (?<!) in code that reaches the browser makes the
// whole page fail on iOS Safari before 16.4 (still common on second-hand iPhones, often a parent's).
// Browser code is every "use client" file plus the i18n helpers the client provider imports.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve("src");
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
});
const SHARED = ["lib/i18n/t.ts", "lib/i18n/messages.ts", "lib/i18n/dates.ts", "lib/i18n/client.tsx"].map((f) => path.join(SRC, f));

describe("no regex lookbehind in browser code", () => {
  it("client components and the shared i18n helpers use none", () => {
    const bad: string[] = [];
    for (const f of files(SRC)) {
      if (f.includes(`${path.sep}catalogues${path.sep}`)) continue;
      const text = readFileSync(f, "utf8");
      const browser = /^["']use client["']/m.test(text) || SHARED.includes(f);
      if (browser && /\(\?<[=!]/.test(text)) bad.push(path.relative(SRC, f));
    }
    expect(bad).toEqual([]);
  });
});
