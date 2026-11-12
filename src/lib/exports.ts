// Every list and report exports to Excel, CSV and PDF with the filters on
// screen (00-global.md P8). The file says the school, the filters, who
// exported it and when. Only fields the person may see are included, because
// callers pass only those columns. Every export is written to the export log.
import "server-only";

import ExcelJS from "exceljs";
import type { SchoolContext, Tx } from "./db";
import { writeAudit } from "./audit";
import { formatDateTime } from "./format";
import { esc, FALLBACK_CSP, htmlToPdf, PdfUnavailableError, pdfFallbackPage } from "./pdf";

export type ExportColumn<Row> = { label: string; value: (row: Row) => string | number | null | undefined };
export type ExportFormat = "csv" | "xlsx" | "pdf";

export type ExportMeta = { title: string; schoolName: string; filters: string; exportedBy: string; timeZone: string };

function csvCell(v: unknown) {
  const s = String(v ?? "");
  // Stops spreadsheet programs running a cell as a formula.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<Row>(columns: ExportColumn<Row>[], rows: Row[], meta: ExportMeta) {
  const lines = [
    csvCell(`${meta.schoolName}: ${meta.title}`),
    csvCell(`Filters: ${meta.filters || "none"}`),
    csvCell(`Exported by ${meta.exportedBy} on ${formatDateTime(new Date(), meta.timeZone)}`),
    "",
    columns.map((c) => csvCell(c.label)).join(","),
    ...rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(",")),
  ];
  return Buffer.from("﻿" + lines.join("\r\n"), "utf8");
}

/** What a column holds in Excel: kept as text, or numbers with a format that looks like the screen. */
type CellKind = { kind: "text" } | { kind: "number" | "money" | "percent"; format: string };

/** Columns that hold numbers which are names, not amounts: never added up, and "0042" must keep its zeros. */
const ID_LABEL = /phone|mobile|whatsapp|aadhaar|aadhar|pin ?code|pincode|account|ifsc|isbn|accession|card|code|\b(no|number|id)\.?$/i;
const PLAIN = /^[-−]?(?:0|[1-9]\d{0,2}(?:,\d{2,3})+|[1-9]\d{0,8})(?:\.\d+)?$/;
const MONEY = /^([-−]?)₹\s?([-−]?)((?:\d{1,3}(?:,\d{2,3})*|\d+)(?:\.\d+)?)$/;
const PERCENT = /^([-−]?\d+(?:\.\d+)?)\s?%$/;
/** Shown for "nothing" in some columns; left as it is, and does not stop the rest being numbers. */
const BLANK = /^(?:|-|–|—|n\/a)$/i;

/** ₹ with Indian grouping (₹1,23,456): Excel's own grouping is in threes, so lakhs and crores get their own sections. */
const rupeeFormat = (paise: boolean) => {
  const d = paise ? ".00" : "";
  return `[>=10000000]"₹"##\\,##\\,##\\,##0${d};[>=100000]"₹"##\\,##\\,##0${d};"₹"#,##0${d}`;
};

const decimals = (s: string) => (s.includes(".") ? s.split(".")[1].length : 0);

/**
 * Reads a column's cells as numbers when every filled cell is one (layman tests LE5, LC11:
 * "55", "₹14,300" and "87.5%" were text, so SUM gave 0 and sorting was wrong). Money becomes
 * rupees with a ₹ format, a percentage a fraction with a % format, so the file looks as before.
 */
export function cellKind(label: string, cells: unknown[]): CellKind {
  if (ID_LABEL.test(label.trim())) return { kind: "text" };
  const filled = cells.filter((c) => !(typeof c === "string" && BLANK.test(c.trim())) && c !== null && c !== undefined);
  if (!filled.length || filled.some((c) => typeof c !== "string" && typeof c !== "number")) return { kind: "text" };
  const texts = filled.map((c) => String(c).trim());
  if (texts.every((t) => MONEY.test(t))) {
    return { kind: "money", format: rupeeFormat(texts.some((t) => decimals(t) > 0)) };
  }
  if (texts.every((t) => PERCENT.test(t))) {
    const d = Math.min(2, Math.max(0, ...texts.map((t) => decimals(t.replace(/\s?%$/, "")))));
    return { kind: "percent", format: d ? `0.${"0".repeat(d)}%` : "0%" };
  }
  if (filled.every((c) => typeof c === "number" || PLAIN.test(String(c).trim()))) {
    const grouped = texts.some((t) => t.includes(","));
    const d = Math.min(4, Math.max(0, ...texts.map(decimals)));
    return { kind: "number", format: grouped ? `#,##0${d ? `.${"0".repeat(d)}` : ""}` : "General" };
  }
  return { kind: "text" };
}

/** One cell in a column of `kind`: a number where it reads as one, else the text as it was. */
export function cellValue(kind: CellKind, v: unknown): string | number {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || kind.kind === "text") return typeof v === "number" ? v : String(v);
  const t = String(v).trim();
  if (kind.kind === "money") {
    const m = MONEY.exec(t);
    return m ? Number(`${m[1] || m[2] ? "-" : ""}${m[3].replace(/,/g, "")}`) : String(v);
  }
  if (kind.kind === "percent") {
    const m = PERCENT.exec(t);
    return m ? Number(m[1].replace("−", "-")) / 100 : String(v);
  }
  return PLAIN.test(t) ? Number(t.replace(/,/g, "").replace("−", "-")) : String(v);
}

