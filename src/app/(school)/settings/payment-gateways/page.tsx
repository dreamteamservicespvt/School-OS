import type { Metadata } from "next";
import Link from "next/link";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { readListParams } from "@/lib/list";
import { findProvider, PROVIDERS, TYPE_WORDS } from "@/lib/payments/providers";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Payment Gateways") };
}

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Settings, Payment Gateways only shows what is connected. DREAM TEAM adds, tests and
// switches gateways on from its console (07-super-admin.md §3.8); the school never types
// a key. Which class or fee head uses which gateway stays the school's choice in Fee Settings.
export default async function PaymentGatewaysPage({ searchParams }: Search) {
  const { current } = await requireSettingsPage("payment-gateways");
  const params = readListParams(await searchParams, ["provider", "status"]);
  const tz = current.school.timeZone;
  const { rows, linked } = await withSchool(current.ctx, async (tx) => {
    const rows = await tx.paymentGatewayAccount.findMany({
      where: {
        archivedAt: params.archived ? { not: null } : null,
        ...(params.q ? { displayName: { contains: params.q, mode: "insensitive" as const } } : {}),
        ...(params.filters.provider ? { provider: params.filters.provider } : {}),
        ...(params.filters.status ? { isActive: params.filters.status === "active" } : {}),
      },
      orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
      select: { id: true, displayName: true, provider: true, environment: true, isActive: true, archivedAt: true, lastTestAt: true, lastTestOk: true, updatedAt: true },
    });
    const gateways = new Map((await tx.paymentGatewayAccount.findMany({ where: { archivedAt: null }, select: { id: true, displayName: true } })).map((g) => [g.id, g.displayName]));
    const linked = (await tx.gatewayLinkedAccount.findMany({
      where: { archivedAt: null, gatewayAccountId: { in: [...gateways.keys()] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true, bankName: true, accountLast4: true, gatewayAccountId: true },
    })).map((l) => ({ ...l, gateway: gateways.get(l.gatewayAccountId) ?? "" }));
    return { rows, linked };
  });
  const filtered = Boolean(params.q || params.filters.provider || params.filters.status || params.archived);

  return (
    <>
      <PageHeader title="Payment Gateways" href="/settings/payment-gateways" userId={current.user.id} />
      <p className="-mt-3 mb-4 max-w-prose text-ink-2">
        <Words k="DREAM TEAM connects the school’s payment gateway (Razorpay first) and tests it. To connect a gateway or change one, tell DREAM TEAM support." />{" "}
        <Words k="Which class or fee head uses which gateway is set in Fee Management, Fee Settings." />
      </p>
      {!rows.some((r) => r.isActive) && rows.length > 0 && !filtered && (
        <Alert tone="warning" className="mb-4" title="No gateway is switched on"><Words k="Parents cannot pay online yet. DREAM TEAM switches a gateway on after its test passes. Tell DREAM TEAM support if you are waiting for this." /></Alert>
      )}
      <ListToolbar placeholder="Search gateways"
        filters={[
          { key: "provider", label: "Provider", options: PROVIDERS.map((p) => ({ value: p.key, label: p.name })) },
          { key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
        ]} />
      <DataTable
        caption="Payment gateways"
        rows={rows}
        total={rows.length}
        params={{ ...params, page: 1 }}
        pageSize={Math.max(rows.length, 1)}
        path="/settings/payment-gateways"
        rowKey={(r) => r.id}
        columns={[
          { key: "name", label: "Name", phone: "title", cell: (r) => r.displayName },
          { key: "type", label: "Type", phone: "meta", cell: (r) => { const p = findProvider(r.provider); return p ? `${TYPE_WORDS[p.type]} · ${p.name}` : r.provider; } },
          { key: "status", label: "Status", phone: "badge", cell: (r) => r.archivedAt ? <Badge><Words k="Archived" /></Badge> : r.isActive ? <Badge tone="success"><Words k="Active" /></Badge> : <Badge><Words k="Inactive" /></Badge> },
          { key: "env", label: "Mode", phone: "meta", cell: (r) => r.environment === "live" ? <Badge tone="brand"><Words k="Live" /></Badge> : <Badge tone="warning"><Words k="Test" /></Badge> },
          { key: "test", label: "Last test", phone: "meta", cell: (r) => r.lastTestAt ? <span className={r.lastTestOk ? "text-success" : "text-danger"}>{r.lastTestOk ? <Words k="Passed" /> : <Words k="Problem" />} · {formatDateTime(r.lastTestAt, tz)}</span> : <span className="text-ink-2"><Words k="Not tested" /></span> },
          { key: "changed", label: "Last changed", cell: (r) => formatDateTime(r.updatedAt, tz) },
        ]}
        empty={filtered ? (
          <EmptyState title="No gateway matches these filters"><Link href="/settings/payment-gateways" className="font-medium text-brand-text underline"><Words k="Clear the filters" /></Link></EmptyState>
        ) : (
          <EmptyState title="No payment gateway yet">
            <p><Words k="Parents can pay at the counter in cash, UPI or cheque from day one. To take fees online, tell DREAM TEAM support: DREAM TEAM connects the school’s Razorpay account for you." /></p>
          </EmptyState>
        )}
      />
      {linked.length > 0 && !params.archived && (
        <Card className="mt-5">
          <CardHeader title="Bank accounts for split payments" description="Razorpay splits online payments into these accounts. Fee Settings chooses which fee head goes to which account." />
          <CardBody>
            <ul className="divide-y divide-line">
              {linked.map((l) => (
                <li key={l.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="font-medium">{l.label}</p>
                  <p className="text-sm text-ink-2">{l.bankName} <Words k="· account ending" /> {l.accountLast4} · {l.gateway}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}
