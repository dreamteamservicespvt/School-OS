import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import * as I from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requireCurrent, requirePage } from "@/lib/current";
import { reachFor } from "@/lib/permissions";
import { withSchool } from "@/lib/db";
import { quickActionsFor } from "@/lib/shell-data";
import { buildHome } from "@/lib/dashboard/compose";
import { assignable, taskAccess } from "@/lib/dashboard/tasks";
import { setupProgress, setupSteps } from "@/lib/dashboard/setup";
import { moduleOpen, reach } from "@/lib/dashboard/common";
import { todayFor } from "@/lib/periods";
import { readDashFilters } from "@/lib/dashboard/filters";
import { formatDate } from "@/lib/format";
import { DashFilterBar } from "./filter-bar";
import { Band } from "@/components/ui/band";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { PanelCard, TodayCard } from "./panels";
import { ApprovalsCard, AttentionCard, RefreshControl, TasksCard } from "./dashboard-client";
import { getT } from "@/lib/i18n/server";
import { dayWords } from "@/lib/i18n/dates";
import type { T } from "@/lib/i18n/t";

export const metadata: Metadata = { title: "Dashboard" };

const iconOf = (name: string): LucideIcon => ((I as unknown as Record<string, LucideIcon>)[name] ?? I.Circle);

