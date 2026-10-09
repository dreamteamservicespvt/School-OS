import type { Metadata } from "next";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { readListParams, skipTake, listHref } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { CHANNELS, CHANNEL_LABEL, type Channel } from "@/lib/messaging/channels";
import { categoryLabel, ensureReadyTemplates, LANGUAGES, languageLabel, TEMPLATE_CATEGORIES } from "@/lib/messaging/templates";
import { ruleTemplateIds, TEMPLATE_FILTERS, templateWhere, usedBy, WHATSAPP_STATUS_LABEL } from "@/lib/communication/templates-admin";
import { PageHeader } from "@/components/shell/page-header";
import { ListToolbar } from "@/components/list/list-toolbar";
import { DataTable } from "@/components/list/data-table";
import { EmptyState } from "@/components/empty-state";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { MessageIcon } from "@/components/icons";
import { ExportMenu } from "@/components/communication/export-menu";

export const metadata: Metadata = { title: "Message Templates" };

const WA_TONE: Record<string, BadgeTone> = { APPROVED: "success", PENDING: "warning", REJECTED: "danger", NOT_SUBMITTED: "neutral" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function TemplatesPage({ searchParams }: { searchParams: Search }) {
  const access = await commPage();
  const { current } = access;
  const params = readListParams(await searchParams, TEMPLATE_FILTERS);
  const data = await withSchool(current.ctx, async (tx) => {
    if (access.full) await ensureReadyTemplates(tx, current.ctx);
    const where = templateWhere(current.ctx, params);
    const orderBy = params.sort === "name" ? { name: params.dir } : params.sort === "updated" ? { updatedAt: params.dir } : [{ category: "asc" as const }, { name: "asc" as const }];
    const [rows, total, firstIds] = await Promise.all([
      tx.template.findMany({ where, orderBy, ...skipTake(params), include: { versions: { where: { isCurrent: true }, orderBy: { language: "asc" } } } }),
      tx.template.count({ where }),
      ruleTemplateIds(tx, current.ctx),
    ]);
    return { rows, total, firstIds };
  });
  const filtered = Boolean(params.q || Object.keys(params.filters).length || params.archived);
  const canEdit = access.full;

  return (
    <>
      <PageHeader title="Message Templates" href="/communication/templates" userId={current.user.id}>
        <div className="flex gap-2">
          {data.total > 0 && <ExportMenu href={listHref("/communication/templates/export", { ...params, page: 1 }, {})} />}
          {canEdit && <ButtonLink href="/communication/templates/new" variant="primary">Add template</ButtonLink>}
        </div>
      </PageHeader>
      <ListToolbar placeholder="Search name or text" filters={[
        { key: "channel", label: "Channel", options: CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] })) },
        { key: "category", label: "Category", options: TEMPLATE_CATEGORIES.map((c) => ({ value: c.key, label: c.label })) },
        { key: "language", label: "Language", options: LANGUAGES.map((l) => ({ value: l.code, label: l.label })) },
        { key: "status", label: "Status", options: [{ value: "dlt-missing", label: "SMS: DLT ID missing" }, ...Object.entries(WHATSAPP_STATUS_LABEL).map(([value, label]) => ({ value, label: `WhatsApp: ${label}` }))] },
      ]} />
      <DataTable
        caption="Message templates"
        rows={data.rows}
        total={data.total}
        params={params}
        path="/communication/templates"
        rowKey={(t) => t.id}
        rowHref={(t) => `/communication/templates/${t.id}`}
        empty={
          <EmptyState title={filtered ? "No templates match these filters" : "No templates yet"} icon={<MessageIcon className="size-6" />}>
            {filtered ? "Change the search or filters." : "Templates are ready message formats with blanks like {student_name}, in each language you use."}
            {canEdit && !filtered && <div className="mt-4"><ButtonLink href="/communication/templates/new" variant="primary">Add template</ButtonLink></div>}
          </EmptyState>
        }
        columns={[
          { key: "name", label: "Name", sortable: true, phone: "title", cell: (t) => <span className="font-medium">{t.name}</span> },
          { key: "category", label: "Category", phone: "meta", cell: (t) => categoryLabel(t.category) },
          { key: "channel", label: "Channel", phone: "meta", cell: (t) => CHANNEL_LABEL[t.channel as Channel] ?? t.channel },
          { key: "languages", label: "Languages", cell: (t) => t.versions.map((v) => languageLabel(v.language)).join(", ") },
          {
            key: "status", label: "Status", phone: "badge", cell: (t) => {
              if (t.channel === "whatsapp") {
                const worst = ["REJECTED", "NOT_SUBMITTED", "PENDING", "APPROVED"].find((s) => t.versions.some((v) => (v.whatsappStatus ?? "NOT_SUBMITTED") === s)) ?? "NOT_SUBMITTED";
                return <Badge tone={WA_TONE[worst]}>{WHATSAPP_STATUS_LABEL[worst]}</Badge>;
              }
              if (t.channel === "sms") return t.versions.every((v) => v.dltTemplateId) ? <Badge tone="success">Ready</Badge> : <Badge tone="danger">Draft</Badge>;
              return <Badge tone="success">Ready</Badge>;
            },
          },
          { key: "dlt", label: "DLT template ID", cell: (t) => (t.channel !== "sms" ? <span className="text-ink-2">Not needed</span> : t.versions.some((v) => !v.dltTemplateId) ? <span className="font-medium text-danger">Missing</span> : <span className="font-mono text-sm">{t.versions.map((v) => v.dltTemplateId).join(", ")}</span>) },
          { key: "version", label: "Version", cell: (t) => `v${Math.max(1, ...t.versions.map((v) => v.version))}` },
          { key: "used", label: "Used by", cell: (t) => usedBy(t, data.firstIds, t.id).join(", ") || <span className="text-ink-2">Typed messages</span> },
          { key: "updated", label: "Changed", sortable: true, cell: (t) => formatDate(t.updatedAt) },
        ]}
      />
    </>
  );
}
