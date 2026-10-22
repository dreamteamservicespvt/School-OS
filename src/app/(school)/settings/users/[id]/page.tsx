import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { combineRoles, applyExceptions, narrowToOwn, type ModuleAccess } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { schoolsFor } from "@/lib/auth/access";
import { MODULES } from "@/lib/modules";
import type { AccessLevel, RolePermissions } from "@/lib/roles";
import { assignableRoles } from "@/lib/settings/roles";
import { STATE_LABEL, STATE_TONE, scopeLabel, stateOf, type UserState } from "@/lib/settings/users";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { AccessForm, DetailsForm, DisableButton, EnableButton, ExceptionsForm, LinkForm, ResendInvite, TwoStepReset } from "./person-forms";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "User" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function describeDevice(userAgent: string | null) {
  if (!userAgent) return "Unknown device";
  const os = /Android/.test(userAgent) ? "Android phone" : /iPhone|iPad/.test(userAgent) ? "iPhone or iPad" : /Windows/.test(userAgent) ? "Windows computer" : /Mac OS/.test(userAgent) ? "Mac" : /Linux/.test(userAgent) ? "Linux computer" : "Device";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "browser";
  return `${os}, ${browser}`;
}

const levelOf = (a: ModuleAccess): AccessLevel => (a.see === "none" ? "none" : a.see === "own" ? "own" : a.change === "all" ? "full" : "view");
const LEVEL_LABEL: Record<AccessLevel, string> = { full: "Full", view: "View", own: "Own", none: "None" };
const LEVEL_TONE = { full: "success", view: "brand", own: "warning", none: "neutral" } as const;

const HISTORY_WORDS: Record<string, string> = {
  "signed-in": "Signed in",
  "locked-after-wrong-passwords": "Locked after 5 wrong passwords",
  invited: "Invited",
  "invite-sent-again": "New invite link made",
  "changed-roles": "Roles or scope changed",
  "changed-exceptions": "Exceptions changed",
  disabled: "Disabled",
  enabled: "Enabled again",
  "reset-two-step": "Two-step login reset",
  "linked-record": "Linked record changed",
  changed: "Details changed",
  "password-set": "Password set",
  "password-changed": "Password changed",
};

