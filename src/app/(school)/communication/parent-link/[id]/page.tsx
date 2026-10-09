import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { formatDate, formatDateTime } from "@/lib/format";
import { childrenByGuardian, guardianLinkIds, linkHistory } from "@/lib/communication/parent-link-admin";
import { maskPhone, REVOKE_REASONS } from "@/lib/parent-link/links";
import { consentTypeLabel } from "@/lib/parent-link/consent";
import { channelSetups } from "@/lib/messaging/channels";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
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
    const link = await tx.parentLink.findFirst({ where: { id, schoolId: ctx.schoolId }, include: { devices: { orderBy: { verifiedAt: "desc" } } } });
    if (!link) return null;
    const guardian = await tx.guardian.findFirstOrThrow({ where: { id: link.guardianId, schoolId: ctx.schoolId }, select: { id: true, name: true, phone: true, optedOut: true } });
    const ids = await guardianLinkIds(tx, ctx, guardian.id);
    const [history, kids, records, requests, setups, newer] = await Promise.all([
      linkHistory(tx, ctx, ids),
      childrenByGuardian(tx, ctx, [guardian.id]),
      tx.consentRecord.findMany({ where: { schoolId: ctx.schoolId, guardianId: guardian.id }, orderBy: { givenAt: "desc" } }),
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

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/communication/parent-link" className="text-brand-text hover:underline">← Parent Link</Link></p>
      <PageHeader title={guardian.name} href={`/communication/parent-link/${link.id}`} userId={current.user.id}>
        <div className="flex flex-wrap gap-2">
          <Badge tone={active ? "success" : "neutral"}>{active ? "Active" : "Revoked"}</Badge>
          {active && <ButtonLink href={`/communication/parent-link/${link.id}/preview`} size="sm">What this guardian sees</ButtonLink>}
        </div>
      </PageHeader>
      {!active && (
        <Alert tone="info" className="mb-4">
          Revoked {link.revokedAt ? formatDateTime(link.revokedAt, tz) : ""}{link.revokeReason ? `: ${link.revokeReason}` : ""}. It no longer opens on any phone.
          {data.newer && <> <Link href={`/communication/parent-link/${data.newer.id}`} className="font-medium underline">Open the new link</Link></>}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardBody>
              <dl className="grid gap-3 sm:grid-cols-3">
                <Detail label="Registered mobile">{maskPhone(guardian.phone)}</Detail>
                <Detail label="Link">Ends in …{link.tokenHint}</Detail>
                <Detail label="Created on">{formatDate(link.createdAt, tz)}</Detail>
                <Detail label="Last sent">{link.lastSentAt ? formatDateTime(link.lastSentAt, tz) : "Not sent yet"}</Detail>
                <Detail label="Last opened">{link.lastOpenedAt ? formatDateTime(link.lastOpenedAt, tz) : "Never"}</Detail>
                <Detail label="Children">{data.kids.length ? data.kids.map((k) => `${k.name}${k.classLabel ? ` (${k.classLabel})` : ""}`).join(", ") : "None studying now"}</Detail>
              </dl>
              {guardian.optedOut && <p className="mt-3 text-sm text-ink-2">This parent opted out of general messages. Parent Link messages still reach them, because the link is their own key.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Phones verified" description="Each phone confirmed with a one-time code. Revoking the link signs out every phone." />
            <CardBody>
              {link.devices.length === 0 ? <p className="text-ink-2">No phone yet. The first time the link opens on a phone, a one-time code goes to the registered mobile.</p> : (
                <ul className="divide-y divide-line">
                  {link.devices.map((d) => {
                    const live = !d.revokedAt && d.expiresAt > now;
                    return (
                      <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span><span className="font-medium">{d.label}</span> <span className="text-sm text-ink-2">verified {formatDate(d.verifiedAt, tz)} · last used {formatDateTime(d.lastUsedAt, tz)}</span></span>
                        <Badge tone={live ? "success" : "neutral"}>{d.revokedAt ? "Signed out" : live ? `Until ${formatDate(d.expiresAt, tz)}` : "Expired"}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Consent forms" />
            <CardBody>
              {data.records.length === 0 && waiting.length === 0 ? <p className="text-ink-2">No consent forms yet.</p> : (
                <ul className="divide-y divide-line">
                  {waiting.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>{title(r.consentTextId)?.title ?? consentTypeLabel(r.consentType)} <span className="text-sm text-ink-2">asked {formatDate(r.createdAt, tz)}, reply by {formatDate(r.replyBy, "UTC")}</span></span>
                      <Badge tone="warning">Waiting</Badge>
                    </li>
                  ))}
                  {data.records.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>{title(c.consentTextId)?.title ?? consentTypeLabel(c.consentType)} · {data.students.find((s) => s.id === c.studentId)?.fullName ?? "Child"} <span className="text-sm text-ink-2">version {c.textVersion} · {c.withdrawnAt ? `withdrawn ${formatDateTime(c.withdrawnAt, tz)}` : `given ${formatDateTime(c.givenAt, tz)} (${c.how})`}</span></span>
                      <Badge tone={c.withdrawnAt ? "neutral" : "success"}>{c.withdrawnAt ? "Withdrawn" : "Given"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <section aria-labelledby="hist">
            <h2 id="hist" className="mb-2 text-lg font-semibold">History</h2>
            {data.history.length === 0 ? <p className="text-ink-2">Nothing yet.</p> : (
              <ol className="space-y-1">
                {data.history.map((h) => (
                  <li key={h.id} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                    <span className="font-medium">{h.what}</span>
                    {h.detail && <span className="text-ink-2"> · {h.detail}</span>}
                    <span className="block text-ink-2">{formatDateTime(h.at, tz)} · {h.by}{h.ip ? ` · ${h.ip}` : ""}{h.messageId && <> · <Link href={`/communication/history/${h.messageId}`} className="text-brand-text underline">Delivery</Link></>}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        {active && <LinkPanel id={link.id} channels={channels} reasons={[...REVOKE_REASONS]} />}
      </div>
    </>
  );
}
