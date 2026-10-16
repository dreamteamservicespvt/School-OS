// QA harness: runs Fee Management's timed work for School A only (CEMS), as the
// background worker (scripts/worker.ts) would. The QA environment runs no worker.
//   npx tsx --conditions=react-server --env-file=.env qa/money/run-fee-schedule.ts late-fees|advance|links
import { prisma, withSchool } from "../../src/lib/db";
import { addLateFees } from "../../src/lib/fees/late-fees";
import { applyAdvance } from "../../src/lib/fees/collect";
import { expireLinks } from "../../src/lib/fees/online";
import { todayIn } from "../../src/lib/staff/dates";

const SCHOOL_A = "fbe1c0d0-cc45-4512-908c-70436e3fd47f"; // Chaitanya EM School — QA Demo
const ctx = { schoolId: SCHOOL_A, userId: null };
const school = await withSchool(ctx, (tx) => tx.school.findUniqueOrThrow({ where: { id: SCHOOL_A }, select: { timeZone: true } }));
const today = todayIn(school.timeZone);
const what = process.argv[2] ?? "late-fees";
const r = await withSchool(ctx, async (tx) => {
  if (what === "late-fees") return addLateFees(tx, ctx, today);
  if (what === "links") return expireLinks(tx, ctx);
  const holders = await tx.payment.findMany({ where: { status: "POSTED", advancePaise: { gt: 0 } }, select: { studentId: true }, distinct: ["studentId"] });
  let used = BigInt(0);
  for (const h of holders) used += await applyAdvance(tx, ctx, h.studentId, today);
  return { used: used.toString() };
}, { timeout: 300_000 });
console.log(what, JSON.stringify(r));
await prisma.$disconnect();
