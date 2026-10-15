// The whole school at a glance (owner's prototype changes of 13 Oct 2026,
// attendance.jsx NotMarked and ClassWise) for the Principal, Vice Principal,
// School Admin and Academic Head: sections not marked yet with Remind, then
// every section today or over any period, lowest first, by class group. A tile
// opens that section's month register.
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, Clock, Hourglass, LayoutGrid, ListChecks, TriangleAlert, UserCheck, UserX } from "lucide-react";
import { formatTime } from "@/lib/format";
import { percentText } from "@/lib/attendance/summary";
import { attendanceTone, sortSections, type ClassWise } from "@/lib/attendance/classwise";
import type { NotMarkedRow } from "@/lib/attendance/remind";
import { BASE } from "@/lib/attendance/access";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Stats } from "@/components/ui/stats";
import { Chips } from "@/components/ui/chips";
import { Progress, Toolbar } from "@/components/ui/kit";
import { UrlSelect } from "@/components/ui/url-controls";
import { PeriodFilter, type PeriodFilterProps } from "@/components/list/period-filter";
import { EmptyState } from "@/components/empty-state";
import { RemindButton } from "@/components/remind-button";
import { cx } from "@/components/ui/cx";
import { remindNotMarkedAction } from "../register/actions";

const TONE_TEXT = { ok: "text-ok", warn: "text-warn", bad: "text-bad" } as const;
const TONE_BG = { ok: "bg-ok/12 text-ok", warn: "bg-warn/12 text-warn", bad: "bg-bad/10 text-bad" } as const;
const n = (v: number) => v.toLocaleString("en-IN");
const short = (name: string) => name.replace(/^Class\s+/i, "").replace(/^Nursery/i, "Nur");

export function NotMarkedCard({ rows, lockText, locked, canRemind, tz }: { rows: NotMarkedRow[]; lockText: string; locked: boolean; canRemind: boolean; tz: string }) {
  if (rows.length === 0) return null;
  const left = rows.filter((r) => !r.remindedAt && r.teacherLogin);
  return (
    <Card>
      <CardHeader icon={Hourglass} title="Not marked yet" description={`Today · ${locked ? `locked at ${lockText}` : `marks lock at ${lockText}`}`}
        action={canRemind && left.length > 1 ? <RemindButton all variant="soft" label="Remind all" run={remindNotMarkedAction.bind(null, left.map((r) => r.sectionId))} /> : <Pill tone="warn">{rows.length}</Pill>} />
      <ul className="px-2 pb-2">
        {rows.map((r) => (
          <li key={r.sectionId} className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
            <span className="w-11 h-11 rounded-xl bg-warn/12 text-warn grid place-items-center shrink-0 text-[12.5px] font-bold" aria-hidden="true">{short(r.name)}</span>
            <Link href={`${BASE}/register?section=${r.sectionId}`} className="min-w-0 flex-1 group">
              <p className="font-semibold text-[14.5px] leading-snug truncate group-hover:text-brand">{r.teacher ?? "No class teacher"}</p>
              <p className="text-[12.5px] text-ink3 truncate">{r.name} · {n(r.students)} {r.students === 1 ? "student" : "students"}{r.teacher ? " · class teacher" : ""}</p>
            </Link>
            {canRemind && (r.teacherLogin
              ? <RemindButton className="shrink-0" done={r.remindedAt ? formatTime(r.remindedAt, tz) : null} run={remindNotMarkedAction.bind(null, [r.sectionId])} />
              : <Pill tone="neutral" className="shrink-0">{r.teacher ? "Cannot sign in" : "No class teacher"}</Pill>)}
          </li>
        ))}
      </ul>
      <p className="px-5 pb-4 text-[12.5px] text-ink3">A class not marked by {lockText} shows as not taken, and no absence message goes to parents. Remind sends the class teacher a message in the app.</p>
    </Card>
  );
}

