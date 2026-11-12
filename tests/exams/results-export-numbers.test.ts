// Results Excel (layman test LC11): subject marks, total, % and rank are numbers
// Excel can add up and sort; the total's "out of" is in the heading; a student
// who joined after the exam has an empty total, not "0 / 0".
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildExport, type ExportColumn } from "@/lib/exports";
import { resultSheetRows, type ExportRow } from "@/app/(school)/examination-results/_lib/result-export";
import type { SheetColumn, SheetRow } from "@/lib/exams/results";

const columns: SheetColumn[] = [
  { id: "en", name: "English", max: 25, gradeOnly: false, entryId: "e1" },
  { id: "ma", name: "Mathematics", max: 100, gradeOnly: false, entryId: "e2" },
  { id: "art", name: "Art", max: 0, gradeOnly: true, entryId: "e3" },
];
const cell = (marks: number | null, extra: Partial<SheetRow["cells"][string]> = {}) => ({ marks, grade: null, absent: false, medical: false, missing: false, passed: true, grace: 0, ...extra });
const base = { studentId: "", admissionNo: "", grade: null, points: null, outcome: "Pass", complete: true, missing: 0, status: "PUBLISHED" as const, publishedAt: null, leftOut: false };
const rows: SheetRow[] = [
  { ...base, studentId: "a", name: "Asha", rollNo: 1, admissionNo: "00012", cells: { en: cell(11), ma: cell(37.5), art: cell(null, { grade: "A" }) }, total: 48.5, maxTotal: 125, percent: 38.8, grade: "C", rank: 2 },
  { ...base, studentId: "b", name: "Bala", rollNo: 2, admissionNo: "00013", cells: { en: cell(null, { absent: true }), ma: cell(90), art: cell(null, { grade: "B" }) }, total: 90, maxTotal: 125, percent: 72, grade: "B", rank: 1 },
  { ...base, studentId: "c", name: "Chitra", rollNo: 3, admissionNo: "00014", cells: {}, total: 0, maxTotal: 0, percent: null, rank: null, outcome: null, complete: false, leftOut: true },
];

async function sheetOf(labels: string[], data: ExportRow[]) {
  const cols: ExportColumn<ExportRow>[] = labels.map((label) => ({ label, value: (r) => r[label] }));
  const file = await buildExport("xlsx", cols, data, { title: "Unit Test 2", schoolName: "Test School", filters: "", exportedBy: "Admin", timeZone: "Asia/Kolkata" });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file.body as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const col = (label: string) => labels.indexOf(label) + 1;
  return { at: (r: number, label: string) => ws.getRow(5 + r).getCell(col(label)).value, head: (label: string) => ws.getRow(5).getCell(col(label)).value };
}

describe("results Excel", () => {
  it("holds marks, total, % and rank as numbers, with out of in the headings", async () => {
    const { labels, rows: data } = resultSheetRows({ columns, rows }, true);
    expect(labels).toEqual(["Roll", "Student", "Admission no", "English (out of 25)", "Mathematics (out of 100)", "Art", "Total (out of 125)", "%", "Grade", "Rank", "Result", "Status"]);
    const x = await sheetOf(labels, data);
    expect(x.head("Total (out of 125)")).toBe("Total (out of 125)");
    expect([x.at(1, "English (out of 25)"), x.at(2, "English (out of 25)")]).toEqual([11, "AB"]);
    expect([x.at(1, "Mathematics (out of 100)"), x.at(2, "Mathematics (out of 100)")]).toEqual([37.5, 90]);
    expect([x.at(1, "Total (out of 125)"), x.at(2, "Total (out of 125)")]).toEqual([48.5, 90]);
    expect([x.at(1, "%"), x.at(1, "Rank"), x.at(1, "Roll")]).toEqual([38.8, 2, 1]);
    expect(x.at(1, "Art")).toBe("A");
    expect(x.at(1, "Admission no")).toBe("00012");
  });

  it("leaves a late joiner's total, % and rank empty", async () => {
    const { labels, rows: data } = resultSheetRows({ columns, rows }, true);
    const x = await sheetOf(labels, data);
    expect([x.at(3, "Total (out of 125)"), x.at(3, "%"), x.at(3, "Rank")]).toEqual([null, null, null]);
    expect(x.at(3, "Result")).toBe("Joined after this exam");
  });

  it("adds an Out of column when students are marked out of different totals", () => {
    const mixed = [rows[0], { ...rows[1], maxTotal: 100 }, rows[2]];
    const { labels, rows: data } = resultSheetRows({ columns, rows: mixed }, true);
    expect(labels).toContain("Total");
    expect(labels[labels.indexOf("Total") + 1]).toBe("Out of");
    expect([data[0]["Out of"], data[1]["Out of"], data[2]["Out of"]]).toEqual([125, 100, null]);
  });

  it("has no totals for a subject teacher's own subjects", () => {
    const { labels } = resultSheetRows({ columns, rows }, false);
    expect(labels.some((l) => l.startsWith("Total"))).toBe(false);
    expect(labels).not.toContain("Rank");
  });
});
