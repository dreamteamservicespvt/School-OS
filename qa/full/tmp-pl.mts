import { withSchool, prisma } from "../../src/lib/db";
import { guardianIdsIn } from "../../src/lib/communication/parent-link-admin";
import { guardiansWithoutLinks } from "../../src/lib/parent-link/links";
const ctx = { schoolId: "2f2c0764-dd19-4441-829d-93e0adb03a4b", userId: null };
for (const campusId of [null, "30e164bc-c700-446a-abce-93d956b6862c"]) {
  const r = await withSchool(ctx, async (tx) => { const all = await guardianIdsIn(tx, ctx, { sectionIds: ["544feaae-37ed-4756-aad5-a4f6dcb857f8"], campusId }); const todo = await guardiansWithoutLinks(tx, ctx, all); return [all.length, todo.length]; });
  console.log(campusId, r);
}
await prisma.$disconnect(); process.exit(0);
