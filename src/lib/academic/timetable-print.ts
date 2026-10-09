// Printable Time Tables (04 §2, Done when 9): one clean page per class,
// teacher or room, with the legend and the date generated. Browser print
// (P9) and the same page as a PDF.
import "server-only";

import type { PeriodSlot } from "@prisma/client";
import { esc } from "../pdf";
import { DAY_NAMES, time12 } from "./common";
import type { PeriodCell } from "./timetable";

export type PrintPage = { title: string; subtitle: string; cells: PeriodCell[]; mode: "class" | "teacher" | "room" };

export function timetableHtml(pages: PrintPage[], meta: { schoolName: string; generated: string; slots: PeriodSlot[]; days: number[]; withPrintButton: boolean; pdfHref?: string }) {
  const { slots, days } = meta;
  const body = pages.map((p) => {
    const at = new Map<string, PeriodCell>();
    for (const c of p.cells) at.set(`${c.dayOfWeek}:${c.periodNo}`, c);
    const rows = slots.map((s) => {
      const head = `<th class="slot"><b>${esc(s.label)}</b><br><span>${esc(time12(s.startTime))} to ${esc(time12(s.endTime))}</span></th>`;
      const anyTeaching = days.some((d) => { const c = at.get(`${d}:${s.number}`); return c && !c.isBreak; });
      if (s.isBreak && !anyTeaching && p.mode !== "room") return `<tr>${head}<td class="break" colspan="${days.length}">${esc(s.label)}</td></tr>`;
      return `<tr>${head}${days.map((d) => {
        if (!s.days.includes(d)) return `<td class="none"></td>`;
        const c = at.get(`${d}:${s.number}`);
        if (!c) return `<td class="free"></td>`;
        if (c.isBreak) return `<td class="break">${esc(c.label ?? "Break")}</td>`;
        const second = p.mode === "class" ? c.staffName ?? "" : c.sectionLabel;
        const cls = c.subjectId ? "teach" : "fixed";
        return `<td class="${cls}"><b>${esc(c.subjectName ?? c.label ?? "")}</b><br><span>${esc(second)}${c.room && p.mode !== "room" ? ` · ${esc(c.room)}` : ""}</span></td>`;
      }).join("")}</tr>`;
    }).join("");
    return `<section class="page">
      <header><h1>${esc(p.title)}</h1><p>${esc(meta.schoolName)} · ${esc(p.subtitle)}</p></header>
      <table><thead><tr><th class="slot">Period</th>${days.map((d) => `<th>${esc(DAY_NAMES[d])}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
      <footer>
        <span class="legend"><i class="teach"></i>Teaching <i class="break"></i>Lunch or break <i class="fixed"></i>Fixed or assembly</span>
        <span>Generated on ${esc(meta.generated)}</span>
      </footer>
    </section>`;
  }).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(pages.length === 1 ? pages[0].title : `${pages.length} Time Tables`)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, "Noto Sans", sans-serif; color: #111; background: #fff; margin: 0; font-size: 10pt; }
    .bar { position: sticky; top: 0; display: flex; gap: 8px; align-items: center; padding: 10px 16px; background: #f3f4f6; border-bottom: 1px solid #ddd; flex-wrap: wrap; }
    .bar button, .bar a { font: inherit; font-size: 15px; min-height: 44px; padding: 0 16px; border-radius: 8px; border: 1px solid #999; background: #fff; color: #111; text-decoration: none; display: inline-flex; align-items: center; cursor: pointer; }
    .bar button { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
    .page { padding: 16px; page-break-after: always; break-after: page; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    header h1 { font-size: 16pt; margin: 0; }
    header p { margin: 2px 0 10px; color: #444; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #999; padding: 4px 6px; vertical-align: top; text-align: left; }
    thead th { background: #eef2ff; }
    th.slot { width: 110px; font-weight: normal; background: #fafafa; }
    th.slot span, td span { color: #444; font-size: 8.5pt; }
    td.break { background: #e5e7eb; text-align: center; font-weight: bold; color: #333; }
    td.teach { background: #fff; }
    td.fixed { background: #fef3c7; }
    td.none { background: repeating-linear-gradient(45deg, #fff, #fff 4px, #f3f4f6 4px, #f3f4f6 8px); }
    footer { display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; color: #444; font-size: 8.5pt; flex-wrap: wrap; }
    .legend i { display: inline-block; width: 10px; height: 10px; border: 1px solid #999; margin: 0 4px 0 10px; vertical-align: middle; }
    .legend i:first-child { margin-left: 0; }
    .legend i.teach { background: #fff; } .legend i.break { background: #e5e7eb; } .legend i.fixed { background: #fef3c7; }
    @media print { .bar { display: none; } .page { padding: 0; } }
    @media (max-width: 700px) { .page { overflow-x: auto; } table { min-width: 640px; } }
  </style></head><body>
  ${meta.withPrintButton ? `<div class="bar"><button type="button" onclick="window.print()">Print</button>${meta.pdfHref ? `<a href="${esc(meta.pdfHref)}" download>Download PDF</a>` : ""}<span>${pages.length === 1 ? "One page" : `${pages.length} pages, one for each`}.</span></div>` : ""}
  ${body || `<p style="padding:16px">Nothing to print. Choose a class, teacher or room.</p>`}
  </body></html>`;
}
