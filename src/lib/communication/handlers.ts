// What happens to a notice when its approval is decided (00-global.md §3.4),
// and where the request opens. Listed in src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { writeAudit } from "../audit";
import { goLive } from "./notices";

export const followUps = {
  notice: async (tx, ctx, approval, decision, note) => {
    const notice = await tx.notice.findUnique({ where: { id: approval.recordId } });
    if (!notice || notice.status !== "WAITING_APPROVAL") return;
    if (decision === "approve") {
      await goLive(tx, ctx, notice.id);
      return;
    }
    // Rejected, sent back or withdrawn: the notice goes back to Draft to be changed.
    await tx.notice.update({ where: { id: notice.id }, data: { status: "DRAFT", approvalId: null } });
    await writeAudit(tx, ctx, { action: decision === "withdraw" ? "approval-withdrawn" : "sent-back", recordType: "Notice", recordId: notice.id, before: { status: "WAITING_APPROVAL" }, after: { status: "DRAFT", note } });
  },
} satisfies Partial<Record<AskableType, FollowUp>>;

export const approvalLinks = {
  notice: (a) => ({ href: `/communication/notices/${a.recordId}`, label: "Open the notice" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
