// The Dashboard's bigger cards, drawn from what the widgets loaded
// (dashboards.jsx TodayClasses, SyllabusCard, ListCard, MyClassCard).
import Link from "next/link";
import * as I from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { HBars } from "@/components/ui/band";
import { cx } from "@/components/ui/cx";
import type { AgendaItem, Birthday, Panel } from "@/lib/dashboard/types";
import type { T } from "@/lib/i18n/t";

export const dashIcon = (name: string): LucideIcon => ((I as unknown as Record<string, LucideIcon>)[name] ?? I.Circle);

const TONE_SOFT = { ok: "bg-ok/10 text-ok", warn: "bg-warn/12 text-warn", bad: "bg-bad/10 text-bad", info: "bg-info/10 text-info", neutral: "bg-sunken text-ink2", brand: "bg-brand/10 text-brand" } as const;
const PILL_TONE = { ok: "ok", warn: "warn", bad: "bad", info: "info", neutral: "neutral" } as const;

function OpenLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-[13px] font-semibold text-brand hover:underline whitespace-nowrap">{children}</Link>;
}

/** A panel in the person's language: its fixed words come from the catalogue (t.any); names and numbers stay as they are. */
export function PanelCard({ panel, t }: { panel: Panel; t: T }) {
  const sub = panel.sub ? t.any(panel.sub) : panel.sub;
  switch (panel.kind) {
    case "classes-today":
      return (
        <Card>
          <CardHeader title={t.any(panel.title)} description={sub} icon={I.CalendarRange} action={<OpenLink href={panel.timetableHref}>{t("Time Table")}</OpenLink>} />
          {panel.off || panel.rows.length === 0 ? (
            <p className="px-5 pb-5 text-[13.5px] text-ink3">{panel.off ? t.any(panel.off) : t("You have no periods on your Time Table today.")}</p>
          ) : (
            <ul className="px-2 pb-2 flex flex-col gap-0.5">
              {panel.rows.map((r) => (
                <li key={r.id} className={cx("flex items-center gap-3 px-3 py-2.5 rounded-xl", r.now ? "bg-brand/[.06] ring-1 ring-brand/25" : "hover:bg-sunken/70", r.past && !r.now && "opacity-75")}>
                  <span className="w-11 text-center shrink-0">
                    <span className="block text-[11px] text-ink3 font-semibold">P{r.periodNo}</span>
                    <span className="block text-[13px] font-semibold tnum">{r.time}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14.5px] truncate">{r.className} <span className="text-ink3 font-normal">· {r.subject}</span></p>
                    <p className={cx("text-[12.5px] truncate", r.note && r.noteTone === "warn" ? "text-warn font-semibold" : "text-ink3")}>
                      {[r.now ? t("Now") : null, r.room || null, r.note ? t.any(r.note) : null].filter(Boolean).join(" · ") || t("No room set")}
                    </p>
                  </div>
                  {r.taken ? <Pill tone="ok" className="shrink-0"><I.Check size={13} strokeWidth={3} aria-hidden="true" />{t("Taken")}</Pill>
                    : r.takeHref ? (
                      <ButtonLink href={r.takeHref} size="sm" variant={r.now || r.past ? "primary" : "secondary"} className="shrink-0">
                        <span className="sm:hidden">{t("Take")}</span><span className="hidden sm:inline">{t("Take attendance")}</span>
                      </ButtonLink>
                    ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      );
    case "bars":
      return (
        <Card>
          <CardHeader title={t.any(panel.title)} description={sub} icon={dashIcon(panel.icon)} action={panel.href ? <OpenLink href={panel.href}>{panel.linkLabel ? t.any(panel.linkLabel) : t("Open")}</OpenLink> : undefined} />
          <div className="px-5 pb-5">
            {panel.rows.length ? <HBars rows={panel.rows.map((r) => ({ key: r.key, label: t.any(r.label), value: r.value, href: r.href }))} goal={panel.goal} lowBelow={panel.lowBelow} /> : <p className="text-[13.5px] text-ink3">{t.any(panel.empty)}</p>}
          </div>
        </Card>
      );
    case "classes-overview":
      return (
        <Card>
          <CardHeader title={t.any(panel.title)} description={sub} icon={I.GraduationCap} action={<OpenLink href={panel.href}>{t("Students")}</OpenLink>} />
          {panel.classes.length === 0 && !panel.unplaced ? (
            <p className="px-5 pb-5 text-[13.5px] text-ink3">{t("No classes with students yet this year.")}</p>
          ) : (
            <ul className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {panel.classes.map((c) => (
                <li key={c.id} className="rounded-xl bg-sunken/70 p-3 min-w-0">
                  <Link href={c.href} className="flex items-baseline justify-between gap-2 group">
                    <span className="font-semibold text-[14px] truncate group-hover:text-brand">{c.name}</span>
                    <span className="font-display font-semibold text-[18px] tnum">{c.total.toLocaleString("en-IN")}</span>
                  </Link>
                  {c.sections.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {c.sections.map((s) => (
                        <Link key={s.id} href={s.href} className="text-[11.5px] font-semibold text-ink2 bg-surface rounded-md px-1.5 py-0.5 hover:text-brand tnum" aria-label={t("{section}: {n} students", { section: `${c.name} ${s.name}`, n: s.count })}>
                          {s.name} · {s.count}
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              ))}
              {panel.unplaced && (
                <li className="rounded-xl border border-dashed border-line p-3 min-w-0">
                  <Link href={panel.unplaced.href} className="flex items-baseline justify-between gap-2 group">
                    <span className="font-semibold text-[14px] group-hover:text-brand">{t("Not yet in a section")}</span>
                    <span className="font-display font-semibold text-[18px] tnum">{panel.unplaced.count.toLocaleString("en-IN")}</span>
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Card>
      );
    case "list":
      return (
        <Card>
          <CardHeader title={t.any(panel.title)} description={sub} icon={dashIcon(panel.icon)} action={panel.href ? <OpenLink href={panel.href}>{panel.linkLabel ? t.any(panel.linkLabel) : t("Open")}</OpenLink> : undefined} />
          {panel.rows.length === 0 ? (
            <p className="px-5 pb-5 text-[13.5px] text-ink3">{t.any(panel.empty)}</p>
          ) : (
            <ul className="px-2 pb-2">
              {panel.rows.map((r) => {
                const inner = (
                  <>
                    {r.avatar ? <Avatar name={r.avatar} size={36} /> : <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", TONE_SOFT.brand)}><I.Circle size={17} aria-hidden="true" /></span>}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14.5px] leading-snug truncate">{r.title}</p>
                      {r.sub && <p className="text-[12.5px] text-ink3 truncate">{r.sub}</p>}
                    </div>
                    {r.right && <Pill tone={PILL_TONE[r.rightTone ?? "neutral"]} className="shrink-0">{t.any(r.right)}</Pill>}
                  </>
                );
                const cls = "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left";
                return <li key={r.id}>{r.href ? <Link href={r.href} className={cx(cls, "hover:bg-sunken/70 transition")}>{inner}</Link> : <div className={cls}>{inner}</div>}</li>;
              })}
            </ul>
          )}
        </Card>
      );
    case "brief":
      return (
        <Card id="brief" className="scroll-mt-4">
          <CardHeader title={t.any(panel.title)} description={sub} icon={I.Newspaper} />
          <div className="px-5 pb-4 flex flex-col gap-4">
            {panel.sections.map((s) => (
              <section key={s.heading}>
                <p className="eyebrow text-ink3 mb-1.5">{t.any(s.heading)}</p>
                <ul className="flex flex-col gap-1.5">
                  {s.lines.map((l, i) => (
                    <li key={i} className="text-[14px] leading-snug flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        {l.href ? <Link href={l.href} className="hover:text-brand hover:underline">{l.text}</Link> : l.text}
                        {l.basis && <span className="block text-[12px] text-ink3">{t("Based on: {basis}", { basis: l.basis })}</span>}
                      </span>
                      {l.suggestion && <Pill tone="brand" className="shrink-0 !h-5 !text-[11px]">{t("Suggestion")}</Pill>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="text-[12px] text-ink3">{t.any(panel.note)}</p>
          </div>
        </Card>
      );
    case "my-class":
      return (
        <Card>
          <CardHeader title={t.any(panel.title)} description={sub} icon={I.GraduationCap} action={<OpenLink href={panel.href}>{t("Class list")}</OpenLink>} />
          <div className="px-5 pb-3 grid grid-cols-3 gap-2 text-center">
            {panel.stats.map((s) => {
              const inner = <><span className="block font-display font-semibold text-[20px] tnum leading-tight">{s.value}</span><span className="block text-[11.5px] text-ink3">{t.any(s.label)}</span></>;
              return s.href
                ? <Link key={s.label} href={s.href} className="rounded-xl bg-sunken/70 py-2.5 hover:bg-brand/8 hover:text-brand transition">{inner}</Link>
                : <div key={s.label} className="rounded-xl bg-sunken/70 py-2.5">{inner}</div>;
            })}
          </div>
          {panel.rows.length > 0 && (
            <ul className="px-2 pb-2">
              {panel.rows.map((r) => (
                <li key={r.id}>
                  <Link href={r.href ?? panel.href} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-sunken/70 text-left">
                    <Avatar name={r.avatar ?? r.title} size={32} />
                    <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold truncate">{r.title}</span><span className="block text-[12px] text-ink3 truncate">{r.sub}</span></span>
                    <I.ChevronRight size={16} className="text-ink3" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      );
  }
}

const DOT = { brand: "bg-brand ring-brand/15", warn: "bg-warn ring-warn/15", info: "bg-info ring-info/15", bad: "bg-bad ring-bad/15", ok: "bg-ok ring-ok/15" } as const;

/** "Today and next": today's lines, then the next days, and birthdays this week. */
export function TodayCard({ items, birthdays, t }: { items: AgendaItem[]; birthdays: Birthday[]; t: T }) {
  return (
    <Card>
      <CardHeader title={t("Today and next")} icon={I.CalendarDays} />
      {items.length === 0 ? (
        <p className="px-5 pb-4 text-[13.5px] text-ink3">{t("Nothing on the School Calendar for the next 7 days.")}</p>
      ) : (
        <ol className="px-5 pb-2 flex flex-col">
          {items.map((e, i) => {
            const body = (
              <>
                <span className="block text-[14px] font-semibold leading-tight group-hover:text-brand">{e.title}</span>
                <span className="block text-[12.5px] text-ink3">{e.where}</span>
              </>
            );
            return (
              <li key={e.id} className="grid grid-cols-[52px_14px_1fr] gap-2.5">
                <span className="text-[13px] font-semibold tnum text-ink2 pt-0.5">{t.any(e.time)}</span>
                <span className="flex flex-col items-center">
                  <span className={cx("w-2.5 h-2.5 rounded-full mt-1.5 ring-4", DOT[e.tone])} />
                  {i < items.length - 1 && <span className="flex-1 w-px bg-line my-1" />}
                </span>
                {e.href ? <Link href={e.href} className="pb-4 text-left min-w-0 group">{body}</Link> : <span className="pb-4 min-w-0">{body}</span>}
              </li>
            );
          })}
        </ol>
      )}
      {birthdays.length > 0 && (
        <div className="mx-5 mb-5 rounded-xl bg-sunken/70 p-3">
          <p className="text-[12.5px] font-semibold text-ink2 flex items-center gap-1.5 mb-1.5"><I.Cake size={15} className="text-brand" aria-hidden="true" />{t("Birthdays this week")}</p>
          <ul className="flex flex-col gap-1 text-[13px]">
            {birthdays.slice(0, 6).map((b) => <li key={b.id} className="flex justify-between gap-3"><span className="truncate">{b.name}</span><span className="text-ink3 shrink-0">{b.when}</span></li>)}
          </ul>
          {birthdays.length > 6 && (
            <details className="mt-1 text-[13px]">
              <summary className="cursor-pointer text-ink3 hover:text-ink">{t("and {n} more", { n: birthdays.length - 6 })}</summary>
              <ul className="mt-1 flex flex-col gap-1">
                {birthdays.slice(6).map((b) => <li key={b.id} className="flex justify-between gap-3"><span className="truncate">{b.name}</span><span className="text-ink3 shrink-0">{b.when}</span></li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
