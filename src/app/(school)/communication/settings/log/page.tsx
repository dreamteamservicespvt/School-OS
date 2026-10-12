import type { Metadata } from "next";
import { withSchool } from "@/lib/db";
import { commOfficePage } from "@/lib/communication/access";
import { readListParams, skipTake, listHref } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { RULES, ruleDef } from "@/lib/messaging/automatic";
import { LOG_FILTERS, logWhere, OUTCOME_LABEL } from "@/lib/communication/automation-log";
import { Zap } from "lucide-react";
import { PAGE_SIZE } from "@/lib/list";
import { Card } from "@/components/ui/card";
import { Toolbar } from "@/components/ui/toolbar";
import { DataList } from "@/components/ui/data-list";
import { Pill, type PillTone } from "@/components/ui/badge";
import { BackLink, RecordHead } from "@/components/ui/split";
import { UrlSearch, UrlSelect } from "@/components/ui/url-filters";
import { PeriodFilter } from "@/components/list/period-filter";
import { EmptyState } from "@/components/empty-state";
import { ExportMenu } from "@/components/communication/export-menu";

const TONE: Record<string, PillTone> = { sent: "ok", "no-credits": "bad" };

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

  const name = (k: string) => ruleDef(k)?.label ?? k;
  return (
    <>
      <BackLink href="/communication/settings" label="Message Settings" />
      <RecordHead title="Automation log" sub={<span className="text-[14px] text-ink3">What each automatic message sent, to whom, and why.</span>} />
      <Card className="overflow-hidden min-w-0">
        <Toolbar className="flex-wrap">
          <UrlSearch placeholder="Person or event" className="min-w-[14rem]" />
          <UrlSelect param="rule" label="Rule" className="md:w-48" options={[{ value: "", label: "Every rule" }, ...RULES.map((r) => ({ value: r.key, label: r.label }))]} />
          <UrlSelect param="outcome" label="Outcome" className="md:w-44" options={[{ value: "", label: "Any outcome" }, ...Object.entries(OUTCOME_LABEL).map(([value, label]) => ({ value, label }))]} />
          <PeriodFilter timeZone={tz} />
          {data.total > 0 && <ExportMenu href={listHref("/communication/settings/log/export", { ...params, page: 1 }, {})} />}
        </Toolbar>
        <DataList
          caption="Automation log"
          rows={data.rows}
          rowKey={(r) => r.id}
          href={(r) => (r.messageId ? `/communication/history/${r.messageId}` : "")}
          minWidth={820}
          paging={{ page: params.page, pageSize: PAGE_SIZE, total: data.total, href: (p) => listHref("/communication/settings/log", params, { page: p }) }}
          empty={
            <EmptyState bare Icon={Zap} title={filtered ? "Nothing here" : "No automatic messages yet"}>
              {filtered ? "Change the search or filters." : "When attendance, fees, results and other modules send automatic messages, each one is listed here with its reason."}
            </EmptyState>
          }
          columns={[
            { key: "at", label: "When", nowrap: true, render: (r) => <span className="tnum text-[13px]">{formatDateTime(r.createdAt, tz)}</span> },
            { key: "rule", label: "Rule", render: (r) => <span className="font-semibold">{name(r.ruleKey)}</span> },
            { key: "event", label: "Event", render: (r) => <span className="text-[13px]">{r.eventLabel}</span> },
            { key: "to", label: "To", render: (r) => <span className="text-[13px]">{r.recipientName}</span> },
            { key: "outcome", label: "Outcome", nowrap: true, render: (r) => <Pill tone={TONE[r.outcome] ?? "neutral"} dot>{OUTCOME_LABEL[r.outcome] ?? r.outcome}</Pill> },
            { key: "note", label: "Note", render: (r) => <span className="text-[13px] text-ink2">{r.note ?? (r.messageId ? "See delivery" : "")}</span> },
          ]}
          mobile={(r) => ({ title: `${name(r.ruleKey)} → ${r.recipientName}`, sub: `${r.eventLabel} · ${formatDateTime(r.createdAt, tz)}`, icon: Zap, iconTone: r.outcome === "sent" ? "brand" : r.outcome === "no-credits" ? "bad" : "neutral",
            pills: [<Pill key="o" tone={TONE[r.outcome] ?? "neutral"} className="!h-[22px] !text-[11.5px]">{OUTCOME_LABEL[r.outcome] ?? r.outcome}</Pill>] })}
        />
      </Card>
    </>
  );
}
