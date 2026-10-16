import type { Metadata } from "next";
import Link from "next/link";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { readListParams } from "@/lib/list";
import { reachFor } from "@/lib/permissions";
import { actionWords, auditWhere, describeDevice, EXPORT_ACTIONS, readAuditFilters } from "@/lib/data-security/audit-view";
import { MASS_EXPORT_ROWS } from "@/lib/data-security/alerts";
import { DataTable } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Export log · Data Backup & Security" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type ExportAfter = { title?: string; format?: string; filters?: string; rows?: number; recordTypes?: number; sizeBytes?: number; personType?: string };

function whatWords(action: string, a: ExportAfter) {
  if (action === "exported") return `${a.title ?? "A list"} (${(a.format ?? "").toUpperCase() === "XLSX" ? "Excel" : (a.format ?? "").toUpperCase()})`;
  if (action === "person-exported") return `One ${a.personType ?? "person"}'s data`;
  return actionWords(action);
}

export default async function ExportLogPage({ searchParams }: Search) {
  const { current } = await requireSettingsPage("data-security");
  const params = readListParams(await searchParams, ["person"]);
  const tz = current.school.timeZone;
  const reach = reachFor(current.permissions, "settings", "view");
  const where = auditWhere(readAuditFilters({ person: params.filters.person }), reach, current.user.id, tz, {
    action: { in: EXPORT_ACTIONS },
    ...(params.q ? { after: { path: ["title"], string_contains: params.q } } : {}),
  });
  const data = await withSchool(current.ctx, async (tx) => {
    const [rows, total, people] = await Promise.all([
      tx.auditLogEntry.findMany({ where, orderBy: { at: "desc" }, skip: (params.page - 1) * 25, take: 25 }),
      tx.auditLogEntry.count({ where }),
      tx.schoolAccess.findMany({ select: { userLogin: { select: { id: true, displayName: true } } }, orderBy: { userLogin: { displayName: "asc" } } }),
    ]);
    return { rows, total, people: people.map((p) => p.userLogin) };
  });
  const names = new Map(data.people.map((p) => [p.id, p.displayName]));
  const filtered = Boolean(params.filters.person || params.q);

  return (
    <>
      <h2 className="sr-only">Export log</h2>
      <p className="mb-4 max-w-prose text-ink-2">Every export and download of school data: who, what, which filters and how many rows. Exports of {MASS_EXPORT_ROWS.toLocaleString("en-IN")} rows or more also show in the security alerts.</p>
      <ListToolbar placeholder="Search by list name" showArchived={false}
        filters={[{ key: "person", label: "Person", options: data.people.map((p) => ({ value: p.id, label: p.displayName })) }]} />
      <DataTable
        caption="Export log"
        rows={data.rows}
        total={data.total}
        params={params}
        path="/settings/data-security/export-log"
        rowKey={(r) => r.id}
        columns={[
          { key: "when", label: "When", phone: "title", cell: (r) => formatDateTime(r.at, tz) },
          { key: "who", label: "Person", phone: "meta", cell: (r) => (r.userLoginId ? names.get(r.userLoginId) ?? "A person no longer at this school" : "School OS") },
          { key: "what", label: "What", phone: "meta", cell: (r) => whatWords(r.action, (r.after ?? {}) as ExportAfter) },
          { key: "filters", label: "Filters", cell: (r) => ((r.after ?? {}) as ExportAfter).filters || <span className="text-ink-2">none</span> },
          { key: "rows", label: "Rows", phone: "badge", cell: (r) => { const n = ((r.after ?? {}) as ExportAfter).rows; return n === undefined ? "" : <Badge tone={n >= MASS_EXPORT_ROWS ? "warning" : "neutral"}>{n.toLocaleString("en-IN")} rows</Badge>; } },
          { key: "device", label: "Device", cell: (r) => (r.device ? describeDevice(r.device) : "") },
        ]}
        empty={filtered ? (
          <EmptyState title="Nothing matches these filters"><Link href="/settings/data-security/export-log" className="font-medium text-brand-text underline">Clear the filters</Link></EmptyState>
        ) : (
          <EmptyState title="Nothing has been exported yet">Each export of a list or report, and each full data export, will be listed here.</EmptyState>
        )}
      />
    </>
  );
}
