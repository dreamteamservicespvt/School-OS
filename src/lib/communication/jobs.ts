// Communication's timed work for notices and queries (src/lib/job-registry.ts imports this).
import "server-only";

import { defineJob, defineSchedule } from "../jobs";
import { syncWhatsappApprovals } from "./templates-admin";
import { expireNotices, publishNotice, PUBLISH_JOB } from "./notices";
import { escalateQueries } from "./queries";

defineJob(PUBLISH_JOB, "Publishing a notice", async (tx, ctx, payload) => {
  const { noticeId } = payload as { noticeId: string };
  const n = await tx.notice.findUnique({ where: { id: noticeId } });
  // Archived or changed before its time: nothing to do.
  if (!n || n.status !== "SCHEDULED") return { skipped: n?.status ?? "missing" };
  if (n.publishAt && n.publishAt.getTime() > Date.now() + 60_000) return { skipped: "moved later" };
  await publishNotice(tx, ctx, n.id);
  return { published: n.id };
});

defineSchedule("notice-expiry", 60, (tx, ctx, now) => expireNotices(tx, ctx, now));
defineSchedule("query-escalation", 30, (tx, ctx, now) => escalateQueries(tx, ctx, now));
// WhatsApp template approvals follow WhatsApp's own answer without anyone pressing "Check".
defineSchedule("whatsapp-approvals", 15, (tx, ctx) => syncWhatsappApprovals(tx, ctx));
