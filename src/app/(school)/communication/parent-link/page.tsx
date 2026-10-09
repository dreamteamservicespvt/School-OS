import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { readListParams, skipTake, listHref } from "@/lib/list";
import { formatDate, formatDateTime } from "@/lib/format";
import { childrenByGuardian, LINK_FILTERS, linkListWhere, linkSummary } from "@/lib/communication/parent-link-admin";
import { maskPhone } from "@/lib/parent-link/links";
import { sectionSwitches } from "@/lib/parent-link/section-list";
import { messageSettings } from "@/lib/messaging/settings";
import { PageHeader } from "@/components/shell/page-header";
import { ListToolbar } from "@/components/list/list-toolbar";
import { DataTable } from "@/components/list/data-table";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { MessageIcon } from "@/components/icons";
import { ExportMenu } from "@/components/communication/export-menu";
import { ParentLinkNav } from "./sub-nav";

export const metadata: Metadata = { title: "Parent Link" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function ParentLinkPage({ searchParams }: { searchParams: Search }) {
  const access = await commPage();
  const { current } = access;
  const tz = current.school.timeZone;
  const params = readListParams(await searchParams, LINK_FILTERS);
  const now = new Date();
  const data = await withSchool(current.ctx, async (tx) => {
    const ctx = current.ctx;
    const where = await linkListWhere(tx, ctx, params, now);
    const [rows, total, summary, settings, classes, sections] = await Promise.all([
      tx.parentLink.findMany({ where, orderBy: params.sort === "opened" ? { lastOpenedAt: { sort: params.dir, nulls: "last" } } : { createdAt: params.sort === "created" ? params.dir : "desc" }, ...skipTake(params), include: { devices: { where: { revokedAt: null, expiresAt: { gt: now } }, select: { id: true } } } }),
      tx.parentLink.count({ where }),
      linkSummary(tx, ctx, now),
      messageSettings(tx, ctx),
      tx.schoolClass.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
      tx.section.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null }, select: { id: true, name: true, classId: true }, orderBy: { name: "asc" } }),
    ]);
    const guardians = await tx.guardian.findMany({ where: { id: { in: rows.map((r) => r.guardianId) } }, select: { id: true, name: true, phone: true } });
    const kids = await childrenByGuardian(tx, ctx, rows.map((r) => r.guardianId));
    const preview = await tx.parentLink.findFirst({ where: { schoolId: ctx.schoolId, status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { id: true } });
    return { rows, total, summary, settings, classes, sections, guardians: new Map(guardians.map((g) => [g.id, g])), kids, previewId: preview?.id ?? null };
  });
  const s = data.summary;
  const pl = data.settings.parentLink;
  const switches = sectionSwitches();
  const filtered = Boolean(params.q || Object.keys(params.filters).length);
  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? "";

  return (
    <>
      <PageHeader title="Parent Link" href="/communication/parent-link" userId={current.user.id}>
        <div className="flex gap-2">
          {data.total > 0 && <ExportMenu href={listHref("/communication/parent-link/export", { ...params, page: 1 }, {})} />}
          <ButtonLink href="/communication/parent-link/send" variant="primary">Send to existing families</ButtonLink>
        </div>
      </PageHeader>
      <ParentLinkNav on="links" />
      {!pl.on && <Alert tone="warning" className="mb-4" action={<ButtonLink href="/communication/settings#parent-link" size="sm">Message Settings</ButtonLink>}>Parent Link is switched off. Parents who open their link see &ldquo;Parent Link is not available right now&rdquo;.</Alert>}

      <ul className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Links active", value: s.active, href: listHref("/communication/parent-link", { ...params, filters: { status: "ACTIVE" }, page: 1, q: "" }, {}) },
          { label: "Links revoked", value: s.revoked, href: listHref("/communication/parent-link", { ...params, filters: { status: "REVOKED" }, page: 1, q: "" }, {}) },
          { label: "Opened in the last 30 days", value: s.opened30, href: listHref("/communication/parent-link", { ...params, filters: { status: "ACTIVE", opened: "30" }, page: 1, q: "" }, {}) },
          { label: "Never opened", value: s.never, href: listHref("/communication/parent-link", { ...params, filters: { status: "ACTIVE", opened: "never" }, page: 1, q: "" }, {}) },
          { label: "Families with no link", value: s.withoutLink, href: "/communication/parent-link/send" },
        ].map((f) => (
          <li key={f.label}>
            <Link href={f.href} className="block h-full rounded-2xl border border-line bg-surface p-4 shadow-card hover:border-brand">
              <span className="block text-2xl font-semibold tabular-nums">{f.value.toLocaleString("en-IN")}</span>
              <span className="text-sm text-ink-2">{f.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <details className="mb-5 rounded-2xl border border-line bg-surface p-4 shadow-card">
        <summary className="cursor-pointer font-semibold">What guardians see</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <ul className="space-y-1.5">
            {switches.map((sw) => {
              const on = pl.shows[sw.key] !== false;
              return (
                <li key={sw.key} className="flex items-start gap-2">
                  <Badge tone={on ? "success" : "neutral"}>{on ? "On" : "Off"}</Badge>
                  <span><span className="font-medium">{sw.label}</span> <span className="text-sm text-ink-2">{sw.description}</span></span>
                </li>
              );
            })}
          </ul>
          <div className="space-y-3 text-sm">
            <p className="text-ink-2">Fees and Pay, receipts, attendance this month, the datesheet and report cards join this list as their modules are switched on. Choose what is shown in Message Settings.</p>
            <div className="flex flex-wrap gap-2">
              {data.previewId && <ButtonLink href={`/communication/parent-link/${data.previewId}/preview`} size="sm">Preview as a guardian</ButtonLink>}
              <ButtonLink href="/communication/settings#parent-link" size="sm">Change in Message Settings</ButtonLink>
            </div>
          </div>
        </div>
      </details>

      <ListToolbar placeholder="Search parent name or mobile" showArchived={false} filters={[
        { key: "status", label: "Status", options: [{ value: "ACTIVE", label: "Active" }, { value: "REVOKED", label: "Revoked" }] },
        { key: "class", label: "Class", options: data.classes.map((c) => ({ value: c.id, label: c.name })) },
        { key: "section", label: "Section", options: data.sections.filter((x) => !params.filters.class || x.classId === params.filters.class).map((x) => ({ value: x.id, label: `${className(x.classId)} ${x.name}` })) },
        { key: "opened", label: "Opened", options: [{ value: "30", label: "In the last 30 days" }, { value: "not30", label: "Not in the last 30 days" }, { value: "never", label: "Never opened" }] },
      ]} />
      <DataTable
        caption="Parent Links"
        rows={data.rows}
        total={data.total}
        params={params}
        path="/communication/parent-link"
        rowKey={(l) => l.id}
        rowHref={(l) => `/communication/parent-link/${l.id}`}
        empty={
          <EmptyState title={filtered ? "No links match these filters" : "No Parent Links yet"} icon={<MessageIcon className="size-6" />}>
            {filtered ? "Change the search or filters." : "Each guardian gets one personal link to see their children's fees, attendance and notices on a phone. Links are sent when an admission is approved; send them to families already in the school here."}
            {!filtered && <div className="mt-4"><ButtonLink href="/communication/parent-link/send" variant="primary">Send to existing families</ButtonLink></div>}
          </EmptyState>
        }
        columns={[
          { key: "guardian", label: "Guardian", phone: "title", cell: (l) => <span className="font-medium">{data.guardians.get(l.guardianId)?.name ?? "Parent"}</span> },
          { key: "mobile", label: "Mobile", phone: "meta", cell: (l) => <span className="whitespace-nowrap tabular-nums">{maskPhone(data.guardians.get(l.guardianId)?.phone ?? "")}</span> },
          { key: "children", label: "Children", phone: "meta", cell: (l) => (data.kids.get(l.guardianId) ?? []).map((k) => `${k.name}${k.classLabel ? ` (${k.classLabel})` : ""}`).join(", ") || <span className="text-ink-2">None studying now</span> },
          { key: "status", label: "Status", phone: "badge", cell: (l) => <Badge tone={l.status === "ACTIVE" ? "success" : "neutral"}>{l.status === "ACTIVE" ? "Active" : "Revoked"}</Badge> },
          { key: "created", label: "Created on", sortable: true, cell: (l) => formatDate(l.createdAt, tz) },
          { key: "opened", label: "Last opened", sortable: true, cell: (l) => (l.lastOpenedAt ? formatDateTime(l.lastOpenedAt, tz) : <span className="text-ink-2">Never</span>) },
          { key: "phones", label: "Phones verified", cell: (l) => l.devices.length },
        ]}
      />
    </>
  );
}
