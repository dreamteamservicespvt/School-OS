// Links built as `/some/page/${id}` must lead to a page that exists. "Open student" on an
// admitted application, the student's name on the Fee Ledger and on Collect Fee, and the
// profile button on homework submissions went to /student-management/<id>, which is a 404
// (the profile is /student-management/students/<id>). Found by a phone crawl of every page.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "../src");
const APP = path.join(SRC, "app");

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

/** The folders a URL folder can be: itself, or inside route groups such as "(school)". */
function children(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => statSync(path.join(dir, n)).isDirectory()).flatMap((n) => (/^\(.*\)$/.test(n) ? children(path.join(dir, n)).map((c) => path.join(n, c)) : [n]));
}

/** Does /a/b/<anything> exist as a page or route: folder a/b (through route groups) with a [param] folder in it? */
function hasDynamicChild(segments: string[]): boolean {
  let dirs = [APP];
  for (const seg of segments) {
    dirs = dirs.flatMap((d) => children(d).filter((c) => path.basename(c) === seg).map((c) => path.join(d, c)));
    if (!dirs.length) return false;
  }
  return dirs.some((d) => children(d).some((c) => /^\[.+\]$/.test(path.basename(c))));
}

/** Links whose ${…} is a fixed page name, not a record id: each value is its own folder. */
const FIXED_PAGE_NAMES = new Set(["lib/settings/page-access.ts: /settings/"]);

describe("links to a record's page lead to a page that exists", () => {
  it("every `/path/${id}` link has a [param] page under that path", () => {
    const broken: string[] = [];
    for (const f of files(SRC)) {
      // Code only: an example in a comment is not a link.
      const text = readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
      // href={`/a/b/${x}`}, href: `/a/b/${x}`, router.push(`/a/b/${x}`), redirect(`/a/b/${x}`)
      for (const m of text.matchAll(/(?:href=\{|href:\s*|push\(|replace\(|redirect\()`(\/[a-z0-9\-/]*\/)\$\{/g)) {
        const segments = m[1].split("/").filter(Boolean);
        if (!segments.length || segments[0] === "api") continue;
        if (FIXED_PAGE_NAMES.has(`${path.relative(SRC, f).replace(/\\/g, "/")}: ${m[1]}`)) continue;
        if (!hasDynamicChild(segments)) broken.push(`${path.relative(SRC, f)}: ${m[1]}\${…}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
