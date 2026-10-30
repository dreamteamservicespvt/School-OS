// Renders report cards with the current source and counts PDF pages (one card should be one page).
//   SCHOOL_ID=<id> npx tsx --conditions=react-server --env-file-if-exists=.env qa/full/rc-pages.mts <sectionId> <periodKey> [studentId]
import { withSchool, prisma } from "../../src/lib/db";
import { renderReportCards } from "../../src/lib/exams/report-cards";

const [sectionId, period, studentId] = process.argv.slice(2);
const ctx = { schoolId: process.env.SCHOOL_ID!, userId: null };
const ids = studentId ? [studentId] : (await withSchool(ctx, (tx) => tx.enrolment.findMany({ where: { sectionId, archivedAt: null }, select: { studentId: true } }))).map((e) => e.studentId);
const doc = await withSchool(ctx, (tx) => renderReportCards(tx, ctx, ids.map((s) => ({ studentId: s, sectionId })), period), { timeout: 120_000 });
const pdf = (await doc.pdf()).toString("latin1");
console.log("cards", ids.length, "pages", (pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length);

await prisma.$disconnect();
process.exit(0);
