// Renders each report card of a section alone and prints its page count and content height in mm.
import { chromium } from "playwright-core";
import { withSchool, prisma } from "../../src/lib/db";
import { renderReportCards } from "../../src/lib/exams/report-cards";
const [sectionId, period] = process.argv.slice(2);
const ctx = { schoolId: process.env.SCHOOL_ID!, userId: null };
const ids = (await withSchool(ctx, (tx) => tx.enrolment.findMany({ where: { sectionId, archivedAt: null }, select: { studentId: true } }))).map((e) => e.studentId);
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const p = await b.newPage({ viewport: { width: 703, height: 1032 } });
await p.emulateMedia({ media: "print" });
for (const id of ids) {
  const doc = await withSchool(ctx, (tx) => renderReportCards(tx, ctx, [{ studentId: id, sectionId }], period), { timeout: 120_000 }).catch((e) => null);
  if (!doc) continue;
  await p.setContent(doc.html);
  const h = await p.evaluate(() => (document.querySelector(".page")!.getBoundingClientRect().height / (96 / 25.4)).toFixed(1));
  const name = await p.evaluate(() => document.querySelector(".info")?.textContent?.slice(0, 80));
  console.log(h, name);
}
await b.close(); await prisma.$disconnect(); process.exit(0);
