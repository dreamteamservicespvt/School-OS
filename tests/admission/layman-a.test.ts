// Layman test A (docs/qa/2026-11-12-layman-A.md), Admission and Students part:
// LA7 a name made only of emoji or digits is questioned, LA9 two staff with
// the same name are told apart in the enquiry Owner filter, LA8 a Student
// Management page a role may not use shows the "not for your role" page
// (/no-access), not a silent jump to the Student List.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AdmissionProblem, hasLetter, needName, ownerFilter } from "@/lib/admission/act";

const fd = (v: Record<string, string>) => { const f = new FormData(); for (const [k, x] of Object.entries(v)) f.set(k, x); return f; };

describe("enquiry names (LA7)", () => {
  it("needs at least one letter, in any script", () => {
    expect(hasLetter("😀😀")).toBe(false);
    expect(hasLetter("1")).toBe(false);
    expect(hasLetter("Ananya")).toBe(true);
    expect(hasLetter("రమేష్")).toBe(true);
    expect(hasLetter("अनन्या")).toBe(true);
  });

  it("refuses an emoji child's name and a parent's name of digits, next to the field", () => {
    const child = () => needName(fd({ childName: "😀😀" }), "childName", "Child's name", "Type the child's name in letters.");
    expect(child).toThrow(AdmissionProblem);
    expect(child).toThrow("Type the child's name in letters.");
    try { child(); } catch (e) { expect((e as AdmissionProblem & { field?: string }).field).toBe("childName"); }
    expect(() => needName(fd({ parentName: "1" }), "parentName", "Parent's name", "Type the parent's name in letters.")).toThrow("Type the parent's name in letters.");
    expect(needName(fd({ childName: "  Diya 2 " }), "childName", "Child's name", "x")).toBe("Diya 2");
  });
});

describe("enquiry Owner filter (LA9)", () => {
  it("keeps the job title only where two staff share a name", () => {
    expect(ownerFilter([
      { value: "a", label: "Naresh Kumar (Receptionist)" },
      { value: "b", label: "Naresh Kumar (Teacher)" },
      { value: "c", label: "Lakshmi Rao (Principal)" },
    ])).toEqual([
      { value: "a", label: "Naresh Kumar (Receptionist)" },
      { value: "b", label: "Naresh Kumar (Teacher)" },
      { value: "c", label: "Lakshmi Rao" },
    ]);
  });
});

describe("refused Student Management pages (LA8)", () => {
  const root = path.resolve("src/app/(school)/student-management");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /^(page|layout)\.tsx$/.test(n) ? [p] : [];
  });

  it("send a role refusal to the no-access page", () => {
    const wrong: string[] = [];
    for (const file of files(root)) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        // A check of the person's abilities (can.manage, can.reach, can.seeRestricted...) that redirects.
        const roleCheck = /if \([^)]*\bcan\.(manage|reach|seeRestricted|lookupOnly)\b[^;]*\bredirect\(/.test(line);
        if (roleCheck && !/redirect\(NO_ACCESS\)/.test(line)) wrong.push(`${path.relative(root, file)}:${i + 1}`);
      });
    }
    expect(wrong).toEqual([]);
    const lib = readFileSync(path.join(root, "_lib/page.ts"), "utf8");
    expect(lib).toContain("export const NO_ACCESS = `/no-access?m=${MODULE}`");
    expect(lib.match(/redirect\(BASE\)/g)).toBeNull();
  });
});
