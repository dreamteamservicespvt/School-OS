import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { readListParams } from "@/lib/list";
import { momentWhere, periodFromSearch } from "@/lib/periods";
import { reachFor } from "@/lib/permissions";
import { actionWords, auditWhere, describeDevice, FAILED_LOGIN_ACTIONS, LOGIN_ACTIONS, readAuditFilters } from "@/lib/data-security/audit-view";
import { DataTable } from "@/components/list/data-table";
import { periodSetup } from "@/lib/period-setup";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Login history · Data Backup & Security" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginHistoryPage({ searchParams }: Search) {
  const current = await requirePage("settings");
  const sp = await searchParams;
  const params = readListParams(sp, ["person", "outcome"]);
  const tz = current.school.timeZone;
  const reach = reachFor(current.permissions, "settings", "view");
  const outcome = params.filters.outcome === "failed" ? "failed" : params.filters.outcome === "ok" ? "ok" : null;
  const actions = outcome === "failed" ? FAILED_LOGIN_ACTIONS : outcome === "ok" ? LOGIN_ACTIONS.filter((a) => !FAILED_LOGIN_ACTIONS.includes(a)) : LOGIN_ACTIONS;
  const f = readAuditFilters({ person: params.filters.person });
  const dates = await periodSetup(current);
  const range = periodFromSearch(sp, dates);
  const where = auditWhere(f, reach, current.user.id, tz, { action: { in: actions }, ...(params.q ? { ipAddress: { contains: params.q } } : {}), ...(range ? { at: momentWhere(range, tz) } : {}) });
  const data = await withSchool(current.ctx, async (tx) => {
    const [rows, total, people] = await Promise.all([
      tx.auditLogEntry.findMany({ where, orderBy: { at: "desc" }, skip: (params.page - 1) * 25, take: 25 }),
      tx.auditLogEntry.count({ where }),
      tx.schoolAccess.findMany({ select: { userLogin: { select: { id: true, displayName: true } } }, orderBy: { userLogin: { displayName: "asc" } } }),
    ]);
    return { rows, total, people: people.map((p) => p.userLogin) };
  });
  const names = new Map(data.people.map((p) => [p.id, p.displayName]));
  const filtered = Boolean(params.filters.person || outcome || params.q || range);

  return (
    <>
      <h2 className="sr-only">Login history</h2>
      <p className="mb-4 max-w-prose text-ink-2">Every sign-in, wrong password, one-time code and sign-out, with the device. A person can sign themselves out of other devices from My Profile.</p>
      <ListToolbar placeholder="Search by IP address" showArchived={false} period={dates}
        filters={[
          { key: "outcome", label: "Result", options: [{ value: "failed", label: "Failed or locked" }, { value: "ok", label: "Signed in or out" }] },
          { key: "person", label: "Person", options: data.people.map((p) => ({ value: p.id, label: p.displayName })) },
        ]} />
      <DataTable
        caption="Login history"
        rows={data.rows}
        total={data.total}
        params={params}
        path="/settings/data-security/login-history"
        rowKey={(r) => r.id}
        columns={[
          { key: "when", label: "When", phone: "title", cell: (r) => formatDateTime(r.at, tz) },
          { key: "who", label: "Person", phone: "meta", cell: (r) => (r.userLoginId ? names.get(r.userLoginId) ?? "A person no longer at this school" : (r.after as { identifier?: string } | null)?.identifier ?? "Unknown sign-in name") },
          { key: "what", label: "What happened", phone: "badge", cell: (r) => <Badge tone={FAILED_LOGIN_ACTIONS.includes(r.action) ? "danger" : r.action === "signed-in-new-device" ? "warning" : "neutral"}>{actionWords(r.action)}</Badge> },
          { key: "device", label: "Device", phone: "meta", cell: (r) => describeDevice(r.device) },
          { key: "ip", label: "IP address", cell: (r) => r.ipAddress ?? "" },
        ]}
        empty={filtered ? (
          <EmptyState title="Nothing matches these filters"><Link href="/settings/data-security/login-history" className="font-medium text-brand-text underline">Clear the filters</Link></EmptyState>
        ) : (
          <EmptyState title="No sign-ins recorded yet">Each sign-in to this school will be listed here.</EmptyState>
        )}
      />
    </>
  );
}
