// Printed library documents: book labels (barcode or QR, A4 sheets of 24,
// 3 across and 8 down) drawn with the shared barcode and QR makers of
// src/lib/documents, and library cards from the "Library card" design in
// Settings, Document Designs. Everything is inline so the PDF needs no
// outside request.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { renderDocument } from "../documents";
import { barcodeSvg } from "../documents/barcode";
import { qrSvg } from "../documents/qr";
import { esc } from "../pdf";
import { formatDate } from "../format";
import type { Member } from "./members";

export const LABELS_PER_SHEET = 24;

export type LabelCopy = { accessionNo: string; barcode: string; title: string; shelf: string | null };

/** A4 sheets of book labels: the school's name, the title, the code and the accession number. */
export function labelsHtml(copies: LabelCopy[], opts: { schoolName: string; labelType: string; skip?: number }) {
  const cells: string[] = [];
  for (let i = 0; i < (opts.skip ?? 0); i++) cells.push('<div class="l empty"></div>');
  for (const c of copies) {
    const code = opts.labelType === "qr" ? `<div class="qr">${qrSvg(c.barcode, "17mm")}</div>` : `<div class="bar">${barcodeSvg(c.barcode, "9mm")}</div>`;
    cells.push(`<div class="l ${opts.labelType === "qr" ? "withqr" : ""}">
      <div class="top"><span class="s">${esc(opts.schoolName)}</span>${c.shelf ? `<span class="sh">Shelf ${esc(c.shelf)}</span>` : ""}</div>
      <div class="t">${esc(c.title)}</div>
      ${code}
      <div class="a">${esc(c.accessionNo)}${opts.labelType === "rfid" ? ' <span class="rf">RFID</span>' : ""}</div>
    </div>`);
  }
  const sheets: string[] = [];
  for (let i = 0; i < cells.length; i += LABELS_PER_SHEET) sheets.push(`<section class="sheet">${cells.slice(i, i + LABELS_PER_SHEET).join("")}</section>`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Book labels</title><style>
    @page { size: A4; margin: 10mm 7mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .sheet { display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 34.6mm; gap: 0 2.5mm; break-after: page; }
    .sheet:last-child { break-after: auto; }
    .l { border: 0.2mm dashed #bbb; border-radius: 2mm; padding: 2mm 2.5mm; overflow: hidden; display: flex; flex-direction: column; gap: 0.8mm; }
    .l.empty { border-color: transparent; }
    .top { display: flex; justify-content: space-between; gap: 2mm; font-size: 6.5pt; color: #555; }
    .top .s { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .top .sh { font-weight: bold; color: #111; white-space: nowrap; }
    .t { font-size: 8pt; font-weight: bold; line-height: 1.2; max-height: 2.4em; overflow: hidden; }
    .bar svg { width: 100%; height: 9mm; display: block; }
    .qr { display: flex; justify-content: center; }
    .qr svg { width: 17mm; height: 17mm; }
    .a { font-family: "Courier New", monospace; font-size: 10pt; font-weight: bold; text-align: center; letter-spacing: 0.5px; }
    .rf { font-family: Arial, sans-serif; font-size: 6pt; border: 0.2mm solid #555; border-radius: 1mm; padding: 0 1mm; vertical-align: middle; }
  </style></head><body>${sheets.join("")}</body></html>`;
}

/** Library cards for members, from the school's "Library card" design (batches of up to 50 a file). */
export async function libraryCardsHtml(tx: Tx, ctx: SchoolContext, members: Member[], q: { validUntil: Date | null; yearName: string | null }) {
  const records = members.map((m) => ({
    fields: {
      student_name: m.name,
      admission_no: m.kind === "STUDENT" ? m.cardNo : null,
      class_section: m.kind === "STUDENT" ? m.group : m.group || "Staff",
      member_no: m.cardNo,
      valid_until: q.validUntil ? formatDate(q.validUntil, "UTC") : null,
    },
    photoFileId: m.photoFileId,
    verifyText: m.cardNo,
  }));
  const pages: string[] = [];
  for (let i = 0; i < records.length; i += 8) pages.push((await renderDocument(tx, ctx, "library-card", records.slice(i, i + 8))).html);
  if (pages.length <= 1) return pages[0] ?? "";
  const head = pages[0].slice(0, pages[0].indexOf("<body>"));
  const bodies = pages.map((p) => p.slice(p.indexOf("<body>") + 6, p.lastIndexOf("</body>")));
  return `${head}<body>${bodies.join('<div style="break-before:page;page-break-before:always"></div>')}</body></html>`;
}
