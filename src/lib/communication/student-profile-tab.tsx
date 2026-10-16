// Communication's tab on the Student Profile (03 §2, Student Profile tabs):
// messages sent to the student's guardians (and to the student), with their
// delivery status, and the notices their class sees on Parent Link.
// Registered through src/lib/students/profile-tab-modules.ts.
import "server-only";

import Link from "next/link";
import { withSchool } from "../db";
import { formatDateTime } from "../format";
import { can, reachFor } from "../permissions";
import { registerProfileTab, type ProfileTabArgs } from "../students/profile-tabs";
import { CHANNEL_LABEL, type Channel } from "../messaging/channels";
import { withHiddenLinks } from "../parent-link/token";
import { DELIVERY_LABEL } from "./history";
import { noticesForGuardian, PRIORITY_LABEL } from "./notices";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SHOWN = 25;
const TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = { QUEUED: "neutral", SENDING: "neutral", SENT: "neutral", DELIVERED: "success", READ: "success", FAILED: "danger" };

async function load({ current, studentId, academicYearId }: ProfileTabArgs) {
  return withSchool(current.ctx, async (tx) => {
    const links = await tx.studentGuardian.findMany({ where: { schoolId: current.ctx.schoolId, studentId, archivedAt: null }, select: { guardianId: true } });
    const guardianIds = links.map((l) => l.guardianId);
    // As in Message History: full Communication access sees every message; others see the ones they sent.
    const own = reachFor(current.permissions, "communication", "create") !== "all";
    const where = {
      schoolId: current.ctx.schoolId,
      isBackup: false,
      OR: [
        { studentId },
        // A parent of brothers and sisters gets one message for all of them (no single student on the row).
        ...(guardianIds.length ? [{ guardianId: { in: guardianIds }, studentId: null }] : []),
      ],
      ...(own ? { message: { sentById: current.ctx.userId } } : {}),
    };
    const [rows, total] = await Promise.all([
      tx.messageRecipient.findMany({
        where,
        orderBy: { queuedAt: "desc" },
        take: SHOWN,
        select: { id: true, messageId: true, name: true, description: true, channel: true, status: true, text: true, failReason: true, queuedAt: true, message: { select: { title: true, trigger: true } } },
      }),
      tx.messageRecipient.count({ where }),
    ]);
    const enrolment = academicYearId
      ? await tx.enrolment.findFirst({ where: { schoolId: current.ctx.schoolId, studentId, academicYearId, archivedAt: null }, orderBy: { createdAt: "desc" }, select: { sectionId: true, classId: true } })
      : null;
    const notices = enrolment ? (await noticesForGuardian(tx, current.ctx, [enrolment])).slice(0, 10) : [];
    return { rows, total, notices };
  });
}

async function CommunicationTab(args: ProfileTabArgs) {
  const { current, studentId } = args;
  const d = await load(args);
  const tz = current.school.timeZone;
  const mayOpenHistory = can(current.permissions, "communication", "view");
  const maySend = can(current.permissions, "communication", "create");
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Messages to parents" description={d.total > SHOWN ? `The latest ${SHOWN} of ${d.total}.` : undefined}
          action={maySend ? <Link className="text-sm font-medium text-brand-text hover:underline" href={`/communication?for=students&ids=${studentId}`}>Send message</Link> : undefined} />
        <CardBody>
          {d.rows.length === 0 ? (
            <p className="text-ink-2">No messages have been sent to this student&apos;s parents yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.rows.map((r) => {
                const body = withHiddenLinks(r.text);
                return (
                  <li key={r.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.message.title ?? r.message.trigger ?? "Message"}</span>
                      <Badge tone={TONE[r.status] ?? "neutral"}>{DELIVERY_LABEL[r.status] ?? r.status}</Badge>
                      <span className="text-sm text-ink-2">{CHANNEL_LABEL[r.channel as Channel] ?? r.channel}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink-2">To {r.name}{r.description ? ` (${r.description})` : ""} · {formatDateTime(r.queuedAt, tz)}</p>
                    <p className="mt-1 line-clamp-2 text-[15px]">{body}</p>
                    {r.status === "FAILED" && r.failReason && <p className="mt-1 text-sm text-danger">{r.failReason}</p>}
                    {mayOpenHistory && <Link className="mt-1 inline-block text-sm font-medium text-brand-text hover:underline" href={`/communication/history/${r.messageId}`}>Open in Message History</Link>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Notices" description="Notices this student's parents see on Parent Link." />
        <CardBody>
          {d.notices.length === 0 ? (
            <p className="text-ink-2">No notices for this class right now.</p>
          ) : (
            <ul className="space-y-3">
              {d.notices.map((n) => (
                <li key={n.id}>
                  <Link className="font-medium text-brand-text hover:underline" href={`/communication/notices/${n.id}`}>{n.title}</Link>
                  <p className="text-sm text-ink-2">
                    {n.publishedAt ? formatDateTime(n.publishedAt, tz) : ""}
                    {n.priority !== "NORMAL" ? ` · ${PRIORITY_LABEL[n.priority]}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

registerProfileTab({
  key: "communication",
  label: "Communication",
  module: "communication",
  order: 120,
  load: (args) => CommunicationTab(args),
});
