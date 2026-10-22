import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Info, Megaphone } from "lucide-react";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { formatDate, formatDateTime } from "@/lib/format";
import { fileLink } from "@/lib/files";
import { audienceGuardianIds, audienceLogins, guardiansOnCampus, loginsOnCampus, markRead, noticeOnCampus, PRIORITY_LABEL, readAudience, STATUS_LABEL } from "@/lib/communication/notices";
import { channelSetups } from "@/lib/messaging/channels";
import { Pill, type PillTone } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { BackLink, Col, DL, RecordHead, Split } from "@/components/ui/split";
import { UrlSegmented } from "@/components/ui/url-filters";
import { cx } from "@/components/ui/cx";
import { NoticeActions } from "./notice-actions";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Notice") };
}

const PRIORITY_TONE: Record<string, PillTone> = { NORMAL: "neutral", HIGH: "warn", CRITICAL: "bad" };
const STATUS_TONE: Record<string, PillTone> = { DRAFT: "neutral", WAITING_APPROVAL: "warn", SCHEDULED: "info", PUBLISHED: "ok", EXPIRED: "neutral", ARCHIVED: "neutral" };

export default async function NoticePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
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
    // A notice for other campuses only is not found for a person limited to one campus (unless it is for them).
    const campusId = access.scope.campusId;
    if (!inAudience && !noticeOnCampus(n, campusId, current.user.id)) return null;
    // Opening a published notice counts as read.
    if (inAudience && n.status === "PUBLISHED") await markRead(tx, current.ctx, n.id, false);
    const manager = access.full || mine;
    const acks = manager ? await tx.noticeAcknowledgement.findMany({ where: { noticeId: n.id } }) : [];
    const myAck = await tx.noticeAcknowledgement.findFirst({ where: { noticeId: n.id, userLoginId: current.user.id } });
    // Who read it and who saw it: only their campus's people for a person limited to one campus.
    const shown = await loginsOnCampus(tx, current.ctx, logins, campusId);
    const people = manager && shown.length ? await tx.userLogin.findMany({ where: { id: { in: shown } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }) : [];
    const guardianIds = manager && n.status !== "DRAFT" ? await guardiansOnCampus(tx, await audienceGuardianIds(tx, current.ctx, a), campusId) : [];
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
  const show = sp.seen === "seen" || sp.seen === "not" ? sp.seen : "all";
  const guardianRows = data.guardians.filter((g) => show === "all" || (show === "seen" ? seenBy.has(g.id) : !seenBy.has(g.id)));
  const peopleRows = data.people.filter((p) => show === "all" || (show === "seen" ? !notRead.includes(p) : notRead.includes(p)));
  const acked = n.askAck ? data.acks.filter((x) => x.acknowledgedAt).length : 0;
  const CH_NAME: Record<string, string> = { board: "Notice board", app: "App notice", "parent-link": "Parent Link", whatsapp: "WhatsApp", sms: "SMS", email: "Email" };
  const details: [string, React.ReactNode][] = [
    ["Audience", n.audienceLabel],
    ["Channels", n.channels.map((c) => CH_NAME[c] ?? c).join(", ")],
    ["Published", n.publishedAt ? formatDateTime(n.publishedAt, tz) : n.publishAt ? `Due ${formatDateTime(n.publishAt, tz)}` : "Not yet"],
    ["Expires on", n.expiresOn ? formatDate(n.expiresOn, "UTC") : "30 days after publishing"],
  ];
  if (data.author) details.push(["Written by", data.author]);
  if (n.messageId) details.push(["Message", <Link key="m" className="text-brand font-semibold hover:underline" href={`/communication/history/${n.messageId}`}><Words k="See delivery" /></Link>]);

  return (
    <>
      <BackLink href="/communication/notices" label="Notice Board" sub={STATUS_LABEL[n.status]} />
      <RecordHead title={n.title}
        sub={<>
          <Pill tone={STATUS_TONE[n.status]} dot>{STATUS_LABEL[n.status]}</Pill>
          <Pill tone={PRIORITY_TONE[n.priority]}>{PRIORITY_LABEL[n.priority]} <Words k="priority" /></Pill>
          {n.askAck && <Pill tone="info"><Words k="Asks for “I have read this”" /></Pill>}
        </>}
        actions={<NoticeActions id={n.id}
          canEdit={data.manager && access.canChange && n.status === "DRAFT"}
          canArchive={data.manager && access.canChange && n.status !== "ARCHIVED" && n.status !== "WAITING_APPROVAL"}
          canAck={data.inAudience && n.askAck && n.status === "PUBLISHED"} acked={Boolean(data.myAck?.acknowledgedAt)}
          canRemind={access.full && n.askAck && n.status === "PUBLISHED" ? notRead.length : 0}
          unseen={access.full && n.status === "PUBLISHED" ? unseen : 0} channels={[...channels]} />} />

      <div className="flex flex-col gap-5 lg:gap-6">
        {n.status === "WAITING_APPROVAL" && <Banner tone="warn" title="Waiting for the Principal."><Words k="It goes out on the chosen channels once approved." /></Banner>}
        {n.status === "SCHEDULED" && n.publishAt && <Banner tone="info" title={`Scheduled for ${formatDateTime(n.publishAt, tz)}.`}><Words k="It is published at that time." /></Banner>}
        {n.status === "ARCHIVED" && <Banner tone="info" title="Archived."><Words k="It is no longer on the board or Parent Link." /></Banner>}
        <Split side={340}>
          <Col>
            <Card className={cx(n.priority === "CRITICAL" && "border-bad/50")}>
              <CardHeader title="The notice" icon={Megaphone} description={data.author ? `By ${data.author}` : undefined} />
              <div className="px-5 pb-5">
                <p className="text-[14.5px] leading-relaxed text-ink2 whitespace-pre-line break-words">{n.body}</p>
                {data.files.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2">
                    {data.files.map((f) => (
                      <li key={f.id}><a href={fileLink(f.id, current.ctx.schoolId)} className="text-[13px] flex items-center gap-2 rounded-xl bg-sunken px-3 py-2 hover:bg-line/60"><FileText size={16} className="text-ink3" aria-hidden="true" />{f.fileName}</a></li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>

            {data.manager && data.guardians.length > 0 && (
              <Card className="overflow-hidden">
                <div className="p-4 md:px-5 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-ink3"><Words k="Seen by parents" /></p>
                    <p className="font-display text-[24px] font-semibold tnum leading-tight">{(data.guardians.length - unseen).toLocaleString("en-IN")} <span className="text-[14px] text-ink3 font-sans"><Words k="of" /> {data.guardians.length.toLocaleString("en-IN")}</span></p>
                    <p className="text-[12.5px] text-ink3"><Words k="From Parent Link opens and WhatsApp read receipts" />{n.askAck ? ` · ${acked} tapped “I have read this”` : ""}</p>
                  </div>
                </div>
                <div className="border-t border-line px-4 md:px-5 py-2.5 flex items-center gap-2">
                  <UrlSegmented param="seen" label="Show" size="sm" options={[{ value: "all", label: "All" }, { value: "seen", label: "Seen" }, { value: "not", label: "Not seen" }]} />
                  <span className="text-[12px] text-ink3 ml-auto">{guardianRows.length} <Words k="shown" /></span>
                </div>
                <ul className="divide-y divide-line/70 border-t border-line max-h-96 overflow-y-auto scroll-thin">
                  {guardianRows.map((g) => {
                    const v = seenBy.get(g.id);
                    return (
                      <li key={g.id} className="flex items-center gap-3 px-4 md:px-5 py-2.5">
                        <Avatar name={g.name} size={32} />
                        <div className="min-w-0 flex-1"><p className="text-[14px] font-semibold truncate">{g.name}</p><p className="text-[12px] text-ink3 truncate">{g.relationship}</p></div>
                        {v ? <span className="text-right text-[12.5px] tnum"><span className="block font-semibold">{formatDateTime(v.firstSeenAt, tz)}</span><span className="text-ink3">{v.via === "whatsapp" ? "WhatsApp read" : "Parent Link"}</span></span> : <Pill tone="warn"><Words k="Not seen" /></Pill>}
                      </li>
                    );
                  })}
                  {!guardianRows.length && <li className="px-5 py-4 text-[13.5px] text-ink3"><Words k="Nobody here." /></li>}
                </ul>
              </Card>
            )}

            {data.manager && data.people.length > 0 && (
              <Card className="overflow-hidden">
                <div className="p-4 md:px-5">
                  <p className="text-[13px] font-semibold text-ink3">{n.askAck ? "Acknowledged by staff and students" : "Read by staff and students"}</p>
                  <p className="font-display text-[24px] font-semibold tnum leading-tight">{data.people.length - notRead.length} <span className="text-[14px] text-ink3 font-sans"><Words k="of" /> {data.people.length}</span></p>
                </div>
                <ul className="divide-y divide-line/70 border-t border-line max-h-96 overflow-y-auto scroll-thin">
                  {peopleRows.map((p) => {
                    const a = ackBy.get(p.id);
                    const at = n.askAck ? a?.acknowledgedAt : a?.readAt;
                    return (
                      <li key={p.id} className="flex items-center gap-3 px-4 md:px-5 py-2.5">
                        <Avatar name={p.displayName} size={32} />
                        <p className="min-w-0 flex-1 text-[14px] font-semibold truncate">{p.displayName}</p>
                        {at ? <span className="text-[12.5px] tnum font-semibold">{formatDateTime(at, tz)}</span> : <Pill tone="warn">{n.askAck ? "Not acknowledged" : "Not read"}</Pill>}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </Col>
          <Card>
            <CardHeader title="Details" icon={Info} />
            <DL cols={1} rows={details} />
          </Card>
        </Split>
      </div>
    </>
  );
}
