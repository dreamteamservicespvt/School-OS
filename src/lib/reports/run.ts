// Running a catalogue report for one person (19 §2, §5): with their
// permissions and reach on the server, the filters printed with it, sorted by
// any column, and exported to Excel, CSV or PDF with the school name, the
// filters, who exported it and when. Heavy reports, and files over 2,000
// rows, are prepared in the background and the person is notified with the
// download link.
import "server-only";

import { randomUUID } from "node:crypto";
import type { SchoolContext, Tx } from "../db";
import { accessIn } from "../auth/access";
import { buildExport, logExport, type ExportColumn, type ExportFormat } from "../exports";
import { formatDate, formatRupees } from "../format";
import { defineJob, enqueue } from "../jobs";
import { notify } from "../notifications";
import { ownSectionIds } from "../people";
import { periodSetup } from "../period-setup";
import type { Current } from "../current";
import { fileStore } from "../storage";
import { todayIn } from "../staff/dates";
import { reportAccess, BASE } from "./access";
import { entryAllowed, findEntry } from "./catalogue";
import { filterWords, readFilters, type Raw } from "./filters";
import type { Cell, ColKind, ReportEntry, ReportFilters, ReportViewer, Row, RunCtx, Table } from "./types";

/** Files bigger than this are made in the background (as every export, lib/exports.ts). */
export const BACKGROUND_ROWS = 2000;
/** Rows shown on screen; the file has every row. */
export const SHOW_ROWS = 25;

export class ReportProblem extends Error {}

/** A cell as the screen and files show it. */
export function cellText(c: Cell | undefined, kind: ColKind | undefined): string {
  if (c === null || c === undefined || c === "") return "";
  if (c instanceof Date) return formatDate(c, "UTC");
  if (typeof c === "bigint") return formatRupees(c);
  if (typeof c === "number") {
    if (kind === "money") return formatRupees(BigInt(Math.round(c)));
    if (kind === "percent") return `${Math.round(c * 10) / 10}%`;
    return c.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  }
  return String(c);
}

/** A number to sort by: bigints, numbers, dates, and words like "92.5%" or "₹1,200". */
function sortValue(c: Cell | undefined): number | string {
  if (c === null || c === undefined) return Number.NEGATIVE_INFINITY;
  if (typeof c === "bigint") return Number(c);
  if (typeof c === "number") return c;
  if (c instanceof Date) return c.getTime();
  const m = /^[−-]?₹?\s?[\d,]+(\.\d+)?\s?%?$/.exec(c.trim());
  if (m) return Number(c.replace(/[₹,%\s]/g, "").replace("−", "-"));
  return c.toLowerCase();
}

export function sortRows(t: Table, sort: string | null, dir: "asc" | "desc"): Table {
  if (!sort || !t.columns.some((c) => c.key === sort)) return t;
  const sign = dir === "desc" ? -1 : 1;
  const rows = [...t.rows].sort((a, b) => {
    const x = sortValue(a[sort]), y = sortValue(b[sort]);
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
    return String(x).localeCompare(String(y), "en-IN", { numeric: true }) * sign;
  });
  return { ...t, rows };
}

/** The person's own sections this year, for own reach; null for the whole school. */
export async function reachSections(tx: Tx, ctx: SchoolContext, own: boolean, yearId: string | null) {
  if (!own) return null;
  return yearId ? ownSectionIds(tx, ctx, yearId) : [];
}

/** Runs one report for one person. Refuses a report the person may not see. */
export async function runEntry(tx: Tx, who: ReportViewer, entry: ReportEntry, f: ReportFilters): Promise<Table> {
  const a = reportAccess(who);
  if (!entryAllowed(entry, a, who)) throw new ReportProblem(`“${entry.name}” is not open to your role.`);
  const sections = await reachSections(tx, who.ctx, a.own, f.year?.id ?? null);
  if (a.own && f.sectionId && !sections?.includes(f.sectionId)) throw new ReportProblem("You can see reports for your own classes only.");
  const cache = new Map<string, Promise<unknown>>();
  const rc: RunCtx = {
    tx, ctx: who.ctx, who, f, tz: who.school.timeZone, sections,
    memo: <T,>(key: string, fn: () => Promise<T>) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key) as Promise<T>; },
  };
  const t = await entry.run(rc);
  return sortRows(t, f.sort, f.dir);
}

/** Class, section and campus names for the words printed with a report. */
export async function filterNames(tx: Tx, f: ReportFilters, own: boolean) {
  const [cls, sec, campus, campuses] = await Promise.all([
    f.classId ? tx.schoolClass.findFirst({ where: { id: f.classId }, select: { name: true } }) : null,
    f.sectionId ? tx.section.findFirst({ where: { id: f.sectionId }, include: { schoolClass: { select: { name: true } } } }) : null,
    f.campusId ? tx.campus.findFirst({ where: { id: f.campusId }, select: { name: true } }) : null,
    tx.campus.count({ where: { archivedAt: null } }),
  ]);
  const clsWords = sec ? `Class ${sec.schoolClass.name.replace(/^class\s+/i, "")} ${sec.name}` : cls ? cls.name : own ? "My classes" : "All classes";
  return { cls: clsWords, campus: campus?.name ?? (campuses > 1 ? "All" : null) };
}

