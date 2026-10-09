import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { RolePermissions } from "@/lib/roles";
import { roleAbout, roleUsage } from "@/lib/settings/roles";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { UsersNav } from "../sub-nav";
import { RoleSwitch } from "./role-actions";

export const metadata: Metadata = { title: "Roles" };

const KIND = { READY: "Ready role", TEMPLATE: "Role template", CUSTOM: "Your own role" } as const;

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const current = await requirePage("settings");
  const showArchived = (await searchParams).archived === "1";
  const { roles, usage } = await withSchool(current.ctx, async (tx) => ({
    roles: await tx.role.findMany({ orderBy: [{ name: "asc" }] }),
    usage: await roleUsage(tx, current.school.id),
  }));
  const mayEdit = can(current.permissions, "settings", "edit");
  const mayCreate = can(current.permissions, "settings", "create");
  const live = roles.filter((r) => !r.archivedAt);
  const archived = roles.filter((r) => r.archivedAt);
  const groups = [
    { title: "Ready roles", about: "On from the first day. You can change what they do, but not their names.", list: live.filter((r) => r.kind === "READY") },
    { title: "Role templates", about: "Switch one on when your school needs it.", list: live.filter((r) => r.kind === "TEMPLATE") },
    { title: "Your school's own roles", about: "Made by copying a role and changing it.", list: live.filter((r) => r.kind === "CUSTOM") },
  ];

  const row = (r: (typeof roles)[number]) => {
    const n = usage.get(r.id) ?? 0;
    return (
      <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0">
        <div className="min-w-0 flex-1">
          <Link href={`/settings/users/roles/${r.id}`} className="font-medium text-brand-text hover:underline">{r.name}</Link>
          <span className="ml-2 inline-flex gap-1 align-middle">
            {r.kind === "TEMPLATE" && <Badge tone={r.isEnabled ? "success" : "neutral"}>{r.isEnabled ? "On" : "Off"}</Badge>}
            {r.requiresTwoStep && <Badge tone="brand">Two-step login</Badge>}
            {r.archivedAt && <Badge>Archived</Badge>}
          </span>
          <p className="text-sm text-ink-2">{KIND[r.kind]} · {n === 0 ? "Nobody has it" : <Link href={`/settings/users?role=${r.id}`} className="underline">{n} {n === 1 ? "person" : "people"}</Link>}</p>
          <p className="text-sm text-ink-2">{roleAbout(r.permissions as Partial<RolePermissions>)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mayCreate && !r.archivedAt && <ButtonLink size="sm" href={`/settings/users/roles/new?copy=${r.id}`}>Copy</ButtonLink>}
          {mayEdit && <RoleSwitch id={r.id} name={r.name} kind={r.kind} isOn={r.isEnabled} archived={Boolean(r.archivedAt)} people={n} />}
        </div>
      </li>
    );
  };

  return (
    <>
      <PageHeader title="Users & Permissions" href="/settings/users/roles" userId={current.user.id}>
        {mayCreate && <ButtonLink href="/settings/users/roles/new" variant="primary">Create a role</ButtonLink>}
      </PageHeader>
      <UsersNav active="roles" />
      <p className="mb-4 max-w-3xl text-sm text-ink-2">
        A role is a set of things a person may do. Change a role and everyone with it changes at once. For one person only, use exceptions on their page.
      </p>
      <div className="space-y-5">
        {groups.map((g) => (
          <Card key={g.title}>
            <CardHeader title={g.title} description={g.about} />
            {g.list.length ? <ul>{g.list.map(row)}</ul> : (
              <div className="p-4">
                <EmptyState title="No roles of your own yet">
                  Copy a ready role and change it, for example a Fee Clerk from the Accountant role.
                  {mayCreate && <div className="mt-4"><ButtonLink href="/settings/users/roles/new" variant="primary">Create a role</ButtonLink></div>}
                </EmptyState>
              </div>
            )}
          </Card>
        ))}
        {archived.length > 0 && (
          showArchived ? (
            <Card>
              <CardHeader title="Archived roles" description="Nobody can be given these. Restore one to use it again." action={<Link href="/settings/users/roles" className="text-sm font-medium text-brand-text underline">Hide</Link>} />
              <ul>{archived.map(row)}</ul>
            </Card>
          ) : (
            <Link href="/settings/users/roles?archived=1" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-text underline">Show {archived.length} archived role{archived.length === 1 ? "" : "s"}</Link>
          )
        )}
      </div>
    </>
  );
}
