// Inventory Management's follow-ups: what happens when the approver decides a
// purchase request or order, a stock transfer, a stock audit's differences or
// an asset disposal (Approvals), where each request opens, and Undo for an
// issue just made at the desk (P5). Imported by src/lib/approval-handlers.ts
// and src/lib/undo-handlers.ts.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { onDecision } from "../approvals";
import { registerApprovalLink } from "../approval-links";
import { registerUndo } from "../undo";
import { withSchool } from "../db";
import { writeAudit } from "../audit";
import { requirePermission } from "../permissions";
import { todayIn } from "../staff/dates";
import { removeDue } from "../fees/structure";
import { decideRequest, decideOrder } from "./purchases";
import { decideTransfer, move } from "./stock";
import { decideAudit } from "./audits";
import { decideDisposal } from "./assets";
import { invCan, invViewer } from "./access";
import { InventoryProblem } from "./problem";
import { BASE } from "./words";

async function today(tx: Tx, ctx: SchoolContext) {
  const s = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  return todayIn(s?.timeZone ?? "Asia/Kolkata");
}

onDecision("purchase", async (tx, ctx, approval, decision, note) => {
  if (approval.recordType === "Purchase Order") await decideOrder(tx, ctx, approval.recordId, decision, note);
  else await decideRequest(tx, ctx, approval.recordId, decision, note);
});

onDecision("stock-transfer", async (tx, ctx, approval, decision, note) => {
  await decideTransfer(tx, ctx, approval.recordId, decision, note, await today(tx, ctx));
});

onDecision("stock-audit", async (tx, ctx, approval, decision, note) => {
  await decideAudit(tx, ctx, approval.recordId, decision, note, await today(tx, ctx));
});

onDecision("asset-disposal", async (tx, ctx, approval, decision, note) => {
  await decideDisposal(tx, ctx, approval.recordId, decision, note);
});

registerApprovalLink("purchase", (a) =>
  a.recordType === "Purchase Order"
    ? { href: `${BASE}/purchases/orders/${a.recordId}`, label: "Open the purchase order" }
    : { href: `${BASE}/purchases?tab=requests&request=${a.recordId}`, label: "Open the purchase request" },
);
registerApprovalLink("stock-transfer", () => ({ href: `${BASE}/items?view=movements&kind=TRANSFER`, label: "Open stock movements" }));
registerApprovalLink("stock-audit", (a) => ({ href: `${BASE}/items/audits/${a.recordId}`, label: "Open the stock audit" }));
registerApprovalLink("asset-disposal", (a) => ({ href: `${BASE}/assets?disposal=${a.recordId}`, label: "Open the asset" }));

const RECENT_MS = 2 * 60_000;

/** Undo an issue just made: the stock goes back and a store charge not yet paid is removed. */
registerUndo("inv-issue", async (current, id) => {
  requirePermission(current.permissions, "inventory-management", "edit");
  if (!invCan(invViewer(current)).issue) throw new InventoryProblem("Your role cannot issue stock.");
  await withSchool(current.ctx, async (tx) => {
    const issue = await tx.stockIssue.findFirst({ where: { id }, include: { lines: true } });
    if (!issue || issue.createdById !== current.user.id || Date.now() - issue.createdAt.getTime() > RECENT_MS) throw new InventoryProblem("This issue can no longer be undone.");
    if (issue.lines.some((l) => l.returnedQty > 0)) throw new InventoryProblem("Part of this issue is already back. Record the other returns instead.");
    const day = await today(tx, current.ctx);
    if (issue.feeDueId) await removeDue(tx, current.ctx, issue.feeDueId, `Store issue ${issue.number} undone`);
    for (const l of issue.lines) {
      await move(tx, current.ctx, { itemId: l.itemId, locationId: issue.locationId, kind: "RETURN", qty: l.qty, date: issue.date, reference: `${issue.number} undone`, reason: "Issue undone at the desk", issueId: issue.id, today: day });
      await tx.stockIssueLine.update({ where: { id: l.id }, data: { returnedQty: l.qty } });
    }
    await tx.stockIssue.update({ where: { id: issue.id }, data: { note: [issue.note, "Undone at the desk"].filter(Boolean).join(". "), chargePaise: BigInt(0), feeDueId: null, missing: [] } });
    await writeAudit(tx, current.ctx, { action: "issue-undone", recordType: "Stock Issue", recordId: issue.id, after: { number: issue.number } });
  });
});