export async function toXlsx<Row>(columns: ExportColumn<Row>[], rows: Row[], meta: ExportMeta) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "School OS";
  const ws = wb.addWorksheet(meta.title.replace(/[*?:\\/[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Export");
  ws.addRow([`${meta.schoolName}: ${meta.title}`]).font = { bold: true, size: 13 };
  ws.addRow([`Filters: ${meta.filters || "none"}`]);
  ws.addRow([`Exported by ${meta.exportedBy} on ${formatDateTime(new Date(), meta.timeZone)}`]);
  ws.addRow([]);
  const header = ws.addRow(columns.map((c) => c.label));
  header.font = { bold: true };
  header.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EFFF" } }; });
  const values = columns.map((c) => rows.map((r) => c.value(r)));
  const kinds = columns.map((c, i) => cellKind(c.label, values[i]));
  rows.forEach((_, r) => {
    const row = ws.addRow(columns.map((_, i) => cellValue(kinds[i], values[i][r])));
    kinds.forEach((k, i) => {
      if (k.kind === "text" || k.format === "General") return;
      const cell = row.getCell(i + 1);
      if (typeof cell.value === "number") cell.numFmt = k.format;
    });
  });
  columns.forEach((c, i) => {
    const longest = Math.max(c.label.length, ...values[i].slice(0, 500).map((v) => String(v ?? "").length));
    const col = ws.getColumn(i + 1);
    col.width = Math.min(50, Math.max(10, longest + 2));
    if (kinds[i].kind !== "text") header.getCell(i + 1).alignment = { horizontal: "right" };
  });
  ws.views = [{ state: "frozen", ySplit: 5 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function listHtml<Row>(columns: ExportColumn<Row>[], rows: Row[], meta: ExportMeta) {
  // An ID, number or phone stays on one line ("SPS-ST-021" broke after "SPS-ST-" in every row, layman test LD12).
  const idCol = columns.map((c) => ID_LABEL.test(c.label));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,"Noto Sans",sans-serif;font-size:10pt;color:#111}
    h1{font-size:14pt;margin:0}.meta{color:#444;margin:4px 0 12px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}
    th{background:#eef2ff}tr:nth-child(even) td{background:#fafafa}td.id{white-space:nowrap}
  </style></head><body>
  <h1>${esc(meta.schoolName)}: ${esc(meta.title)}</h1>
  <p class="meta">Filters: ${esc(meta.filters || "none")} · Exported by ${esc(meta.exportedBy)} on ${esc(formatDateTime(new Date(), meta.timeZone))} · ${rows.length} rows</p>
  <table><thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${columns.map((c, i) => `<td${idCol[i] ? ' class="id"' : ""}>${esc(c.value(r))}</td>`).join("")}</tr>`).join("")}</tbody></table>
  </body></html>`;
}

export async function buildExport<Row>(format: ExportFormat, columns: ExportColumn<Row>[], rows: Row[], meta: ExportMeta) {
  const base = `${meta.title}`.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "export";
  if (format === "csv") return { body: toCsv(columns, rows, meta), type: "text/csv; charset=utf-8", name: `${base}.csv` };
  if (format === "xlsx") return { body: await toXlsx(columns, rows, meta), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name: `${base}.xlsx` };
  const html = listHtml(columns, rows, meta);
  try {
    return { body: await htmlToPdf(html, { landscape: columns.length > 6 }), type: "application/pdf", name: `${base}.pdf` };
  } catch (e) {
    // No PDF could be made: the list opens as a printable page instead (Print, then "Save as PDF").
    if (e instanceof PdfUnavailableError) return { body: Buffer.from(pdfFallbackPage(html)), type: "text/html; charset=utf-8", name: `${base}.html` };
    throw e;
  }
}

/** The export log (Settings, Data Backup & Security) is the audit log's "exported" lines. */
export async function logExport(tx: Tx, ctx: SchoolContext, what: { title: string; format: ExportFormat; filters: string; rows: number }) {
  // DREAM TEAM support access never takes data out of the school (07-super-admin.md §3.4).
  if (ctx.support) throw new Error("DREAM TEAM support access cannot export, print or download the school’s data.");
  await writeAudit(tx, ctx, { action: "exported", recordType: "Export", recordId: null, after: what });
}

export function exportResponse(file: { body: Buffer; type: string; name: string }) {
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.type,
      "Content-Disposition": `${file.type.startsWith("text/html") ? "inline" : "attachment"}; filename="${file.name}"`,
      "Cache-Control": "no-store",
      // The printable list holds school-typed text: nothing in it may run as script.
      ...(file.type.startsWith("text/html") ? { "Content-Security-Policy": FALLBACK_CSP, "X-Content-Type-Options": "nosniff" } : {}),
    },
  });
}