/** The words for a run: "Class 5 · This month (01-10-2026 to 15-10-2026) · Main campus". */
export async function runWords(tx: Tx, entry: ReportEntry, f: ReportFilters, own: boolean, options: { label: string; value: string; options: { value: string; label: string }[] }[] = []) {
  const names = await filterNames(tx, f, own);
  const extra = options.map((o) => { const v = o.options.find((x) => x.value === o.value); return v && v.value ? `${o.label}: ${v.label}` : null; }).filter((x): x is string => Boolean(x));
  return filterWords(f, entry, { ...names, extra });
}

/** One report as a file, with its total line, the school name, the filters, who and when on top. */
export async function reportFile(t: Table, entry: ReportEntry, format: ExportFormat, meta: { schoolName: string; exportedBy: string; timeZone: string; filters: string }) {
  const rows: Row[] = t.totals ? [...t.rows, t.totals] : t.rows;
  const columns: ExportColumn<Row>[] = t.columns.map((c) => ({ label: c.label, value: (r) => cellText(r[c.key], c.kind) }));
  return buildExport(format, columns, rows, { title: entry.name, ...meta, filters: meta.filters + (t.note ? ` · ${t.note}` : "") });
}

/** Builds the person who asked from their login, for background work and schedules (they may have lost access since). */
export async function viewerOf(tx: Tx, userId: string, schoolId: string): Promise<ReportViewer | null> {
  const view = await accessIn(userId, schoolId);
  if (!view) return null;
  const user = await tx.userLogin.findUnique({ where: { id: userId }, select: { id: true, displayName: true, archivedAt: true } });
  if (!user || user.archivedAt) return null;
  return { ...view, ctx: { schoolId, userId }, user: { id: user.id, displayName: user.displayName } } as ReportViewer;
}

/** Asks for a heavy report to be prepared in the background. The same filters asked twice the same minute run once. */
export async function prepareReport(tx: Tx, who: ReportViewer, entry: ReportEntry, params: Record<string, string>, words: string, format: ExportFormat = "xlsx") {
  const a = reportAccess(who);
  if (!entryAllowed(entry, a, who)) throw new ReportProblem(`“${entry.name}” is not open to your role.`);
  const run = await tx.reportRun.create({ data: { schoolId: who.ctx.schoolId, userId: who.user.id, key: entry.key, title: entry.name, params, filters: words, format } });
  await enqueue(tx, who.ctx, "reports:run", `reports:run:${run.id}`, { runId: run.id });
  return run;
}

/** The background run: re-reads the person's access, makes the file, keeps it and notifies them with the link. */
export async function makeRun(tx: Tx, ctx: SchoolContext, runId: string) {
  const run = await tx.reportRun.findUnique({ where: { id: runId } });
  if (!run || run.status !== "QUEUED") return { skipped: true };
  const entry = findEntry(run.key);
  const who = await viewerOf(tx, run.userId, ctx.schoolId);
  const fail = async (problem: string) => {
    await tx.reportRun.update({ where: { id: run.id }, data: { status: "FAILED", problem } });
    await notify(tx, { ...ctx, userId: null }, { to: run.userId, type: "report-failed", text: `${run.title} could not be prepared: ${problem}`, link: BASE });
    return { failed: problem };
  };
  if (!entry || !who) return fail("your role no longer allows this report.");
  const a = reportAccess(who);
  if (!entryAllowed(entry, a, who)) return fail("your role no longer allows this report.");
  const setup = await periodSetup(who as unknown as Current);
  const today = todayIn(who.school.timeZone);
  const f = await readFilters(tx, who.ctx, entry, run.params as Raw, setup, today, who.campusId ?? null);
  const t = await runEntry(tx, who, entry, f);
  const format = (["csv", "xlsx", "pdf"].includes(run.format) ? run.format : "xlsx") as ExportFormat;
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true } });
  const file = await reportFile(t, entry, format, { schoolName: school.name, exportedBy: who.user.displayName, timeZone: who.school.timeZone, filters: run.filters });
  const id = randomUUID();
  const key = `${ctx.schoolId}/reports/${id}`;
  await fileStore().put(key, file.body, file.type);
  await tx.storedFile.create({ data: { id, schoolId: ctx.schoolId, storageKey: key, fileName: file.name, contentType: file.type, sizeBytes: file.body.length, purpose: "report", uploadedById: run.userId } });
  await tx.reportRun.update({ where: { id: run.id }, data: { status: "READY", rows: t.rows.length, fileId: id, readyAt: new Date() } });
  await logExport(tx, { schoolId: ctx.schoolId, userId: run.userId }, { title: run.title, format, filters: run.filters, rows: t.rows.length });
  await notify(tx, { ...ctx, userId: null }, { to: run.userId, type: "report-ready", text: `Report ready: ${run.title} (${t.rows.length.toLocaleString("en-IN")} rows). Tap to download.`, link: `${BASE}/runs/${run.id}` });
  return { rows: t.rows.length, fileId: id };
}

defineJob("reports:run", "Report prepared in the background", async (tx, ctx, payload) => {
  const r = await makeRun(tx, ctx, String(payload.runId ?? ""));
  return r;
}, { ownTransaction: true });
