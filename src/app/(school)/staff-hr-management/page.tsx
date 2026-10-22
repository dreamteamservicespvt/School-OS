import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Info, MessageCircle, Pencil, SearchX, Upload, UserPlus, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { readListParams, listHref } from "@/lib/list";
import { staffPage, BASE } from "@/lib/staff/page";
import { pageHidden } from "@/lib/duty";
import { onRollWhere, STAFF_FILTERS, staffOrder, staffWhere } from "@/lib/staff/list";
import { EMPLOYMENT_TYPES, STAFF_STATUSES } from "@/lib/staff/settings";
import { onLeaveOn } from "@/lib/staff/leave";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Chips, Empty, ListFooter, Stats, Toolbar } from "@/components/ui/blocks";
import { DataList, cardPill, type DataColumn } from "@/components/ui/data-list";
import { ListToolbar } from "@/components/list/list-toolbar";
import { StaffHead } from "./_components/head";
import { Avatar, ExportLinks, StatusBadge } from "./_components/bits";
import { BulkBar, STAFF_BULK_FORM } from "./_components/bulk-bar";
import { copyChannelsOn } from "@/lib/staff/staff-message";
import { CHANNEL_LABEL } from "@/lib/messaging/channels";
import { bulkChangeDepartment, bulkMessage } from "./actions";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Staff List") };
}

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STEP = 25;
const iconBtn = "relative z-[1] grid size-[34px] place-items-center rounded-lg text-ink2 hover:bg-sunken hover:text-ink";

