// Layman loop 3: the Parent Link page sends the phone only the words its browser parts use
// (the whole list made it 2.1 MB). A word a browser component asks for that is not in that
// short list would show in English on a Hindi or Telugu phone, so every one must be listed.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PARENT_BROWSER_WORDS } from "@/lib/parent-link/words";

const root = path.resolve(import.meta.dirname, "../..");
const dir = path.join(root, "src/components/parent-link");
const files = [
  ...readdirSync(dir).filter((f) => f.endsWith(".tsx")).map((f) => path.join(dir, f)),
  path.join(root, "src/components/language-picker.tsx"),
  path.join(root, "src/components/attendance/month-select.tsx"),
];

describe("Parent Link browser words", () => {
  it("every t(\"…\") in a browser component of the parent page is in PARENT_BROWSER_WORDS", () => {
    const listed = new Set(PARENT_BROWSER_WORDS);
    const missing: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (!/^["']use client["']/m.test(src)) continue;
      for (const m of src.matchAll(/(?<![\w.])t\(\s*"((?:[^"\\]|\\.)*)"/g)) {
        const key = JSON.parse(`"${m[1]}"`) as string;
        if (!listed.has(key)) missing.push(`${path.basename(f)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
