import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireConsolePage } from "@/lib/console/current";
import { withConsoleSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { findProvider, TYPE_WORDS } from "@/lib/payments/providers";
import { secretEndings } from "@/lib/payments/gateways";
import { appUrl } from "@/lib/parent-link/token";
import { BackLink } from "@/components/console/bits";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { GatewayForm } from "../gateway-form";
import { providerInfo } from "../providers-info";
import { ArchiveGateway, LinkedAccountForm, RemoveLinkedAccount, RestoreGateway, SwitchGateway, TestSavedButton } from "../parts";

export const metadata: Metadata = { title: "Payment gateway" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GatewayPage({ params }: { params: Promise<{ id: string; gatewayId: string }> }) {
  await requireConsolePage("connect");
  const { id: schoolId, gatewayId: id } = await params;
  if (!UUID.test(schoolId) || !UUID.test(id)) notFound();
  const data = await withConsoleSchool(schoolId, async (tx) => {
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, timeZone: true } });
    const g = await tx.paymentGatewayAccount.findFirst({ where: { id, schoolId } });
    if (!school || !g) return null;
    const linked = await tx.gatewayLinkedAccount.findMany({ where: { gatewayAccountId: id, archivedAt: null }, orderBy: { createdAt: "asc" } });
    const history = await tx.auditLogEntry.findMany({ where: { schoolId, recordType: "Payment Gateway Account", recordId: id }, orderBy: { at: "desc" }, take: 8 });
    return { school, g, linked, history };
  });
  if (!data) notFound();
  const { school, g, linked, history } = data;
  const tz = school.timeZone;
  const provider = findProvider(g.provider);
  const endings = secretEndings(g);
  const publicValues: Record<string, string> = {};
  if (provider?.publicField && g.publicKey) publicValues[provider.publicField] = g.publicKey;

  return (
    <div className="space-y-5">
      <div>
        <BackLink href={`/console/schools/${schoolId}/connections#gateways`} label="Connections" extra={school.name} />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold">{g.displayName}</h1>
          {g.archivedAt ? <Badge>Archived</Badge> : g.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
          {g.environment === "live" ? <Badge tone="brand">Live</Badge> : <Badge tone="warning">Test</Badge>}
        </div>
        <p className="mt-1 max-w-prose text-ink2">A payment gateway of {school.name}. Every change here goes into the school’s Audit Log with your name. The school sees this gateway in Settings, Payment Gateways, without its keys.</p>
      </div>

      {g.archivedAt ? (
        <Alert tone="info" title="This gateway is archived" action={<RestoreGateway schoolId={schoolId} id={g.id} />}>
          It takes no payments. Payments already made through it keep their record.
        </Alert>
      ) : g.environment === "test" && g.isActive ? (
        <Alert tone="warning" title="Test mode">Payments through this gateway are pretend payments. Switch to live mode when Razorpay has activated the school’s account.</Alert>
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
              {!g.archivedAt && (
                <div className="flex flex-wrap items-start gap-3">
                  <TestSavedButton schoolId={schoolId} id={g.id} />
                  <SwitchGateway schoolId={schoolId} id={g.id} name={g.displayName} on={g.isActive} tested={g.lastTestOk === true} />
                </div>
              )}
            </CardBody>
          </Card>

          {!g.archivedAt && (
            <Card>
              <CardHeader title="Change details" description="Secrets are never shown again. Leave a secret blank to keep the saved one." />
              <CardBody>
                <GatewayForm schoolId={schoolId} mode="edit" id={g.id} providers={providerInfo()}
                  webhookBase={`${appUrl()}/api/v1/payments/razorpay/webhook?s=${schoolId}`}
                  saved={{ displayName: g.displayName, provider: g.provider, environment: g.environment === "live" ? "live" : "test", values: publicValues, endings }} />
              </CardBody>
            </Card>
          )}

          {g.provider === "razorpay" && (
            <Card>
              <CardHeader title="Bank accounts for split payments"
                description="When the school’s fees go into different bank accounts (its Fee Settings), add each account here after setting it up in Razorpay Route. Razorpay then splits online payments to them." />
              <CardBody className="space-y-5">
                {linked.length === 0 ? (
                  <p className="text-ink2">No bank account added. All online payments go to the main account linked to the school’s Razorpay account.</p>
                ) : (
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {linked.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div>
                          <p className="font-medium">{l.label}</p>
                          <p className="text-sm text-ink2">{l.bankName} · account ending {l.accountLast4} · {l.ifsc} · <code>{l.linkedAccountId}</code></p>
                        </div>
                        {!g.archivedAt && <RemoveLinkedAccount schoolId={schoolId} gatewayId={g.id} id={l.id} label={l.label} />}
                      </li>
                    ))}
                  </ul>
                )}
                {!g.archivedAt && (
                  <details className="rounded-xl border border-line p-4">
                    <summary className="min-h-11 cursor-pointer content-center font-medium">Add a bank account</summary>
                    <div className="mt-4"><LinkedAccountForm schoolId={schoolId} gatewayId={g.id} /></div>
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
              {history.length === 0 ? <p className="text-ink2">No changes yet.</p> : (
                <ol className="space-y-3 text-sm">
                  {history.map((h) => (
                    <li key={h.id}>
                      <p className="font-medium">{ACTION_WORDS[h.action] ?? h.action}</p>
                      <p className="text-ink2">{h.actorNote ?? (h.userLoginId ? "A school login" : "School OS")} · {formatDateTime(h.at, tz)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
          {!g.archivedAt && (
            <Card>
              <CardHeader title="Archive" description="Stops this gateway for good. Past payments keep their record." />
              <CardBody><ArchiveGateway schoolId={schoolId} id={g.id} name={g.displayName} /></CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
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
