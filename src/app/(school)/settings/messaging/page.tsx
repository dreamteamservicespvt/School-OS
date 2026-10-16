import type { Metadata } from "next";
import Link from "next/link";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, listHref } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { CHANNEL_LABEL, channelSetups, PROVIDER_CHANNELS, PROVIDER_FIELDS, PROVIDERS } from "@/lib/messaging/channels";
import { creditBalances } from "@/lib/messaging/credits";
import { webhookPath } from "@/lib/messaging/webhooks";
import { appUrl } from "@/lib/parent-link/token";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ExportMenu } from "@/components/communication/export-menu";
import { ChannelCard, CreditsForm, DltForm } from "./channel-forms";

export const metadata: Metadata = { title: "SMS, WhatsApp & Email" };

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
    const me = current.user.id ? await tx.userLogin.findUnique({ where: { id: current.user.id }, select: { phone: true, email: true } }) : null;
    const people = await tx.userLogin.findMany({ where: { id: { in: ledger.map((l) => l.createdById).filter(Boolean) as string[] } }, select: { id: true, displayName: true } });
    return { setups, balances, school, ledger, total, me, people: new Map(people.map((p) => [p.id, p.displayName])) };
  });
  const base = appUrl();
  const low = (["whatsapp", "sms"] as const).filter((c) => data.setups[c].isOn && data.balances[c] < data.setups[c].lowCreditAlert);
  const dltMissing = !data.school.smsDltEntityId || !data.school.smsSenderHeader;

  return (
    <>
      <PageHeader title="SMS, WhatsApp & Email" href="/settings/messaging" userId={current.user.id} />
      <p className="-mt-3 mb-4 text-ink-2">Connect each channel to a provider. Keys are stored encrypted and never shown again. What each message says is in <Link href="/communication/templates" className="text-brand-text underline">Message Templates</Link>; automatic messages are in <Link href="/communication/settings" className="text-brand-text underline">Message Settings</Link>.</p>
      {!canEdit && <Alert tone="info" className="mb-4">You can see these settings. The School Admin changes them.</Alert>}
      {low.map((c) => <Alert key={c} tone="warning" className="mb-4">Only {data.balances[c].toLocaleString("en-IN")} {CHANNEL_LABEL[c]} credits left, below your alert of {data.setups[c].lowCreditAlert.toLocaleString("en-IN")}. Buy more from the provider and add them below.</Alert>)}

      <div className="space-y-5">
        {PROVIDER_CHANNELS.map((c) => {
          const s = data.setups[c];
          return (
            <ChannelCard key={c} readOnly={!canEdit} data={{
              channel: c, label: CHANNEL_LABEL[c], provider: s.provider, providers: PROVIDERS[c], fields: Object.fromEntries(PROVIDERS[c].map((p) => [p.key, PROVIDER_FIELDS[p.key] ?? []])),
              config: s.config, hasSecrets: s.hasSecrets, secretsLast4: s.secretsLast4, isOn: s.isOn, live: s.environment === "live", lowCreditAlert: s.lowCreditAlert,
              lastTest: s.lastTestAt ? { at: formatDateTime(s.lastTestAt, tz), ok: Boolean(s.lastTestOk), note: s.lastTestNote ?? "" } : null,
              testTo: c === "email" ? data.me?.email ?? "" : (data.me?.phone ?? "").replace(/\D/g, "").slice(-10),
              webhook: c === "email" ? null : `${base}${webhookPath(c, current.ctx.schoolId)}${c === "sms" ? "?key=<key>" : ""}`,
            }} />
          );
        })}

        <Card>
          <CardHeader title="SMS: DLT registration" description="Indian telecom rules: every SMS needs the school's DLT entity ID, an approved sender header, and a DLT template ID on each SMS template." />
          <CardBody>
            {dltMissing && <Alert tone="warning" className="mb-3">SMS cannot be switched on until both are added.</Alert>}
            <DltForm entityId={data.school.smsDltEntityId ?? ""} header={data.school.smsSenderHeader ?? ""} readOnly={!canEdit} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Credits" description="1 credit per WhatsApp message and 1 per SMS part. Email and app notifications are free." />
          <CardBody>
            <dl className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
              {(["whatsapp", "sms"] as const).map((c) => (
                <div key={c} className="rounded-xl bg-surface-2 p-3">
                  <dt className="text-sm text-ink-2">{CHANNEL_LABEL[c]} credits left</dt>
                  <dd className={`text-2xl font-semibold tabular-nums ${data.balances[c] < data.setups[c].lowCreditAlert ? "text-danger" : ""}`}>{data.balances[c].toLocaleString("en-IN")}</dd>
                </div>
              ))}
            </dl>
            {canEdit && <div className="mb-5"><CreditsForm /></div>}
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-semibold">Credit history</h3>
              {data.total > 0 && <ExportMenu href={listHref("/settings/messaging/credits-export", { ...params, page: 1 }, {})} />}
            </div>
            <ListToolbar placeholder="Search note" showArchived={false} filters={[{ key: "channel", label: "Channel", options: [{ value: "whatsapp", label: "WhatsApp" }, { value: "sms", label: "SMS" }] }]} />
            <DataTable
              caption="Credit history"
              rows={data.ledger}
              total={data.total}
              params={params}
              path="/settings/messaging"
              rowKey={(l) => l.id}
              empty={<p className="rounded-xl border border-dashed border-line-strong p-6 text-center text-ink-2">No credits added or used yet.</p>}
              columns={[
                { key: "at", label: "When", phone: "meta", cell: (l) => formatDateTime(l.createdAt, tz) },
                { key: "channel", label: "Channel", phone: "meta", cell: (l) => (l.channel === "sms" ? "SMS" : "WhatsApp") },
                { key: "amount", label: "Credits", phone: "title", cell: (l) => <span className={`font-medium tabular-nums ${l.amount < 0 ? "" : "text-success"}`}>{l.amount > 0 ? "+" : ""}{l.amount.toLocaleString("en-IN")}</span> },
                { key: "note", label: "Note", phone: "meta", cell: (l) => (l.messageId ? <Link href={`/communication/history/${l.messageId}`} className="text-brand-text underline">{l.note}</Link> : l.note) },
                { key: "by", label: "By", cell: (l) => (l.createdById ? data.people.get(l.createdById) ?? "Staff" : "School OS") },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
