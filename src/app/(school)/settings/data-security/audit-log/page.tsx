import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { listHref, readListParams } from "@/lib/list";
import { can, reachFor } from "@/lib/permissions";
import { actionWords, auditWhere, describeDevice, diff, readAuditFilters } from "@/lib/data-security/audit-view";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Audit log · Data Backup & Security" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const PAGE = 50;

export default async function AuditLogPage({ searchParams }: Search) {
  const current = await requirePage("settings");
  const sp = await searchParams;
  const f = readAuditFilters(sp);
  const params = readListParams(sp, ["person", "recordType", "action", "record", "period", "from", "to"]);
  const tz = current.school.timeZone;
  const reach = reachFor(current.permissions, "settings", "view");
  const where = auditWhere(f, reach, current.user.id, tz);
  const data = await withSchool(current.ctx, async (tx) => {
    const [rows, total, types, actions, people] = await Promise.all([
      tx.auditLogEntry.findMany({ where, orderBy: { at: "desc" }, skip: (params.page - 1) * PAGE, take: PAGE }),
      tx.auditLogEntry.count({ where }),
      tx.auditLogEntry.findMany({ where: auditWhere({}, reach, current.user.id, tz), distinct: ["recordType"], select: { recordType: true }, orderBy: { recordType: "asc" } }),
      tx.auditLogEntry.findMany({ where: auditWhere({}, reach, current.user.id, tz), distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
      tx.schoolAccess.findMany({ select: { userLogin: { select: { id: true, displayName: true } } }, orderBy: { userLogin: { displayName: "asc" } } }),
    ]);
    return { rows, total, types: types.map((t) => t.recordType), actions: actions.map((a) => a.action), people: people.map((p) => p.userLogin) };
  });
  const names = new Map(data.people.map((p) => [p.id, p.displayName]));
  const pages = Math.max(1, Math.ceil(data.total / PAGE));
  const filtered = Object.values(f).some(Boolean);
  const exportQuery = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
  const canExport = can(current.permissions, "settings", "export");

  return (
    <>
      <h2 className="sr-only">Audit log</h2>
      <p className="mb-4 max-w-prose text-ink-2">
        Every change in School OS: who, what, when, from which device, with the values before and after. Nobody can change or remove these lines.
        {reach === "own" && " Your role shows only your own changes."}
      </p>
      <ListToolbar placeholder="Record type, action or record ID" showArchived={false} period={{ timeZone: tz }}
        filters={[
          { key: "person", label: "Person", allLabel: "Anyone", options: [{ value: "system", label: "School OS (automatic)" }, ...data.people.map((p) => ({ value: p.id, label: p.displayName }))] },
          { key: "action", label: "Action", allLabel: "Any action", options: data.actions.map((a) => ({ value: a, label: actionWords(a) })) },
        ]}
        more={[{ key: "recordType", label: "Record type", allLabel: "Any record type", options: data.types.map((t) => ({ value: t, label: t })) }]} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink-2" role="status">{data.total.toLocaleString("en-IN")} entr{data.total === 1 ? "y" : "ies"}{f.record ? ` for record ${f.record}` : ""}</p>
        {canExport && data.total > 0 && (
          <div className="flex flex-wrap gap-1">
            {(["xlsx", "csv", "pdf"] as const).map((fmt) => (
              <a key={fmt} href={`/settings/data-security/audit-log/export?${new URLSearchParams([...exportQuery, ["format", fmt]])}`} className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm font-medium hover:bg-surface-2">
                Export {fmt === "xlsx" ? "Excel" : fmt.toUpperCase()}
              </a>
            ))}
          </div>
        )}
      </div>

      {data.rows.length === 0 ? (
        filtered ? (
          <EmptyState title="No entries match these filters"><Link href="/settings/data-security/audit-log" className="font-medium text-brand-text underline">Clear the filters</Link></EmptyState>
        ) : (
          <EmptyState title="No changes recorded yet">Every change anyone makes will be listed here.</EmptyState>
        )
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {data.rows.map((r) => {
            const rows = diff(r.before, r.after);
            return (
              <li key={r.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-start gap-x-4 gap-y-1 p-3 hover:bg-surface-2/60 sm:flex-nowrap">
                    <span className="w-40 shrink-0 text-sm text-ink-2">{formatDateTime(r.at, tz)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{actionWords(r.action)}</span>{" "}
                      <span className="text-ink-2">· {r.recordType}</span>
                      <span className="block text-sm text-ink-2">
                        {r.userLoginId ? names.get(r.userLoginId) ?? "A person no longer at this school" : r.actorNote ?? "School OS"}
                        {r.device ? ` · ${describeDevice(r.device)}` : ""}{r.ipAddress ? ` · ${r.ipAddress}` : ""}
                      </span>
                    </span>
                    {rows.length > 0 && <span className="text-sm font-medium text-brand-text group-open:hidden">Show details</span>}
                  </summary>
                  <div className="space-y-2 px-3 pb-4">
                    {r.recordId && (
                      <p className="text-sm">
                        Record ID <code className="break-all">{r.recordId}</code>{" "}
                        <Link href={listHref("/settings/data-security/audit-log", { ...params, page: 1, filters: {} , q: ""}, { record: r.recordId, recordType: r.recordType })} className="font-medium text-brand-text hover:underline">See this record&apos;s history</Link>
                      </p>
                    )}
                    {rows.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <caption className="sr-only">Values before and after</caption>
                          <thead className="text-ink-2"><tr><th scope="col" className="py-1 pr-3 font-medium">Field</th><th scope="col" className="py-1 pr-3 font-medium">Before</th><th scope="col" className="py-1 font-medium">After</th></tr></thead>
                          <tbody className="divide-y divide-line">
                            {rows.map((d) => (
                              <tr key={d.field} className={d.changed ? "" : "text-ink-2"}>
                                <th scope="row" className="py-1 pr-3 font-medium">{d.field}{d.changed && <Badge tone="warning" className="ml-2">changed</Badge>}</th>
                                <td className="max-w-xs break-words py-1 pr-3">{d.before || <span className="text-ink-2">(empty)</span>}</td>
                                <td className="max-w-xs break-words py-1">{d.after || <span className="text-ink-2">(empty)</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <p className="text-sm text-ink-2">No values were recorded for this action.</p>}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-2">Page {params.page} of {pages}</p>
          <div className="flex gap-2">
            {params.page > 1 && <Link href={listHref("/settings/data-security/audit-log", params, { page: params.page - 1 })} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 font-medium hover:bg-surface-2">Previous</Link>}
            {params.page < pages && <Link href={listHref("/settings/data-security/audit-log", params, { page: params.page + 1 })} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 font-medium hover:bg-surface-2">Next</Link>}
          </div>
        </nav>
      )}
    </>
  );
}
