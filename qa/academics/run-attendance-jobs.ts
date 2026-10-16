// Runs the due "attendance-after-save" jobs of ONE school (no worker runs in the QA
// environment, and running the full worker would touch every school's queue).
//   npx tsx --conditions=react-server --env-file=.env qa/academics/run-attendance-jobs.ts <school id>
import "../../src/lib/job-registry";
import { prisma, withSchool } from "../../src/lib/db";
import { afterAttendanceSaved } from "../../src/lib/attendance/alerts";

const schoolId = process.argv[2];
if (!schoolId) throw new Error("give the school id");
const ctx = { schoolId, userId: null };
const due = await withSchool(ctx, (tx) => tx.backgroundJob.findMany({ where: { kind: "attendance-after-save", status: "queued", runAfter: { lte: new Date() } } }));
for (const job of due) {
  const p = job.payload as { sectionId: string; date: string };
  const result = await withSchool(ctx, (tx) => afterAttendanceSaved(tx, ctx, { sectionId: String(p.sectionId), date: String(p.date) }));
  await withSchool(ctx, (tx) => tx.backgroundJob.update({ where: { id: job.id }, data: { status: "done", finishedAt: new Date(), result: (result ?? undefined) as never } }));
  console.log(JSON.stringify({ job: job.id, result }));
}
console.log(`ran ${due.length} job(s)`);
await prisma.$disconnect();
