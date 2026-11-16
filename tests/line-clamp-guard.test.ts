// "line-clamp-N" works only with its own display (-webkit-box). A display class in the same list
// ("block", "flex", "grid", "inline-block", "inline") wins and the text is never cut: live test 16 Nov,
// Parent Link messages showed whole 4-line texts in their closed rows, and 6 other places had the same mix.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(name) ? [p] : [];
  });
}

describe("line-clamp classes", () => {
  it("never share a class list with a plain display class", () => {
    const bad: string[] = [];
    for (const f of files("src")) {
      for (const m of readFileSync(f, "utf8").matchAll(/className="([^"]*\bline-clamp-\d[^"]*)"/g)) {
        const classes = m[1].split(/\s+/);
        if (classes.some((c) => ["block", "flex", "grid", "inline-block", "inline", "inline-flex"].includes(c))) bad.push(`${f}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