function historyDetail(action: string, before: unknown, after: unknown): string | null {
  const a = (after ?? {}) as Record<string, unknown>;
  const b = (before ?? {}) as Record<string, unknown>;
  if (action === "changed-roles") return `${(b.roles as string[] | undefined)?.join(", ") ?? "?"} → ${(a.roles as string[] | undefined)?.join(", ") ?? "?"}${b.scope !== a.scope ? `; scope ${scopeLabel(String(b.scope))} → ${scopeLabel(String(a.scope))}` : ""}`;
  if (action === "invited") return `Roles: ${(a.roles as string[] | undefined)?.join(", ") ?? ""}`;
  if (action === "reset-two-step") return `${a.reason ?? ""}. Checked: ${a.checkDone ?? ""}`;
  if (action === "linked-record") return `${b.belongsTo ?? "Not linked"} → ${a.belongsTo ?? "Not linked"}`;
  if (action === "disabled" && typeof a.signedOutDevices === "number") return `Signed out on ${a.signedOutDevices} device${a.signedOutDevices === 1 ? "" : "s"}`;
  if (action === "changed-exceptions") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].map((k) => `${MODULES.find((m) => m.key === k)?.name ?? k}: ${a[k] ? LEVEL_LABEL[a[k] as AccessLevel] : "as roles"}`).join("; ") || "All cleared";
  }
  return null;
}

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { current, may } = await requireSettingsPage("users");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const tz = current.school.timeZone;
  const data = await withSchool(current.ctx, async (tx) => {
    const accesses = await tx.schoolAccess.findMany({ where: { schoolId: current.school.id, userLoginId: id }, orderBy: { createdAt: "desc" }, include: { roles: { include: { role: true } }, campus: true } });
    if (accesses.length === 0) return null;
    const [login, sessions, staff, student, roles, campuses, freeStaff, history] = await Promise.all([
      tx.userLogin.findUniqueOrThrow({ where: { id } }),
      tx.session.findMany({ where: { userLoginId: id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: "desc" } }),
      tx.staff.findFirst({ where: { userLoginId: id }, select: { id: true, fullName: true, designation: true } }),
      tx.student.findFirst({ where: { userLoginId: id }, select: { id: true, fullName: true } }),
      assignableRoles(tx, current.ctx),
      tx.campus.findMany({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { name: "asc" }], select: { id: true, name: true } }),
      tx.staff.findMany({ where: { archivedAt: null, userLoginId: null, status: { in: ["ACTIVE", "ON_LEAVE"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, designation: true } }),
      tx.auditLogEntry.findMany({ where: { recordType: "User Login", recordId: id }, orderBy: { at: "desc" }, take: 60 }),
    ]);
    const actorIds = [...new Set(history.map((h) => h.userLoginId).filter((x): x is string => Boolean(x)))];
    const actors = await tx.userLogin.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } });
    return { accesses, login, sessions, staff, student, roles, campuses, freeStaff, history, actors: new Map(actors.map((a) => [a.id, a.displayName])) };
  });
  if (!data) notFound();
  const { accesses, login, sessions, staff, student, roles, campuses, freeStaff, history, actors } = data;
  const live = accesses.find((a) => !a.archivedAt) ?? null;
  const last = accesses[0];
  const state: UserState = stateOf(login.status as UserState, Boolean(live));
  const otherSchools = (await schoolsFor(id)).filter((s) => s.id !== current.school.id);
  const mayEdit = may.edit;
  const isSelf = id === current.user.id;
  const mayResetTwoStep = !isSelf && current.roles.some((r) => r.key === "school-admin" || r.key === "principal");

  const shown = live ?? last;
  const roleList = shown.roles.map((r) => r.role);
  const fromRoles = combineRoles(roleList.filter((r) => r.isEnabled && !r.archivedAt).map((r) => r.permissions as RolePermissions));
  const scoped = shown.scope === "OWN" ? narrowToOwn(fromRoles) : fromRoles;
  const exceptions = (shown.exceptions ?? {}) as Record<string, AccessLevel>;
  const effective = applyExceptions(scoped, [exceptions]);
  const twoStepNeeded = roleList.some((r) => r.requiresTwoStep);

  const linkOptions = [
    ...(staff ? [{ value: `staff:${staff.id}`, label: `Staff: ${staff.fullName}, ${staff.designation}` }] : []),
    ...(student ? [{ value: `student:${student.id}`, label: `Student: ${student.fullName}` }] : []),
    ...freeStaff.map((s) => ({ value: `staff:${s.id}`, label: `Staff: ${s.fullName}, ${s.designation}` })),
  ];
  const belongsTo = staff ? `staff:${staff.id}` : student ? `student:${student.id}` : "";

  return (
    <>
      <Link href="/settings/users" className="mb-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-text hover:underline"><Words k={"← Users & Permissions"} /></Link>
      <PageHeader title={login.displayName} href={`/settings/users/${id}`} userId={current.user.id}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>
          {mayEdit && !isSelf && (state === "DISABLED"
            ? <EnableButton userId={id} name={login.displayName} />
            : <DisableButton userId={id} name={login.displayName} devices={sessions.length} />)}
          {mayEdit && mayResetTwoStep && state !== "DISABLED" && login.status === "ACTIVE" && <TwoStepReset userId={id} name={login.displayName} />}
        </div>
      </PageHeader>

      <div className="space-y-5">
        {state === "INVITED" && (
          <Alert tone="warning" title="Has not set a password yet">
            {login.inviteExpiresAt && login.inviteExpiresAt > new Date()
              ? `The invite link works until ${formatDateTime(login.inviteExpiresAt, tz)}.`
              : "The invite link has run out."} <Words k="Lost the link? Make a new one; the old one stops working." />
            {mayEdit && <div className="mt-3"><ResendInvite userId={id} name={login.displayName} /></div>}
          </Alert>
        )}
        {state === "DISABLED" && (
          <Alert tone="info" title="Disabled in this school">
            {login.displayName} <Words k="cannot open" /> {current.school.name}<Words k=". Their records and history are kept." /> {live ? "" : `When enabled, they get back: ${roleList.map((r) => r.name).join(", ") || "no role"}.`}
          </Alert>
        )}
        {isSelf && <Alert tone="info"><Words k="This is you. Another School Admin must disable you or reset your two-step login." /></Alert>}

        <Card>
          <CardHeader title="Details" />
          <CardBody className="space-y-4">
            <dl className="grid gap-4 sm:grid-cols-3">
              <Detail label="Username">{login.username}</Detail>
              <Detail label="Last sign-in">{login.lastSignInAt ? formatDateTime(login.lastSignInAt, tz) : "Never"}</Detail>
              <Detail label="Two-step login">{twoStepNeeded ? (login.twoStepResetAt ? `Needed by their role. Reset on ${formatDateTime(login.twoStepResetAt, tz)}; they set it up at next sign-in.` : "Needed by their role") : "Not needed by their roles"}</Detail>
              {otherSchools.length > 0 && <Detail label="Also works in">{otherSchools.map((s) => s.name).join(", ")}</Detail>}
            </dl>
            {mayEdit
              ? <DetailsForm userId={id} name={login.displayName} phone={login.phone ?? ""} email={login.email ?? ""}
                  locked={otherSchools.length > 0 ? `This login also works in ${otherSchools.map((s) => s.name).join(", ")}, so only ${login.displayName} can change their name, phone and email, in My profile.` : null} />
              : <dl className="grid gap-4 sm:grid-cols-3"><Detail label="Phone">{login.phone ?? "Not given"}</Detail><Detail label="Email">{login.email ?? "Not given"}</Detail></dl>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Belongs to" description="The Staff record this login is for." />
          <CardBody>
            {staff && <p className="mb-3 text-sm"><Words k="Linked to" /> <Link href={`/staff-hr-management/${staff.id}`} className="font-medium text-brand-text underline">{staff.fullName}</Link>, {staff.designation}.</p>}
            {student && <p className="mb-3 text-sm"><Words k="Linked to the student" /> <Link href={`/student-management/students/${student.id}`} className="font-medium text-brand-text underline">{student.fullName}</Link>.</p>}
            {mayEdit ? <LinkForm userId={id} current={belongsTo} options={linkOptions} /> : !staff && !student && <p className="text-sm text-ink-2"><Words k="Not linked to a record." /></p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Roles and scope" description={`${roleList.map((r) => r.name).join(", ") || "No role"} · ${scopeLabel(shown.scope)}${shown.campus ? `: ${shown.campus.name}` : ""}`} />
          <CardBody>
            {mayEdit && live
              ? <AccessForm userId={id} name={login.displayName} roles={roles} campuses={campuses} roleIds={live.roles.map((r) => r.roleId)} scope={live.scope} campusId={live.campusId ?? ""} isSelf={isSelf} />
              : <p className="text-sm text-ink-2">{live ? "Your role can see roles but not change them." : "Enable this person to change their roles."}</p>}
          </CardBody>
        </Card>

        {live && (
          <Card>
            <CardHeader title="Exceptions" description="A setting here replaces what the roles give for one module, wider or narrower, for this person only." />
            <CardBody>
              {mayEdit
                ? <ExceptionsForm userId={id} rows={MODULES.map((m) => ({ key: m.key, name: m.name, fromRoles: LEVEL_LABEL[levelOf(scoped[m.key])], exception: exceptions[m.key] ?? "" }))} />
                : <p className="text-sm text-ink-2">{Object.keys(exceptions).length ? Object.entries(exceptions).map(([k, v]) => `${MODULES.find((m) => m.key === k)?.name}: ${LEVEL_LABEL[v]}`).join("; ") : "No exceptions."}</p>}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="What they can do" description="Their roles, scope and exceptions together. This is what School OS checks every time." />
          <CardBody>
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {MODULES.map((m) => {
                const lvl = levelOf(effective[m.key]);
                return (
                  <li key={m.key} className="flex min-h-9 items-center justify-between gap-3 border-b border-line py-1 text-sm">
                    <span>{m.name}{exceptions[m.key] && <span className="ml-1 text-xs text-ink-2"><Words k="(exception)" /></span>}</span>
                    <Badge tone={LEVEL_TONE[lvl]}>{LEVEL_LABEL[lvl]}</Badge>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Signed-in devices" description={sessions.length ? `${sessions.length} device${sessions.length === 1 ? "" : "s"} signed in now. Disabling or changing roles signs them all out.` : "Not signed in on any device."} />
          {sessions.length > 0 && (
            <CardBody>
              <ul className="divide-y divide-line">
                {sessions.map((s) => (
                  <li key={s.id} className="py-2 text-sm">
                    <span className="font-medium">{describeDevice(s.userAgent)}</span>
                    <span className="block text-ink-2"><Words k="Signed in" /> {formatDateTime(s.createdAt, tz)} <Words k="· last used" /> {formatDateTime(s.lastUsedAt, tz)}{s.ipAddress ? ` · ${s.ipAddress}` : ""}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="Login history" description="Sign-ins and every change to this login, newest first." />
          <CardBody>
            {history.length === 0 ? <p className="text-sm text-ink-2"><Words k="Nothing yet." /></p> : (
              <ol className="divide-y divide-line">
                {history.map((h) => {
                  const detail = historyDetail(h.action, h.before, h.after);
                  const by = h.userLoginId && h.userLoginId !== id ? actors.get(h.userLoginId) : null;
                  return (
                    <li key={h.id} className="py-2 text-sm">
                      <span className="font-medium">{HISTORY_WORDS[h.action] ?? h.action.replace(/-/g, " ")}</span>
                      {by && <span className="text-ink-2"> <Words k="by" /> {by}</span>}
                      <span className="block text-ink-2">
                        {formatDateTime(h.at, tz)}{h.device ? ` · ${describeDevice(h.device)}` : ""}{h.ipAddress ? ` · ${h.ipAddress}` : ""}
                      </span>
                      {detail && <span className="block text-ink-2">{detail}</span>}
                    </li>
                  );
                })}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
