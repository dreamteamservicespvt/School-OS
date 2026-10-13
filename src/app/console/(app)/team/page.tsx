import type { Metadata } from "next";
import Link from "next/link";
import { Crown, LifeBuoy, Lock, Send, UserCog, UserPlus, UserX } from "lucide-react";
import type { ConsoleRole, ConsoleUserStatus, Prisma } from "@prisma/client";
import { requireConsolePage } from "@/lib/console/current";
import { CONSOLE_ROLES, ROLE_ORDER } from "@/lib/console/roles";
import { maskMobile, showMobile } from "@/lib/console/activity";
import { withConsole } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { buttonClass } from "@/components/ui/button";
import { PageHead } from "@/components/ui/display";
import { Empty, SegLinks } from "@/components/ui/blocks";
import { UrlSearch } from "@/components/ui/list-controls";
import { CloseSheetButton, UrlSheet } from "@/components/ui/url-sheet";
import { whenWords } from "@/components/console/activity-line";
import { ActSheet } from "@/components/console/sheets";
import { InviteTeamSheet, RoleSheet } from "@/components/console/team-sheets";
import { changeRoleAction, disableTeamAction, inviteTeamAction, resendTeamAction } from "./actions";

export const metadata: Metadata = { title: "Team" };

type SP = Record<string, string | undefined>;
const STATUS_WORD: Record<ConsoleUserStatus, string> = { ACTIVE: "Active", INVITED: "Invited", DISABLED: "Disabled" };
const STATUS_TONE = { ACTIVE: "ok", INVITED: "info", DISABLED: "neutral" } as const;
const ROLE_ICON: Record<ConsoleRole, typeof Crown> = { OWNER: Crown, ONBOARDING: UserPlus, SUPPORT: LifeBuoy };
const FILTERS: Record<string, ConsoleUserStatus> = { active: "ACTIVE", invited: "INVITED", disabled: "DISABLED" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<SP> }) {
  // Only the Owner manages DREAM TEAM: the page and every action check it on the server.
  const c = await requireConsolePage("team");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const fKey = sp.f && sp.f in FILTERS ? sp.f : "";
  const now = new Date();
  const where: Prisma.SuperAdminUserWhereInput = { archivedAt: null };
  const [everyone, rows] = await withConsole(async (tx) => {
    const all = await tx.superAdminUser.findMany({ where, orderBy: [{ createdAt: "asc" }], select: { id: true, role: true, status: true } });
    const digits = q.replace(/\D/g, "");
    const roleHit = ROLE_ORDER.filter((r) => q && CONSOLE_ROLES[r].label.toLowerCase().includes(q.toLowerCase()));
    const list = await tx.superAdminUser.findMany({
      where: {
        ...where,
        ...(fKey ? { status: FILTERS[fKey] } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []), ...(roleHit.length ? [{ role: { in: roleHit } }] : [])] } : {}),
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });
    return [all, list] as const;
  });
  const activeOwners = everyone.filter((m) => m.role === "OWNER" && m.status === "ACTIVE");
  const isLastOwner = (m: { role: ConsoleRole; status: ConsoleUserStatus }) => m.role === "OWNER" && m.status === "ACTIVE" && activeOwners.length <= 1;

  const keep = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && !["act", "id"].includes(k)) n.set(k, v);
    for (const [k, v] of Object.entries(patch)) if (v === null) n.delete(k); else n.set(k, v);
    return n.toString() ? `/console/team?${n}` : "/console/team";
  };
  const here = keep({});
  const act = (a: string, id?: string) => keep({ act: a, ...(id ? { id } : {}) });

  const last = (m: (typeof rows)[number]) => {
    if (m.status === "DISABLED") return `Disabled${m.disabledAt ? ` ${formatDate(m.disabledAt)}` : ""}${m.disabledReason ? `: ${m.disabledReason}` : ""}`;
    if (m.status === "INVITED") return m.inviteExpiresAt && m.inviteExpiresAt > now ? `Invite sent, works until ${formatDate(m.inviteExpiresAt)}` : "Invite expired";
    return m.lastSignInAt ? `Signed in ${whenWords(m.lastSignInAt, now)}` : "Not signed in yet";
  };

  const actions = (m: (typeof rows)[number]) => {
    if (m.status === "DISABLED") return <Link href={act("enable", m.id)} scroll={false} className={buttonClass("ghost", "sm")}>Enable again</Link>;
    return (
      <>
        {m.status === "INVITED" && <Link href={act("resend", m.id)} scroll={false} className={buttonClass("secondary", "sm")}><Send size={15} aria-hidden="true" />Resend</Link>}
        <Link href={act("role", m.id)} scroll={false} className={buttonClass("secondary", "sm")}><UserCog size={15} aria-hidden="true" />Change role</Link>
        {m.id !== c.user.id && <Link href={act(isLastOwner(m) ? "lastowner" : "disable", m.id)} scroll={false} className={buttonClass("ghost", "sm")}>{isLastOwner(m) ? <Lock size={15} aria-hidden="true" /> : <UserX size={15} aria-hidden="true" />}Disable</Link>}
      </>
    );
  };
  const you = (m: { id: string }) => (m.id === c.user.id ? <span className="text-ink3 font-normal"> (you)</span> : null);

  // The sheet the address asks for.
  const target = sp.id && /^[0-9a-f-]{36}$/i.test(sp.id) ? await withConsole((tx) => tx.superAdminUser.findUnique({ where: { id: sp.id! } })) : null;
  let sheet: React.ReactNode = null;
  if (sp.act === "invite") sheet = <InviteTeamSheet closeHref={here} roles={CONSOLE_ROLES} action={inviteTeamAction} />;
  else if (target && !target.archivedAt) {
    if (sp.act === "role" && target.status !== "DISABLED") sheet = <RoleSheet closeHref={here} userId={target.id} name={target.name} current={target.role} lastOwner={isLastOwner(target)} roles={CONSOLE_ROLES} action={changeRoleAction} />;
    else if (sp.act === "resend" && target.status === "INVITED") sheet = (
      <ActSheet title={`Resend the invite to ${target.name}?`} closeHref={here} action={resendTeamAction} submitLabel="Send new invite" hidden={{ userId: target.id }}>
        <p>A new link goes by WhatsApp and SMS to +91 {maskMobile(target.phone)}{target.email ? ", and by email" : ""}. It works for 3 days. The old link stops working.</p>
      </ActSheet>
    );
    else if (sp.act === "enable" && target.status === "DISABLED") sheet = (
      <ActSheet title={`Enable ${target.name} again?`} closeHref={here} action={resendTeamAction} submitLabel={`Send invite to ${target.name}`} hidden={{ userId: target.id }}>
        <p>{target.name} gets a new invite link on +91 {maskMobile(target.phone)} and sets a new password, with two-step login.</p>
      </ActSheet>
    );
    else if (sp.act === "disable" && target.status !== "DISABLED" && target.id !== c.user.id && !isLastOwner(target)) sheet = (
      <ActSheet title={`Disable ${target.name}?`} sub="They cannot sign in to the console any more" closeHref={here} action={disableTeamAction} submitLabel={`Disable ${target.name}`} danger hidden={{ userId: target.id }} reason={{ placeholder: "Left DREAM TEAM on 9 Oct." }}>
        <p>Their sign-in stops at once, on every device. Everything they did stays in the Activity Log.</p>
      </ActSheet>
    );
    else if (sp.act === "lastowner") sheet = (
      <UrlSheet title="The last Owner cannot be disabled" sub="DREAM TEAM SERVICES" closeHref={here} footer={<CloseSheetButton variant="secondary">Close</CloseSheetButton>}>
        <div className="flex flex-col gap-4">
          <Banner tone="warn" title="DREAM TEAM needs at least one active Owner.">Make someone else Owner first.</Banner>
          <p className="text-[14px] text-ink2 leading-relaxed">{target.name} is the only active Owner. Without an Owner, nobody could manage the team, close a school or mark a payment.</p>
        </div>
      </UrlSheet>
    );
  }

  return (
    <div>
      <PageHead title="Team" sub="DREAM TEAM SERVICES’ own console users. Two-step login is always on."
        actions={<Link href={act("invite")} scroll={false} className={buttonClass("primary")}><UserPlus size={18} aria-hidden="true" />Invite team member</Link>} />
      <div className="flex flex-col gap-5 lg:gap-6">
        <div className="grid md:grid-cols-3 gap-3">
          {ROLE_ORDER.map((r) => {
            const n = everyone.filter((m) => m.role === r && m.status !== "DISABLED").length;
            const Icon = ROLE_ICON[r];
            return (
              <Card key={r} className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-lg bg-brand/10 text-brand grid place-items-center" aria-hidden="true"><Icon size={18} /></span>
                  <p className="font-semibold text-[15px] flex-1">{CONSOLE_ROLES[r].label}</p>
                  <Pill tone="neutral">{n} {n === 1 ? "person" : "people"}</Pill>
                </div>
                <p className="text-[13px] text-ink3 leading-snug">{CONSOLE_ROLES[r].does}</p>
              </Card>
            );
          })}
        </div>
        <Card className="overflow-hidden">
          <div className="p-3 sm:p-4 flex flex-col sm:flex-row gap-3 sm:items-center border-b border-line">
            <UrlSearch id="sa-team-search" placeholder="Name, phone, email or role" className="flex-1" />
            <div className="overflow-x-auto no-scrollbar">
              <SegLinks label="Status" value={fKey} options={[{ value: "", label: "All", href: keep({ f: null }) }, ...Object.keys(FILTERS).map((k) => ({ value: k, label: STATUS_WORD[FILTERS[k]], href: keep({ f: k }) }))]} />
            </div>
          </div>
          {rows.length === 0 ? <Empty title="Nobody matches" body="Try a different name or status." /> : (
            <>
              <div className="hidden lg:block overflow-x-auto scroll-thin">
                <table className="w-full text-left text-[14px] min-w-[900px]">
                  <thead><tr className="text-[12px] text-ink3 font-semibold border-b border-line">
                    <th className="pl-5 px-3 py-3 font-semibold">Name</th><th className="px-3 py-3 font-semibold">Phone</th><th className="px-3 py-3 font-semibold">Role</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Last sign-in</th><th className="px-3 pr-5 py-3 font-semibold text-right">Actions</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.id} className="border-b border-line/70 last:border-0">
                        <td className="pl-5 px-3 py-2.5"><div className="flex items-center gap-3"><Avatar name={m.name} size={36} /><div className="min-w-0"><p className="font-semibold leading-tight">{m.name}{you(m)}</p>{m.email && <p className="text-[12.5px] text-ink3">{m.email}</p>}</div></div></td>
                        <td className="px-3 py-2.5 tnum whitespace-nowrap">{showMobile(m.phone)}</td>
                        <td className="px-3 py-2.5"><Pill tone={m.role === "OWNER" ? "brand" : "neutral"}>{CONSOLE_ROLES[m.role].label}</Pill></td>
                        <td className="px-3 py-2.5"><Pill tone={STATUS_TONE[m.status]} dot>{STATUS_WORD[m.status]}</Pill></td>
                        <td className="px-3 py-2.5 text-ink2"><p className="leading-tight">{last(m)}</p>{m.status === "ACTIVE" && <p className="text-[12px] text-ink3">Two-step login on</p>}</td>
                        <td className="px-3 pr-5 py-2.5"><div className="flex gap-2 justify-end">{actions(m)}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="lg:hidden divide-y divide-line/70">
                {rows.map((m) => (
                  <li key={m.id} className="px-4 py-3 flex flex-col gap-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} size={42} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[15px] truncate">{m.name}{you(m)}</p>
                        <p className="text-[13px] text-ink3 truncate tnum">{showMobile(m.phone)} · {last(m)}</p>
                        <div className="flex gap-1.5 mt-1.5"><Pill tone={m.role === "OWNER" ? "brand" : "neutral"}>{CONSOLE_ROLES[m.role].label}</Pill><Pill tone={STATUS_TONE[m.status]}>{STATUS_WORD[m.status]}</Pill></div>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap pl-[54px]">{actions(m)}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum">Showing {rows.length} of {everyone.length} · console users have no School Access and cannot open a school’s data</div>
        </Card>
      </div>
      {sheet}
    </div>
  );
}
