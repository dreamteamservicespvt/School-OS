import type { Metadata } from "next";
import Link from "next/link";
import * as I from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requireCurrent } from "@/lib/current";
import { prisma, withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { reachFor } from "@/lib/permissions";
import { BUILT_MODULES, type ModuleKey } from "@/lib/modules";
import { roleNeedsTwoStep } from "@/lib/auth/two-step";
import { onChannels } from "@/lib/messaging/channels";
import { NOTE_KINDS, readNotePrefs, type NoteChannel } from "@/lib/notification-kinds";
import { fileLink } from "@/lib/files";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmButton } from "@/components/ui/confirm";
import { signOut, signOutDevice } from "../actions";
import { signOutOthers } from "./actions";
import { EditDetails, NotePrefsTable, PasswordButton, TwoStepRow } from "./parts";

export const metadata: Metadata = { title: "My profile" };

function describeDevice(ua: string | null): { name: string; icon: LucideIcon } {
  if (!ua) return { name: "Unknown device", icon: I.MonitorSmartphone };
  const phone = /Android|iPhone/.test(ua);
  const os = /Android/.test(ua) ? "Android phone" : /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "a computer";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return { name: `${browser} on ${os}`, icon: phone ? I.Smartphone : /iPad/.test(ua) ? I.Tablet : I.Monitor };
}

