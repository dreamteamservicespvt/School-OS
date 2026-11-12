// The class result sheet as export rows (layman test LC11). Marks, totals,
// percentages and ranks are numbers, so Excel can add them up and sort them;
// the "out of" goes in the heading, not in each cell. A student who joined
// after the exam has an empty total, not "0 / 0".
import type { SheetColumn, SheetRow } from "@/lib/exams/results";

export type ExportRow = Record<string, string | number | null>;

/** Marks as the screen shows them (one decimal at most), but as a number. */
const marks = (n: number) => Math.round(n * 10) / 10;

/** A subject's heading: "English (out of 25)", or just the name for a grade-only subject. */
export const subjectLabel = (c: SheetColumn) => (c.gradeOnly ? c.name : `${c.name} (out of ${c.max})`);

/**
 * Headings and rows for one exam's result sheet. With `withTotals` false (a
 * subject teacher's own subjects) there is no total, %, grade, rank or result.
 * When every student is marked out of the same total, the heading says
 * "Total (out of 125)"; when they differ (optional subjects), an "Out of"
 * column follows the total instead.
 */
export function resultSheetRows(sheet: { columns: SheetColumn[]; rows: SheetRow[] }, withTotals: boolean): { labels: string[]; rows: ExportRow[] } {
  const counted = sheet.rows.filter((r) => !r.leftOut && r.maxTotal > 0);
  const outOf = [...new Set(counted.map((r) => r.maxTotal))];
  const totalLabel = outOf.length === 1 ? `Total (out of ${outOf[0]})` : "Total";
  const ownOutOf = outOf.length > 1;
  const overall = withTotals ? [totalLabel, ...(ownOutOf ? ["Out of"] : []), "%", "Grade", "Rank", "Result"] : [];
  const labels = ["Roll", "Student", "Admission no", ...sheet.columns.map(subjectLabel), ...overall, "Status"];
  const rows = sheet.rows.map((r) => {
    const row: ExportRow = { Roll: r.rollNo, Student: r.name, "Admission no": r.admissionNo, Status: r.status === "PUBLISHED" ? "Published" : "Draft" };
    if (withTotals) {
      const shown = !r.leftOut && r.maxTotal > 0;
      row[totalLabel] = shown ? marks(r.total) : null;
      if (ownOutOf) row["Out of"] = shown ? r.maxTotal : null;
      row["%"] = shown ? r.percent : null;
      row.Grade = r.grade ?? "";
      row.Rank = r.rank;
      row.Result = r.leftOut ? "Joined after this exam" : r.outcome ?? "";
    }
    for (const c of sheet.columns) {
      const cell = r.cells[c.id];
      row[subjectLabel(c)] = !cell ? null : cell.absent ? (cell.medical ? "ML" : "AB") : c.gradeOnly ? cell.grade ?? "" : cell.marks === null ? null : marks(cell.marks);
    }
    return row;
  });
  return { labels, rows };
}
