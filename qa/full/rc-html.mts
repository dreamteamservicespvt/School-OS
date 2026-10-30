// Writes the HTML of one report card to qa-output/full/rc.html and measures its pages in Chrome.
//   npx tsx qa/full/rc-html.mts <sectionId> <periodKey> <studentId>
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { withSchool, prisma } from "../../src/lib/db";
import { renderReportCards } from "../../src/lib/exams/report-cards";
const [sectionId, period, studentId] = process.argv.slice(2);
const sec = [{ school_id: process.env.SCHOOL_ID! }];
const ctx = { schoolId: sec[0].school_id, userId: null };
const doc = await withSchool(ctx, (tx) => renderReportCards(tx, ctx, [{ studentId, sectionId }], period), { timeout: 120_000 });
writeFileSync("qa-output/full/rc.html", doc.html);
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const p = await b.newPage({ viewport: { width: 703, height: 1032 } });
await p.emulateMedia({ media: "print" });
await p.setContent(doc.html);
// A4 at 96 dpi minus 12 mm margins on both sides: 297 - 24 = 273 mm.
const mm = 96 / 25.4;
console.log(JSON.stringify(await p.evaluate((mm) => {
  const page = document.querySelector(".page")!;
  const kids = [...page.children].map((k) => { const r = k.getBoundingClientRect(); return `${k.tagName}.${k.className} top=${(r.top / mm).toFixed(1)} h=${(r.height / mm).toFixed(1)}`; });
  return { pageH: (page.getBoundingClientRect().height / mm).toFixed(1), kids };
}, mm), null, 1));
await b.close();
await prisma.$disconnect();
