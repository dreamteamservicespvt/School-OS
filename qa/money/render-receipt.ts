// QA harness: renders one School A receipt with the worktree's code (to check a template fix without a server).
//   npx tsx --conditions=react-server --env-file=.env qa/money/render-receipt.ts <paymentId> <out.pdf>
import { writeFileSync } from "node:fs";
import { prisma, withSchool } from "../../src/lib/db";
import { renderReceipt } from "../../src/lib/fees/documents";

const ctx = { schoolId: "fbe1c0d0-cc45-4512-908c-70436e3fd47f", userId: null };
const [paymentId, out] = process.argv.slice(2);
const doc = await withSchool(ctx, (tx) => renderReceipt(tx, ctx, paymentId, "office"), { timeout: 60_000 });
writeFileSync(out, await doc.pdf());
console.log("written", out);
await prisma.$disconnect();
process.exit(0);
