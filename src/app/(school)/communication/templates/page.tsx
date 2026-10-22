import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { CHANNELS } from "@/lib/messaging/channels";
import { categoryLabel, ensureReadyTemplates, languageLabel, TEMPLATE_CATEGORIES } from "@/lib/messaging/templates";
import { ruleTemplateIds, TEMPLATE_FILTERS, templateWhere, usedBy, WHATSAPP_STATUS_LABEL } from "@/lib/communication/templates-admin";
import { Card } from "@/components/ui/card";
import { Toolbar } from "@/components/ui/toolbar";
import { DataList } from "@/components/ui/data-list";
import { Banner } from "@/components/ui/banner";
import { Pill, type PillTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { UrlSearch, UrlSegmented, UrlSelect } from "@/components/ui/url-filters";
import { EmptyState } from "@/components/empty-state";
import { ExportMenu } from "@/components/communication/export-menu";
import { CommHead } from "../_components/comm-head";
import { ChannelPills, CHANNEL_NAME } from "../_components/channel-pills";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Message Templates" };

const WA_TONE: Record<string, PillTone> = { APPROVED: "ok", PENDING: "warn", REJECTED: "bad", NOT_SUBMITTED: "neutral" };

type Search = Promise<Record<string, string | string[] | undefined>>;
type Version = { whatsappStatus: string | null; dltTemplateId: string | null; version: number; language: string };

function waStatus(versions: Version[]) {
  return ["REJECTED", "NOT_SUBMITTED", "PENDING", "APPROVED"].find((s) => versions.some((v) => (v.whatsappStatus ?? "NOT_SUBMITTED") === s)) ?? "NOT_SUBMITTED";
}

export default async function TemplatesPage({ searchParams }: { searchParams: Search }) {
  const access = await commPage();
  const { current } = access;
  const params = readListParams(await searchParams, TEMPLATE_FILTERS);
  const data = await withSchool(current.ctx, async (tx) => {
    if (access.full) await ensureReadyTemplates(tx, current.ctx);
    const where = templateWhere(current.ctx, params);
    const orderBy = params.sort === "name" ? { name: params.dir } : params.sort === "updated" ? { updatedAt: params.dir } : [{ category: "asc" as const }, { name: "asc" as const }];
    const [rows, total, firstIds, noDlt] = await Promise.all([
      tx.template.findMany({ where, orderBy, ...skipTake(params), include: { versions: { where: { isCurrent: true }, orderBy: { language: "asc" } } } }),
      tx.template.count({ where }),
      ruleTemplateIds(tx, current.ctx),
      tx.template.count({ where: { schoolId: current.ctx.schoolId, archivedAt: null, channel: "sms", versions: { some: { isCurrent: true, dltTemplateId: null } } } }),
    ]);
    return { rows, total, firstIds, noDlt };
  });
  const filtered = Boolean(params.q || Object.keys(params.filters).length || params.archived);
  const canEdit = access.full;
  const ver = (t: (typeof data.rows)[number]) => `v${Math.max(1, ...t.versions.map((v) => v.version))}`;
  const langs = (t: (typeof data.rows)[number]) => t.versions.map((v) => languageLabel(v.language)).join(", ");
  const missing = (t: (typeof data.rows)[number]) => t.channel === "sms" && t.versions.some((v) => !v.dltTemplateId);

  return (
    <>
      <CommHead access={access} page="Message Templates" href="/communication/templates"
        sub="Ready message formats in each language, with blanks like student name and due amount. Each save makes a new version."
        actions={canEdit ? <ButtonLink href="/communication/templates/new" variant="primary" icon={Plus}><Words k="New template" /></ButtonLink> : undefined} />
      <div className="flex flex-col gap-5 lg:gap-6">
        {data.noDlt > 0 && params.filters.status !== "dlt-missing" && (
          <Banner tone="warn" title={`${data.noDlt} SMS ${data.noDlt === 1 ? "template has" : "templates have"} no DLT template ID.`}
            action={<ButtonLink href="/communication/templates?status=dlt-missing" size="sm" variant="secondary"><Words k="Show them" /></ButtonLink>}>
            <Words k="They can be saved, but no SMS can be sent from them." />
          </Banner>
        )}
        <Card className="overflow-hidden min-w-0">
          <Toolbar className="flex-wrap">
            <UrlSearch placeholder="Template name or text" className="min-w-[14rem]" />
            <UrlSegmented param="channel" label="Channel" options={[{ value: "", label: "All" }, ...CHANNELS.map((c) => ({ value: c, label: CHANNEL_NAME[c] ?? c }))]} />
            <UrlSelect param="category" label="Category" className="md:w-44" options={[{ value: "", label: "Any category" }, ...TEMPLATE_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))]} />
            <UrlSelect param="status" label="Status" className="md:w-48" options={[{ value: "", label: "Any status" }, { value: "dlt-missing", label: "No DLT ID" }, ...Object.entries(WHATSAPP_STATUS_LABEL).map(([value, label]) => ({ value, label: `WhatsApp ${label.toLowerCase()}` }))]} />
            {data.total > 0 && <ExportMenu href={listHref("/communication/templates/export", { ...params, page: 1 }, {})} />}
          </Toolbar>
          <DataList
            caption="Message templates"
            rows={data.rows}
            rowKey={(t) => t.id}
            href={(t) => `/communication/templates/${t.id}`}
            minWidth={900}
            paging={{ page: params.page, pageSize: PAGE_SIZE, total: data.total, href: (p) => listHref("/communication/templates", params, { page: p }) }}
            footer={<div className="px-4 py-3 border-t border-line text-[13px] text-ink3">{data.total.toLocaleString("en-IN")} {params.archived ? "archived " : ""}{data.total === 1 ? "template" : "templates"} · <Link href={listHref("/communication/templates", { ...params, archived: !params.archived }, { page: null })} className="text-brand font-semibold hover:underline">{params.archived ? "Show templates in use" : "Show archived"}</Link></div>}
            empty={
              <EmptyState bare Icon={FileText} title={filtered ? "No templates here" : "No templates yet"}
                action={canEdit && !filtered ? <ButtonLink href="/communication/templates/new" icon={Plus}><Words k="New template" /></ButtonLink> : undefined}>
                {filtered ? "Change the search or filters." : "Templates are ready message formats with blanks like {student_name}, in each language you use."}
              </EmptyState>
            }
            columns={[
              { key: "name", label: "Template", render: (t) => <div className="min-w-[180px]"><p className="font-semibold">{t.name}</p><p className="text-[12.5px] text-ink3">{categoryLabel(t.category)}</p></div> },
              { key: "ch", label: "Channel", render: (t) => <ChannelPills channels={[t.channel]} /> },
              { key: "langs", label: "Languages", render: (t) => <span className="text-[13px]">{langs(t)}</span> },
              { key: "wa", label: "WhatsApp", nowrap: true, render: (t) => (t.channel === "whatsapp" ? <Pill tone={WA_TONE[waStatus(t.versions)]} dot>{WHATSAPP_STATUS_LABEL[waStatus(t.versions)]}</Pill> : <span className="text-ink3">–</span>) },
              { key: "dlt", label: "DLT template ID", render: (t) => (t.channel !== "sms" ? <span className="text-ink3"><Words k="No SMS" /></span> : missing(t) ? <Pill tone="bad"><Words k="Missing" /></Pill> : <span className="font-mono text-[12.5px]">{t.versions.map((v) => v.dltTemplateId).join(", ")}</span>) },
              { key: "ver", label: "Version", align: "right", render: (t) => <span className="tnum">{ver(t)}</span> },
              { key: "used", label: "Used by", render: (t) => <span className="text-[13px] text-ink2">{usedBy(t, data.firstIds, t.id).join(", ") || "Typed messages"}</span> },
            ]}
            mobile={(t) => ({
              title: t.name, sub: `${categoryLabel(t.category)} · ${langs(t)} · ${ver(t)}`, icon: FileText,
              iconTone: missing(t) || (t.channel === "whatsapp" && waStatus(t.versions) === "REJECTED") ? "bad" : "brand",
              pills: [
                <ChannelPills key="c" channels={[t.channel]} />,
                t.channel === "whatsapp" ? <Pill key="w" tone={WA_TONE[waStatus(t.versions)]} className="!h-[22px] !text-[11.5px]"><Words k="WhatsApp" /> {WHATSAPP_STATUS_LABEL[waStatus(t.versions)].toLowerCase()}</Pill> : null,
                missing(t) ? <Pill key="d" tone="bad" className="!h-[22px] !text-[11.5px]"><Words k="DLT ID missing" /></Pill> : null,
              ],
            })}
          />
        </Card>
      </div>
    </>
  );
}
