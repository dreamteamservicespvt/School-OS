// The record-name tab guard (layman loop, 17 Nov 2026). With several records
// open, every browser tab said only "Book · Library Management", so a person
// could not tell the tabs apart. <RecordTitle name={...} /> puts the record's
// own name in front of the tab title. This test lists every record page under
// src/app/(school) (a page.tsx with a dynamic segment such as [id] in its path)
// and fails when one has neither
//   - <RecordTitle (or <FileReview, which names the tab after the import file), nor
//   - a "// tab: <why>" note (a page that only redirects, or is not a record).
// There is no baseline: every record page passes today, so a new one must too.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const SCHOOL = path.join(ROOT, "src", "app", "(school)");
const NAMES_TAB = /<RecordTitle\b|<FileReview\b/;
const NOTE = /^\s*\/\/ tab: \S/m;

function recordPages(dir: string, dynamic = false): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...recordPages(p, dynamic || /^\[.+\]$/.test(e.name)));
    else if (dynamic && e.name === "page.tsx") out.push(p);
  }
  return out;
}

describe("record pages name the browser tab", () => {
  const pages = recordPages(SCHOOL);

  it("finds the record pages", () => {
    expect(pages.length).toBeGreaterThan(40);
    expect(pages.map((p) => path.relative(ROOT, p).replace(/\\/g, "/"))).toContain("src/app/(school)/library-management/books/[id]/page.tsx");
  });

  it("every record page has <RecordTitle> or a // tab: note", () => {
    const missing = pages
      .filter((p) => { const t = fs.readFileSync(p, "utf8"); return !NAMES_TAB.test(t) && !NOTE.test(t); })
      .map((p) => path.relative(ROOT, p).replace(/\\/g, "/"));
    expect(missing, "Add <RecordTitle name={record's name} /> (src/components/ui/record-title.tsx) or a \"// tab: <why>\" note").toEqual([]);
  });

  it("<FileReview> itself names the tab after the file", () => {
    const t = fs.readFileSync(path.join(ROOT, "src", "components", "import", "file-review.tsx"), "utf8");
    expect(t).toMatch(/<RecordTitle name=\{file\.fileName\}/);
  });
});
