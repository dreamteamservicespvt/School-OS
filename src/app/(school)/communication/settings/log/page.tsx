import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { commOfficePage } from "@/lib/communication/access";
import { readListParams, skipTake, listHref } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { RULES, ruleDef } from "@/lib/messaging/automatic";
import { LOG_FILTERS, logWhere, OUTCOME_LABEL } from "@/lib/communication/automation-log";
import { PageHeader } from "@/components/shell/page-header";
import { ListToolbar } from "@/components/list/list-toolbar";
import { DataTable } from "@/components/list/data-table";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { MessageIcon } from "@/components/icons";
import { ExportMenu } from "@/components/communication/export-menu";

export const metadata: Metadata = { title: "Automation log" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function AutomationLogPage({ searchParams }: { searchParams: Search }) {
  const access = await commOfficePage();
  const { current } = access;
  const tz = current.school.timeZone;
  const params = readListParams(await searchParams, LOG_FILTERS);
  const data = await withSchool(current.ctx, async (tx) => {
    const where = logWhere(current.ctx, params, current.school.timeZone);
    const [rows, total] = await Promise.all([
      tx.automationLog.findMany({ where, orderBy: { createdAt: params.sort === "at" && params.dir === "asc" ? "asc" : "desc" }, ...skipTake(params) }),
      tx.automationLog.count({ where }),
    ]);
    return { rows, total };
  });
  const filtered = Boolean(params.q || Object.keys(params.filters).length);

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/communication/settings" className="text-brand-text hover:underline">← Message Settings</Link></p>
      <PageHeader title="Automation log" href="/communication/settings/log" userId={current.user.id}>
        {data.total > 0 && <ExportMenu href={listHref("/communication/settings/log/export", { ...params, page: 1 }, {})} />}
      </PageHeader>
      <p className="-mt-3 mb-4 text-ink-2">What each automatic message sent, to whom, and why.</p>
      <ListToolbar period={{ timeZone: current.school.timeZone }} placeholder="Search person or event" showArchived={false} filters={[
        { key: "rule", label: "Rule", options: RULES.map((r) => ({ value: r.key, label: r.label })) },
        { key: "outcome", label: "Outcome", options: Object.entries(OUTCOME_LABEL).map(([value, label]) => ({ value, label })) },
      ]} />
      <DataTable
        caption="Automation log"
        rows={data.rows}
        total={data.total}
        params={params}
        path="/communication/settings/log"
        rowKey={(r) => r.id}
        
        empty={
          <EmptyState title={filtered ? "Nothing matches these filters" : "No automatic messages yet"} icon={<MessageIcon className="size-6" />}>
            {filtered ? "Change the search or filters." : "When attendance, fees, results and other modules send automatic messages, each one is listed here with its reason."}
          </EmptyState>
        }
        columns={[
          { key: "at", label: "When", sortable: true, phone: "meta", cell: (r) => formatDateTime(r.createdAt, tz) },
          { key: "rule", label: "Rule", phone: "title", cell: (r) => <span className="font-medium">{ruleDef(r.ruleKey)?.label ?? r.ruleKey}</span> },
          { key: "event", label: "Event", phone: "meta", cell: (r) => r.eventLabel },
          { key: "to", label: "To", phone: "meta", cell: (r) => r.recipientName },
          { key: "outcome", label: "Outcome", phone: "badge", cell: (r) => <Badge tone={r.outcome === "sent" ? "success" : r.outcome === "no-credits" ? "danger" : "neutral"}>{OUTCOME_LABEL[r.outcome] ?? r.outcome}</Badge> },
          { key: "note", label: "Note", cell: (r) => (r.messageId ? <Link href={`/communication/history/${r.messageId}`} className="text-brand-text underline">{r.note ?? "Delivery"}</Link> : r.note ?? "") },
        ]}
      />
    </>
  );
}
