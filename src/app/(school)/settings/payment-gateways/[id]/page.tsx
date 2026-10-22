import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { findProvider, TYPE_WORDS } from "@/lib/payments/providers";
import { secretEndings } from "@/lib/payments/gateways";
import { appOrigin } from "@/lib/origin";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { GatewayForm } from "../gateway-form";
import { providerInfo } from "../providers-info";
import { ArchiveGateway, LinkedAccountForm, RemoveLinkedAccount, RestoreGateway, SwitchGateway, TestSavedButton } from "../parts";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Payment gateway" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GatewayPage({ params }: { params: Promise<{ id: string }> }) {
  const { current, may } = await requireSettingsPage("payment-gateways");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const tz = current.school.timeZone;
  const data = await withSchool(current.ctx, async (tx) => {
    const g = await tx.paymentGatewayAccount.findUnique({ where: { id } });
    if (!g) return null;
    const linked = await tx.gatewayLinkedAccount.findMany({ where: { gatewayAccountId: id, archivedAt: null }, orderBy: { createdAt: "asc" } });
    const history = await tx.auditLogEntry.findMany({ where: { recordType: "Payment Gateway Account", recordId: id }, orderBy: { at: "desc" }, take: 8 });
    const people = await tx.schoolAccess.findMany({ where: { userLoginId: { in: history.map((h) => h.userLoginId).filter((x): x is string => Boolean(x)) } }, select: { userLogin: { select: { id: true, displayName: true } } } });
    return { g, linked, history, names: new Map(people.map((p) => [p.userLogin.id, p.userLogin.displayName])) };
  });
  if (!data) notFound();
  const { g, linked, history, names } = data;
  const provider = findProvider(g.provider);
  const canEdit = may.edit;
  const canArchive = may.archive;
  const endings = secretEndings(g);
  const origin = await appOrigin();
  const publicValues: Record<string, string> = {};
  if (provider?.publicField && g.publicKey) publicValues[provider.publicField] = g.publicKey;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm"><Link href="/settings/payment-gateways" className="text-brand-text hover:underline"><Words k="Payment Gateways" /></Link></nav>
      <PageHeader title={g.displayName} href={`/settings/payment-gateways/${g.id}`} userId={current.user.id}>
        <div className="flex flex-wrap items-center gap-2">
          {g.archivedAt ? <Badge><Words k="Archived" /></Badge> : g.isActive ? <Badge tone="success"><Words k="Active" /></Badge> : <Badge><Words k="Inactive" /></Badge>}
          {g.environment === "live" ? <Badge tone="brand"><Words k="Live" /></Badge> : <Badge tone="warning"><Words k="Test" /></Badge>}
        </div>
      </PageHeader>

      {g.archivedAt ? (
        <Alert tone="info" className="mb-5" title="This gateway is archived" action={canArchive ? <RestoreGateway id={g.id} /> : undefined}>
          <Words k="It takes no payments. Payments already made through it keep their record." />
        </Alert>
      ) : g.environment === "test" && g.isActive ? (
        <Alert tone="warning" className="mb-5" title="Test mode"><Words k="Payments through this gateway are pretend payments. Switch to live mode when Razorpay has activated your account." /></Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Connection" description="Test any time. A test asks the provider with the saved details and changes nothing." />
            <CardBody className="space-y-4">
              <dl className="grid gap-4 sm:grid-cols-3">
                <Detail label="Provider">{provider ? `${provider.name} (${TYPE_WORDS[provider.type]})` : g.provider}</Detail>
                <Detail label="Last test">
                  {g.lastTestAt ? <span className={g.lastTestOk ? "text-success" : "text-danger"}>{g.lastTestOk ? "Passed" : "Problem"}, {formatDateTime(g.lastTestAt, tz)}</span> : "Not tested yet"}
                </Detail>
                <Detail label="Secrets saved">{Object.keys(endings).length ? Object.entries(endings).map(([k, v]) => `${provider?.fields.find((f) => f.key === k)?.label ?? provider?.webhookSecret?.label ?? k} ending ${v}`).join(", ") : "None"}</Detail>
              </dl>
              {g.lastTestOk === false && g.lastTestNote && <Alert tone="danger" title="What did not work">{g.lastTestNote}</Alert>}
              {!g.archivedAt && canEdit && (
                <div className="flex flex-wrap items-start gap-3">
                  <TestSavedButton id={g.id} />
                  <SwitchGateway id={g.id} name={g.displayName} on={g.isActive} tested={g.lastTestOk === true} />
                </div>
              )}
            </CardBody>
          </Card>

          {!g.archivedAt && canEdit && (
            <Card>
              <CardHeader title="Change details" description="Secrets are never shown again. Leave a secret blank to keep the saved one." />
              <CardBody>
                <GatewayForm mode="edit" id={g.id} providers={providerInfo()}
                  webhookBase={`${origin}/api/v1/payments/razorpay/webhook?s=${current.school.id}`}
                  saved={{ displayName: g.displayName, provider: g.provider, environment: g.environment === "live" ? "live" : "test", values: publicValues, endings }} />
              </CardBody>
            </Card>
          )}

          {g.provider === "razorpay" && (
            <Card>
              <CardHeader title="Bank accounts for split payments"
                description="When fees go into different bank accounts (Fee Management, Fee Settings), add each account here after setting it up in Razorpay Route. Razorpay then splits online payments to them." />
              <CardBody className="space-y-5">
                {linked.length === 0 ? (
                  <p className="text-ink-2"><Words k="No bank account added. All online payments go to the main account linked to your Razorpay account." /></p>
                ) : (
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {linked.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div>
                          <p className="font-medium">{l.label}</p>
                          <p className="text-sm text-ink-2">{l.bankName} <Words k="· account ending" /> {l.accountLast4} · {l.ifsc} · <code>{l.linkedAccountId}</code></p>
                        </div>
                        {canArchive && !g.archivedAt && <RemoveLinkedAccount gatewayId={g.id} id={l.id} label={l.label} />}
                      </li>
                    ))}
                  </ul>
                )}
                {canEdit && !g.archivedAt && (
                  <details className="rounded-xl border border-line p-4">
                    <summary className="min-h-11 cursor-pointer content-center font-medium"><Words k="Add a bank account" /></summary>
                    <div className="mt-4"><LinkedAccountForm gatewayId={g.id} /></div>
                  </details>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="History" />
            <CardBody>
              {history.length === 0 ? <p className="text-ink-2"><Words k="No changes yet." /></p> : (
                <ol className="space-y-3 text-sm">
                  {history.map((h) => (
                    <li key={h.id}>
                      <p className="font-medium">{ACTION_WORDS[h.action] ?? h.action}</p>
                      <p className="text-ink-2">{h.userLoginId ? names.get(h.userLoginId) ?? "Someone" : "School OS"} · {formatDateTime(h.at, tz)}</p>
                    </li>
                  ))}
                </ol>
              )}
              <Link href={`/settings/data-security/audit-log?record=${g.id}`} className="mt-4 inline-flex min-h-11 items-center font-medium text-brand-text hover:underline"><Words k="Full history with old and new values" /></Link>
            </CardBody>
          </Card>
          {!g.archivedAt && canArchive && (
            <Card>
              <CardHeader title="Archive" description="Stops this gateway for good. Past payments keep their record." />
              <CardBody><ArchiveGateway id={g.id} name={g.displayName} /></CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

const ACTION_WORDS: Record<string, string> = {
  created: "Added",
  changed: "Details changed",
  tested: "Connection tested",
  "switched-on": "Switched on",
  "switched-off": "Switched off",
  archived: "Archived",
  restored: "Restored",
  "webhook-received": "Payment confirmation received",
  "webhook-refused": "Confirmation refused (signature did not match)",
};
