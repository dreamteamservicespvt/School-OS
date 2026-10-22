import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { MODULES } from "@/lib/modules";
import type { RolePermissions } from "@/lib/roles";
import { permissionChanges } from "@/lib/settings/role-words";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { RoleEditor } from "../role-editor";
import { PutBack, RoleSwitch } from "../role-actions";
import { schoolRole } from "@/lib/school-roles";

export const metadata: Metadata = { title: "Role" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KIND = { READY: "Ready role", TEMPLATE: "Role template", CUSTOM: "Your own role" } as const;
const WORDS: Record<string, string> = { created: "Created", "changed-permissions": "Changed", archived: "Archived", restored: "Restored", "switched-on": "Switched on", "switched-off": "Switched off", "put-back": "Put back" };

type Version = { name?: string; permissions?: Partial<RolePermissions>; requiresTwoStep?: boolean };

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { current, may } = await requireSettingsPage("users");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const tz = current.school.timeZone;
  const data = await withSchool(current.ctx, async (tx) => {
    const role = await schoolRole(tx, current.ctx, { where: { id } });
    if (!role) return null;
    const holders = await tx.schoolAccess.findMany({
      where: { schoolId: current.ctx.schoolId, archivedAt: null, roles: { some: { roleId: id } } },
      select: { userLoginId: true, userLogin: { select: { displayName: true, username: true } } },
    });
    const history = await tx.auditLogEntry.findMany({ where: { recordType: "Role", recordId: id }, orderBy: { at: "desc" }, take: 40 });
    const actorIds = [...new Set(history.map((h) => h.userLoginId).filter((x): x is string => Boolean(x)))];
    const actors = await tx.userLogin.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } });
    return { role, holders, history, actors: new Map(actors.map((a) => [a.id, a.displayName])) };
  });
  if (!data) notFound();
  const { role, holders, history, actors } = data;
  const people = new Map(holders.map((h) => [h.userLoginId, h.userLogin.displayName]));
  const mayEdit = may.edit && !role.archivedAt;
  const latestChange = history.find((h) => h.action === "changed-permissions" || h.action === "put-back");

  return (
    <>
      <Link href="/settings/users/roles" className="mb-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-text hover:underline">← Roles</Link>
      <PageHeader title={role.name} href={`/settings/users/roles/${id}`} userId={current.user.id}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{KIND[role.kind]}</Badge>
          {role.kind === "TEMPLATE" && <Badge tone={role.isEnabled ? "success" : "neutral"}>{role.isEnabled ? "On" : "Off"}</Badge>}
          {role.archivedAt && <Badge>Archived</Badge>}
          {may.create && !role.archivedAt && <ButtonLink href={`/settings/users/roles/new?copy=${id}`}>Copy</ButtonLink>}
          {may.edit && <RoleSwitch id={id} name={role.name} kind={role.kind} isOn={role.isEnabled} archived={Boolean(role.archivedAt)} people={people.size} />}
        </div>
      </PageHeader>
      <div className="space-y-5">
        {role.archivedAt && <Alert tone="info">This role is archived. Restore it to change it or give it to people.</Alert>}
        {role.key === "school-admin" && <Alert tone="info">The School Admin role always keeps Full access to Settings, so someone can always manage logins and roles.</Alert>}
        <Card>
          <CardHeader title="Permissions" description={people.size ? `${people.size} ${people.size === 1 ? "person has" : "people have"} this role. Changes apply to all of them.` : "Nobody has this role yet."} />
          <CardBody>
            <RoleEditor id={id} name={role.name} kind={role.kind} permissions={role.permissions as Partial<RolePermissions>} requiresTwoStep={role.requiresTwoStep}
              copyFromId={null} modules={MODULES.map((m) => ({ key: m.key, name: m.name }))} people={people.size} readOnly={!mayEdit} cancelHref="/settings/users/roles" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="People with this role" />
          <CardBody>
            {people.size === 0 ? <p className="text-sm text-ink-2">Nobody yet. Give the role from a person&apos;s page in Users.</p> : (
              <ul className="flex flex-wrap gap-2">
                {[...people].sort((a, b) => a[1].localeCompare(b[1])).map(([uid, name]) => (
                  <li key={uid}><Link href={`/settings/users/${uid}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-3 hover:border-brand">{name}</Link></li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="History" description="Every change to this role, newest first." />
          <CardBody>
            {history.length === 0 ? <p className="text-sm text-ink-2">No changes since the school was set up.</p> : (
              <ol className="divide-y divide-line">
                {history.map((h) => {
                  const before = (h.before ?? {}) as Version;
                  const after = (h.after ?? {}) as Version;
                  const lines = h.action === "changed-permissions" || h.action === "put-back"
                    ? [
                        ...(before.name && after.name && before.name !== after.name ? [`Renamed from ${before.name} to ${after.name}`] : []),
                        ...permissionChanges(after.name ?? role.name, before.permissions ?? {}, after.permissions ?? {}),
                        ...(before.requiresTwoStep !== undefined && before.requiresTwoStep !== after.requiresTwoStep ? [`Two-step login ${after.requiresTwoStep ? "turned on" : "turned off"}`] : []),
                      ]
                    : [];
                  const when = formatDateTime(h.at, tz);
                  return (
                    <li key={h.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                      <div>
                        <span className="font-medium">{WORDS[h.action] ?? h.action.replace(/-/g, " ")}</span>
                        <span className="text-ink-2"> · {when}{h.userLoginId && actors.get(h.userLoginId) ? ` · ${actors.get(h.userLoginId)}` : ""}</span>
                        {lines.length > 0 && <ul className="mt-1 list-disc pl-5 text-ink-2">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
                      </div>
                      {mayEdit && h.action === "changed-permissions" && <PutBack auditId={h.id} roleId={id} when={when} />}
                    </li>
                  );
                })}
              </ol>
            )}
            {latestChange && <p className="mt-2 text-xs text-ink-2">Put back returns the role to how it was just before that change.</p>}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
