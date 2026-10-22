import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { formatDate, formatDateTime } from "@/lib/format";
import { childrenByGuardian, guardianLinkIds, linkCampusWhere, linkHistory } from "@/lib/communication/parent-link-admin";
import { maskPhone, REVOKE_REASONS } from "@/lib/parent-link/links";
import { consentTypeLabel } from "@/lib/parent-link/consent";
import { channelSetups } from "@/lib/messaging/channels";
import { Ban, Eye, FileSignature, History as HistoryIcon, Info, MessageSquareText, Plus, Send, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";
import { Pill } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { BackLink, Col, DL, RecordHead, Split } from "@/components/ui/split";
import { LinkPanel } from "./link-panel";

export const metadata: Metadata = { title: "Parent Link" };

export default async function LinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const access = await commPage();
  const { current } = access;
  const tz = current.school.timeZone;
  const now = new Date();
  const data = await withSchool(current.ctx, async (tx) => {
    const ctx = current.ctx;
    // Another campus's guardian's link is not found for a person limited to one campus.
    const campusId = access.scope.campusId ?? null;
    const link = await tx.parentLink.findFirst({ where: { id, schoolId: ctx.schoolId, ...(await linkCampusWhere(tx, ctx, campusId)) }, include: { devices: { orderBy: { verifiedAt: "desc" } } } });
    if (!link) return null;
    const guardian = await tx.guardian.findFirstOrThrow({ where: { id: link.guardianId, schoolId: ctx.schoolId }, select: { id: true, name: true, phone: true, optedOut: true } });
    const ids = await guardianLinkIds(tx, ctx, guardian.id);
    const [history, kids, records, requests, setups, newer] = await Promise.all([
      linkHistory(tx, ctx, ids),
      childrenByGuardian(tx, ctx, [guardian.id], campusId),
      tx.consentRecord.findMany({ where: { schoolId: ctx.schoolId, guardianId: guardian.id, archivedAt: null }, orderBy: { givenAt: "desc" } }),
      tx.consentRequest.findMany({ where: { schoolId: ctx.schoolId, guardianIds: { has: guardian.id } }, orderBy: { createdAt: "desc" } }),
      channelSetups(tx, ctx),
      link.replacedById ? tx.parentLink.findFirst({ where: { id: link.replacedById }, select: { id: true } }) : null,
    ]);
    const texts = await tx.consentText.findMany({ where: { schoolId: ctx.schoolId, id: { in: [...records.map((r) => r.consentTextId), ...requests.map((r) => r.consentTextId)] } }, select: { id: true, title: true, version: true } });
    const students = await tx.student.findMany({ where: { schoolId: ctx.schoolId, id: { in: records.map((r) => r.studentId) } }, select: { id: true, fullName: true } });
    return { link, guardian, history, kids: kids.get(guardian.id) ?? [], records, requests, texts, students, setups, newer };
  });
  if (!data) notFound();
  const { link, guardian } = data;
  const active = link.status === "ACTIVE";
  const title = (tid: string) => data.texts.find((t) => t.id === tid);
  const waiting = data.requests.filter((r) => !data.records.some((c) => c.consentType === r.consentType && !c.withdrawnAt) && !data.records.some((c) => c.consentType === r.consentType && c.withdrawnAt && c.withdrawnHow !== "replaced by a newer version"));
  const channels = (["whatsapp", "sms"] as const).filter((c) => data.setups[c].isOn).map((c) => ({ value: c, label: c === "sms" ? "SMS" : "WhatsApp" }));

  const kidsText = data.kids.length ? data.kids.map((k) => `${k.name}${k.classLabel ? ` (${k.classLabel})` : ""}${k.restricted ? ", not on Parent Link: custody restriction" : ""}`).join("; ") : "None studying now";
  const liveDevices = link.devices.filter((d) => !d.revokedAt && d.expiresAt > now).length;
  const ICONS: Record<string, TimelineItem["icon"]> = { Opened: Eye, Sent: Send, Created: Plus, Revoked: Ban, "Phone confirmed with a one-time code": ShieldCheck, "One-time code sent": MessageSquareText, "Wrong one-time code typed": TriangleAlert, "Consent given": FileSignature, "Consent withdrawn": FileSignature };
  const TONES: Record<string, TimelineItem["tone"]> = { Opened: "ok", Revoked: "bad", "Phone confirmed with a one-time code": "ok", "Wrong one-time code typed": "warn", "Consent given": "ok", Created: "brand" };
  const history: TimelineItem[] = data.history.map((h) => ({
    icon: ICONS[h.what] ?? HistoryIcon, tone: TONES[h.what] ?? "neutral",
    what: <>{h.what}{h.detail && <span className="text-ink3"> · {h.detail}</span>}{h.messageId && <> · <Link href={`/communication/history/${h.messageId}`} className="text-brand font-semibold hover:underline">Delivery</Link></>}</>,
    when: `${formatDateTime(h.at, tz)} · ${h.by}${h.ip ? ` · ${h.ip}` : ""}`,
  }));
  const details: [string, React.ReactNode][] = [
    ["Registered mobile", <span key="m" className="tnum">{maskPhone(guardian.phone)}</span>],
    ["Children", kidsText],
    ["Link", <span key="l" className="font-mono text-[13px]">…/p/••••{link.tokenHint}</span>],
    ["Created on", formatDate(link.createdAt, tz)],
    ["Last sent", link.lastSentAt ? formatDateTime(link.lastSentAt, tz) : "Not sent yet"],
    ["Last opened", link.lastOpenedAt ? formatDateTime(link.lastOpenedAt, tz) : <span key="o" className="text-warn font-semibold">Never</span>],
  ];

  return (
    <>
      <BackLink href="/communication/parent-link" label="Parent Link" sub={active ? "Active" : "Revoked"} />
      <RecordHead title={guardian.name}
        sub={<>
          <Pill tone={active ? "ok" : "bad"} dot>{active ? "Active" : "Revoked"}</Pill>
          <Pill tone="neutral">{liveDevices} {liveDevices === 1 ? "phone" : "phones"} verified</Pill>
          {!link.lastOpenedAt && active && <Pill tone="warn">Never opened</Pill>}
        </>}
        actions={<>
          {active && <ButtonLink href={`/communication/parent-link/${link.id}/preview`} variant="soft" icon={Smartphone}>What they see</ButtonLink>}
          {active && access.full && <LinkPanel id={link.id} name={guardian.name} channels={channels} reasons={[...REVOKE_REASONS]} />}
        </>} />

      <div className="flex flex-col gap-5 lg:gap-6">
        {!active && (
          <Banner tone="info" title={`Revoked${link.revokedAt ? ` on ${formatDateTime(link.revokedAt, tz)}` : ""}.`}
            action={data.newer ? <ButtonLink href={`/communication/parent-link/${data.newer.id}`} size="sm" variant="secondary">Open the new link</ButtonLink> : undefined}>
            {link.revokeReason ? `${link.revokeReason}. ` : ""}It no longer opens on any phone.
          </Banner>
        )}
        {guardian.optedOut && <Banner tone="info" title="Opted out of general messages.">Parent Link messages still reach them, because the link is their own key.</Banner>}
        <Split side={340}>
          <Col>
            <Card>
              <CardHeader title="History" icon={HistoryIcon} description="Every open with date, time and phone" />
              <div className="px-5 pb-5">{history.length ? <Timeline items={history} /> : <p className="text-[13.5px] text-ink3">Nothing yet.</p>}</div>
            </Card>
            <Card>
              <CardHeader title="Consent forms" icon={FileSignature} />
              <ul className="px-5 pb-5 flex flex-col gap-2 text-[13.5px]">
                {waiting.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
                    <span>{title(r.consentTextId)?.title ?? consentTypeLabel(r.consentType)}<span className="block text-[12.5px] text-ink3">Asked {formatDate(r.createdAt, tz)} · reply by {formatDate(r.replyBy, "UTC")}</span></span>
                    <Pill tone="warn">Waiting</Pill>
                  </li>
                ))}
                {data.records.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
                    <span>{title(c.consentTextId)?.title ?? consentTypeLabel(c.consentType)} v{c.textVersion} · {data.students.find((s) => s.id === c.studentId)?.fullName ?? "Child"}<span className="block text-[12.5px] text-ink3">{c.refused ? `Refused on a paper form dated ${formatDate(c.givenAt, "UTC")}` : c.withdrawnAt ? `Withdrawn ${formatDateTime(c.withdrawnAt, tz)}` : c.how === "paper-form" ? `Given on a paper form dated ${formatDate(c.givenAt, "UTC")}` : `Given ${formatDateTime(c.givenAt, tz)} · ${c.how}`}</span></span>
                    <Pill tone={c.withdrawnAt ? "neutral" : "ok"}>{c.withdrawnAt ? "Withdrawn" : "Given"}</Pill>
                  </li>
                ))}
                {!data.records.length && !waiting.length && <li className="text-ink3">No consent forms yet.</li>}
              </ul>
            </Card>
          </Col>
          <Col>
            <Card>
              <CardHeader title="Details" icon={Info} />
              <DL cols={1} rows={details} />
            </Card>
            <Card>
              <CardHeader title="Phones verified" icon={ShieldCheck} description="Each confirmed with a one-time code. Revoking signs out every phone." />
              <ul className="px-5 pb-5 flex flex-col gap-2.5 text-[13.5px]">
                {link.devices.map((d) => {
                  const live = !d.revokedAt && d.expiresAt > now;
                  return (
                    <li key={d.id} className="flex items-start justify-between gap-3">
                      <span><b className="font-semibold">{d.label}</b><span className="block text-[12.5px] text-ink3">Verified {formatDate(d.verifiedAt, tz)} · used {formatDateTime(d.lastUsedAt, tz)}</span></span>
                      <Pill tone={live ? "ok" : "neutral"} className="shrink-0">{d.revokedAt ? "Signed out" : live ? `Until ${formatDate(d.expiresAt, tz)}` : "Expired"}</Pill>
                    </li>
                  );
                })}
                {!link.devices.length && <li className="text-ink3">No phone yet. The first time the link opens on a phone, a one-time code goes to the registered mobile.</li>}
              </ul>
            </Card>
          </Col>
        </Split>
      </div>
    </>
  );
}