function greeting(timeZone: string, now: Date, t: T) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hour12: false }).format(now));
  return hour < 12 ? t("Good morning") : hour < 17 ? t("Good afternoon") : t("Good evening");
}

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DashboardPage({ searchParams }: Search) {
  // A student has no Dashboard: their home is Homework & Learning (17 §1).
  const who = await requireCurrent();
  if (reachFor(who.permissions, "dashboard", "view") === "none" && reachFor(who.permissions, "homework-learning", "view") !== "none") redirect("/homework-learning");
  // A driver has no Dashboard either: his home is today's trips in the driver app (01 §2 Driver, 12 §2).
  if (reachFor(who.permissions, "dashboard", "view") === "none" && who.modulesOn.has("transport-management") && who.permissions["transport-management"]?.see === "own") redirect("/driver");
  const current = await requirePage("dashboard");
  const t = await getT();
  const sp = await searchParams;
  const now = new Date();
  const tz = current.school.timeZone;

  // A new school's School Admin and Principal start on the setup checklist until most of it is done.
  // It is read alongside the page rather than before it (QA PLATFORM-13).
  const setupFirst = sp.view !== "dashboard" && moduleOpen(current, "settings") && reach(current, "settings", "edit") === "all";
  const setup = setupFirst ? withSchool(current.ctx, (tx) => setupSteps(tx, current.ctx, current)) : null;
  const access = taskAccess(current);
  // The filters (01 §2 Controls): a campus within the person's limit, and a past day; the cards and their links follow them.
  const { filters, campuses } = await withSchool(current.ctx, (tx) => readDashFilters(tx, current.ctx, current, sp, todayFor(tz, now)));
  const page = Promise.all([
    buildHome(current, { now, filters }),
    withSchool(current.ctx, (tx) => assignable(tx, { ctx: current.ctx, access })),
  ]);
  page.catch(() => {}); // Awaited below; a school sent to setup never needs it.
  if (setup) {
    const p = setupProgress(await setup);
    if (!p.complete && p.done * 2 < p.total) redirect("/dashboard/setup");
  }
  const [home, people] = await page;
  const quick = quickActionsFor(current, home.approvals !== null);
  const primary = home.leader ? null : quick[0] ?? null;
  const updated = now.toLocaleTimeString("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
  const today = todayFor(tz, now).toISOString().slice(0, 10);
  const first = home.panels.first;
  const band = home.band.map((b) => ({ key: b.id, label: t.any(b.label), big: b.big, of: b.of, foot: b.foot ? t.any(b.foot) : b.foot, href: b.href, ring: home.leader ? b.ring : undefined }));

  const tasks = (
    <TasksCard mine={home.tasks.mine} given={home.tasks.given} left={home.tasks.left} access={home.tasks.access}
      people={people.map((p) => ({ id: p.id, name: p.name }))} meId={current.user.id} today={today} />
  );
  const approvals = home.approvals && <ApprovalsCard count={home.approvals.count} rows={home.approvals.rows} />;
  const todayCard = <TodayCard items={home.agenda} birthdays={home.birthdays} t={t} />;
  const quickCard = quick.length > 0 && (
    <Card className="hidden xl:block">
      <CardHeader title={t("Quick actions")} />
      <div className="grid grid-cols-2 gap-2 px-4 pb-4">
        {quick.map((q) => {
          const Ic = iconOf(q.icon);
          return (
            <Link key={q.label} href={q.href} className="flex flex-col items-start gap-2 p-3 rounded-xl bg-sunken/70 hover:bg-brand/8 hover:text-brand transition text-left">
              <Ic size={20} className="text-brand" aria-hidden="true" />
              <span className="text-[13.5px] font-semibold leading-tight">{t.any(q.label)}</span>
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
          <p className="text-[13px] font-semibold text-ink3">{dayWords(t, home.dayLine)}</p>
          <h1 className="font-display text-[26px] md:text-[32px] font-semibold tracking-tight leading-tight mt-0.5">{greeting(tz, now, t)}, {home.first}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <RefreshControl updated={updated} />
          {primary && <ButtonLink href={primary.href} variant="primary" icon={iconOf(primary.icon)}>{t.any(primary.label)}</ButtonLink>}
        </div>
      </div>

      {(campuses.length > 1 || home.leader) && (
        <DashFilterBar campuses={campuses.length > 1 ? campuses : []} day={home.leader ? home.filters.date?.toISOString().slice(0, 10) ?? "" : null} today={today}
          showing={[home.filters.campusId ? campuses.find((c) => c.id === home.filters.campusId)?.name : null, home.filters.date ? formatDate(home.filters.date, "UTC") : null].filter((x): x is string => Boolean(x)).join(" · ")} />
      )}

      {first.length > 0 && <div className="md:hidden flex flex-col gap-5">{first.map((p, i) => <PanelCard key={i} panel={p} t={t} />)}</div>}

      {band.length >= 2 && <Band items={band} label={home.leader ? t("School today") : t("Your day")} />}

      {quick.length > 0 && (
        <nav aria-label={t("Quick actions")} className="xl:hidden -mx-4 px-4 md:-mx-6 md:px-6 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 w-max">
            {quick.map((q) => {
              const Ic = iconOf(q.icon);
              return (
                <Link key={q.label} href={q.href} className="flex items-center gap-2 h-11 pl-2 pr-4 rounded-full bg-surface border border-line text-[14px] font-semibold shadow-card hover:text-brand">
                  <span className="w-8 h-8 rounded-full bg-brand/10 text-brand grid place-items-center"><Ic size={16} aria-hidden="true" /></span>{t.any(q.label)}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 lg:gap-6 items-start">
        <div className="flex flex-col gap-5 lg:gap-6 min-w-0">
          {first.length > 0 && <div className="hidden md:flex flex-col gap-5 lg:gap-6">{first.map((p, i) => <PanelCard key={i} panel={p} t={t} />)}</div>}
          <AttentionCard items={home.attention} hiddenSeen={home.hiddenSeen} />
          {home.panels.main.map((p, i) => <PanelCard key={i} panel={p} t={t} />)}
          {tasks}
        </div>
        <div className="flex flex-col gap-5 lg:gap-6 min-w-0">
          {quickCard}
          {home.leader ? <>{todayCard}{approvals}</> : <>{approvals}{todayCard}</>}
          {home.panels.side.map((p, i) => <PanelCard key={i} panel={p} t={t} />)}
        </div>
      </div>
    </div>
  );
}