function DL({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3.5 px-5 pb-5 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] text-ink3 font-semibold">{k}</dt>
          <dd className="text-[14.5px] mt-0.5 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function ProfilePage() {
  const current = await requireCurrent();
  const tz = current.school.timeZone;
  const u = current.user;
  const [sessions, staff, mustTwoStep, allowed] = await Promise.all([
    prisma.session.findMany({ where: { userLoginId: u.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: "desc" } }),
    withSchool(current.ctx, (tx) => tx.staff.findFirst({ where: { userLoginId: u.id }, select: { id: true, staffCode: true, joiningDate: true, photoFileId: true } })),
    roleNeedsTwoStep(u.id, current.school.id),
    withSchool(current.ctx, (tx) => onChannels(tx, current.ctx)),
  ]);
  const twoStepOn = mustTwoStep || u.twoStepChosen;
  const can = (m: ModuleKey) => reachFor(current.permissions, m, "view") !== "none";
  const kinds = NOTE_KINDS.filter((k) => !k.module || can(k.module as ModuleKey));
  const roleNames = current.roles.map((r) => r.name);
  const photo = staff?.photoFileId ? fileLink(staff.photoFileId, current.school.id) : null;
  const others = sessions.filter((s) => s.id !== current.session.id).length;

  const work: { href: string; icon: LucideIcon; title: string; sub: string; show: boolean }[] = [
    { href: "/staff-hr-management/leave", icon: I.CalendarDays, title: "My leave", sub: "Ask for leave and see what is left", show: Boolean(staff) && can("staff-hr-management") },
    { href: "/salary-management/slips?mine=1", icon: I.Wallet, title: "My salary slips", sub: "Each month's slip to view or download", show: Boolean(staff) && can("salary-management") && BUILT_MODULES.has("salary-management") },
    { href: staff ? `/staff-hr-management/${staff.id}` : "/staff-hr-management", icon: I.FileText, title: "My staff record", sub: "ID card, joining letter and documents", show: Boolean(staff) && can("staff-hr-management") },
  ];

  return (
    <div>
      <PageHeader title="My profile" href="/profile" userId={u.id} sub="Your own details, password, devices and alerts. Only you see this page." />
      <div className="flex flex-col gap-5 lg:gap-6">
        <Card>
          <div className="p-5 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <Avatar name={u.displayName} size={64} src={photo} />
              <div className="min-w-0">
                <p className="font-display font-semibold text-[22px] leading-tight truncate">{u.displayName}</p>
                <p className="text-[14px] text-ink3 truncate">{roleNames.join(", ") || "No role yet"} · {current.school.name}</p>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {roleNames[0] && <Pill tone="brand">{roleNames[0]}</Pill>}
                  {staff && <Pill tone="neutral"><span className="font-mono text-[11.5px]">{staff.staffCode}</span></Pill>}
                  {twoStepOn && <Pill tone="ok"><I.ShieldCheck size={13} aria-hidden="true" />Two-step login on</Pill>}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <EditDetails name={u.displayName} phone={u.phone} email={u.email} />
            </div>
          </div>
        </Card>

        <div className="grid gap-5 lg:gap-6 items-start xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-5 lg:gap-6 min-w-0">
            <Card>
              <CardHeader title="My details" description="Changing your mobile number or email needs a one-time code" icon={I.User} />
              <DL rows={[
                ["Full name", u.displayName],
                ["Mobile number", <span key="p" className="tnum">{u.phone ?? "Not given"}</span>],
                ["Email", u.email ?? "Not given"],
                ["Username", <span key="u" className="font-mono text-[13.5px]">{u.username}</span>],
                ...(staff ? ([["Staff code", <span key="c" className="font-mono text-[13.5px]">{staff.staffCode}</span>], ["Joined", formatDate(staff.joiningDate)]] as [string, React.ReactNode][]) : []),
                ["Roles", roleNames.join(", ") || "None"],
                ["Last signed in", u.lastSignInAt ? formatDateTime(u.lastSignInAt, tz) : "Now"],
              ]} />
            </Card>

            <Card>
              <CardHeader title="Password and sign-in" icon={I.KeyRound} />
              <div className="divide-y divide-line/70 border-t border-line/70">
                <div className="flex items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1 text-[14px]">
                    <b className="font-semibold block">Password</b>
                    <span className="block text-[12.5px] text-ink3">{u.passwordChangedAt ? `Last changed ${formatDate(u.passwordChangedAt)}` : "Set when you accepted your invite"}</span>
                  </div>
                  <PasswordButton />
                </div>
                <TwoStepRow required={mustTwoStep} on={twoStepOn} sendsTo={u.email ?? u.phone} />
              </div>
            </Card>

            <Card>
              <CardHeader title="Signed-in devices" description="Sign out of a phone you lost or a computer you shared" icon={I.MonitorSmartphone} />
              <ul className="px-2 pb-2">
                {sessions.map((s) => {
                  const d = describeDevice(s.userAgent);
                  const me = s.id === current.session.id;
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                      <span className="w-10 h-10 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><d.icon size={19} aria-hidden="true" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[14px] truncate">{d.name}{me && <Pill tone="brand" className="!h-5 !text-[11px] ml-2 align-middle">This device</Pill>}</p>
                        <p className="text-[12.5px] text-ink3 truncate">{me ? "Active now" : `Last used ${formatDateTime(s.lastUsedAt, tz)}`}{s.ipAddress ? ` · ${s.ipAddress}` : ""}</p>
                      </div>
                      {!me && (
                        <form action={signOutDevice}>
                          <input type="hidden" name="sessionId" value={s.id} />
                          <button type="submit" className="h-8 px-3 rounded-lg text-[13px] font-semibold text-ink2 hover:bg-sunken hover:text-ink">Sign out</button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
              {others > 0 && (
                <div className="px-5 pb-4 pt-1">
                  <ConfirmButton trigger="Sign out everywhere else" triggerVariant="danger-soft" title="Sign out everywhere else?"
                    confirmLabel={`Sign out ${others} device${others === 1 ? "" : "s"}`} confirmVariant="danger" onConfirm={signOutOthers}>
                    You are signed out on {others} other device{others === 1 ? "" : "s"}. You stay signed in here. Your password is needed to sign in there again.
                  </ConfirmButton>
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title="My notifications" description="Choose how each kind reaches you. Some cannot be switched off." icon={I.Bell} />
              <NotePrefsTable kinds={kinds} prefs={readNotePrefs(u.notificationPrefs)} allowed={[...allowed] as NoteChannel[]} phone={u.phone} />
            </Card>
          </div>

          <div className="flex flex-col gap-5 lg:gap-6 min-w-0">
            {work.some((w) => w.show) && (
              <Card>
                <CardHeader title="My work" icon={I.Briefcase} />
                <ul className="px-2 pb-2">
                  {work.filter((w) => w.show).map((w) => (
                    <li key={w.title}>
                      <Link href={w.href} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                        <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><w.icon size={19} aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px]">{w.title}</span><span className="block text-[12.5px] text-ink3 truncate">{w.sub}</span></span>
                        <I.ChevronRight size={17} className="text-ink3" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card>
              <div className="p-2">
                <Link href="/profile/appearance" className="w-full flex items-center gap-3 px-3 h-11 rounded-xl hover:bg-sunken text-[14px] font-medium">
                  <I.Palette size={18} className="text-ink3" aria-hidden="true" />Colours and text size<I.ChevronRight size={16} className="text-ink3 ml-auto" aria-hidden="true" />
                </Link>
                {current.schools.length > 1 && (
                  <p className="flex items-center gap-3 px-3 h-11 text-[14px] text-ink3"><I.Building2 size={18} aria-hidden="true" />{current.schools.length} schools: switch from your name at the top</p>
                )}
                <form action={signOut}>
                  <button type="submit" className="w-full flex items-center gap-3 px-3 h-11 rounded-xl hover:bg-sunken text-[14px] font-medium text-left text-bad">
                    <I.LogOut size={18} aria-hidden="true" />Sign out
                  </button>
                </form>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
