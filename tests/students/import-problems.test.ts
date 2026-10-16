// Student import preview (P10): a row with several problems lists all of them
// at once, so the office fixes the file in one go (QA PEOPLE-01).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { autoMatch, previewImport } from "@/lib/importer";
import { studentImport, STUDENT_IMPORT } from "@/lib/students/import";
import { studentSchool } from "./fixtures";

let s: Awaited<ReturnType<typeof studentSchool>>;
beforeAll(async () => {
  s = await studentSchool();
});

const headers = ["Full name", "Class", "Section", "Date of birth", "Gender", "Father's or guardian's name", "Parent's phone"];

describe("import preview problems", () => {
  it("shows an empty birth date and a bad phone on the same row", async () => {
    const kind = studentImport(STUDENT_IMPORT, { sectionId: s.s5a, applyFeePlan: false });
    const rows = [
      ["Demo Meghana Rao", "", "", "", "Female", "Demo Suresh Rao", "12345"],
      ["Demo Good Row", "", "", "12-03-2016", "Male", "Demo Ravi Rao", "9876512345"],
      ["", "", "", "", "", "", ""],
    ];
    const preview = await withSchool(s.ctx, (tx) => previewImport(tx, s.ctx, kind, rows, autoMatch(kind.columns, headers)));
    const bad = preview.bad.find((b) => b.line === 2)!;
    expect(bad.problems).toEqual(["Date of birth is empty.", "Parent's phone: Phone number has 5 digits. Indian mobile numbers have 10 digits."]);
    // The empty columns are not said twice in other words.
    const blank = preview.bad.find((b) => b.line === 4)!;
    expect(blank.problems.every((p) => p.endsWith("is empty."))).toBe(true);
    // A skipped row holds no seat: the good row still goes through.
    expect(preview.good.map((g) => g.line)).toEqual([3]);
  });
});
