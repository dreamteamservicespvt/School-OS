import type { Metadata } from "next";
import Link from "next/link";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, listHref } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { CHANNEL_LABEL, channelSetups, offeredChannels, PROVIDER_CHANNELS, PROVIDERS, SMS_OFFERED } from "@/lib/messaging/channels";
import { creditBalances } from "@/lib/messaging/credits";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ExportMenu } from "@/components/communication/export-menu";
import { ChannelChoices } from "./channel-choices";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("SMS, WhatsApp & Email") };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function MessagingSettingsPage({ searchParams }: { searchParams: Search }) {
  const { current, may } = await requireSettingsPage("messaging");
  const tz = current.school.timeZone;
  const canEdit = may.edit;
  const params = readListParams(await searchParams, ["channel"]);
  const data = await withSchool(current.ctx, async (tx) => {
    const ctx = current.ctx;
    const where = { schoolId: ctx.schoolId, ...(params.filters.channel === "whatsapp" || params.filters.channel === "sms" ? { channel: params.filters.channel } : {}), ...(params.q ? { note: { contains: params.q, mode: "insensitive" as const } } : {}) };
    const [setups, balances, school, ledger, total] = await Promise.all([
      channelSetups(tx, ctx),
      creditBalances(tx, ctx),
      tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { smsDltEntityId: true, smsSenderHeader: true } }),
      tx.creditLedgerEntry.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(params) }),
      tx.creditLedgerEntry.count({ where }),
    ]);
    const people = await tx.userLogin.findMany({ where: { id: { in: ledger.map((l) => l.createdById).filter(Boolean) as string[] } }, select: { id: true, displayName: true } });
    return { setups, balances, school, ledger, total, people: new Map(people.map((p) => [p.id, p.displayName])) };
  });
  // SMS is not used for now (SMS_OFFERED, owner 15 Nov 2026): its card, DLT box and credits are not shown; its saved setup is kept.
  const paid = offeredChannels(["whatsapp", "sms"] as const);
  const low = paid.filter((c) => data.setups[c].isOn && data.balances[c] < data.setups[c].lowCreditAlert);
  const dltMissing = !data.school.smsDltEntityId || !data.school.smsSenderHeader;

  return (
    <>
      <PageHeader title="SMS, WhatsApp & Email" href="/settings/messaging" userId={current.user.id} />
      <p className="-mt-3 mb-4 text-ink-2"><Words k="Switch each channel on or off. DREAM TEAM connects them and adds credits. Message words are in" /> <Link href="/communication/templates" className="text-brand-text underline"><Words k="Message Templates" /></Link><Words k="; automatic messages are in" /> <Link href="/communication/settings" className="text-brand-text underline"><Words k="Message Settings" /></Link>.</p>
      {!canEdit && <Alert tone="info" className="mb-4"><Words k="You can see these settings. The School Admin changes them." /></Alert>}
      {low.map((c) => <Alert key={c} tone="warning" className="mb-4"><Words k="Only" /> {data.balances[c].toLocaleString("en-IN")} {CHANNEL_LABEL[c]} <Words k="credits left, below your alert of" /> {data.setups[c].lowCreditAlert.toLocaleString("en-IN")}<Words k=". To buy more, tell DREAM TEAM." /></Alert>)}

      <div className="space-y-5">
        {offeredChannels(PROVIDER_CHANNELS).map((c) => {
          const s = data.setups[c];
          return (
            <ChannelChoices key={c} readOnly={!canEdit} data={{
              channel: c, label: CHANNEL_LABEL[c], connected: s.provider !== "sandbox", providerLabel: PROVIDERS[c].find((p) => p.key === s.provider)?.label ?? s.provider,
              isOn: s.isOn, live: s.environment === "live", lowCreditAlert: s.lowCreditAlert,
              sender: (c === "whatsapp" ? s.config.displayNumber : c === "email" ? s.config.fromAddress : c === "sms" ? s.config.senderId : null) || null,
              lastTest: s.lastTestAt ? { at: formatDateTime(s.lastTestAt, tz), ok: Boolean(s.lastTestOk) } : null,
            }} />
          );
        })}

        {!SMS_OFFERED && <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2"><Words k="SMS is not used for now. Messages go by WhatsApp, email and the app." /></p>}

        {SMS_OFFERED && <Card>
          <CardHeader title="SMS: DLT registration" description="Every SMS needs a DLT entity ID, sender header and template ID. DREAM TEAM adds them." />
          <CardBody>
            {dltMissing && <Alert tone="info" className="mb-3"><Words k="Not added yet. SMS can be switched on after DREAM TEAM adds it." /></Alert>}
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-ink-2"><Words k="DLT entity ID" /></dt><dd className="font-mono font-medium">{data.school.smsDltEntityId || "Not added yet"}</dd></div>
              <div><dt className="text-ink-2"><Words k="Sender header" /></dt><dd className="font-mono font-medium">{data.school.smsSenderHeader || "Not added yet"}</dd></div>
            </dl>
          </CardBody>
        </Card>}

        <Card>
          <CardHeader title="Credits" description={SMS_OFFERED ? "1 credit per WhatsApp message and 1 per SMS part. Email and app notifications are free. DREAM TEAM adds the credits your school buys." : "1 credit per WhatsApp message. Email and app notifications are free. DREAM TEAM adds the credits your school buys."} />
          <CardBody>
            <dl className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
              {paid.map((c) => (
                <div key={c} className="rounded-xl bg-surface-2 p-3">
                  <dt className="text-sm text-ink-2">{CHANNEL_LABEL[c]} <Words k="credits left" /></dt>
                  <dd className={`text-2xl font-semibold tabular-nums ${data.balances[c] < data.setups[c].lowCreditAlert ? "text-danger" : ""}`}>{data.balances[c].toLocaleString("en-IN")}</dd>
                </div>
              ))}
            </dl>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-semibold"><Words k="Credit history" /></h3>
              {data.total > 0 && <ExportMenu href={listHref("/settings/messaging/credits-export", { ...params, page: 1 }, {})} />}
            </div>
            <ListToolbar placeholder="Search note" showArchived={false} filters={SMS_OFFERED ? [{ key: "channel", label: "Channel", options: [{ value: "whatsapp", label: "WhatsApp" }, { value: "sms", label: "SMS" }] }] : []} />
            <DataTable
              caption="Credit history"
              rows={data.ledger}
              total={data.total}
              params={params}
              path="/settings/messaging"
              rowKey={(l) => l.id}
              empty={<p className="rounded-xl border border-dashed border-line-strong p-6 text-center text-ink-2"><Words k="No credits added or used yet." /></p>}
              columns={[
                { key: "at", label: "When", phone: "meta", cell: (l) => formatDateTime(l.createdAt, tz) },
                { key: "channel", label: "Channel", phone: "meta", cell: (l) => (l.channel === "sms" ? "SMS" : "WhatsApp") },
                { key: "amount", label: "Credits", phone: "title", cell: (l) => <span className={`font-medium tabular-nums ${l.amount < 0 ? "" : "text-success"}`}>{l.amount > 0 ? "+" : ""}{l.amount.toLocaleString("en-IN")}</span> },
                { key: "note", label: "Note", phone: "meta", cell: (l) => (l.messageId ? <Link href={`/communication/history/${l.messageId}`} className="text-brand-text underline">{l.note}</Link> : l.note) },
                { key: "by", label: "By", cell: (l) => (l.createdById ? data.people.get(l.createdById) ?? "Staff" : l.messageId ? "School OS" : "DREAM TEAM support") },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
