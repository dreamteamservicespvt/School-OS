import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, listHref } from "@/lib/list";
import { formatDate, formatDateTime } from "@/lib/format";
import { admissionPage, BASE } from "@/lib/admission/page";
import { ENQUIRY_FILTERS, QUICK, enquiryOrder, enquiryWhere } from "@/lib/admission/list";
import { enquiryScope } from "@/lib/admission/access";
import { CLOSED_STATUSES, label, live, openYears } from "@/lib/admission/settings";
import { enquiryChoices, names } from "@/lib/admission/choices";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { ModuleIcon } from "@/components/icons";
import { ExportLinks, StatusBadge, SubNav, linkClass } from "../_components/bits";
import { Board, type Column as BoardColumn } from "../_components/board";
import { AddEnquiry } from "./enquiry-forms";
import { BulkForm, CampaignBar, RowCheck, SelectAll } from "./campaign-bar";
import { campaignAction, moveEnquiryCard } from "./actions";

export const metadata: Metadata = { title: "Enquiries" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function EnquiriesPage({ searchParams }: Search) {
  const { current, viewer, settings, year, tz } = await admissionPage();
  const raw = await searchParams;
  const params = readListParams(raw, ENQUIRY_FILTERS);
  const view = raw.view === "board" ? "board" : "list";
  const now = new Date();
  const yearId = year?.id ?? "00000000-0000-0000-0000-000000000000";
  const where = enquiryWhere(params, viewer, { yearId, timeZone: tz, now });

  const data = await withSchool(current.ctx, async (tx) => {
    const scope = { AND: [enquiryScope(viewer)], archivedAt: null, academicYearId: yearId };
    const [rows, total, choices, n, campaigns, years, overdue, today] = await Promise.all([
      view === "list" ? tx.enquiry.findMany({ where, orderBy: enquiryOrder(params), ...skipTake(params), include: { campaign: { select: { name: true } } } }) : Promise.resolve([]),
      tx.enquiry.count({ where }),
      enquiryChoices(tx, current.ctx, current, settings, tz),
      names(tx),
      tx.admissionCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 50, select: { id: true, name: true } }),
      openYears(tx),
      tx.enquiry.count({ where: { ...scope, status: { notIn: [...CLOSED_STATUSES] }, nextFollowUpAt: { lt: now } } }),
      tx.enquiry.count({ where: enquiryWhere({ ...params, filters: { quick: "today" }, q: "" }, viewer, { yearId, timeZone: tz, now }) }),
    ]);
    let board: BoardColumn[] = [];
    if (view === "board") {
      const statuses = live(settings.statusList);
      const grouped = await tx.enquiry.groupBy({ by: ["status"], where, _count: { _all: true } });
      board = await Promise.all(statuses.map(async (st) => {
        const cards = await tx.enquiry.findMany({ where: { AND: [where, { status: st.key }] }, orderBy: [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 20 });
        return {
          key: st.key, label: st.label, count: grouped.find((g) => g.status === st.key)?._count._all ?? 0,
          href: listHref(`${BASE}/enquiries`, params, { status: st.key, page: null }),
          accepts: !(["applied", "admitted", "lost"] as string[]).includes(st.key),
          cards: cards.map((e) => {
            const late = e.nextFollowUpAt && e.nextFollowUpAt < now && !CLOSED_STATUSES.includes(e.status);
            return { id: e.id, title: e.childName, href: `${BASE}/enquiries/${e.id}`, meta: `${e.parentName} · ${e.classId ? n.classes.get(e.classId) ?? "" : "Class not set"}`, tone: late ? ("danger" as const) : undefined, note: e.nextFollowUpAt && !CLOSED_STATUSES.includes(e.status) ? `${late ? "Overdue: " : "Follow up "}${formatDateTime(e.nextFollowUpAt, tz)}` : undefined };
          }),
        };
      }));
    }
    return { rows, total, choices, n, campaigns, years, overdue, today, board };
  });
  type Row = (typeof data.rows)[number];
  const canChange = viewer.change !== "none";
  const bulk = viewer.change === "all" && settings.campaignsOn;

  const columns: Column<Row>[] = [
    ...(bulk ? [{ key: "select", label: "", className: "w-10", cell: (r: Row) => <RowCheck id={r.id} label={r.childName} /> }] : []),
    { key: "child", label: "Child's name", sortable: true, phone: "title", cell: (r) => <Link href={`${BASE}/enquiries/${r.id}`} className="font-medium text-brand-text hover:underline">{r.childName}</Link> },
    { key: "parent", label: "Parent's name", sortable: true, phone: "meta", cell: (r) => r.parentName },
    { key: "phone", label: "Phone", phone: "meta", cell: (r) => <a href={`tel:+91${r.phone}`} className="hover:underline">{r.phone}</a> },
    { key: "class", label: "Class wanted", phone: "meta", cell: (r) => (r.classId ? data.n.classes.get(r.classId) ?? "" : "Not decided") },
    { key: "source", label: "Source", cell: (r) => label(settings.sourceList, r.source) },
    { key: "status", label: "Status", sortable: true, phone: "badge", cell: (r) => <StatusBadge status={r.status} label={label(settings.statusList, r.status)} /> },
    { key: "owner", label: "Owner", cell: (r) => (r.ownerStaffId ? data.n.staff.get(r.ownerStaffId) ?? "" : "No owner") },
    {
      key: "followup", label: "Next follow-up", sortable: true, phone: "meta",
      cell: (r) => {
        if (!r.nextFollowUpAt || CLOSED_STATUSES.includes(r.status)) return <span className="text-ink-2">None</span>;
        const late = r.nextFollowUpAt < now;
        return <span className={late ? "font-medium text-danger" : ""}>{late && <span className="sr-only">Overdue: </span>}{formatDateTime(r.nextFollowUpAt, tz)}</span>;
      },
    },
    ...(settings.campaignsOn ? [{ key: "campaign", label: "Campaign", cell: (r: Row) => r.campaign?.name ?? "" }] : []),
    { key: "created", label: "Created", sortable: true, cell: (r) => formatDate(r.createdAt, tz) },
  ];

  const filters = [
    { key: "status", label: "Status", options: live(settings.statusList).map((s) => ({ value: s.key, label: s.label })) },
    { key: "source", label: "Source", options: settings.sourceList.map((s) => ({ value: s.key, label: s.label })) },
    { key: "class", label: "Class", options: data.choices.classes },
    ...(viewer.see === "all" ? [{ key: "owner", label: "Owner", options: [...data.choices.owners, { value: "none", label: "No owner" }] }] : []),
    ...(settings.campaignsOn && data.campaigns.length ? [{ key: "campaign", label: "Campaign", options: data.campaigns.map((c) => ({ value: c.id, label: c.name })) }] : []),
    { key: "year", label: "Admission year", options: [...data.years.map((y) => ({ value: y.id, label: y.name })), { value: "all", label: "All years" }] },
  ];
  const quick = params.filters.quick ?? "";
  const chip = (value: string | null) => listHref(`${BASE}/enquiries`, params, { quick: value, page: null });
  const viewHref = (v: string) => { const h = listHref(`${BASE}/enquiries`, params, { page: null }); return v === "board" ? `${h}${h.includes("?") ? "&" : "?"}view=board` : h; };
  const exportHref = listHref(`${BASE}/enquiries/export`, params, { page: null });
  const filtered = Boolean(params.q || Object.keys(params.filters).length || params.archived);

  return (
    <>
      <PageHeader title="Enquiries" href={`${BASE}/enquiries`} userId={current.user.id}>
        <div className="flex flex-wrap gap-2">
          {viewer.change === "all" && <ButtonLink href={`${BASE}/enquiries/import`}>Import</ButtonLink>}
          <ExportLinks href={exportHref} />
          {canChange && <AddEnquiry c={data.choices} />}
        </div>
      </PageHeader>
      {!year && <p className="mb-4 rounded-xl border border-warn/40 bg-warn-bg p-3 text-warn-text">No academic year is set up yet. Add one in Academic Management to take enquiries.</p>}
      <SubNav label="Quick filters" current={quick || "all"} items={[
        { key: "all", label: "All", href: chip(null) },
        ...QUICK.filter((q) => viewer.see === "all" || q.value !== "mine").map((q) => ({ key: q.value, label: q.label, href: chip(q.value), count: q.value === "overdue" ? data.overdue : q.value === "today" ? data.today : undefined, tone: q.value === "overdue" ? ("danger" as const) : undefined })),
      ]} />
      <div className="mb-3 flex gap-2" role="group" aria-label="Show as">
        <Link href={viewHref("list")} aria-current={view === "list" ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg border px-4 text-sm ${view === "list" ? "border-brand bg-brand-soft font-medium text-brand-text" : "border-line"}`}>List</Link>
        <Link href={viewHref("board")} aria-current={view === "board" ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg border px-4 text-sm ${view === "board" ? "border-brand bg-brand-soft font-medium text-brand-text" : "border-line"}`}>Board by status</Link>
      </div>
      <ListToolbar placeholder="Search by child, parent, phone or email" filters={filters} />
      {view === "board" ? (
        <Board label="Enquiries by status" columns={data.board} move={canChange ? moveEnquiryCard : undefined} moveLabel="Change status" />
      ) : (
        <>
          {bulk && data.total > 0 && (
            <div className="mb-2 hidden items-center gap-2 text-sm text-ink-2 md:flex">
              <SelectAll /> <span>Select all on this page to run a campaign</span>
            </div>
          )}
          {bulk && <><BulkForm /><CampaignBar run={campaignAction} schoolName={current.school.name} /></>}
          <DataTable
            rows={data.rows}
            columns={columns}
            rowKey={(r) => r.id}
            total={data.total}
            params={params}
            path={`${BASE}/enquiries`}
            caption="Enquiries"
            actions={(r) => (
              <span className="flex flex-wrap justify-end gap-1">
                <Link href={`${BASE}/enquiries/${r.id}`} className={linkClass}>Open</Link>
                <a href={`tel:+91${r.phone}`} className={linkClass} aria-label={`Call ${r.parentName}`}>Call</a>
              </span>
            )}
            empty={
              filtered ? (
                <EmptyState title="No enquiries match these filters">
                  <p>Try another search, or reset the filters to see every enquiry.</p>
                  <ButtonLink href={`${BASE}/enquiries`} className="mt-4">Reset filters</ButtonLink>
                </EmptyState>
              ) : (
                <EmptyState title="No enquiries yet" icon={<ModuleIcon module="admission-management" className="size-6" />}>
                  <p>Add each walk-in or phone enquiry here, with a follow-up date, so no family is forgotten.</p>
                  {canChange && <div className="mt-4"><AddEnquiry c={data.choices} /></div>}
                </EmptyState>
              )
            }
          />
        </>
      )}
      <p className="mt-2 text-sm text-ink-2">{data.total} {data.total === 1 ? "enquiry" : "enquiries"}{data.overdue ? ` · ${data.overdue} follow-ups overdue` : ""}.</p>
    </>
  );
}
