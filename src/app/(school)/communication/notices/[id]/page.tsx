import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { formatDate, formatDateTime } from "@/lib/format";
import { fileLink } from "@/lib/files";
import { audienceGuardianIds, audienceLogins, markRead, PRIORITY_LABEL, readAudience, STATUS_LABEL } from "@/lib/communication/notices";
import { channelSetups } from "@/lib/messaging/channels";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { NoticeActions } from "./notice-actions";

export const metadata: Metadata = { title: "Notice" };

const PRIORITY_TONE: Record<string, BadgeTone> = { NORMAL: "neutral", HIGH: "warning", CRITICAL: "danger" };

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const access = await commPage();
  const { current } = access;
  const tz = current.school.timeZone;
  const data = await withSchool(current.ctx, async (tx) => {
    const n = await tx.notice.findFirst({ where: { id, schoolId: current.ctx.schoolId } });
    if (!n) return null;
    const a = readAudience(n.audience);
    const logins = n.status === "PUBLISHED" || n.status === "EXPIRED" ? await audienceLogins(tx, current.ctx, a) : [];
    const mine = n.createdById === current.user.id;
    const inAudience = logins.includes(current.user.id);
    if (!access.full && !mine && !inAudience) return null;
    // Opening a published notice counts as read.
    if (inAudience && n.status === "PUBLISHED") await markRead(tx, current.ctx, n.id, false);
    const manager = access.full || mine;
    const acks = manager ? await tx.noticeAcknowledgement.findMany({ where: { noticeId: n.id } }) : [];
    const myAck = await tx.noticeAcknowledgement.findFirst({ where: { noticeId: n.id, userLoginId: current.user.id } });
    const people = manager && logins.length ? await tx.userLogin.findMany({ where: { id: { in: logins } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }) : [];
    const guardianIds = manager && n.status !== "DRAFT" ? await audienceGuardianIds(tx, current.ctx, a) : [];
    const views = manager ? await tx.noticeGuardianView.findMany({ where: { noticeId: n.id } }) : [];
    const guardians = guardianIds.length ? await tx.guardian.findMany({ where: { id: { in: guardianIds.slice(0, 2000) } }, select: { id: true, name: true, relationship: true }, orderBy: { name: "asc" } }) : [];
    const files = n.attachmentFileIds.length ? await tx.storedFile.findMany({ where: { id: { in: n.attachmentFileIds } }, select: { id: true, fileName: true } }) : [];
    const setups = await channelSetups(tx, current.ctx);
    const author = n.createdById ? await tx.userLogin.findUnique({ where: { id: n.createdById }, select: { displayName: true } }) : null;
    return { n, a, people, acks, myAck, guardians, views, files, manager, inAudience, setups, author: author?.displayName ?? null };
  });
  if (!data) notFound();
  const { n } = data;
  const ackBy = new Map(data.acks.map((x) => [x.userLoginId, x]));
  const seenBy = new Map(data.views.map((v) => [v.guardianId, v]));
  const notRead = data.people.filter((p) => !ackBy.get(p.id)?.[n.askAck ? "acknowledgedAt" : "readAt"]);
  const unseen = data.guardians.filter((g) => !seenBy.has(g.id)).length;
  const channels = (["whatsapp", "sms", "email"] as const).filter((c) => data.setups[c].isOn);

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/communication/notices" className="text-brand-text hover:underline">← Notice Board</Link></p>
      <PageHeader title={n.title} href={`/communication/notices/${n.id}`} userId={current.user.id}>
        <NoticeActions id={n.id}
          canEdit={data.manager && access.canChange && n.status === "DRAFT"}
          canArchive={data.manager && access.canChange && n.status !== "ARCHIVED" && n.status !== "WAITING_APPROVAL"}
          canAck={data.inAudience && n.askAck && n.status === "PUBLISHED"} acked={Boolean(data.myAck?.acknowledgedAt)}
          canRemind={data.manager && n.askAck && n.status === "PUBLISHED" ? notRead.length : 0}
          unseen={data.manager && access.canChange && n.status === "PUBLISHED" ? unseen : 0} channels={[...channels]} />
      </PageHeader>
      {n.status === "WAITING_APPROVAL" && <Alert tone="warning" className="mb-4">Waiting for the principal. It is published once approved.</Alert>}
      {n.status === "SCHEDULED" && n.publishAt && <Alert tone="info" className="mb-4">Scheduled for {formatDateTime(n.publishAt, tz)}.</Alert>}
      {n.status === "ARCHIVED" && <Alert tone="info" className="mb-4">Archived. It is no longer on the board or Parent Link.</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={`lg:col-span-2 ${n.priority === "CRITICAL" ? "border-2 border-danger" : ""}`}>
          <CardBody>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge tone={PRIORITY_TONE[n.priority]}>{PRIORITY_LABEL[n.priority]}</Badge>
              <Badge>{STATUS_LABEL[n.status]}</Badge>
            </div>
            <p className="whitespace-pre-line">{n.body}</p>
            {data.files.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {data.files.map((f) => <li key={f.id}><a href={fileLink(f.id, current.ctx.schoolId)} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-3 font-medium text-brand-text hover:bg-surface-2">{f.fileName}</a></li>)}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <dl className="grid gap-3">
              <Detail label="Audience">{n.audienceLabel}</Detail>
              <Detail label="Channels">{n.channels.map((c) => ({ board: "Notice board", app: "App notification", "parent-link": "Parent Link", whatsapp: "WhatsApp", sms: "SMS", email: "Email" })[c] ?? c).join(", ")}</Detail>
              <Detail label="Published">{n.publishedAt ? formatDateTime(n.publishedAt, tz) : "Not yet"}</Detail>
              <Detail label="Expires on">{n.expiresOn ? formatDate(n.expiresOn, "UTC") : "30 days after publishing"}</Detail>
              {data.author && <Detail label="Written by">{data.author}</Detail>}
              {n.messageId && <Detail label="Message"><Link className="text-brand-text underline" href={`/communication/history/${n.messageId}`}>See delivery</Link></Detail>}
            </dl>
          </CardBody>
        </Card>
      </div>

      {data.manager && data.people.length > 0 && (
        <Card className="mt-4">
          <CardHeader title={n.askAck ? `${data.people.length - notRead.length} of ${data.people.length} acknowledged` : `${data.people.length - notRead.length} of ${data.people.length} read`} description="Staff and students in the audience" />
          <CardBody>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 font-medium">{n.askAck ? "Acknowledged" : "Read"}</h3>
                <ul className="space-y-1 text-sm">
                  {data.people.filter((p) => !notRead.includes(p)).map((p) => <li key={p.id}>{p.displayName} <span className="text-ink-2">{formatDateTime((n.askAck ? ackBy.get(p.id)?.acknowledgedAt : ackBy.get(p.id)?.readAt) ?? new Date(), tz)}</span></li>)}
                  {notRead.length === data.people.length && <li className="text-ink-2">Nobody yet.</li>}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-medium">Not yet</h3>
                <ul className="space-y-1 text-sm">
                  {notRead.map((p) => <li key={p.id}>{p.displayName}</li>)}
                  {notRead.length === 0 && <li className="text-success">Everyone has.</li>}
                </ul>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {data.manager && data.guardians.length > 0 && (
        <Card className="mt-4">
          <CardHeader title={`Seen by ${data.guardians.length - unseen} of ${data.guardians.length}`} description="Parents, from Parent Link opens and WhatsApp read receipts" />
          <CardBody>
            <details>
              <summary className="min-h-11 cursor-pointer font-medium text-brand-text">Show each parent</summary>
              <ul className="mt-2 divide-y divide-line text-sm">
                {data.guardians.map((g) => {
                  const v = seenBy.get(g.id);
                  return (
                    <li key={g.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>{g.name} <span className="text-ink-2">({g.relationship})</span></span>
                      {v ? <span>{formatDateTime(v.firstSeenAt, tz)} · {v.via === "whatsapp" ? "WhatsApp" : "Parent Link"}</span> : <span className="text-ink-2">Not seen</span>}
                    </li>
                  );
                })}
              </ul>
            </details>
          </CardBody>
        </Card>
      )}
    </>
  );
}
