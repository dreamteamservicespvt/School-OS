import type { Metadata } from "next";
import Link from "next/link";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { MODULES } from "@/lib/modules";
import type { RolePermissions } from "@/lib/roles";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { RoleEditor } from "../role-editor";
import { schoolRole, schoolRoles } from "@/lib/school-roles";
import { sensitiveChoices } from "@/lib/sensitive";

export const metadata: Metadata = { title: "Create a role" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewRolePage({ searchParams }: { searchParams: Promise<{ copy?: string }> }) {
  const { current } = await requireSettingsPage("users", "create");
  const copy = (await searchParams).copy;
  const { from, roles } = await withSchool(current.ctx, async (tx) => ({
    from: copy && UUID.test(copy) ? await schoolRole(tx, current.ctx, { where: { id: copy, archivedAt: null } }) : null,
    roles: await schoolRoles(tx, current.ctx, { where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  }));
  return (
    <>
      <Link href="/settings/users/roles" className="mb-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-text hover:underline">← Roles</Link>
      <PageHeader title={from ? `Copy ${from.name}` : "Create a role"} href="/settings/users/roles/new" userId={current.user.id} />
      <nav aria-label="Start from" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-2">Start from:</span>
        <Link href="/settings/users/roles/new" className={`min-h-9 rounded-full border px-3 py-1.5 ${!from ? "border-brand bg-brand-soft" : "border-line"}`}>Nothing</Link>
        {roles.map((r) => (
          <Link key={r.id} href={`/settings/users/roles/new?copy=${r.id}`} className={`min-h-9 rounded-full border px-3 py-1.5 ${from?.id === r.id ? "border-brand bg-brand-soft" : "border-line"}`}>{r.name}</Link>
        ))}
      </nav>
      <Card>
        <CardBody>
          <RoleEditor key={from?.id ?? "blank"} id={null} name={from ? `${from.name} (copy)` : ""} kind="CUSTOM"
            permissions={(from?.permissions as Partial<RolePermissions>) ?? { dashboard: "own" }} requiresTwoStep={from?.requiresTwoStep ?? false}
            sensitiveFields={from?.sensitiveFields ?? ""} sensitiveOptions={sensitiveChoices({ key: null, kind: "CUSTOM" })}
            copyFromId={from?.id ?? null} modules={MODULES.map((m) => ({ key: m.key, name: m.name }))} people={0} readOnly={false} cancelHref="/settings/users/roles" />
        </CardBody>
      </Card>
    </>
  );
}