export function ClassWiseView({ cw, sort, group, href, period, today }: {
  cw: ClassWise; sort: "low" | "class"; group: string; href: (change: Record<string, string | null>) => string;
  period: PeriodFilterProps; today: boolean;
}) {
  const shown = cw.sections.filter((s) => s.students > 0 && (group === "all" || s.group.key === group));
  const list = sortSections(shown, sort);
  const marked = shown.filter((s) => s.marked > 0);
  const sum = (k: "present" | "absent" | "late" | "leave") => shown.reduce((a, s) => a + s[k], 0);
  const students = marked.reduce((a, s) => a + s.students, 0);
  const counted = marked.reduce((a, s) => a + s.counted, 0);
  const avg = counted ? Math.round((marked.reduce((a, s) => a + s.weight, 0) / counted) * 1000) / 10 : null;
  const low = marked.filter((s) => s.percent !== null && s.percent < 85).length;
  const rangeText = cw.oneDay && today ? "Today" : "These dates";

  return (
    <div className="flex flex-col gap-4">
      <Stats items={today ? [
        { label: "Present today", value: n(sum("present")), sub: `of ${n(students)} in marked sections · ${percentText(avg)}`, icon: UserCheck },
        { label: "Absent", value: n(sum("absent")), sub: "Parents get a message", icon: UserX, tone: sum("absent") ? "bad" : undefined },
        { label: "Late", value: n(sum("late")), sub: "Counted as present", icon: Clock },
        { label: "On leave", value: n(sum("leave")), sub: "Not counted in the %", icon: CalendarDays },
        { label: "Sections marked", value: `${marked.length} of ${shown.length}`, sub: shown.length - marked.length ? `${shown.length - marked.length} not marked yet` : "All marked", icon: ListChecks, tone: shown.length - marked.length ? "warn" : "ok" },
      ] : [
        { label: "Average attendance", value: percentText(avg), sub: `${cw.sections[0]?.days ?? 0} school days`, icon: UserCheck },
        { label: "Student-days absent", value: n(sum("absent")), sub: "Across these sections", icon: UserX },
        { label: "Below 85%", value: n(low), sub: low ? "Sections to look at" : "None", icon: TriangleAlert, tone: low ? "bad" : undefined },
        { label: "Sections", value: n(shown.length), sub: group === "all" ? "Whole school" : cw.groups.find((g) => g.key === group)?.label, icon: LayoutGrid },
      ]} />
      <Card className="overflow-hidden">
        <CardHeader icon={LayoutGrid} title="Class-wise attendance" description={`${rangeText} · tap a class to see its students`} />
        <Toolbar>
          <Suspense><PeriodFilter {...period} fallback="today" className="w-full md:w-auto" /></Suspense>
          <UrlSelect param="sort" label="Order" value={sort} className="w-full md:w-48" options={[{ value: "low", label: "Lowest first" }, { value: "class", label: "Class order" }]} />
          {cw.groups.length > 1 && (
            <Chips label="Class groups" className="md:basis-full" value={group} options={[
              { value: "all", label: "All classes", href: href({ group: null }) },
              ...cw.groups.map((g) => ({ value: g.key, label: g.label, href: href({ group: g.key }) })),
            ]} />
          )}
        </Toolbar>
        {cw.off ? (
          <EmptyState bare title={cw.off === "Sunday" ? "Sunday: no school" : cw.off === "Not started" ? "These dates have not come yet" : `No school: ${cw.off}`} Icon={CalendarDays}>
            Holidays and Sundays are never counted. Choose another date.
          </EmptyState>
        ) : list.length === 0 ? (
          <EmptyState bare title="No sections to show" Icon={LayoutGrid}>Sections appear here once they have students.</EmptyState>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5 p-3">
            {list.map((s) => {
              const t = attendanceTone(s.percent, s.notMarked || s.marked === 0);
              return (
                <li key={s.sectionId} className="min-w-0">
                  <Link href={`${BASE}/register?section=${s.sectionId}&month=${cw.from.toISOString().slice(0, 7)}`}
                    className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3.5 hover:bg-sunken/60 hover:border-ink3/40 transition min-w-0 h-full">
                    <span className="flex items-center gap-3 min-w-0">
                      <span className={cx("w-11 h-11 rounded-xl grid place-items-center shrink-0 text-[12.5px] font-bold", TONE_BG[t])} aria-hidden="true">{short(s.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-[14.5px] leading-snug truncate">{s.name}</span>
                        <span className="block text-[12.5px] text-ink3 truncate">{s.teacher?.name ?? "No class teacher"} · {n(s.students)} students</span>
                      </span>
                      {s.marked > 0 && s.percent !== null
                        ? <span className={cx("font-display text-[20px] font-semibold tnum shrink-0", TONE_TEXT[t])}>{percentText(s.percent)}</span>
                        : <Pill tone="warn" className="shrink-0">Not marked</Pill>}
                    </span>
                    <Progress value={s.percent ?? 0} tone={t} />
                    <span className="text-[12.5px] text-ink2 truncate">
                      {s.marked === 0 ? (today ? "Not taken yet today" : "No marks on these dates")
                        : cw.oneDay ? `${n(s.present)} of ${n(s.students)} present · ${n(s.absent)} absent${s.late ? ` · ${n(s.late)} late` : ""}${s.leave ? ` · ${n(s.leave)} on leave` : ""}`
                          : `${n(s.absent)} student-days absent over ${n(s.days)} school days`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="px-5 pb-4 text-[12.5px] text-ink3">Green is 92% or more, amber 85% to 92%, red below 85%. Late counts as present; leave, holidays and Sundays are not counted.</p>
      </Card>
    </div>
  );
}
