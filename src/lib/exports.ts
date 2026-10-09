// Every list and report exports to Excel, CSV and PDF with the filters on
// screen (00-global.md P8). The file says the school, the filters, who
// exported it and when. Only fields the person may see are included, because
// callers pass only those columns. Every export is written to the export log.
import "server-only";

import ExcelJS from "exceljs";
import type { SchoolContext, Tx } from "./db";
import { writeAudit } from "./audit";
import { formatDateTime } from "./format";
import { esc, htmlToPdf } from "./pdf";

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

export async function toXlsx<Row>(columns: ExportColumn<Row>[], rows: Row[], meta: ExportMeta) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "School OS";
  const ws = wb.addWorksheet(meta.title.slice(0, 31) || "Export");
  ws.addRow([`${meta.schoolName}: ${meta.title}`]).font = { bold: true, size: 13 };
  ws.addRow([`Filters: ${meta.filters || "none"}`]);
  ws.addRow([`Exported by ${meta.exportedBy} on ${formatDateTime(new Date(), meta.timeZone)}`]);
  ws.addRow([]);
  const header = ws.addRow(columns.map((c) => c.label));
  header.font = { bold: true };
  header.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EFFF" } }; });
  for (const r of rows) ws.addRow(columns.map((c) => c.value(r) ?? ""));
  columns.forEach((c, i) => {
    const longest = Math.max(c.label.length, ...rows.slice(0, 500).map((r) => String(c.value(r) ?? "").length));
    ws.getColumn(i + 1).width = Math.min(50, Math.max(10, longest + 2));
  });
  ws.views = [{ state: "frozen", ySplit: 5 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function listHtml<Row>(columns: ExportColumn<Row>[], rows: Row[], meta: ExportMeta) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,"Noto Sans",sans-serif;font-size:10pt;color:#111}
    h1{font-size:14pt;margin:0}.meta{color:#444;margin:4px 0 12px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}
    th{background:#eef2ff}tr:nth-child(even) td{background:#fafafa}
  </style></head><body>
  <h1>${esc(meta.schoolName)}: ${esc(meta.title)}</h1>
  <p class="meta">Filters: ${esc(meta.filters || "none")} · Exported by ${esc(meta.exportedBy)} on ${esc(formatDateTime(new Date(), meta.timeZone))} · ${rows.length} rows</p>
  <table><thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(c.value(r))}</td>`).join("")}</tr>`).join("")}</tbody></table>
  </body></html>`;
}

export async function buildExport<Row>(format: ExportFormat, columns: ExportColumn<Row>[], rows: Row[], meta: ExportMeta) {
  const base = `${meta.title}`.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "export";
  if (format === "csv") return { body: toCsv(columns, rows, meta), type: "text/csv; charset=utf-8", name: `${base}.csv` };
  if (format === "xlsx") return { body: await toXlsx(columns, rows, meta), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name: `${base}.xlsx` };
  return { body: await htmlToPdf(listHtml(columns, rows, meta), { landscape: columns.length > 6 }), type: "application/pdf", name: `${base}.pdf` };
}

/** The export log (Settings, Data Backup & Security) is the audit log's "exported" lines. */
export async function logExport(tx: Tx, ctx: SchoolContext, what: { title: string; format: ExportFormat; filters: string; rows: number }) {
  await writeAudit(tx, ctx, { action: "exported", recordType: "Export", recordId: null, after: what });
}

export function exportResponse(file: { body: Buffer; type: string; name: string }) {
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.type,
      "Content-Disposition": `attachment; filename="${file.name}"`,
      "Cache-Control": "no-store",
    },
  });
}
