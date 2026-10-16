// Printed inventory documents: the purchase order (from the school's
// "Purchase order" design in Settings, Document Designs), asset tags and item
// labels (barcode or QR, A4 sheets of 24) drawn with the shared barcode and QR
// makers. Everything is inline so the PDF needs no outside request.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { renderDocument } from "../documents";
import { barcodeSvg } from "../documents/barcode";
import { qrSvg } from "../documents/qr";
import { esc } from "../pdf";
import { formatDate } from "../format";
import { itemLabel } from "./items";
import { qtyWords } from "./words";

const day = (d: Date | null) => (d ? formatDate(d, "UTC") : "");

/** The purchase order (HTML and PDF), from the school's design. */
export async function purchaseOrderDoc(tx: Tx, ctx: SchoolContext, orderId: string) {
  const o = await tx.purchaseOrder.findFirst({ where: { id: orderId }, include: { lines: true, request: true } });
  if (!o) return null;
  const [vendor, loc, items, approver] = await Promise.all([
    tx.vendor.findFirst({ where: { id: o.vendorId } }),
    tx.storeLocation.findFirst({ where: { id: o.locationId } }),
    tx.item.findMany({ where: { id: { in: o.lines.map((l) => l.itemId) } } }),
    o.approvedById ? tx.userLogin.findFirst({ where: { id: o.approvedById }, select: { displayName: true } }) : null,
  ]);
  const rupees = (p: bigint) => `₹${(Number(p) / 100).toLocaleString("en-IN", { minimumFractionDigits: Number(p) % 100 ? 2 : 0 })}`;
  const doc = await renderDocument(tx, ctx, "purchase-order", {
    fields: {
      po_no: o.number, po_date: day(o.date), vendor_name: vendor?.name ?? "", vendor_gstin: vendor?.gstin ?? "", vendor_phone: vendor?.phone ?? "", vendor_address: vendor?.address ?? "",
      deliver_to: loc?.name ?? "", expected_on: day(o.expectedOn), request_no: o.request?.number ?? "", approved_by: approver?.displayName ?? "",
    },
    lines: o.lines.map((l) => {
      const i = items.find((x) => x.id === l.itemId)!;
      return { label: `${itemLabel(i)} (${i.code}): ${qtyWords(l.qty, i.unit)} at ${rupees(l.unitPricePaise)}`, amountPaise: l.unitPricePaise * BigInt(l.qty) };
    }),
    verifyText: o.number,
  });
  return { doc, order: o, vendor };
}

export const LABELS_PER_SHEET = 24;
export type Label = { code: string; title: string; sub: string | null };

/** A4 sheets of tags or labels: the school's name, what it is, the code as a barcode or QR, and the code. */
export function labelsHtml(labels: Label[], opts: { schoolName: string; kind: "barcode" | "qr"; title: string; skip?: number }) {
  const cells: string[] = [];
  for (let i = 0; i < (opts.skip ?? 0); i++) cells.push('<div class="l empty"></div>');
  for (const c of labels) {
    const code = opts.kind === "qr" ? `<div class="qr">${qrSvg(c.code, "17mm")}</div>` : `<div class="bar">${barcodeSvg(c.code, "9mm")}</div>`;
    cells.push(`<div class="l">
      <div class="top"><span class="s">${esc(opts.schoolName)}</span>${c.sub ? `<span class="sh">${esc(c.sub)}</span>` : ""}</div>
      <div class="t">${esc(c.title)}</div>
      ${code}
      <div class="a">${esc(c.code)}</div>
    </div>`);
  }
  const sheets: string[] = [];
  for (let i = 0; i < cells.length; i += LABELS_PER_SHEET) sheets.push(`<section class="sheet">${cells.slice(i, i + LABELS_PER_SHEET).join("")}</section>`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title)}</title><style>
    @page { size: A4; margin: 10mm 7mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .sheet { display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 34.6mm; gap: 0 2.5mm; break-after: page; }
    .sheet:last-child { break-after: auto; }
    .l { border: 0.2mm dashed #bbb; border-radius: 2mm; padding: 2mm 2.5mm; overflow: hidden; display: flex; flex-direction: column; gap: 0.8mm; }
    .l.empty { border-color: transparent; }
    .top { display: flex; justify-content: space-between; gap: 2mm; font-size: 6.5pt; color: #555; }
    .top .s { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .top .sh { font-weight: bold; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 50%; }
    .t { font-size: 8pt; font-weight: bold; line-height: 1.2; max-height: 2.4em; overflow: hidden; }
    .bar svg { width: 100%; height: 9mm; display: block; }
    .qr { display: flex; justify-content: center; }
    .qr svg { width: 17mm; height: 17mm; }
    .a { font-family: "Courier New", monospace; font-size: 10pt; font-weight: bold; text-align: center; letter-spacing: 0.5px; }
  </style></head><body>${sheets.join("")}</body></html>`;
}
