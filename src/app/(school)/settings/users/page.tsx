import type { Metadata } from "next";
import Link from "next/link";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { listHref, readListParams, skipTake } from "@/lib/list";
import { PageHeader } from "@/components/shell/page-header";
import { ListToolbar } from "@/components/list/list-toolbar";
import { DataTable, type Column } from "@/components/list/data-table";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { UserIcon } from "@/components/icons";
import { filterUsers, schoolUsers, sortUsers, type UserRow } from "@/lib/settings/user-list";
import { STATE_LABEL, STATE_TONE } from "@/lib/settings/users";
import { UsersNav } from "./sub-nav";
import { schoolRoles } from "@/lib/school-roles";

export const metadata: Metadata = { title: "Users & Permissions" };

const FILTERS = ["status", "role", "twostep", "exceptions"] as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, may } = await requireSettingsPage("users");
  const params = readListParams(await searchParams, FILTERS);
  const tz = current.school.timeZone;
  const { rows, roles } = await withSchool(current.ctx, async (tx) => ({
    rows: await schoolUsers(tx, current.school.id),
    roles: await schoolRoles(tx, current.ctx, { where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  }));
  const filtered = sortUsers(filterUsers(rows, params.q, params.filters), params.sort, params.dir);
  const { skip, take } = skipTake(params);
  const page = filtered.slice(skip, skip + take);
  const counts = { ACTIVE: 0, INVITED: 0, DISABLED: 0 };
  for (const r of rows) counts[r.state]++;

  const columns: Column<UserRow>[] = [
    { key: "name", label: "Name", sortable: true, phone: "title", cell: (r) => r.name },
    { key: "username", label: "Username", sortable: true, phone: "meta", cell: (r) => r.username },
    { key: "belongsTo", label: "Belongs to", cell: (r) => r.belongsTo ?? <span className="text-ink-2">Not linked</span> },
    { key: "roles", label: "Roles", phone: "meta", cell: (r) => r.roles.map((x) => x.name).join(", ") || <span className="text-ink-2">No role</span> },
    { key: "scope", label: "Scope", cell: (r) => (r.campus ? `${r.scope}: ${r.campus}` : r.scope) + (r.exceptions ? ` · ${r.exceptions} exception${r.exceptions === 1 ? "" : "s"}` : "") },
    { key: "status", label: "Status", sortable: true, phone: "badge", cell: (r) => <Badge tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Badge> },
    { key: "lastSignIn", label: "Last sign-in", sortable: true, phone: "meta", cell: (r) => (r.lastSignInAt ? formatDateTime(r.lastSignInAt, tz) : "Never") },
    { key: "twoStep", label: "Two-step login", cell: (r) => (r.twoStep ? "On" : "Off") },
  ];
  const exportBase = listHref("/settings/users/export", { ...params, page: 1 }, {});
  const sep = exportBase.includes("?") ? "&" : "?";

  return (
    <>
      <PageHeader title="Users & Permissions" href="/settings/users" userId={current.user.id}>
        {may.create && <ButtonLink href="/settings/users/new" variant="primary">Invite a user</ButtonLink>}
      </PageHeader>
      <UsersNav active="users" />
      {may.readOnly && <p className="mb-4 rounded-xl bg-surface-2 p-3 text-sm text-ink-2">You can see logins and roles here. The School Admin invites people and changes roles.</p>}
      <p className="mb-4 text-sm text-ink-2">
        {counts.ACTIVE} active · {counts.INVITED} invited · {counts.DISABLED} disabled. Most staff get their login from <Link href="/staff-hr-management/add" className="font-medium text-brand-text underline">Add Staff</Link> in Staff &amp; HR. Everyone else is invited here.
      </p>
      <ListToolbar placeholder="Search name, username, phone or email" filters={[
        { key: "status", label: "Status", options: [{ value: "ACTIVE", label: "Active" }, { value: "INVITED", label: "Invited" }, { value: "DISABLED", label: "Disabled" }] },
        { key: "role", label: "Role", options: roles.map((r) => ({ value: r.id, label: r.name })) },
        { key: "twostep", label: "Two-step login", options: [{ value: "on", label: "On" }, { value: "off", label: "Off" }] },
        { key: "exceptions", label: "Exceptions", options: [{ value: "yes", label: "Has exceptions" }] },
      ]} showArchived={false}>
        <div className="flex flex-wrap gap-1 text-sm" aria-label="Export">
          {(["xlsx", "csv", "pdf"] as const).map((f) => (
            <a key={f} href={`${exportBase}${sep}format=${f}`} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-3 font-medium hover:bg-surface-2">{f === "xlsx" ? "Excel" : f.toUpperCase()}</a>
          ))}
        </div>
      </ListToolbar>
      <DataTable rows={page} columns={columns} rowKey={(r) => r.id} rowHref={(r) => `/settings/users/${r.id}`} total={filtered.length} params={params} path="/settings/users" caption="Users of this school"
        empty={rows.length === 0 ? (
          <EmptyState title="No logins yet" icon={<UserIcon className="size-6" />}>
            {may.create ? "Invite the people who will use School OS." : "The School Admin invites the people who will use School OS."}
            {may.create && <div className="mt-4"><ButtonLink href="/settings/users/new" variant="primary">Invite a user</ButtonLink></div>}
          </EmptyState>
        ) : (
          <EmptyState title="Nobody matches these filters">
            Change the search or <Link href="/settings/users" className="font-medium text-brand-text underline">reset the filters</Link>.
          </EmptyState>
        )} />
    </>
  );
}
