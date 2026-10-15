// Helpers shared by the catalogue's reports: the sections a run may read,
// class names, and turning each module's own report result into one Table
// without working out any number again.
import "server-only";

import type { ExportColumn } from "../../exports";
import type { ReportResult } from "../../fees/reports";
import type { ReportTable as AttendanceTable } from "../../attendance/reports";
import type { Report as AdmissionReport } from "../../admission/reports";
import type { Cell, Column, Row, RunCtx, Table } from "../types";

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
export const ZERO = BigInt(0);

/** Sections of the chosen year this run may read, after the class and section filters; null = every section. */
export async function scopeSections(rc: RunCtx): Promise<string[] | null> {
  const { f, sections, tx } = rc;
  if (!f.year) return sections ?? [];
  let ids: string[] | null = sections;
  if (f.classId || f.campusId) {
    const rows = await tx.section.findMany({ where: { academicYearId: f.year.id, archivedAt: null, ...(f.classId ? { classId: f.classId } : {}), ...(f.campusId ? { schoolClass: { campusId: f.campusId } } : {}) }, select: { id: true } });
    const inClass = rows.map((r) => r.id);
    ids = ids ? ids.filter((x) => inClass.includes(x)) : inClass;
  }
  if (f.sectionId) ids = ids ? ids.filter((x) => x === f.sectionId) : [f.sectionId];
  return ids;
}

/** "Class 5 A" for every section of a year. */
export async function sectionNames(rc: RunCtx, yearId: string | null = rc.f.year?.id ?? null) {
  return rc.memo(`sections:${yearId}`, async () => {
    const rows = await rc.tx.section.findMany({ where: { ...(yearId ? { academicYearId: yearId } : {}) }, include: { schoolClass: { select: { name: true, sortOrder: true } } } });
    return new Map(rows.map((s) => [s.id, { label: `${s.schoolClass.name} ${s.name}`, classId: s.classId, className: s.schoolClass.name, sort: s.schoolClass.sortOrder * 1000 + s.name.charCodeAt(0) }]));
  });
}

/** The section each student is in this year, for class columns. */
export async function studentSections(rc: RunCtx, studentIds: string[]) {
  if (!rc.f.year || studentIds.length === 0) return new Map<string, string>();
  const rows = await rc.tx.enrolment.findMany({ where: { academicYearId: rc.f.year.id, studentId: { in: studentIds }, archivedAt: null }, select: { studentId: true, sectionId: true } });
  return new Map(rows.map((r) => [r.studentId, r.sectionId]));
}

/** A Fee or Finance Report's own result, as it is. */
export function fromMoney(r: ReportResult): Table {
  return { columns: r.columns.map((c) => ({ key: c.key, label: c.label, kind: c.kind ?? "text" })), rows: r.rows, totals: r.totals ?? null, note: r.note ?? null };
}

/** An Attendance Report's own table, as it is (its % column stays the module's words). */
export function fromAttendance(t: AttendanceTable): Table {
  const columns: Column[] = t.columns.map((c) => ({ key: c.key, label: c.label, kind: c.numeric ? (c.label.includes("%") ? "percent" : "number") : "text" }));
  const rows: Row[] = t.rows.map((r) => Object.fromEntries(t.columns.map((c) => [c.key, r[c.key] ?? null])) as Row);
  return { columns, rows, note: t.footer ?? null, empty: t.rows.length ? null : t.empty };
}

/** An Admission Report's own table. */
export function fromAdmission(r: AdmissionReport): Table {
  return { columns: r.columns.map((c) => ({ key: c.key, label: c.label, kind: c.align === "right" ? "number" : "text" })), rows: r.rows as Row[], note: r.headline || null };
}

/** A table built for export elsewhere (Salary reports): its columns' values become the cells. */
export function fromExport(columns: ExportColumn<Record<string, unknown>>[], rows: Record<string, unknown>[], money: string[] = []): Table {
  const cols: Column[] = columns.map((c, i) => ({ key: `c${i}`, label: c.label, kind: money.includes(c.label) ? "money" : "text" }));
  return {
    columns: cols,
    rows: rows.map((r) => Object.fromEntries(columns.map((c, i) => [`c${i}`, (c.value(r) ?? null) as Cell]))),
  };
}

/** Adds up the money and number columns into a total line, with a first-column label. */
export function totalsOf(t: Pick<Table, "columns" | "rows">, label = "Total", keys?: string[]): Row {
  const out: Row = {};
  t.columns.forEach((c, i) => {
    if (i === 0) { out[c.key] = label; return; }
    if (keys ? !keys.includes(c.key) : c.kind !== "money" && c.kind !== "number") { out[c.key] = null; return; }
    if (c.kind === "money") out[c.key] = t.rows.reduce<bigint>((s, r) => s + (typeof r[c.key] === "bigint" ? (r[c.key] as bigint) : ZERO), ZERO);
    else out[c.key] = t.rows.reduce<number>((s, r) => s + (typeof r[c.key] === "number" ? (r[c.key] as number) : 0), 0);
  });
  return out;
}
