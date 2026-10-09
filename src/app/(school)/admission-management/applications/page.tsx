import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, listHref } from "@/lib/list";
import { formatDate, formatDateTime } from "@/lib/format";
import { fullPage, BASE } from "@/lib/admission/page";
import { APPLICATION_FILTERS, applicationOrder, applicationWhere } from "@/lib/admission/list";
import { STAGES } from "@/lib/admission/applications";
import { progressOf } from "@/lib/admission/documents";
import { feeStatus } from "@/lib/admission/fee";
import { classRules, openYears, stageOn } from "@/lib/admission/settings";
import { names } from "@/lib/admission/choices";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModuleIcon } from "@/components/icons";
import { DocProgress, ExportLinks, FeeBadge, StageBadge, SubNav, linkClass } from "../_components/bits";

export const metadata: Metadata = { title: "Applications" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ApplicationsPage({ searchParams }: Search) {
  const { current, viewer, settings, year, tz } = await fullPage();
  const params = readListParams(await searchParams, APPLICATION_FILTERS);
  const yearId = year?.id ?? "00000000-0000-0000-0000-000000000000";
  const where = applicationWhere(params, { yearId });
  const now = new Date();

  const data = await withSchool(current.ctx, async (tx) => {
    const [rows, total, n, rules, years, online] = await Promise.all([
      tx.application.findMany({
        where, orderBy: applicationOrder(params), ...skipTake(params),
        include: {
          documents: { select: { docType: true, status: true } },
          payments: { select: { status: true, amountPaise: true, cancelledAt: true } },
          tests: { where: { archivedAt: null }, include: { test: { select: { startsAt: true } } } },
          interviews: { where: { cancelledAt: null }, select: { startsAt: true } },
        },
      }),
      tx.application.count({ where }),
      names(tx),
      classRules(tx),
      openYears(tx),
      tx.application.count({ where: { archivedAt: null, academicYearId: yearId, stage: "SUBMITTED_ONLINE" } }),
    ]);
    return { rows, total, n, rules, years, online };
  });
  type Row = (typeof data.rows)[number];
  const fee = settings.applicationFeeOn;
  const tests = stageOn(settings, "test") || stageOn(settings, "interview");

  const nextDate = (r: Row) => {
    const dates = [...r.tests.map((t) => t.test.startsAt), ...r.interviews.map((i) => i.startsAt)].sort((a, b) => a.getTime() - b.getTime());
    return dates.find((d) => d >= now) ?? dates[dates.length - 1] ?? null;
  };

  const columns: Column<Row>[] = [
    { key: "number", label: "Application no.", sortable: true, phone: "meta", cell: (r) => <Link href={`${BASE}/applications/${r.id}`} className="font-medium text-brand-text hover:underline">{r.applicationNo}</Link> },
    { key: "name", label: "Child's name", sortable: true, phone: "title", cell: (r) => <span>{r.fullName}{r.channel === "online" && <Badge tone="brand" className="ml-2">Online</Badge>}</span> },
    { key: "class", label: "Class applied for", phone: "meta", cell: (r) => data.n.classes.get(r.classId) ?? "" },
    { key: "phone", label: "Parent's phone", cell: (r) => <a href={`tel:+91${r.phone}`} className="hover:underline">{r.phone}</a> },
    { key: "stage", label: "Stage", sortable: true, phone: "badge", cell: (r) => <StageBadge stage={r.stage} /> },
    {
      key: "docs", label: "Documents", cell: (r) => {
        const p = progressOf(r.documents, data.rules.get(r.classId)?.documents ?? []);
        return <DocProgress verified={p.requiredVerified} required={p.required} />;
      },
    },
    ...(tests ? [{ key: "test", label: "Test or interview", cell: (r: Row) => { const d = nextDate(r); return d ? formatDateTime(d, tz) : ""; } }] : []),
    ...(fee ? [{ key: "fee", label: "Fee paid", cell: (r: Row) => <FeeBadge status={feeStatus(r, r.payments)} /> }] : []),
    { key: "submitted", label: "Submitted", sortable: true, cell: (r) => formatDate(r.createdAt, tz) },
  ];

  const stage = params.filters.stage ?? "";
  const chip = (v: string | null) => listHref(`${BASE}/applications`, params, { stage: v, page: null });
  const filters = [
    { key: "class", label: "Class", options: [...data.n.classes.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })) },
    { key: "year", label: "Admission year", options: [...data.years.map((y) => ({ value: y.id, label: y.name })), { value: "all", label: "All years" }] },
    { key: "docs", label: "Documents", options: [{ value: "complete", label: "Complete" }, { value: "missing", label: "Not complete" }] },
    ...(fee ? [{ key: "fee", label: "Fee", options: [{ value: "paid", label: "Paid" }, { value: "unpaid", label: "Not paid" }, { value: "none", label: "Not needed" }] }] : []),
    { key: "channel", label: "Filled", options: [{ value: "counter", label: "At the counter" }, { value: "online", label: "Online" }] },
  ];
  const exportHref = listHref(`${BASE}/applications/export`, params, { page: null });
  const filtered = Boolean(params.q || Object.keys(params.filters).length || params.archived);

  return (
    <>
      <PageHeader title="Applications" href={`${BASE}/applications`} userId={current.user.id}>
        <div className="flex flex-wrap gap-2">
          <ExportLinks href={exportHref} />
          {viewer.change === "all" && <ButtonLink href={`${BASE}/applications/new`} variant="primary">New application</ButtonLink>}
        </div>
      </PageHeader>
      {settings.onlineOn && (
        <p className="mb-4 text-sm text-ink-2">
          Online form for parents: <a href={`/apply/${current.school.code}`} className="font-medium text-brand-text underline" target="_blank" rel="noopener">/apply/{current.school.code}</a>. Share this link by WhatsApp, SMS or email.
        </p>
      )}
      <SubNav label="Stages" current={stage || "all"} items={[
        { key: "all", label: "All", href: chip(null) },
        { key: "open", label: "Not yet decided", href: chip("open") },
        ...STAGES.filter((s) => s.value !== "SUBMITTED_ONLINE" || settings.onlineOn).map((s) => ({ key: s.value, label: s.label, href: chip(s.value), count: s.value === "SUBMITTED_ONLINE" ? data.online : undefined })),
      ]} />
      <ListToolbar placeholder="Search by name, application number or phone" filters={filters} />
      <DataTable
        rows={data.rows}
        columns={columns}
        rowKey={(r) => r.id}
        total={data.total}
        params={params}
        path={`${BASE}/applications`}
        caption="Applications"
        actions={(r) => <Link href={`${BASE}/applications/${r.id}`} className={linkClass}>Open</Link>}
        empty={
          filtered ? (
            <EmptyState title="No applications match these filters">
              <p>Try another search, or reset the filters.</p>
              <ButtonLink href={`${BASE}/applications`} className="mt-4">Reset filters</ButtonLink>
            </EmptyState>
          ) : (
            <EmptyState title="No applications yet" icon={<ModuleIcon module="admission-management" className="size-6" />}>
              <p>Fill an application at the counter, or open an enquiry and convert it, so nothing is typed twice.</p>
              {viewer.change === "all" && <ButtonLink href={`${BASE}/applications/new`} variant="primary" className="mt-4">New application</ButtonLink>}
            </EmptyState>
          )
        }
      />
    </>
  );
}