export default async function StaffListPage({ searchParams }: Search) {
  const { current, viewer, today } = await staffPage();
  if (viewer.see !== "all") redirect(viewer.staffId ? `${BASE}/${viewer.staffId}` : `${BASE}/leave`);
  const raw = await searchParams;
  const params = readListParams(raw, STAFF_FILTERS);
  const shownCount = Math.min(500, Math.max(STEP, Number.parseInt(String(raw.n ?? ""), 10) || STEP));
  const where = staffWhere(params, viewer);
  // The department chips count the people the other filters leave.
  const { department: _dept, ...otherFilters } = params.filters;
  void _dept;
  const whereAnyDept = staffWhere({ ...params, filters: otherFilters }, viewer);

  const data = await withSchool(current.ctx, async (tx) => {
    // One campus: the counts and the "on leave today" names are of their campus's staff (and their own record).
    const onRoll = onRollWhere(viewer);
    const [rows, total, designations, departments, campuses, byDept, roll, teaching, rollIds] = await Promise.all([
      tx.staff.findMany({ where, orderBy: staffOrder(params), take: shownCount, include: { department: { select: { name: true } } } }),
      tx.staff.count({ where }),
      tx.designation.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } }),
      tx.department.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.campus.findMany({ where: { archivedAt: null, ...(viewer.campusId ? { id: viewer.campusId } : {}) }, select: { id: true, name: true } }),
      tx.staff.groupBy({ by: ["departmentId"], where: whereAnyDept, _count: { _all: true } }),
      tx.staff.count({ where: onRoll }),
      tx.staff.count({ where: { ...onRoll, staffType: "Teaching" } }),
      tx.staff.findMany({ where: onRoll, select: { id: true, fullName: true } }),
    ]);
    const leaveToday = await onLeaveOn(tx, current.ctx, today, rollIds.map((r) => r.id));
    const names = rollIds.filter((r) => leaveToday.has(r.id)).map((r) => r.fullName.split(/\s+/)[0]);
    const copyChannels = viewer.change === "all" ? await copyChannelsOn(tx, current.ctx) : [];
    return { rows, total, designations, departments, campuses, byDept, roll, teaching, leaveToday, leaveNames: names, copyChannels };
  });
  type Row = (typeof data.rows)[number];
  const canChange = viewer.change === "all";
  // Adding staff is office work; the Principal sees and approves (src/lib/duty.ts). 05-roles still allows it on the server.
  const canAdd = canChange && !pageHidden(current, "staff-hr-management", "add");
  const f = params.filters;
  const href = (change: Record<string, string | null>) => listHref(BASE, { ...params, page: 1 }, { ...change, page: null, n: null });
  const deptCount = new Map(data.byDept.map((d) => [d.departmentId ?? "none", d._count._all]));
  const allDept = data.byDept.reduce((n, d) => n + d._count._all, 0);
  const anyFilter = Boolean(params.q || Object.keys(f).length || params.archived);
  const exportHref = listHref(`${BASE}/export`, params, { page: null, n: null });
  const moreHref = data.rows.length < data.total ? listHref(BASE, params, { n: shownCount + STEP, page: null }) : null;
  const campusName = data.campuses.length === 1 ? data.campuses[0].name : null;

  const today$ = (r: Row, cls = "") =>
    r.status !== "ACTIVE" ? <StatusBadge status={r.status} className={cls} />
      : data.leaveToday.has(r.id) ? <Pill tone="warn" dot={!cls} className={cls}><Words k="On leave today" /></Pill>
        : <span className="text-ink3" title="Shown once Attendance Management records staff attendance">–</span>;

  const columns: DataColumn<Row>[] = [
    { key: "name", label: "Staff member", sortHref: listHref(BASE, params, { sort: "name", dir: params.sort === "name" && params.dir === "asc" ? "desc" : "asc", page: null }), sorted: params.sort === "name" ? params.dir : null, render: (r) => (
      <div className="flex items-center gap-3">
        <Avatar name={r.fullName} photoFileId={r.photoFileId} size="sm" />
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{r.fullName}</p>
          <p className="font-mono text-[12.5px] text-ink3">{r.staffCode}</p>
        </div>
      </div>
    ) },
    { key: "designation", label: "Designation", sortHref: listHref(BASE, params, { sort: "designation", dir: params.sort === "designation" && params.dir === "asc" ? "desc" : "asc", page: null }), sorted: params.sort === "designation" ? params.dir : null, render: (r) => (
      <><p className="leading-tight">{r.designation}</p><p className="text-[12.5px] text-ink3">{r.employmentType}</p></>
    ) },
    { key: "department", label: "Department", render: (r) => r.department?.name ?? <span className="text-ink3">–</span> },
    { key: "phone", label: "Phone", nowrap: true, render: (r) => <span className="tnum">{r.phone}</span> },
    { key: "today", label: "Today", render: (r) => today$(r) },
    { key: "act", label: <span className="sr-only"><Words k="Actions" /></span>, render: (r) => (
      <div className="flex justify-end gap-0.5">
        <a href={`https://wa.me/91${r.phone}`} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label={`Message ${r.fullName} on WhatsApp`} title="Message"><MessageCircle size={17} aria-hidden="true" /></a>
        {canChange && <a href={`${BASE}/${r.id}?edit=personal`} className={iconBtn} aria-label={`Edit ${r.fullName}`} title="Edit"><Pencil size={16} aria-hidden="true" /></a>}
      </div>
    ) },
  ];

  return (
    <>
      <StaffHead page="Staff List" href={BASE}
        sub={`${data.roll.toLocaleString("en-IN")} staff on roll${campusName ? ` · ${campusName}` : ""}`}
        actions={<>
          {canAdd && <ButtonLink href={`${BASE}/import`} icon={Upload} className="max-md:hidden"><Words k="Import" /></ButtonLink>}
          <ExportLinks href={exportHref} className="max-md:hidden" />
          {canAdd && <ButtonLink href={`${BASE}/add`} variant="primary" icon={UserPlus}><Words k="Add staff" /></ButtonLink>}
        </>} />

      <Stats label="Staff today" className="mb-5" items={[
        { label: "Staff on roll", value: data.roll.toLocaleString("en-IN"), sub: `${data.teaching} teaching, ${data.roll - data.teaching} others` },
        { label: "Present today", value: "–", sub: "Once staff attendance is taken" },
        { label: "On leave today", value: data.leaveToday.size, sub: data.leaveNames.length ? data.leaveNames.slice(0, 3).join(", ") + (data.leaveNames.length > 3 ? ` and ${data.leaveNames.length - 3} more` : "") : "Nobody", href: `${BASE}/leave`, tone: data.leaveToday.size ? "warn" : undefined },
        { label: "Not in yet", value: "–", sub: "Once staff attendance is taken" },
      ]} />

      {data.departments.length > 0 && (
        <Chips label="Staff by department" value={f.department ?? "all"} options={[
          { value: "all", label: "All departments", count: allDept, href: href({ department: null }) },
          ...data.departments.map((d) => ({ value: d.id, label: d.name, count: deptCount.get(d.id) ?? 0, href: href({ department: d.id }) })),
          ...(deptCount.get("none") ? [{ value: "none", label: "No department", count: deptCount.get("none")!, href: href({ department: "none" }) }] : []),
        ]} />
      )}

      <Card className="mt-3 overflow-hidden">
        <Toolbar>
          <ListToolbar placeholder="Name, staff ID, designation or phone" showArchived={canChange}
            filters={[
              { key: "status", label: "Status", allLabel: "Active", options: [...STAFF_STATUSES.filter((s) => s.value !== "ACTIVE").map((s) => ({ value: s.value, label: s.label })), { value: "all", label: "Every status" }] },
              { key: "type", label: "Type", allLabel: "All types", options: EMPLOYMENT_TYPES.map((t) => ({ value: t, label: t })) },
            ]}
            more={[
              { key: "designation", label: "Designation", options: data.designations.map((d) => ({ value: d.name, label: d.name })) },
              ...(data.campuses.length > 1 ? [{ key: "campus", label: "Campus", options: data.campuses.map((c) => ({ value: c.id, label: c.name })) }] : []),
            ]} />
        </Toolbar>

        {canChange && <BulkBar departments={data.departments.map((d) => ({ value: d.id, label: d.name }))} changeDepartment={bulkChangeDepartment} message={bulkMessage} copyChannels={data.copyChannels.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))} />}

        <DataList caption="Staff" rows={data.rows} columns={columns} rowKey={(r) => r.id} minWidth={860}
          rowHref={(r) => `${BASE}/${r.id}`} rowLabel={(r) => `Open ${r.fullName}`}
          select={canChange ? { form: STAFF_BULK_FORM, label: (r) => `Select ${r.fullName}`, value: (r) => r.id, allLabel: "Select every staff member shown" } : undefined}
          mobile={(r) => ({
            title: r.fullName, avatar: r.fullName, avatarSrc: r.photoFileId ? `/staff-hr-management/files/${r.photoFileId}` : null,
            sub: [r.designation, r.department?.name].filter(Boolean).join(" · "),
            pills: [r.status !== "ACTIVE" || data.leaveToday.has(r.id) ? <span key="t" className="contents">{today$(r, cardPill)}</span> : null].filter(Boolean) as React.ReactNode[],
          })}
          footer={<ListFooter shown={data.rows.length} total={data.total} moreHref={moreHref} />}
          empty={anyFilter ? (
            <Empty icon={SearchX} title="No staff match"
              body={params.q ? <><Words k="Nobody called “" />{params.q}<Words k="”. Try the staff ID or phone number." /></> : "Try a different department or filter."}
              action={<ButtonLink href={BASE}><Words k="Clear filters" /></ButtonLink>} />
          ) : (
            <Empty icon={Users} title="No staff added yet" body="Add your teachers and staff one by one, or import them all from Excel."
              action={canAdd ? <div className="flex flex-wrap justify-center gap-2"><ButtonLink href={`${BASE}/import`} icon={Upload}><Words k="Import staff" /></ButtonLink><ButtonLink href={`${BASE}/add`} variant="primary" icon={UserPlus}><Words k="Add staff" /></ButtonLink></div> : undefined} />
          )} />
      </Card>
      {data.rows.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ink3"><Info size={14} aria-hidden="true" /><Words k="Present and late show here once Attendance Management records staff attendance." /></p>
      )}
    </>
  );
}
