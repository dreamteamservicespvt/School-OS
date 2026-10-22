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
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Payment Gateways" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PaymentGatewaysPage({ searchParams }: Search) {
  const { current, may } = await requireSettingsPage("payment-gateways");
  const params = readListParams(await searchParams, ["provider", "status"]);
  const tz = current.school.timeZone;
  const rows = await withSchool(current.ctx, (tx) =>
    tx.paymentGatewayAccount.findMany({
      where: {
        archivedAt: params.archived ? { not: null } : null,
        ...(params.q ? { displayName: { contains: params.q, mode: "insensitive" as const } } : {}),
        ...(params.filters.provider ? { provider: params.filters.provider } : {}),
        ...(params.filters.status ? { isActive: params.filters.status === "active" } : {}),
      },
      orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
    }),
  );
  const canAdd = may.create;
  const filtered = Boolean(params.q || params.filters.provider || params.filters.status || params.archived);

  return (
    <>
      <PageHeader title="Payment Gateways" href="/settings/payment-gateways" userId={current.user.id}>
        {canAdd && <ButtonLink href="/settings/payment-gateways/new" variant="primary"><Words k="Add a gateway" /></ButtonLink>}
      </PageHeader>
      <p className="-mt-3 mb-4 max-w-prose text-ink-2">
        <Words k="Connect Razorpay and other gateways so parents can pay online. Which class or fee head uses which gateway is set in Fee Management, Fee Settings." />
      </p>
      {!rows.some((r) => r.isActive) && rows.length > 0 && !filtered && (
        <Alert tone="warning" className="mb-4" title="No gateway is switched on"><Words k="Parents cannot pay online yet. Open a gateway, test it, then switch it on." /></Alert>
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
        rowHref={(r) => `/settings/payment-gateways/${r.id}`}
        columns={[
          { key: "name", label: "Name", phone: "title", cell: (r) => r.displayName },
          { key: "type", label: "Type", phone: "meta", cell: (r) => { const p = findProvider(r.provider); return p ? `${TYPE_WORDS[p.type]} · ${p.name}` : r.provider; } },
          { key: "status", label: "Status", phone: "badge", cell: (r) => r.archivedAt ? <Badge><Words k="Archived" /></Badge> : r.isActive ? <Badge tone="success"><Words k="Active" /></Badge> : <Badge><Words k="Inactive" /></Badge> },
          { key: "env", label: "Mode", phone: "meta", cell: (r) => r.environment === "live" ? <Badge tone="brand"><Words k="Live" /></Badge> : <Badge tone="warning"><Words k="Test" /></Badge> },
          { key: "test", label: "Last test", phone: "meta", cell: (r) => r.lastTestAt ? <span className={r.lastTestOk ? "text-success" : "text-danger"}>{r.lastTestOk ? "Passed" : "Problem"} · {formatDateTime(r.lastTestAt, tz)}</span> : <span className="text-ink-2"><Words k="Not tested" /></span> },
          { key: "changed", label: "Last changed", cell: (r) => formatDateTime(r.updatedAt, tz) },
        ]}
        actions={(r) => <Link href={`/settings/payment-gateways/${r.id}`} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2">{r.archivedAt ? "View" : "Edit or test"}</Link>}
        empty={filtered ? (
          <EmptyState title="No gateway matches these filters"><Link href="/settings/payment-gateways" className="font-medium text-brand-text underline"><Words k="Clear the filters" /></Link></EmptyState>
        ) : (
          <EmptyState title="No payment gateway yet">
            <p><Words k="Parents can pay at the counter in cash, UPI or cheque from day one. To take fees online, connect Razorpay (recommended) or another gateway." /></p>
            {canAdd && <div className="mt-4"><ButtonLink href="/settings/payment-gateways/new" variant="primary"><Words k="Add a gateway" /></ButtonLink></div>}
          </EmptyState>
        )}
      />
    </>
  );
}
