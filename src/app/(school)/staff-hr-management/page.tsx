import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, listHref } from "@/lib/list";
import { staffPage, BASE } from "@/lib/staff/page";
import { STAFF_FILTERS, staffOrder, staffWhere } from "@/lib/staff/list";
import { EMPLOYMENT_TYPES, STAFF_STATUSES } from "@/lib/staff/settings";
import { onLeaveOn } from "@/lib/staff/leave";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModuleIcon } from "@/components/icons";
import { Avatar, ExportLinks, StatusBadge } from "./_components/bits";
import { BulkBar, BulkForm, RowCheck, SelectAll } from "./_components/bulk-bar";
import { bulkChangeDepartment, bulkMessage } from "./actions";

export const metadata: Metadata = { title: "Staff List" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function StaffListPage({ searchParams }: Search) {
  const { current, viewer, today } = await staffPage();
  if (viewer.see !== "all") redirect(viewer.staffId ? `${BASE}/${viewer.staffId}` : `${BASE}/leave`);
  const params = readListParams(await searchParams, STAFF_FILTERS);
  const where = staffWhere(params, viewer);

  const data = await withSchool(current.ctx, async (tx) => {
    const [rows, total, designations, departments, campuses, counts] = await Promise.all([
      tx.staff.findMany({ where, orderBy: staffOrder(params), ...skipTake(params), include: { department: { select: { name: true } } } }),
      tx.staff.count({ where }),
      tx.designation.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } }),
      tx.department.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.campus.findMany({ where: { archivedAt: null }, select: { id: true, name: true } }),
      tx.staff.count({ where: { archivedAt: null } }),
    ]);
    const onLeave = await onLeaveOn(tx, current.ctx, today, rows.map((r) => r.id));
    return { rows, total, designations, departments, campuses, counts, onLeave };
  });
  type Row = (typeof data.rows)[number];
  const canChange = viewer.change === "all";

  const columns: Column<Row>[] = [
    ...(canChange ? [{ key: "select", label: "", className: "w-10", cell: (r: Row) => <RowCheck id={r.id} label={r.fullName} /> }] : []),
    {
      key: "name", label: "Name", sortable: true, phone: "title",
      cell: (r) => (
        <span className="inline-flex items-center gap-3">
          <Avatar name={r.fullName} photoFileId={r.photoFileId} size="sm" />
          <span>{r.fullName}</span>
        </span>
      ),
    },
    { key: "code", label: "Staff ID", sortable: true, phone: "meta", cell: (r) => r.staffCode },
    { key: "designation", label: "Designation", sortable: true, phone: "meta", cell: (r) => `${r.designation}${r.department ? ` · ${r.department.name}` : ""}` },
    { key: "phone", label: "Phone", phone: "meta", cell: (r) => <a href={`tel:+91${r.phone}`} className="hover:underline">{r.phone}</a> },
    {
      key: "status", label: "Status", phone: "badge",
      cell: (r) => (
        <span className="inline-flex flex-wrap gap-1">
          <StatusBadge status={r.status} />
          {data.onLeave.has(r.id) && r.status === "ACTIVE" && <Badge tone="warning">On leave today</Badge>}
        </span>
      ),
    },
  ];
  // Linking the name: the first column is the checkbox for HR, so the name links itself.
  if (canChange) {
    const nameCol = columns[1];
    const draw = nameCol.cell;
    nameCol.cell = (r) => <Link href={`${BASE}/${r.id}`} className="font-medium text-brand-text hover:underline">{draw(r)}</Link>;
  }

  const filters = [
    { key: "status", label: "Status", options: [...STAFF_STATUSES.map((s) => ({ value: s.value, label: s.label })), { value: "all", label: "Any status" }] },
    { key: "designation", label: "Designation", options: data.designations.map((d) => ({ value: d.name, label: d.name })) },
    { key: "department", label: "Department", options: [...data.departments.map((d) => ({ value: d.id, label: d.name })), { value: "none", label: "No department" }] },
    { key: "type", label: "Employment type", options: EMPLOYMENT_TYPES.map((t) => ({ value: t, label: t })) },
    ...(data.campuses.length > 1 ? [{ key: "campus", label: "Campus", options: data.campuses.map((c) => ({ value: c.id, label: c.name })) }] : []),
  ];
  const exportHref = listHref(`${BASE}/export`, params, { page: null });
  const filtered = Boolean(params.q || Object.keys(params.filters).length || params.archived);

  return (
    <>
      <PageHeader title="Staff List" href={BASE} userId={current.user.id}>
        <div className="flex flex-wrap gap-2">
          {canChange && <ButtonLink href={`${BASE}/import`}>Import</ButtonLink>}
          <ExportLinks href={exportHref} />
          {canChange && <ButtonLink href={`${BASE}/add`} variant="primary">Add staff</ButtonLink>}
        </div>
      </PageHeader>
      <ListToolbar placeholder="Search by name, staff ID, designation or phone" filters={filters} />
      {canChange && data.total > 0 && (
        <div className="mb-2 hidden items-center gap-2 text-sm text-ink-2 md:flex">
          <SelectAll /> <span>Select all on this page for bulk actions</span>
        </div>
      )}
      <BulkForm />
      {canChange && <BulkBar departments={data.departments.map((d) => ({ value: d.id, label: d.name }))} changeDepartment={bulkChangeDepartment} message={bulkMessage} />}
      <DataTable
        rows={data.rows}
        columns={columns}
        rowKey={(r) => r.id}
        rowHref={canChange ? undefined : (r) => `${BASE}/${r.id}`}
        total={data.total}
        params={params}
        path={BASE}
        caption="Staff"
        actions={(r) => (
          <span className="flex flex-wrap justify-end gap-1">
            <Link href={`${BASE}/${r.id}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-brand-text hover:bg-surface-2">View</Link>
            {canChange && <Link href={`${BASE}/${r.id}?edit=personal`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-brand-text hover:bg-surface-2">Edit</Link>}
            <a href={`https://wa.me/91${r.phone}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-brand-text hover:bg-surface-2" aria-label={`Message ${r.fullName} on WhatsApp`}>Message</a>
          </span>
        )}
        empty={
          filtered ? (
            <EmptyState title="No staff match these filters">
              <p>Try another search, or reset the filters to see everyone.</p>
              <ButtonLink href={BASE} className="mt-4">Reset filters</ButtonLink>
            </EmptyState>
          ) : (
            <EmptyState title="No staff added yet" icon={<ModuleIcon module="staff-hr-management" className="size-6" />}>
              <p>Add your teachers and staff one by one, or import them all from Excel.</p>
              {canChange && <ButtonLink href={`${BASE}/add`} variant="primary" className="mt-4">Add staff</ButtonLink>}
            </EmptyState>
          )
        }
      />
      <p className="mt-2 text-sm text-ink-2">{data.counts} staff on record.</p>
    </>
  );
}
