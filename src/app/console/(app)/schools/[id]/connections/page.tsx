import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireConsolePage } from "@/lib/console/current";
import { connectionsCtx } from "@/lib/console/connections";
import { withConsoleSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { CHANNEL_LABEL, channelSetups, PROVIDER_CHANNELS, PROVIDER_FIELDS, PROVIDERS } from "@/lib/messaging/channels";
import { creditBalances } from "@/lib/messaging/credits";
import { webhookPath } from "@/lib/messaging/webhooks";
import { LANGUAGES } from "@/lib/messaging/templates";
import { appUrl } from "@/lib/parent-link/token";
import { BackLink } from "@/components/console/bits";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ChannelCard, CreditsForm, DltForm, SmsDltIdForm } from "./channel-forms";
import { GatewaysSection } from "./gateways-section";
import { IntegrationsSection } from "./integrations-section";

export const metadata: Metadata = { title: "Connections" };

const SECTIONS = [
  { id: "messages", label: "SMS, WhatsApp & Email" },
  { id: "sms-templates", label: "SMS template DLT IDs" },
  { id: "gateways", label: "Payment gateways" },
  { id: "other", label: "Other connections" },
] as const;

export default async function ConnectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const c = await requireConsolePage("connect");
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const ctx = connectionsCtx(c, id);
  const data = await withConsoleSchool(id, async (tx) => {
    const school = await tx.school.findUnique({ where: { id }, select: { id: true, name: true, timeZone: true, smsDltEntityId: true, smsSenderHeader: true } });
    if (!school) return null;
    const [setups, balances, smsTemplates] = await Promise.all([
      channelSetups(tx, ctx),
      creditBalances(tx, ctx),
      tx.template.findMany({
        where: { schoolId: id, channel: "sms", archivedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true, versions: { where: { isCurrent: true }, orderBy: { language: "asc" }, select: { id: true, language: true, body: true, dltTemplateId: true } } },
      }),
    ]);
    return { school, setups, balances, smsTemplates };
  });
  if (!data) notFound();
  const { school, setups, balances, smsTemplates } = data;
  const tz = school.timeZone;
  const base = appUrl();
  const dltMissing = !school.smsDltEntityId || !school.smsSenderHeader;
  const smsTexts = smsTemplates.flatMap((t) => t.versions.map((v) => ({ ...v, name: t.name })));
  const smsWaiting = smsTexts.filter((v) => !v.dltTemplateId).length;
  const lang = (code: string) => LANGUAGES.find((l) => l.code === code)?.label ?? code;

  return (
    <div className="space-y-5">
      <div>
        <BackLink href={`/console/schools/${id}`} label={school.name} />
        <h1 className="font-display text-2xl font-bold">Connections</h1>
        <p className="mt-1 max-w-prose text-ink2">DREAM TEAM sets these up for {school.name}. The school never types a key or provider ID: its Settings only shows what is connected and lets it switch each message channel on or off. Every change here goes into the school’s Audit Log with your name.</p>
        <nav aria-label="Sections" className="mt-3 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <Link key={s.id} href={`#${s.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line px-3 text-sm font-medium hover:bg-sunken">
              {s.label}{s.id === "sms-templates" && smsWaiting > 0 && <Badge tone="warning">{smsWaiting}</Badge>}
            </Link>
          ))}
        </nav>
      </div>

      <section id="messages" className="scroll-mt-20 space-y-5" aria-label="SMS, WhatsApp & Email">
        {PROVIDER_CHANNELS.map((ch) => {
          const s = setups[ch];
          return (
            <ChannelCard key={ch} data={{
              schoolId: id, channel: ch, label: CHANNEL_LABEL[ch], provider: s.provider, providers: PROVIDERS[ch], fields: Object.fromEntries(PROVIDERS[ch].map((p) => [p.key, PROVIDER_FIELDS[p.key] ?? []])),
              config: s.config, hasSecrets: s.hasSecrets, secretsLast4: s.secretsLast4, isOn: s.isOn, live: s.environment === "live", lowCreditAlert: s.lowCreditAlert,
              lastTest: s.lastTestAt ? { at: formatDateTime(s.lastTestAt, tz), ok: Boolean(s.lastTestOk), note: s.lastTestNote ?? "" } : null,
              testTo: ch === "email" ? c.user.email ?? "" : c.user.phone.replace(/\D/g, "").slice(-10),
              webhook: ch === "email" ? null : `${base}${webhookPath(ch, id)}${ch === "sms" ? "?key=<key>" : ""}`,
            }} />
          );
        })}

        <Card>
          <CardHeader title="SMS: DLT registration" description="The school’s principal entity ID and approved sender header from the telecom DLT portal." />
          <CardBody>
            {dltMissing && <Alert tone="warning" className="mb-3">SMS cannot be switched on until both are added.</Alert>}
            <DltForm schoolId={id} entityId={school.smsDltEntityId ?? ""} header={school.smsSenderHeader ?? ""} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Message credits" description="Credits on a paid credits invoice are added by themselves. Add credits by hand only for anything else, with the reason; a minus number corrects a mistake." />
          <CardBody>
            <dl className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
              {(["whatsapp", "sms"] as const).map((ch) => (
                <div key={ch} className="rounded-xl bg-sunken p-3">
                  <dt className="text-sm text-ink2">{CHANNEL_LABEL[ch]} credits left</dt>
                  <dd className={`text-2xl font-semibold tabular-nums ${balances[ch] < setups[ch].lowCreditAlert ? "text-bad" : ""}`}>{balances[ch].toLocaleString("en-IN")}</dd>
                </div>
              ))}
            </dl>
            <CreditsForm schoolId={id} />
          </CardBody>
        </Card>
      </section>

      <section id="sms-templates" className="scroll-mt-20" aria-label="SMS template DLT IDs">
        <Card>
          <CardHeader title="SMS template DLT IDs" description="Register each text on the DLT portal exactly as written, then add its DLT template ID here. An SMS text without one cannot be sent. When the school changes a text, the new text needs its own ID." />
          <CardBody>
            {smsTexts.length === 0 ? <p className="text-ink2">This school has no SMS templates.</p> : (
              <ul className="divide-y divide-line">
                {smsTexts.map((v) => (
                  <li key={v.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="font-medium">{v.name}</p>
                      <span className="text-sm text-ink2">{lang(v.language)}</span>
                      {v.dltTemplateId ? <Badge tone="success">DLT ID added</Badge> : <Badge tone="warning">DLT ID missing</Badge>}
                    </div>
                    <p className="mb-2 whitespace-pre-wrap break-words rounded-lg bg-sunken p-3 font-mono text-sm">{v.body}</p>
                    <SmsDltIdForm schoolId={id} versionId={v.id} value={v.dltTemplateId ?? ""} label={`${v.name} (${lang(v.language)})`} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>

      <GatewaysSection schoolId={id} />
      <IntegrationsSection schoolId={id} />
    </div>
  );
}
