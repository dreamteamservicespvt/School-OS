// What Parent Link would show a guardian (no channel is connected, so no link can be sent and
// the browser view is blocked): the report cards ready for each child.
//   npx tsx --conditions=react-server --env-file=.env qa/academics/parent-cards.ts <schoolId> <studentId>...
import { prisma, withSchool } from "../../src/lib/db";
import { parentReportCards } from "../../src/lib/exams/parent-link";

const [schoolId, ...students] = process.argv.slice(2);
const ctx = { schoolId, userId: null };
for (const id of students) {
  const out = await withSchool(ctx, async (tx) => {
    const cards = await parentReportCards(tx, ctx, [id]);
    return { cards };
  }, { timeout: 120_000 } as never);
  console.log(JSON.stringify({ studentId: id, ...out }));
}
await prisma.$disconnect();
