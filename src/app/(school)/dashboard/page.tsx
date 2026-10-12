import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import * as I from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { quickActionsFor } from "@/lib/shell-data";
import { buildHome } from "@/lib/dashboard/compose";
import { assignable, taskAccess } from "@/lib/dashboard/tasks";
import { setupProgress, setupSteps } from "@/lib/dashboard/setup";
import { moduleOpen, reach } from "@/lib/dashboard/common";
import { todayFor } from "@/lib/periods";
import { Band } from "@/components/ui/band";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { PanelCard, TodayCard } from "./panels";
import { ApprovalsCard, AttentionCard, RefreshControl, TasksCard } from "./dashboard-client";

export const metadata: Metadata = { title: "Dashboard" };

const iconOf = (name: string): LucideIcon => ((I as unknown as Record<string, LucideIcon>)[name] ?? I.Circle);

function greeting(timeZone: string, now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hour12: false }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DashboardPage({ searchParams }: Search) {
  const current = await requirePage("dashboard");
  const sp = await searchParams;
  const now = new Date();
  const tz = current.school.timeZone;

  // A new school's School Admin and Principal start on the setup checklist until most of it is done.
  if (sp.view !== "dashboard" && moduleOpen(current, "settings") && reach(current, "settings", "edit") === "all") {
    const p = setupProgress(await withSchool(current.ctx, (tx) => setupSteps(tx, current.ctx, current)));
    if (!p.complete && p.done * 2 < p.total) redirect("/dashboard/setup");
  }

  const access = taskAccess(current);
  const [home, people] = await Promise.all([
    buildHome(current, { now }),
    withSchool(current.ctx, (tx) => assignable(tx, { ctx: current.ctx, access })),
  ]);
  const quick = quickActionsFor(current);
  const primary = home.leader ? null : quick[0] ?? null;
  const updated = now.toLocaleTimeString("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
  const today = todayFor(tz, now).toISOString().slice(0, 10);
  const first = home.panels.first;
  const band = home.band.map((b) => ({ key: b.id, label: b.label, big: b.big, of: b.of, foot: b.foot, href: b.href, ring: home.leader ? b.ring : undefined }));

  const tasks = (
    <TasksCard mine={home.tasks.mine} given={home.tasks.given} left={home.tasks.left} access={home.tasks.access}
      people={people.map((p) => ({ id: p.id, name: p.name }))} meId={current.user.id} today={today} />
  );
  const approvals = home.approvals && <ApprovalsCard count={home.approvals.count} rows={home.approvals.rows} />;
  const todayCard = <TodayCard items={home.agenda} birthdays={home.birthdays} />;
  const quickCard = quick.length > 0 && (
    <Card className="hidden xl:block">
      <CardHeader title="Quick actions" />
      <div className="grid grid-cols-2 gap-2 px-4 pb-4">
        {quick.map((q) => {
          const Ic = iconOf(q.icon);
          return (
            <Link key={q.label} href={q.href} className="flex flex-col items-start gap-2 p-3 rounded-xl bg-sunken/70 hover:bg-brand/8 hover:text-brand transition text-left">
              <Ic size={20} className="text-brand" aria-hidden="true" />
              <span className="text-[13.5px] font-semibold leading-tight">{q.label}</span>
            </Link>
          );
        })}
      </div>
    </Card>
  );

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-ink3">{home.dayLine}</p>
          <h1 className="font-display text-[26px] md:text-[32px] font-semibold tracking-tight leading-tight mt-0.5">{greeting(tz, now)}, {home.first}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <RefreshControl updated={updated} />
          {primary && <ButtonLink href={primary.href} variant="primary" icon={iconOf(primary.icon)}>{primary.label}</ButtonLink>}
        </div>
      </div>

      {first.length > 0 && <div className="md:hidden flex flex-col gap-5">{first.map((p, i) => <PanelCard key={i} panel={p} />)}</div>}

      {band.length >= 2 && <Band items={band} label={home.leader ? "School today" : "Your day"} />}

      {quick.length > 0 && (
        <nav aria-label="Quick actions" className="xl:hidden -mx-4 px-4 md:-mx-6 md:px-6 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 w-max">
            {quick.map((q) => {
              const Ic = iconOf(q.icon);
              return (
                <Link key={q.label} href={q.href} className="flex items-center gap-2 h-11 pl-2 pr-4 rounded-full bg-surface border border-line text-[14px] font-semibold shadow-card hover:text-brand">
                  <span className="w-8 h-8 rounded-full bg-brand/10 text-brand grid place-items-center"><Ic size={16} aria-hidden="true" /></span>{q.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 lg:gap-6 items-start">
        <div className="flex flex-col gap-5 lg:gap-6 min-w-0">
          {first.length > 0 && <div className="hidden md:flex flex-col gap-5 lg:gap-6">{first.map((p, i) => <PanelCard key={i} panel={p} />)}</div>}
          <AttentionCard items={home.attention} hiddenSeen={home.hiddenSeen} />
          {home.panels.main.map((p, i) => <PanelCard key={i} panel={p} />)}
          {tasks}
        </div>
        <div className="flex flex-col gap-5 lg:gap-6 min-w-0">
          {quickCard}
          {home.leader ? <>{todayCard}{approvals}</> : <>{approvals}{todayCard}</>}
          {home.panels.side.map((p, i) => <PanelCard key={i} panel={p} />)}
        </div>
      </div>
    </div>
  );
}
